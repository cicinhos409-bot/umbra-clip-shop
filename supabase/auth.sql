-- UMBRA Clip Shop — perfis ligados ao Supabase Auth.
-- Execute este arquivo ANTES de supabase/clip-shop.sql no SQL Editor.
-- O login e as senhas são gerenciados por auth.users; nunca salve senhas em public.
-- IDEMPOTENTE: pode ser executado novamente sem apagar usuários existentes.

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  name text,
  avatar_url text,
  plan text not null default 'free',
  is_admin boolean not null default false,
  trial_ends_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Completa instalações que já possuam uma versão anterior de profiles.
alter table public.profiles add column if not exists email text;
alter table public.profiles add column if not exists name text;
alter table public.profiles add column if not exists avatar_url text;
alter table public.profiles add column if not exists plan text default 'free';
alter table public.profiles add column if not exists is_admin boolean default false;
alter table public.profiles add column if not exists trial_ends_at timestamptz;
alter table public.profiles add column if not exists expires_at timestamptz;
alter table public.profiles add column if not exists created_at timestamptz default now();
alter table public.profiles add column if not exists updated_at timestamptz default now();

update public.profiles set plan = 'free' where plan is null;
update public.profiles set is_admin = false where is_admin is null;
update public.profiles set created_at = now() where created_at is null;
update public.profiles set updated_at = now() where updated_at is null;

alter table public.profiles alter column plan set default 'free';
alter table public.profiles alter column plan set not null;
alter table public.profiles alter column is_admin set default false;
alter table public.profiles alter column is_admin set not null;
alter table public.profiles alter column created_at set default now();
alter table public.profiles alter column created_at set not null;
alter table public.profiles alter column updated_at set default now();
alter table public.profiles alter column updated_at set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_plan_valid'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_plan_valid
      check (plan in ('free', 'pro', 'elite', 'admin'));
  end if;
end
$$;

-- Executada pelo Supabase quando uma conta é criada com auth.signUp().
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, name, avatar_url, plan)
  values (
    new.id,
    new.email,
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'name', new.raw_user_meta_data ->> 'full_name', '')), ''),
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'avatar_url', '')), ''),
    'free'
  )
  on conflict (id) do update
    set email = excluded.email,
        name = coalesce(public.profiles.name, excluded.name),
        avatar_url = coalesce(public.profiles.avatar_url, excluded.avatar_url),
        updated_at = now();

  return new;
end;
$$;

revoke all on function public.handle_new_user() from public, anon, authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Mantém updated_at correto sem confiar no navegador.
create or replace function public.set_profile_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.set_profile_updated_at() from public, anon, authenticated;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_profile_updated_at();

-- Cria perfis para contas que existiam antes desta migração.
insert into public.profiles (id, email, name, avatar_url, plan, created_at, updated_at)
select
  user_row.id,
  user_row.email,
  nullif(trim(coalesce(user_row.raw_user_meta_data ->> 'name', user_row.raw_user_meta_data ->> 'full_name', '')), ''),
  nullif(trim(coalesce(user_row.raw_user_meta_data ->> 'avatar_url', '')), ''),
  'free',
  coalesce(user_row.created_at, now()),
  now()
from auth.users as user_row
on conflict (id) do nothing;

alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
  on public.profiles
  for select
  to authenticated
  using ((select auth.uid()) = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles
  for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- O navegador pode ler o próprio perfil e alterar somente dados públicos.
-- plan, is_admin, trial_ends_at e expires_at ficam restritos ao backend/service role.
revoke all on table public.profiles from anon, authenticated;
grant select on table public.profiles to authenticated;
grant update (name, avatar_url) on table public.profiles to authenticated;

comment on table public.profiles is
  'Perfil público e assinatura do usuário. Credenciais permanecem em auth.users.';

comment on column public.profiles.plan is
  'Plano efetivo: free, pro, elite ou admin. Nunca editável pelo cliente.';

