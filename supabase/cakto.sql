-- UMBRA Clip Shop — integração idempotente Cakto -> assinaturas.
-- Execute depois de auth.sql e antes ou depois de clip-shop.sql.

create table if not exists public.cakto_webhook_events (
  event_id text primary key,
  event_type text not null,
  customer_email text not null,
  plan text not null check (plan in ('free', 'pro', 'elite')),
  offer_id text,
  product_id text,
  checkout_id text,
  amount numeric(12,2) not null default 0,
  occurred_at timestamptz not null,
  processed_at timestamptz not null default now()
);

create index if not exists cakto_webhook_events_email_idx
  on public.cakto_webhook_events (customer_email);

create table if not exists public.cakto_entitlements (
  customer_email text primary key,
  plan text not null check (plan in ('pro', 'elite')),
  status text not null check (status in ('active', 'canceled', 'refunded', 'chargeback')),
  expires_at timestamptz,
  last_event_id text not null references public.cakto_webhook_events(event_id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.cakto_webhook_events enable row level security;
alter table public.cakto_entitlements enable row level security;
revoke all on table public.cakto_webhook_events from anon, authenticated;
revoke all on table public.cakto_entitlements from anon, authenticated;

create or replace function public.process_cakto_webhook(
  p_event_id text,
  p_event text,
  p_email text,
  p_plan text,
  p_offer_id text default null,
  p_product_id text default null,
  p_checkout_id text default null,
  p_amount numeric default 0,
  p_period_months integer default 1,
  p_occurred_at timestamptz default now()
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(trim(p_email));
  v_inserted integer;
  v_expires_at timestamptz;
  v_status text;
begin
  if p_event_id is null or trim(p_event_id) = '' or v_email = '' then
    raise exception 'INVALID_CAKTO_EVENT' using errcode = '22023';
  end if;
  if p_plan not in ('free', 'pro', 'elite') then
    raise exception 'INVALID_CAKTO_PLAN' using errcode = '22023';
  end if;

  insert into public.cakto_webhook_events
    (event_id, event_type, customer_email, plan, offer_id, product_id, checkout_id, amount, occurred_at)
  values
    (p_event_id, p_event, v_email, p_plan, p_offer_id, p_product_id, p_checkout_id, greatest(0, coalesce(p_amount, 0)), coalesce(p_occurred_at, now()))
  on conflict (event_id) do nothing;
  get diagnostics v_inserted = row_count;
  if v_inserted = 0 then return 'duplicate'; end if;

  if p_event in ('purchase_approved', 'subscription_created', 'subscription_renewed') then
    v_expires_at := now() + make_interval(months => greatest(1, least(coalesce(p_period_months, 1), 24)));

    insert into public.cakto_entitlements (customer_email, plan, status, expires_at, last_event_id)
    values (v_email, p_plan, 'active', v_expires_at, p_event_id)
    on conflict (customer_email) do update
      set plan = excluded.plan,
          status = 'active',
          expires_at = case
            when p_event = 'subscription_renewed'
              then greatest(coalesce(public.cakto_entitlements.expires_at, now()), now())
                   + make_interval(months => greatest(1, least(coalesce(p_period_months, 1), 24)))
            else excluded.expires_at
          end,
          last_event_id = excluded.last_event_id,
          updated_at = now();

    update public.profiles
      set plan = p_plan,
          expires_at = (select entitlement.expires_at from public.cakto_entitlements entitlement where entitlement.customer_email = v_email),
          updated_at = now()
      where lower(email) = v_email and not is_admin;
    return 'activated';
  end if;

  v_status := case p_event when 'refund' then 'refunded' when 'chargeback' then 'chargeback' else 'canceled' end;
  update public.cakto_entitlements
    set status = v_status, expires_at = now(), last_event_id = p_event_id, updated_at = now()
    where customer_email = v_email;
  update public.profiles
    set plan = 'free', expires_at = null, updated_at = now()
    where lower(email) = v_email and not is_admin;
  return 'revoked';
end;
$$;

revoke all on function public.process_cakto_webhook(text,text,text,text,text,text,text,numeric,integer,timestamptz)
  from public, anon, authenticated;
grant execute on function public.process_cakto_webhook(text,text,text,text,text,text,text,numeric,integer,timestamptz)
  to service_role;

-- Compra feita antes do cadastro: aplica o direito assim que auth.users for criado.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_entitlement public.cakto_entitlements%rowtype;
begin
  select * into v_entitlement
  from public.cakto_entitlements
  where customer_email = lower(new.email)
    and status = 'active'
    and (expires_at is null or expires_at > now());

  insert into public.profiles (id, email, name, avatar_url, plan, expires_at)
  values (
    new.id,
    new.email,
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'name', new.raw_user_meta_data ->> 'full_name', '')), ''),
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'avatar_url', '')), ''),
    coalesce(v_entitlement.plan, 'free'),
    v_entitlement.expires_at
  )
  on conflict (id) do update
    set email = excluded.email,
        name = coalesce(public.profiles.name, excluded.name),
        avatar_url = coalesce(public.profiles.avatar_url, excluded.avatar_url),
        plan = case when public.profiles.is_admin then public.profiles.plan else excluded.plan end,
        expires_at = case when public.profiles.is_admin then public.profiles.expires_at else excluded.expires_at end,
        updated_at = now();
  return new;
end;
$$;

revoke all on function public.handle_new_user() from public, anon, authenticated;

