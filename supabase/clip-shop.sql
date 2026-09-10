-- UMBRA Clip Shop — reservas transacionais e idempotentes de geração.
-- Execute no SQL Editor depois do schema base de profiles/plan-gating.
-- IDEMPOTENTE: não apaga dados existentes.

create extension if not exists pgcrypto;

create table if not exists public.clip_shop_generation_reservations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  request_id uuid not null,
  feature_key text not null default 'umbra_clip_shop' check (feature_key = 'umbra_clip_shop'),
  status text not null default 'reserved' check (status in ('reserved', 'started', 'completed', 'released', 'expired')),
  plan_snapshot text not null default 'free',
  requested_count integer not null default 1,
  period_start date not null default date_trunc('month', now())::date,
  result_count integer not null default 0 check (result_count >= 0),
  reserved_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  released_at timestamptz,
  expires_at timestamptz not null default (now() + interval '30 minutes'),
  release_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, request_id)
);

alter table public.clip_shop_generation_reservations
  add column if not exists requested_count integer not null default 1;

alter table public.clip_shop_generation_reservations
  add column if not exists period_start date not null default date_trunc('month', now())::date;

-- Corrige a competência de linhas anteriores à migração sem apagar histórico.
update public.clip_shop_generation_reservations
set period_start = date_trunc('month', reserved_at)::date
where period_start is distinct from date_trunc('month', reserved_at)::date;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'clip_shop_requested_count_positive'
      and conrelid = 'public.clip_shop_generation_reservations'::regclass
  ) then
    alter table public.clip_shop_generation_reservations
      add constraint clip_shop_requested_count_positive check (requested_count > 0);
  end if;
end $$;

create index if not exists clip_shop_reservations_user_status_idx
  on public.clip_shop_generation_reservations (user_id, status);

create index if not exists clip_shop_reservations_monthly_usage_idx
  on public.clip_shop_generation_reservations (user_id, period_start)
  where status in ('reserved', 'started', 'completed');

alter table public.clip_shop_generation_reservations enable row level security;

drop policy if exists "clip_shop_reservations_select_own" on public.clip_shop_generation_reservations;
create policy "clip_shop_reservations_select_own"
  on public.clip_shop_generation_reservations for select
  to authenticated using (user_id = auth.uid());

-- Escritas ocorrem somente pelas RPCs SECURITY DEFINER abaixo.
revoke insert, update, delete on public.clip_shop_generation_reservations from anon, authenticated;
grant select on public.clip_shop_generation_reservations to authenticated;

create or replace function public.clip_shop_effective_plan(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when coalesce(p.is_admin, false) then 'admin'
    when p.plan = 'elite' and (p.expires_at is null or p.expires_at > now()) then 'elite'
    when p.plan = 'pro' and (p.expires_at is null or p.expires_at > now()) then 'pro'
    when coalesce(p.trial_ends_at, '-infinity'::timestamptz) > now() then 'pro'
    else 'free'
  end
  from public.profiles p
  where p.id = p_user_id
$$;

revoke all on function public.clip_shop_effective_plan(uuid) from public, anon, authenticated;

create or replace function public.clip_shop_plan_limit(p_plan text)
returns integer
language sql
immutable
security invoker
set search_path = public
as $$
  select case p_plan
    when 'free' then 3
    when 'pro' then 1000
    when 'elite' then -1
    when 'admin' then -1
    else 3
  end
$$;

revoke all on function public.clip_shop_plan_limit(text) from public, anon, authenticated;

create or replace function public.clip_shop_plan_batch_limit(p_plan text)
returns integer
language sql
immutable
security invoker
set search_path = public
as $$
  select case p_plan
    when 'free' then 1
    when 'pro' then 50
    when 'elite' then 150
    when 'admin' then 150
    else 1
  end
$$;

revoke all on function public.clip_shop_plan_batch_limit(text) from public, anon, authenticated;

drop function if exists public.get_clip_shop_usage();
create function public.get_clip_shop_usage()
returns table (used bigint, reserved bigint, limit_total integer, remaining bigint, plan text)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_plan text;
  v_used bigint;
  v_reserved bigint;
  v_limit integer;
  v_period date := date_trunc('month', now())::date;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  v_plan := public.clip_shop_effective_plan(v_user);
  v_limit := public.clip_shop_plan_limit(v_plan);

  select coalesce(sum(r.result_count), 0)::bigint into v_used
  from public.clip_shop_generation_reservations r
  where r.user_id = v_user
    and r.period_start = v_period
    and r.status = 'completed';

  select coalesce(sum(r.requested_count), 0)::bigint into v_reserved
  from public.clip_shop_generation_reservations r
  where r.user_id = v_user
    and r.period_start = v_period
    and r.status in ('reserved', 'started')
    and r.expires_at > now();

  return query select v_used, v_reserved, v_limit,
    case when v_limit < 0 then -1::bigint else greatest(0::bigint, v_limit::bigint - v_used - v_reserved) end, v_plan;
end;
$$;

revoke all on function public.get_clip_shop_usage() from public, anon;
grant execute on function public.get_clip_shop_usage() to authenticated;

create or replace function public.reserve_clip_shop_generation(p_request_id uuid, p_requested_count integer)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_plan text;
  v_existing uuid;
  v_existing_status text;
  v_committed bigint;
  v_limit integer;
  v_batch_limit integer;
  v_period date := date_trunc('month', now())::date;
  v_id uuid;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  if p_request_id is null then raise exception 'REQUEST_ID_REQUIRED' using errcode = '22023'; end if;
  if p_requested_count is null or p_requested_count <= 0 then raise exception 'INVALID_REQUESTED_COUNT' using errcode = '22023'; end if;

  -- Uma trava transacional por usuário impede duas abas de reservarem o último uso.
  perform pg_advisory_xact_lock(hashtextextended(v_user::text || ':umbra_clip_shop:' || v_period::text, 0));

  select id, status into v_existing, v_existing_status
  from public.clip_shop_generation_reservations
  where user_id = v_user and request_id = p_request_id;
  if v_existing is not null then
    if v_existing_status in ('reserved', 'started', 'expired') then return v_existing; end if;
    raise exception 'CLIP_SHOP_REQUEST_ALREADY_FINALIZED' using errcode = 'P0001';
  end if;

  update public.clip_shop_generation_reservations
  set status = 'expired', updated_at = now()
  where user_id = v_user and status in ('reserved', 'started') and expires_at <= now();

  v_plan := public.clip_shop_effective_plan(v_user);
  v_limit := public.clip_shop_plan_limit(v_plan);
  v_batch_limit := public.clip_shop_plan_batch_limit(v_plan);

  if p_requested_count > v_batch_limit then
    raise exception 'CLIP_SHOP_BATCH_LIMIT_REACHED' using errcode = 'P0001';
  end if;

  select coalesce(sum(case
    when status = 'completed' then result_count
    when status in ('reserved', 'started') and expires_at > now() then requested_count
    else 0 end), 0)::bigint into v_committed
  from public.clip_shop_generation_reservations
  where user_id = v_user and period_start = v_period;

  if v_limit >= 0 and v_committed + p_requested_count > v_limit then
    raise exception 'CLIP_SHOP_MONTHLY_LIMIT_REACHED' using errcode = 'P0001';
  end if;

  insert into public.clip_shop_generation_reservations (user_id, request_id, plan_snapshot, requested_count, period_start)
  values (v_user, p_request_id, coalesce(v_plan, 'free'), p_requested_count, v_period)
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.reserve_clip_shop_generation(uuid, integer) from public, anon;
grant execute on function public.reserve_clip_shop_generation(uuid, integer) to authenticated;

-- Compatibilidade temporária com clientes anteriores: reserva uma vaga.
create or replace function public.reserve_clip_shop_generation(p_request_id uuid)
returns uuid
language sql
security definer
set search_path = public
as $$
  select public.reserve_clip_shop_generation(p_request_id, 1)
$$;

revoke all on function public.reserve_clip_shop_generation(uuid) from public, anon;
grant execute on function public.reserve_clip_shop_generation(uuid) to authenticated;

create or replace function public.start_clip_shop_generation(p_reservation_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_reservation public.clip_shop_generation_reservations%rowtype;
  v_committed bigint;
  v_limit integer;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;

  select * into v_reservation
  from public.clip_shop_generation_reservations
  where id = p_reservation_id and user_id = v_user;
  if not found or v_reservation.status not in ('reserved', 'started', 'expired') then
    raise exception 'INVALID_CLIP_SHOP_RESERVATION' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_user::text || ':umbra_clip_shop:' || v_reservation.period_start::text, 0));

  -- Uma reserva expirada pode ser retomada se ainda houver saldo. Isso evita
  -- perder filas locais sem permitir que a retomada ultrapasse o plano.
  if v_reservation.status = 'expired' or v_reservation.expires_at <= now() then
    v_limit := public.clip_shop_plan_limit(public.clip_shop_effective_plan(v_user));
    select coalesce(sum(case
      when status = 'completed' then result_count
      when status in ('reserved', 'started') and expires_at > now() then requested_count
      else 0 end), 0)::bigint into v_committed
    from public.clip_shop_generation_reservations
    where user_id = v_user and period_start = v_reservation.period_start and id <> p_reservation_id;

    if v_committed + v_reservation.requested_count > v_limit then
      raise exception 'CLIP_SHOP_RECOVERY_LIMIT_REACHED' using errcode = 'P0001';
    end if;
  end if;

  update public.clip_shop_generation_reservations
  set status = 'started', started_at = coalesce(started_at, now()),
      expires_at = greatest(expires_at, now() + interval '2 hours'), updated_at = now()
  where id = p_reservation_id and user_id = v_user and status in ('reserved', 'started', 'expired');
  if not found then raise exception 'INVALID_CLIP_SHOP_RESERVATION' using errcode = 'P0001'; end if;
end;
$$;

revoke all on function public.start_clip_shop_generation(uuid) from public, anon;
grant execute on function public.start_clip_shop_generation(uuid) to authenticated;

create or replace function public.finish_clip_shop_generation(p_reservation_id uuid, p_result_count integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_result_count < 0 then raise exception 'INVALID_RESULT_COUNT' using errcode = '22023'; end if;
  update public.clip_shop_generation_reservations
  set status = 'completed', result_count = greatest(result_count, p_result_count), completed_at = coalesce(completed_at, now()), updated_at = now()
  where id = p_reservation_id and user_id = auth.uid() and status in ('started', 'completed')
    and p_result_count <= requested_count;
  if not found then raise exception 'INVALID_CLIP_SHOP_RESERVATION' using errcode = 'P0001'; end if;
end;
$$;

revoke all on function public.finish_clip_shop_generation(uuid, integer) from public, anon;
grant execute on function public.finish_clip_shop_generation(uuid, integer) to authenticated;

create or replace function public.release_clip_shop_generation(p_reservation_id uuid, p_reason text default 'client_canceled')
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.clip_shop_generation_reservations
  set status = 'released', released_at = coalesce(released_at, now()), release_reason = left(coalesce(p_reason, 'client_canceled'), 200), updated_at = now()
  where id = p_reservation_id and user_id = auth.uid() and status in ('reserved', 'released');
  if not found then raise exception 'INVALID_CLIP_SHOP_RESERVATION' using errcode = 'P0001'; end if;
end;
$$;

revoke all on function public.release_clip_shop_generation(uuid, text) from public, anon;
grant execute on function public.release_clip_shop_generation(uuid, text) to authenticated;
