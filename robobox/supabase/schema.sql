-- =============================================================================
-- Robobox Connect - production schema (PostgreSQL / Supabase)
--
-- Four tables. Stage, last contact, current value, tasks and the calendar are
-- NOT stored - they are derived from connect history in model.js, exactly as in
-- the browser build. Nothing here can drift out of sync because there is
-- nothing to sync.
-- =============================================================================

create extension if not exists "pgcrypto";

create type sales_role   as enum ('sales', 'sales_head', 'ceo');
create type connect_kind as enum ('New', 'Reconnect');
create type opp_status   as enum ('Open', 'Won', 'Lost');

-- Controlled vocabulary lives in the app (model.js V). Storing it as text keeps
-- adding an offering or a loss reason a one-line change instead of a migration.

create table app_user (
  id         uuid primary key references auth.users (id) on delete cascade,
  name       text not null,
  email      text unique not null,
  role       sales_role not null default 'sales',
  owner_key  text unique,
  active     boolean not null default true
);

-- A school exists exactly once.
create table school (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  location      text,
  region        text not null default 'Mumbai',
  cluster       text,
  board         text,
  students      integer check (students is null or students >= 0),
  existing_lab  text,
  competitor    text default 'None',
  lead_source   text,
  owner_key     text references app_user (owner_key),
  origin        text not null default 'app',
  created_at    timestamptz not null default now(),
  unique (name, location)
);
create index school_owner_idx on school (owner_key);

create table contact (
  id        uuid primary key default gen_random_uuid(),
  school_id uuid not null references school (id) on delete cascade,
  name      text not null,
  role      text,
  phone     text,
  email     text
);
create index contact_school_idx on contact (school_id);

-- A school has many opportunities, one per offering in play.
create table opportunity (
  id                uuid primary key default gen_random_uuid(),
  school_id         uuid not null references school (id) on delete cascade,
  offering          text,
  variant           text,
  owner_key         text references app_user (owner_key),
  -- Written once, at creation. No update path exists; realisation is measured
  -- against it, so overwriting it would destroy the only baseline there is.
  initial_potential numeric(14,2),
  expected_closure  date,
  status            opp_status not null default 'Open',
  closed_value      numeric(14,2),
  final_value       numeric(14,2),
  loss_reason       text,
  closed_at         date,
  origin            text not null default 'app',
  created_at        date not null default current_date
);
create index opportunity_school_idx on opportunity (school_id);
create index opportunity_owner_idx  on opportunity (owner_key);

-- The append-only history. Every interaction, never overwritten.
create table connect (
  id              uuid primary key default gen_random_uuid(),
  school_id       uuid not null references school (id) on delete cascade,
  opportunity_id  uuid references opportunity (id) on delete cascade,
  logged_by       uuid not null references app_user (id),
  kind            connect_kind not null,
  mode            text,
  contact_id      uuid references contact (id),
  response        text,
  interest        text,
  blocker         text default 'None',
  blocker_detail  text,
  changed         text,
  commercial      jsonb not null default '{}'::jsonb,  -- {quoted, negotiated}
  notes           text,
  next_action     text,
  next_action_at  timestamptz,
  at              timestamptz not null default now()
);
create index connect_opp_idx    on connect (opportunity_id, at desc);
create index connect_school_idx on connect (school_id, at desc);
create index connect_user_idx   on connect (logged_by, at desc);

-- Initial potential is a baseline, so the database refuses to change it.
create or replace function freeze_initial_potential() returns trigger
language plpgsql as $$
begin
  if new.initial_potential is distinct from old.initial_potential then
    raise exception 'initial_potential is immutable once set';
  end if;
  return new;
end $$;

create trigger opportunity_freeze_potential before update on opportunity
  for each row execute function freeze_initial_potential();

-- History is history: a connect is never edited, and only its author can remove
-- one they logged today (a typo caught immediately).
create or replace function block_connect_update() returns trigger
language plpgsql as $$
begin raise exception 'connects are append-only'; end $$;

create trigger connect_no_update before update on connect
  for each row execute function block_connect_update();

-- ================================================================ permissions
create or replace function my_role() returns sales_role
language sql stable security definer set search_path = public as $$
  select role from app_user where id = auth.uid()
$$;

create or replace function my_owner_key() returns text
language sql stable security definer set search_path = public as $$
  select owner_key from app_user where id = auth.uid()
$$;

create or replace function sees_all() returns boolean
language sql stable as $$ select my_role() in ('sales_head', 'ceo') $$;

alter table school      enable row level security;
alter table contact     enable row level security;
alter table opportunity enable row level security;
alter table connect     enable row level security;
alter table app_user    enable row level security;

-- A rep sees their own schools; the head of sales and the CEO see everything.
-- This is the server-side twin of RB.auth.visibleSchools().
create policy school_read   on school for select using (sees_all() or owner_key = my_owner_key());
create policy school_write  on school for update using (sees_all() or owner_key = my_owner_key());
create policy school_insert on school for insert with check (auth.uid() is not null);

create policy contact_rw on contact for all
  using (exists (select 1 from school s where s.id = contact.school_id
                 and (sees_all() or s.owner_key = my_owner_key())))
  with check (auth.uid() is not null);

create policy opp_read   on opportunity for select using (sees_all() or owner_key = my_owner_key());
create policy opp_write  on opportunity for update using (sees_all() or owner_key = my_owner_key());
create policy opp_insert on opportunity for insert with check (auth.uid() is not null);

create policy connect_read on connect for select using (
  sees_all() or logged_by = auth.uid()
  or exists (select 1 from school s where s.id = connect.school_id and s.owner_key = my_owner_key()));
create policy connect_insert on connect for insert with check (logged_by = auth.uid());
create policy connect_delete on connect for delete using (
  logged_by = auth.uid() and at > now() - interval '1 day');

create policy user_read on app_user for select using (auth.uid() is not null);
