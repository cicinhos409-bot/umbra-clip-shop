-- UMBRA Clip Shop — retenção de registros técnicos por 3 dias.
-- Execute depois de auth.sql e clip-shop.sql/clip-shop-update-150.sql.
-- Registros individuais são removidos; um contador mensal mínimo preserva os limites dos planos.

begin;

create table if not exists public.clip_shop_monthly_usage_rollups (
  user_id uuid not null references auth.users(id) on delete cascade,
  period_start date not null,
  result_count bigint not null default 0 check (result_count >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, period_start)
);

alter table public.clip_shop_monthly_usage_rollups enable row level security;
revoke all on table public.clip_shop_monthly_usage_rollups from public, anon, authenticated;

create or replace function public.clip_shop_archived_usage(p_user_id uuid, p_period date)
returns bigint language sql stable security definer set search_path = '' as $$
  select coalesce((select r.result_count from public.clip_shop_monthly_usage_rollups r
    where r.user_id = p_user_id and r.period_start = p_period), 0)::bigint
$$;
revoke all on function public.clip_shop_archived_usage(uuid,date) from public, anon, authenticated;

create or replace function public.cleanup_clip_shop_records(p_retention interval default interval '3 days')
returns bigint language plpgsql security definer set search_path = '' as $$
declare v_cutoff timestamptz := now() - greatest(p_retention, interval '3 days'); v_deleted bigint;
begin
  perform pg_advisory_xact_lock(hashtextextended('clip_shop_retention_cleanup', 0));
  insert into public.clip_shop_monthly_usage_rollups (user_id, period_start, result_count)
  select user_id, period_start, sum(result_count)::bigint
  from public.clip_shop_generation_reservations
  where status = 'completed' and coalesce(completed_at, updated_at) < v_cutoff
  group by user_id, period_start
  on conflict (user_id, period_start) do update
    set result_count = public.clip_shop_monthly_usage_rollups.result_count + excluded.result_count,
        updated_at = now();

  delete from public.clip_shop_generation_reservations
  where case when status = 'completed' then coalesce(completed_at, updated_at) else updated_at end < v_cutoff;
  get diagnostics v_deleted = row_count;

  delete from public.clip_shop_monthly_usage_rollups
  where period_start < (date_trunc('month', now()) - interval '1 month')::date;
  return v_deleted;
end;
$$;
revoke all on function public.cleanup_clip_shop_records(interval) from public, anon, authenticated;
grant execute on function public.cleanup_clip_shop_records(interval) to service_role;

create or replace function public.get_clip_shop_usage()
returns table (used bigint, reserved bigint, limit_total integer, remaining bigint, plan text)
language plpgsql stable security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_plan text; v_used bigint; v_reserved bigint; v_limit integer;
  v_period date := date_trunc('month', now())::date;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  v_plan := public.clip_shop_effective_plan(v_user); v_limit := public.clip_shop_plan_limit(v_plan);
  select public.clip_shop_archived_usage(v_user, v_period) + coalesce(sum(r.result_count), 0)::bigint into v_used
  from public.clip_shop_generation_reservations r
  where r.user_id = v_user and r.period_start = v_period and r.status = 'completed';
  select coalesce(sum(r.requested_count), 0)::bigint into v_reserved
  from public.clip_shop_generation_reservations r
  where r.user_id = v_user and r.period_start = v_period and r.status in ('reserved','started') and r.expires_at > now();
  return query select v_used, v_reserved, v_limit,
    case when v_limit < 0 then -1::bigint else greatest(0::bigint, v_limit::bigint-v_used-v_reserved) end, v_plan;
end;
$$;
revoke all on function public.get_clip_shop_usage() from public, anon;
grant execute on function public.get_clip_shop_usage() to authenticated;

create or replace function public.reserve_clip_shop_generation(p_request_id uuid, p_requested_count integer)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_plan text; v_existing uuid; v_existing_status text; v_committed bigint;
  v_limit integer; v_batch_limit integer; v_period date := date_trunc('month',now())::date; v_id uuid;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  if p_request_id is null then raise exception 'REQUEST_ID_REQUIRED' using errcode='22023'; end if;
  if p_requested_count is null or p_requested_count <= 0 then raise exception 'INVALID_REQUESTED_COUNT' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_user::text||':umbra_clip_shop:'||v_period::text,0));
  select id,status into v_existing,v_existing_status from public.clip_shop_generation_reservations
    where user_id=v_user and request_id=p_request_id;
  if v_existing is not null then
    if v_existing_status in ('reserved','started','expired') then return v_existing; end if;
    raise exception 'CLIP_SHOP_REQUEST_ALREADY_FINALIZED' using errcode='P0001';
  end if;
  update public.clip_shop_generation_reservations set status='expired',updated_at=now()
    where user_id=v_user and status in ('reserved','started') and expires_at<=now();
  v_plan:=public.clip_shop_effective_plan(v_user); v_limit:=public.clip_shop_plan_limit(v_plan);
  v_batch_limit:=public.clip_shop_plan_batch_limit(v_plan);
  if p_requested_count>v_batch_limit then raise exception 'CLIP_SHOP_BATCH_LIMIT_REACHED' using errcode='P0001'; end if;
  select public.clip_shop_archived_usage(v_user,v_period)+coalesce(sum(case when status='completed' then result_count
    when status in ('reserved','started') and expires_at>now() then requested_count else 0 end),0)::bigint into v_committed
    from public.clip_shop_generation_reservations where user_id=v_user and period_start=v_period;
  if v_limit>=0 and v_committed+p_requested_count>v_limit then raise exception 'CLIP_SHOP_MONTHLY_LIMIT_REACHED' using errcode='P0001'; end if;
  insert into public.clip_shop_generation_reservations(user_id,request_id,plan_snapshot,requested_count,period_start)
    values(v_user,p_request_id,coalesce(v_plan,'free'),p_requested_count,v_period) returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.reserve_clip_shop_generation(uuid,integer) from public, anon;
grant execute on function public.reserve_clip_shop_generation(uuid,integer) to authenticated;

create or replace function public.start_clip_shop_generation(p_reservation_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_user uuid:=auth.uid(); v_reservation public.clip_shop_generation_reservations%rowtype;
  v_committed bigint; v_limit integer;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  select * into v_reservation from public.clip_shop_generation_reservations
    where id=p_reservation_id and user_id=v_user;
  if not found or v_reservation.status not in ('reserved','started','expired') then
    raise exception 'INVALID_CLIP_SHOP_RESERVATION' using errcode='P0001';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_user::text||':umbra_clip_shop:'||v_reservation.period_start::text,0));
  if v_reservation.status='expired' or v_reservation.expires_at<=now() then
    v_limit:=public.clip_shop_plan_limit(public.clip_shop_effective_plan(v_user));
    select public.clip_shop_archived_usage(v_user,v_reservation.period_start)+coalesce(sum(case
      when status='completed' then result_count
      when status in ('reserved','started') and expires_at>now() then requested_count else 0 end),0)::bigint into v_committed
    from public.clip_shop_generation_reservations
    where user_id=v_user and period_start=v_reservation.period_start and id<>p_reservation_id;
    if v_limit>=0 and v_committed+v_reservation.requested_count>v_limit then
      raise exception 'CLIP_SHOP_RECOVERY_LIMIT_REACHED' using errcode='P0001';
    end if;
  end if;
  update public.clip_shop_generation_reservations
    set status='started',started_at=coalesce(started_at,now()),expires_at=greatest(expires_at,now()+interval '2 hours'),updated_at=now()
    where id=p_reservation_id and user_id=v_user and status in ('reserved','started','expired');
  if not found then raise exception 'INVALID_CLIP_SHOP_RESERVATION' using errcode='P0001'; end if;
end;
$$;
revoke all on function public.start_clip_shop_generation(uuid) from public, anon;
grant execute on function public.start_clip_shop_generation(uuid) to authenticated;

commit;

create extension if not exists pg_cron;
do $$
declare v_job_id bigint;
begin
  select jobid into v_job_id from cron.job where jobname='clip-shop-retention-3-days';
  if v_job_id is not null then perform cron.unschedule(v_job_id); end if;
  perform cron.schedule('clip-shop-retention-3-days','17 3 * * *','select public.cleanup_clip_shop_records(interval ''3 days'');');
end $$;

-- Executa uma limpeza imediata e confirma o agendamento.
select public.cleanup_clip_shop_records(interval '3 days') as records_deleted_now;
select jobid, jobname, schedule, active from cron.job where jobname='clip-shop-retention-3-days';
