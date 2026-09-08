-- =============================================================================
-- Robobox Sales OS - production schema (PostgreSQL / Supabase)
--
-- The browser build stores everything in localStorage so the pilot runs with no
-- server. This is the same shape as a real table set, with row-level security
-- doing in the database exactly what RB.auth does in the client: a rep sees
-- their own accounts, the head of sales sees the team's, the CEO sees all, and
-- nobody but the CEO reads the company-wide analytics views.
-- =============================================================================

create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------- vocabulary
create type sales_role as enum ('sales', 'sales_head', 'ceo');

create type deal_stage as enum (
  'New Lead', 'Contacted', 'Meeting Fixed', 'Meeting Done', 'Demo',
  'Proposal', 'Negotiation', 'Verbal Confirmation', 'Won', 'Lost', 'On Hold'
);

create type activity_type as enum (
  'Call', 'Meeting', 'School Visit', 'Demo', 'Workshop',
  'Proposal Sent', 'Email', 'WhatsApp', 'Other'
);

create type activity_outcome as enum ('Positive', 'Neutral', 'Negative', 'No response');

create type date_precision as enum ('exact', 'day', 'month', 'none');

-- ---------------------------------------------------------------------- users
-- Mirrors auth.users; the host site's existing login populates this.
create table app_user (
  id          uuid primary key references auth.users (id) on delete cascade,
  name        text not null,
  email       text unique not null,
  role        sales_role not null default 'sales',
  owner_key   text unique,            -- the name used in the imported sheet, e.g. 'AYUSH'
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

-- -------------------------------------------------------------------- schools
create table school (
  id                        uuid primary key default gen_random_uuid(),
  source_sr_no              text,
  name                      text not null,
  region                    text,
  location                  text,
  boards                    text[] not null default '{}',
  students                  integer check (students is null or students >= 0),
  students_min              integer,
  students_max              integer,
  decision_maker            text,
  lead_source               text,
  lead_source_raw           text,

  opportunity_status        text not null default 'Needs qualification',
  opportunity               text,
  deal_size                 numeric(14,2) check (deal_size is null or deal_size >= 0),
  rate_per_student          integer generated always as (
                              case when deal_size is not null and students > 0
                                   then round(deal_size / students)::int end
                            ) stored,

  -- Confirmed stage only. Never write a guess here; suggested_stage carries it.
  stage                     deal_stage,
  suggested_stage           deal_stage,
  suggested_stage_reason    text,
  probability               smallint check (probability between 0 and 100),

  last_contacted            date,
  last_contacted_raw        text,
  last_contacted_precision  date_precision not null default 'none',
  contact_status            text,

  next_action               text,
  next_action_date          date,
  expected_closure          date,
  expected_closure_raw      text,

  blockers                  text,
  blocker_tags              text[] not null default '{}',
  competitors               text[] not null default '{}',
  remarks                   text,

  duplicate_flag            boolean not null default false,
  created_by                uuid references app_user (id),
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);

create index school_region_idx        on school (region);
create index school_stage_idx         on school (stage);
create index school_last_contacted_ix on school (last_contacted);
create index school_next_action_ix    on school (next_action_date);
create index school_name_trgm         on school using gin (to_tsvector('simple', name));

-- A school can be shared between reps, exactly as the sheet's "AYUSH & PARTH" rows were.
create table school_owner (
  school_id uuid not null references school (id) on delete cascade,
  user_id   uuid not null references app_user (id) on delete cascade,
  primary key (school_id, user_id)
);
create index school_owner_user_idx on school_owner (user_id);

-- ------------------------------------------------------------------ activity
-- The only thing a rep writes. Everything on `school` is kept current from here.
create table activity (
  id                uuid primary key default gen_random_uuid(),
  school_id         uuid not null references school (id) on delete cascade,
  logged_by         uuid not null references app_user (id),
  happened_on       date not null default current_date,
  logged_at         timestamptz not null default now(),
  type              activity_type not null,
  contact           text,
  outcome           activity_outcome not null default 'Neutral',
  notes             text,
  stage_from        deal_stage,
  stage_to          deal_stage,
  next_action       text,
  next_action_date  date,
  deal_size         numeric(14,2),
  expected_closure  date,
  blockers          text,
  constraint activity_not_future check (happened_on <= current_date)
);
create index activity_school_idx on activity (school_id, happened_on desc);
create index activity_user_idx   on activity (logged_by, happened_on desc);

-- -------------------------------------------------------------------- settings
create table app_setting (
  key         text primary key,
  value       jsonb not null,
  updated_by  uuid references app_user (id),
  updated_at  timestamptz not null default now()
);
insert into app_setting (key, value) values
  ('tam_rate_per_student', '1700'::jsonb),
  ('stalled_after_days',   '30'::jsonb)
on conflict (key) do nothing;

-- ==================================================================== triggers
-- Rolling the activity forward into the school row is the automation the
-- spreadsheet never had. Doing it in the database means it holds no matter
-- which client wrote the activity.
create or replace function apply_activity_to_school() returns trigger
language plpgsql as $$
begin
  update school s set
    last_contacted           = greatest(coalesce(s.last_contacted, new.happened_on), new.happened_on),
    last_contacted_precision = 'exact',
    last_contacted_raw       = null,
    contact_status           = 'Contacted',
    stage                    = coalesce(new.stage_to, s.stage),
    next_action              = coalesce(new.next_action, s.next_action),
    next_action_date         = coalesce(new.next_action_date, s.next_action_date),
    deal_size                = coalesce(new.deal_size, s.deal_size),
    expected_closure         = coalesce(new.expected_closure, s.expected_closure),
    blockers                 = coalesce(new.blockers, s.blockers),
    opportunity_status       = case
                                 when new.stage_to is not null or new.deal_size is not null
                                   then 'Opportunity identified'
                                 else s.opportunity_status
                               end,
    updated_at               = now()
  where s.id = new.school_id;

  -- Whoever works the account owns it, if nobody did.
  insert into school_owner (school_id, user_id)
  select new.school_id, new.logged_by
  where not exists (select 1 from school_owner where school_id = new.school_id);

  return new;
end $$;

create trigger activity_rolls_up
  after insert on activity
  for each row execute function apply_activity_to_school();

create or replace function touch_updated_at() returns trigger
language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

create trigger school_touch before update on school
  for each row execute function touch_updated_at();

-- ================================================================ permissions
create or replace function current_role_of() returns sales_role
language sql stable security definer set search_path = public as $$
  select role from app_user where id = auth.uid()
$$;

create or replace function can_see_all() returns boolean
language sql stable as $$
  select current_role_of() in ('sales_head', 'ceo')
$$;

alter table school       enable row level security;
alter table school_owner enable row level security;
alter table activity     enable row level security;
alter table app_user     enable row level security;
alter table app_setting  enable row level security;

-- A rep sees the accounts they own or have worked; head of sales and the CEO
-- see everything. This is the server-side twin of RB.auth.visibleSchools().
create policy school_read on school for select using (
  can_see_all()
  or exists (select 1 from school_owner o where o.school_id = school.id and o.user_id = auth.uid())
  or exists (select 1 from activity a where a.school_id = school.id and a.logged_by = auth.uid())
);

create policy school_write on school for update using (
  can_see_all()
  or exists (select 1 from school_owner o where o.school_id = school.id and o.user_id = auth.uid())
);

create policy school_insert on school for insert with check (auth.uid() is not null);

create policy owner_read on school_owner for select using (
  can_see_all() or user_id = auth.uid()
);
create policy owner_write on school_owner for all using (can_see_all()) with check (can_see_all());

create policy activity_read on activity for select using (
  can_see_all()
  or logged_by = auth.uid()
  or exists (select 1 from school_owner o where o.school_id = activity.school_id and o.user_id = auth.uid())
);
create policy activity_insert on activity for insert with check (logged_by = auth.uid());
-- Activities are an audit trail: no updates, and only your own same-day deletes.
create policy activity_delete on activity for delete using (
  logged_by = auth.uid() and logged_at > now() - interval '1 day'
);

create policy user_read on app_user for select using (auth.uid() is not null);
create policy user_self on app_user for update using (id = auth.uid());

create policy setting_read  on app_setting for select using (auth.uid() is not null);
create policy setting_write on app_setting for all
  using (current_role_of() = 'ceo') with check (current_role_of() = 'ceo');

-- ===================================================================== views
-- The CEO dashboard reads these. They are security_invoker, so RLS still
-- applies: a rep querying them sees only their own rows, never the company
-- roll-up, even if they call the API directly.
create view v_school_health with (security_invoker = true) as
select
  s.*,
  coalesce(s.stage, s.suggested_stage) as effective_stage,
  (s.stage is not null)                as stage_confirmed,
  current_date - s.last_contacted      as days_since_contact,
  (s.next_action_date < current_date)  as overdue,
  (select count(*) from activity a where a.school_id = s.id) as activity_count,
  array_remove(array[
    case when not exists (select 1 from school_owner o where o.school_id = s.id) then 'Sales owner' end,
    case when s.opportunity      is null then 'Opportunity' end,
    case when s.stage            is null then 'Stage' end,
    case when s.deal_size        is null then 'Deal size' end,
    case when s.last_contacted   is null then 'Last contacted' end,
    case when s.next_action      is null then 'Next action' end,
    case when s.expected_closure is null then 'Expected closure' end
  ], null) as missing_fields
from school s;

create view v_rep_scorecard with (security_invoker = true) as
select
  u.id, u.name, u.role,
  count(distinct s.id)                                             as accounts,
  sum(s.deal_size) filter (where coalesce(s.stage, s.suggested_stage)
        not in ('Won', 'Lost', 'On Hold'))                         as open_value,
  sum(s.deal_size) filter (where s.stage = 'Won')                  as won_value,
  count(*) filter (where current_date - s.last_contacted > 30)     as gone_quiet,
  (select count(*) from activity a where a.logged_by = u.id)       as activities,
  (select max(happened_on) from activity a where a.logged_by = u.id) as last_activity
from app_user u
left join school_owner o on o.user_id = u.id
left join school s       on s.id = o.school_id
group by u.id, u.name, u.role;
