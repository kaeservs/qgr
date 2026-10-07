-- Team access: who may use the dashboard, and what they may change.
--
-- The web app reaches Supabase as the signed-in person, with the publishable
-- key, never the service role. Row level security decides what they see: a
-- team member reads every table the dashboard shows; anyone else, signed in or
-- not, reads nothing. Only the agents write tables directly. Each change a
-- person makes goes through a function below that checks they are on the team
-- and checks the input, as the agents' functions do.
--
-- Adding a person: create their account (Authentication → Users → Add user),
-- then in the SQL editor:
--   select private.add_team_member('name@example.com', 'owner');

create schema private;
-- Policies call private.is_team_member() as the signed-in role. The schema is
-- not exposed through the API, so nothing in it can be called over HTTP.
grant usage on schema private to authenticated;

-- ---------------------------------------------------------------- the team

create table public.team_members (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  added_at timestamptz not null default now()
);
alter table public.team_members enable row level security;
revoke all on public.team_members from anon, authenticated;

create function private.is_team_member()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.team_members where user_id = (select auth.uid()))
$$;

create function private.require_team_member()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null or not exists (select 1 from public.team_members where user_id = v_user) then
    raise exception 'Only the QGR team can do this' using errcode = '42501';
  end if;
  return v_user;
end
$$;

create function private.add_team_member(p_email text, p_role text default 'member')
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
begin
  select id into v_user from auth.users where lower(email) = lower(btrim(p_email));
  if v_user is null then
    raise exception 'There is no account for % yet: add it under Authentication → Users first', p_email;
  end if;
  insert into public.team_members (user_id, role) values (v_user, p_role)
  on conflict (user_id) do update set role = excluded.role;
  return v_user;
end
$$;

-- Postgres lets everyone execute a new function. Only policies need this one.
revoke all on function private.is_team_member() from public, anon;
revoke all on function private.require_team_member() from public, anon, authenticated;
revoke all on function private.add_team_member(text, text) from public, anon, authenticated;
grant execute on function private.is_team_member() to authenticated;

-- ---------------------------------------------------------------- who did it

alter table public.runs add column created_by uuid references auth.users (id) on delete set null;
alter table public.ad_variants
  add column approved_by uuid references auth.users (id) on delete set null,
  add column updated_by uuid references auth.users (id) on delete set null;
create index runs_created_by on public.runs (created_by);
create index ad_variants_approved_by on public.ad_variants (approved_by);
create index ad_variants_updated_by on public.ad_variants (updated_by);

-- ---------------------------------------------------------------- reading

grant select on
  public.team_members, public.brand_profile, public.competitors, public.runs, public.run_stages,
  public.run_events, public.competitor_reports, public.hooks, public.competitor_ads,
  public.strategies, public.strategy_angles, public.ad_sets, public.ad_variants
to authenticated;

create policy "Team members read the team" on public.team_members
  for select to authenticated using ((select private.is_team_member()));
create policy "Team members read the brand profile" on public.brand_profile
  for select to authenticated using ((select private.is_team_member()));
create policy "Team members read competitors" on public.competitors
  for select to authenticated using ((select private.is_team_member()));
create policy "Team members read runs" on public.runs
  for select to authenticated using ((select private.is_team_member()));
create policy "Team members read run stages" on public.run_stages
  for select to authenticated using ((select private.is_team_member()));
create policy "Team members read run events" on public.run_events
  for select to authenticated using ((select private.is_team_member()));
create policy "Team members read reports" on public.competitor_reports
  for select to authenticated using ((select private.is_team_member()));
create policy "Team members read hooks" on public.hooks
  for select to authenticated using ((select private.is_team_member()));
create policy "Team members read competitor ads" on public.competitor_ads
  for select to authenticated using ((select private.is_team_member()));
create policy "Team members read strategies" on public.strategies
  for select to authenticated using ((select private.is_team_member()));
create policy "Team members read strategy angles" on public.strategy_angles
  for select to authenticated using ((select private.is_team_member()));
create policy "Team members read ad sets" on public.ad_sets
  for select to authenticated using ((select private.is_team_member()));
create policy "Team members read ad variants" on public.ad_variants
  for select to authenticated using ((select private.is_team_member()));

-- ---------------------------------------------------------------- changing

-- Starts a run for the signed-in teammate. The app's server then hands the
-- run's id to n8n; if n8n cannot be reached it calls report_start_failure, so
-- the run shows why instead of waiting forever.
create function public.create_run(
  p_kind text,
  p_input text,
  p_title text,
  p_platforms text[],
  p_goal text,
  p_url text default null,
  p_competitor_name text default null,
  p_files text[] default null,
  p_excerpt text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := private.require_team_member();
  v_id uuid;
begin
  if cardinality(p_platforms) <> (select count(distinct p) from unnest(p_platforms) as p) then
    raise exception 'A platform is listed twice';
  end if;
  v_id := public.start_run(p_kind, p_input, p_title, p_platforms, p_goal, p_url, p_competitor_name, p_files, p_excerpt);
  update public.runs set created_by = v_user where id = v_id;
  return v_id;
end
$$;

-- The app could not hand a run to n8n. Marks the run's first agent failed with
-- the reason, so the run page offers a retry. Only for a run no agent has
-- picked up yet.
create function public.report_start_failure(p_run_id uuid, p_error text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_stage text;
begin
  perform private.require_team_member();
  if exists (select 1 from public.run_stages where run_id = p_run_id and status not in ('queued', 'skipped')) then
    raise exception 'Run % has already started', p_run_id;
  end if;
  select stage into v_stage
    from public.run_stages
   where run_id = p_run_id and status = 'queued'
   order by case stage when 'tracker' then 1 when 'strategist' then 2 else 3 end
   limit 1;
  if v_stage is null then
    raise exception 'Run % not found', p_run_id;
  end if;
  update public.run_stages
     set status = 'failed',
         error = left(coalesce(nullif(btrim(p_error), ''), 'The agents could not be reached.'), 500),
         finished_at = now()
   where run_id = p_run_id and stage = v_stage;
  insert into public.run_events (run_id, text) values (p_run_id, 'Stopped: the agents could not be reached');
end
$$;

-- Saves a person's edits to one variant: the words on its image and its copy
-- for each of the run's platforms. The app's server works the guardrail flags
-- out again from the new words (lib/guardrails.ts) and they are stored with them.
create function public.save_variant(p_variant_id uuid, p_creative_text text, p_copy jsonb, p_warnings text[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := private.require_team_member();
  v_variant public.ad_variants;
  v_platforms text[];
  v_run uuid;
  v_platform text;
  v_entry jsonb;
begin
  select * into v_variant from public.ad_variants where id = p_variant_id for update;
  if not found then
    raise exception 'Variant % not found', p_variant_id;
  end if;
  select r.id, r.platforms into v_run, v_platforms
    from public.ad_sets s
    join public.runs r on r.id = s.run_id
   where s.id = v_variant.ad_set_id;

  if coalesce(length(btrim(p_creative_text)), 0) not between 1 and 120 then
    raise exception 'The image text needs 1 to 120 characters';
  end if;
  if jsonb_typeof(p_copy) is distinct from 'object' then
    raise exception 'The copy must be keyed by platform';
  end if;
  if exists (select 1 from jsonb_object_keys(p_copy) as k where not (k = any (v_platforms))) then
    raise exception 'The copy names a platform this run did not ask for';
  end if;
  foreach v_platform in array v_platforms loop
    v_entry := p_copy -> v_platform;
    if jsonb_typeof(v_entry) is distinct from 'object' then
      raise exception 'The % copy is missing', v_platform;
    end if;
    if exists (
      select 1 from jsonb_each(v_entry) as e
       where e.key not in ('text', 'headline', 'description', 'cta') or jsonb_typeof(e.value) <> 'string'
    ) then
      raise exception 'The % copy has a field it should not', v_platform;
    end if;
    if coalesce(length(btrim(v_entry ->> 'text')), 0) not between 1 and 3000
       or coalesce(length(btrim(v_entry ->> 'headline')), 0) not between 1 and 300
       or coalesce(length(v_entry ->> 'description'), 0) > 300
       or coalesce(length(v_entry ->> 'cta'), 0) > 40 then
      raise exception 'The % copy is empty or too long', v_platform;
    end if;
  end loop;
  if coalesce(cardinality(p_warnings), 0) > 50
     or exists (select 1 from unnest(p_warnings) as w where coalesce(length(w), 0) not between 1 and 200) then
    raise exception 'The guardrail flags are not valid';
  end if;

  update public.ad_variants
     set creative_text = btrim(p_creative_text),
         copy = p_copy,
         warnings = coalesce(p_warnings, '{}'),
         updated_at = now(),
         updated_by = v_user
   where id = p_variant_id;
  insert into public.run_events (run_id, text) values (v_run, 'Variant ' || v_variant.label || ' edited');
end
$$;

-- Approves one variant. The first approval in a set also approves its run and
-- the strategy behind it.
create function public.approve_variant(p_variant_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := private.require_team_member();
  v_variant public.ad_variants;
  v_set public.ad_sets;
begin
  select * into v_variant from public.ad_variants where id = p_variant_id for update;
  if not found then
    raise exception 'Variant % not found', p_variant_id;
  end if;
  if v_variant.approved_at is not null then
    return;
  end if;
  select * into v_set from public.ad_sets where id = v_variant.ad_set_id;

  update public.ad_variants set approved_at = now(), approved_by = v_user where id = p_variant_id;
  update public.runs set approved_at = coalesce(approved_at, now()) where id = v_set.run_id;
  update public.strategies set approved_at = coalesce(approved_at, now()) where id = v_set.strategy_id;
  insert into public.run_events (run_id, text) values (v_set.run_id, 'Variant ' || v_variant.label || ' approved');
end
$$;

-- The brand profile every agent reads before it writes.
create function public.update_brand_profile(
  p_company text,
  p_website text,
  p_offer text,
  p_audience text,
  p_voice text[],
  p_guardrails text[],
  p_page_name text,
  p_x_handle text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_handle text := btrim(coalesce(p_x_handle, ''));
begin
  perform private.require_team_member();
  if coalesce(length(btrim(p_company)), 0) not between 1 and 120
     or coalesce(length(btrim(p_website)), 0) not between 1 and 200
     or coalesce(length(btrim(p_offer)), 0) not between 1 and 1000
     or coalesce(length(btrim(p_audience)), 0) not between 1 and 1000
     or coalesce(length(btrim(p_page_name)), 0) not between 1 and 80 then
    raise exception 'Every field needs a value, within its length';
  end if;
  if v_handle !~ '^@?[A-Za-z0-9_]{1,15}$' then
    raise exception 'The X handle should look like @quantumglobal';
  end if;
  if coalesce(cardinality(p_voice), 0) not between 1 and 6
     or exists (select 1 from unnest(p_voice) as v where coalesce(length(btrim(v)), 0) not between 1 and 40) then
    raise exception 'Pick one to six words for the voice';
  end if;
  if coalesce(cardinality(p_guardrails), 0) > 12
     or exists (select 1 from unnest(p_guardrails) as g where coalesce(length(btrim(g)), 0) not between 1 and 200) then
    raise exception 'Up to 12 guardrails, each up to 200 characters';
  end if;

  update public.brand_profile
     set company = btrim(p_company),
         website = btrim(p_website),
         offer = btrim(p_offer),
         audience = btrim(p_audience),
         voice = array(select btrim(v) from unnest(p_voice) with ordinality as t(v, n) order by n),
         guardrails = array(select btrim(g) from unnest(coalesce(p_guardrails, '{}')) with ordinality as t(g, n) order by n),
         page_name = btrim(p_page_name),
         x_handle = case when left(v_handle, 1) = '@' then v_handle else '@' || v_handle end,
         updated_at = now()
   where id = 1;
end
$$;

-- Signed-in teammates may call these; each checks membership itself.
revoke execute on function
  public.create_run(text, text, text, text[], text, text, text, text[], text),
  public.report_start_failure(uuid, text),
  public.save_variant(uuid, text, jsonb, text[]),
  public.approve_variant(uuid),
  public.update_brand_profile(text, text, text, text, text[], text[], text, text)
from public, anon;
grant execute on function
  public.create_run(text, text, text, text[], text, text, text, text[], text),
  public.report_start_failure(uuid, text),
  public.save_variant(uuid, text, jsonb, text[]),
  public.approve_variant(uuid),
  public.update_brand_profile(text, text, text, text, text[], text[], text, text)
to authenticated, service_role;
