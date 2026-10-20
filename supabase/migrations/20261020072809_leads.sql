-- Leads: the people who answered QGR's ads and posts, as Zoho CRM holds them,
-- each judged against what the team says makes a lead qualified, and tied to
-- the campaign and the ad it came from where the lead says so.
--
-- * Zoho stays where leads live. n8n ("QGR · Leads") reads the ones added or
--   changed since its last read, every fifteen minutes, with the team's Zoho
--   login, which never leaves n8n. Only what the dashboard needs is copied:
--   the name, what the lead said and what Zoho knows of them, where they came
--   from and the sales team's status. Email addresses, phone numbers and
--   street addresses stay in Zoho; the dashboard links to the lead there.
-- * A lead is tied to an ad by what it carries: Meta's campaign and ad from a
--   lead form, or the tags on the link it followed. A QGR post's link is tagged
--   with its run and variant (utm_campaign qgr-<run>, utm_content
--   <label>-<place>), which ties the lead to that variant. A lead that carries
--   neither is not tied to a campaign: never guessed.
-- * A post can carry the link the team sends people to, tagged by the
--   database as it is scheduled (schedule_post, with "link": true on a place),
--   so the words that go out are the words the publish dialog showed.
-- * Claude (n8n) judges each new lead against the team's criteria: qualified,
--   not qualified, or can't tell, each reason quoting what the lead said. A
--   person can set the verdict; theirs counts over Claude's, and their reason
--   becomes an example the next judgements read. Counts are worked out in code.

-- ---------------------------------------------------------------- settings

alter table public.team_settings
  add column lead_criteria text not null default
    E'A qualified lead:\n' ||
    E'- is looking at U.S. residency through investment (EB-5), for themselves or their family;\n' ||
    E'- says they can invest at least US$800,000, the EB-5 minimum in a targeted employment area, from funds they can show the source of;\n' ||
    E'- wants to start within the next 12 months.\n\n' ||
    E'Not qualified: looking only for work, study or a visit; says they cannot invest that much; a vendor, a test or spam.\n\n' ||
    E'Can''t tell: the lead does not say enough about their budget or their plans.'
    check (char_length(lead_criteria) between 20 and 4000),
  -- When the criteria last changed: a verdict judged before reads as on older criteria.
  add column lead_criteria_at timestamptz not null default now(),
  -- Off until the team switches it on, once Zoho is connected in n8n.
  add column leads_source text not null default 'off' check (leads_source in ('off', 'zoho')),
  -- Zoho's region (zoho.com, zoho.eu, ...) and the organisation in the CRM's
  -- address, for the API and for the link to each lead.
  add column zoho_region text check (zoho_region in ('com', 'eu', 'in', 'com.au', 'jp', 'ca', 'sa', 'com.cn')),
  add column zoho_org text check (zoho_org ~ '^org[0-9]{1,20}$'),
  -- The newest change read from Zoho: the next read asks for what changed after it.
  add column leads_synced_at timestamptz,
  add column leads_checked_at timestamptz,
  add column leads_sync_error text,
  -- Where posts send people: a post that asks for it carries this link, tagged
  -- with its run, variant and place. Null: posts carry no link.
  add column post_link text check (char_length(post_link) <= 300 and post_link ~ '^https://[^\s?#]+(\?[^\s#]*)?$');

-- ---------------------------------------------------------------- leads

create table public.leads (
  id uuid primary key default gen_random_uuid(),
  zoho_id text not null unique check (zoho_id ~ '^[0-9]{1,30}$'),
  name text not null check (char_length(name) between 1 and 120),
  -- The sales team's Lead Status and Lead Source, as Zoho has them.
  zoho_status text check (char_length(zoho_status) <= 80),
  zoho_source text check (char_length(zoho_source) <= 80),
  -- Where it came from, read from its tags and source (meta: a Meta lead form
  -- that does not say Facebook or Instagram; other: not known).
  platform text not null default 'other' check (platform in ('facebook', 'instagram', 'meta', 'linkedin', 'x', 'website', 'other')),
  -- What it carries about its ad: { id, name, ad_id, ad_name, adset, form } from
  -- a lead form, and { utm: { source, medium, campaign, content, term } }.
  campaign jsonb not null default '{}'::jsonb check (jsonb_typeof(campaign) = 'object' and pg_column_size(campaign) < 4096),
  -- What the lead said and what Zoho knows of them, never contact details: [{ field, value }].
  answers jsonb not null default '[]'::jsonb check (jsonb_typeof(answers) = 'array' and pg_column_size(answers) < 32768),
  -- The QGR post it came from, by its tagged link.
  run_id uuid references public.runs (id) on delete set null,
  variant_id uuid references public.ad_variants (id) on delete set null,
  place text check (place in ('facebook', 'instagram', 'linkedin', 'x')),
  created_in_zoho timestamptz not null,
  modified_in_zoho timestamptz not null,
  -- Claude's judgement: [{ text, field, quote }], each quote copied from an answer.
  verdict text check (verdict in ('qualified', 'not_qualified', 'unclear')),
  reasons jsonb not null default '[]'::jsonb check (jsonb_typeof(reasons) = 'array'),
  judged_at timestamptz,
  -- The criteria it was judged against (team_settings.lead_criteria_at then).
  judged_criteria_at timestamptz,
  judge_status text not null default 'queued' check (judge_status in ('queued', 'working', 'done', 'failed')),
  judge_attempts integer not null default 0,
  judge_claimed_at timestamptz,
  judge_error text,
  -- A person's verdict, which counts over Claude's.
  person_verdict text check (person_verdict in ('qualified', 'not_qualified')),
  person_note text check (char_length(person_note) <= 500),
  person_by uuid references auth.users (id) on delete set null,
  person_at timestamptz,
  first_seen_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index leads_created on public.leads (created_in_zoho desc);
create index leads_due on public.leads (judge_status, judge_claimed_at);
create index leads_run on public.leads (run_id);
create index leads_variant on public.leads (variant_id);
create index leads_person_by on public.leads (person_by);

-- What judging the leads cost, on failure too.
create table public.lead_usage (
  id bigint generated always as identity primary key,
  lead_id uuid not null references public.leads (id) on delete cascade,
  model text not null,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  cache_creation_input_tokens integer not null default 0,
  cache_read_input_tokens integer not null default 0,
  created_at timestamptz not null default now()
);
create index lead_usage_lead on public.lead_usage (lead_id);

alter table public.leads enable row level security;
alter table public.lead_usage enable row level security;
revoke all on public.leads, public.lead_usage from public, anon, authenticated;
grant select on public.leads, public.lead_usage to authenticated;
create policy "Team members read the leads" on public.leads
  for select to authenticated using ((select private.is_team_member()));
create policy "Team members read what judging the leads cost" on public.lead_usage
  for select to authenticated using ((select private.is_team_member()));

-- ---------------------------------------------------------------- the team

-- What makes a lead qualified, in the team's words. Leads judged before keep
-- their verdict, marked as on older criteria, until someone judges them again.
create function public.update_lead_criteria(p_criteria text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := private.require_team_member();
  v_text text := btrim(coalesce(p_criteria, ''));
begin
  if char_length(v_text) < 20 or char_length(v_text) > 4000 then
    raise exception 'Say what makes a lead qualified in 20 to 4,000 characters';
  end if;
  update public.team_settings
     set lead_criteria = v_text,
         lead_criteria_at = case when lead_criteria is distinct from v_text then now() else lead_criteria_at end,
         updated_at = now(), updated_by = v_user
   where id = 1;
end
$$;

-- Where leads come from: off, or Zoho CRM in its region, with the
-- organisation in its address (for the link to each lead).
create function public.set_leads_source(p_source text, p_region text default null, p_org text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := private.require_team_member();
begin
  if p_source is null or p_source not in ('off', 'zoho') then
    raise exception 'Leads come from Zoho, or are off';
  end if;
  if p_source = 'zoho' and (p_region is null or p_region not in ('com', 'eu', 'in', 'com.au', 'jp', 'ca', 'sa', 'com.cn')) then
    raise exception 'Paste the address of your Zoho CRM, as your browser shows it';
  end if;
  if p_org is not null and p_org !~ '^org[0-9]{1,20}$' then
    raise exception 'That Zoho address does not name an organisation';
  end if;
  update public.team_settings
     set leads_source = p_source,
         zoho_region = case when p_source = 'zoho' then p_region else zoho_region end,
         zoho_org = case when p_source = 'zoho' then p_org else zoho_org end,
         leads_sync_error = case when p_source = 'zoho' then null else leads_sync_error end,
         updated_at = now(), updated_by = v_user
   where id = 1;
end
$$;

-- A person's verdict on a lead, with why. Null takes it back, and Claude's counts again.
create function public.set_lead_verdict(p_lead_id uuid, p_verdict text, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := private.require_team_member();
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if p_verdict is not null and p_verdict not in ('qualified', 'not_qualified') then
    raise exception 'A lead is qualified or not qualified';
  end if;
  if v_note is not null and char_length(v_note) > 500 then
    raise exception 'Keep the reason under 500 characters';
  end if;
  update public.leads
     set person_verdict = p_verdict,
         person_note = case when p_verdict is null then null else v_note end,
         person_by = case when p_verdict is null then null else v_user end,
         person_at = case when p_verdict is null then null else now() end,
         updated_at = now()
   where id = p_lead_id;
  if not found then
    raise exception 'That lead is gone';
  end if;
end
$$;

-- Judges a lead again, or every lead of the last 90 days judged on older
-- criteria or not judged at all; the 300 newest at most. Returns how many.
create function public.judge_leads_again(p_lead_id uuid default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
  v_at timestamptz;
begin
  perform private.require_team_member();
  if p_lead_id is not null then
    update public.leads
       set judge_status = 'queued', judge_attempts = 0, judge_claimed_at = null, judge_error = null, updated_at = now()
     where id = p_lead_id and judge_status <> 'working';
    get diagnostics v_count = row_count;
    if v_count = 0 then
      raise exception 'That lead is being judged now, or is gone';
    end if;
    return v_count;
  end if;
  select lead_criteria_at into v_at from public.team_settings where id = 1;
  with older as (
    select id from public.leads
     where created_in_zoho > now() - interval '90 days'
       and judge_status in ('done', 'failed')
       and (judge_status = 'failed' or judged_criteria_at is null or judged_criteria_at < v_at)
     order by created_in_zoho desc
     limit 300
  )
  update public.leads l
     set judge_status = 'queued', judge_attempts = 0, judge_claimed_at = null, judge_error = null, updated_at = now()
    from older
   where l.id = older.id;
  get diagnostics v_count = row_count;
  return v_count;
end
$$;

-- ---------------------------------------------------------------- n8n

-- Whether to read Zoho, where, and from when: the newest change already read,
-- or the last 90 days the first time, so an old CRM is not judged whole.
create function public.leads_sync_plan()
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'on', s.leads_source = 'zoho' and s.zoho_region is not null,
    'api', case when s.zoho_region is null then null else 'https://www.zohoapis.' || s.zoho_region end,
    'since', to_char(coalesce(s.leads_synced_at, now() - interval '90 days') at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"+00:00"')
  )
  from public.team_settings s
  where s.id = 1;
$$;

-- The leads read from Zoho, added or brought up to date. A lead whose answers
-- changed is judged again; the verdict a person set stays. Codes in its tags
-- tie it to a QGR run and variant. p_newest is the newest change read, so the
-- next read starts there.
create function public.leads_record(p_leads jsonb, p_newest timestamptz default null)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_lead jsonb;
  v_run uuid;
  v_variant uuid;
  v_place text;
  v_platform text;
  v_count integer := 0;
begin
  if jsonb_typeof(p_leads) is distinct from 'array' or jsonb_array_length(p_leads) > 500 then
    raise exception 'The leads must be a list of 500 at most';
  end if;
  for v_lead in select value from jsonb_array_elements(p_leads) loop
    if coalesce(v_lead ->> 'zoho_id', '') !~ '^[0-9]{1,30}$' then
      raise exception 'A lead has no Zoho id';
    end if;
    if jsonb_typeof(v_lead -> 'answers') is distinct from 'array' or jsonb_array_length(v_lead -> 'answers') > 40 then
      raise exception 'A lead''s answers are not readable';
    end if;
    v_platform := coalesce(v_lead ->> 'platform', 'other');
    if v_platform not in ('facebook', 'instagram', 'meta', 'linkedin', 'x', 'website', 'other') then
      v_platform := 'other';
    end if;

    v_run := null;
    v_variant := null;
    v_place := null;
    if coalesce(v_lead ->> 'run_code', '') ~ '^[0-9a-f]{8}$' then
      select r.id into v_run from public.runs r where r.id::text like (v_lead ->> 'run_code') || '%' order by r.created_at desc limit 1;
    end if;
    if v_run is not null and coalesce(v_lead ->> 'label', '') in ('A', 'B', 'C') then
      select v.id into v_variant
        from public.ad_variants v join public.ad_sets s on s.id = v.ad_set_id
       where s.run_id = v_run and v.label = v_lead ->> 'label';
    end if;
    if v_run is not null and coalesce(v_lead ->> 'place', '') in ('facebook', 'instagram', 'linkedin', 'x') then
      v_place := v_lead ->> 'place';
    end if;

    insert into public.leads as l (zoho_id, name, zoho_status, zoho_source, platform, campaign, answers, run_id, variant_id, place, created_in_zoho, modified_in_zoho)
    values (
      v_lead ->> 'zoho_id',
      left(coalesce(nullif(btrim(v_lead ->> 'name'), ''), 'Lead ' || right(v_lead ->> 'zoho_id', 4)), 120),
      left(nullif(btrim(v_lead ->> 'status'), ''), 80),
      left(nullif(btrim(v_lead ->> 'source'), ''), 80),
      v_platform,
      case when jsonb_typeof(v_lead -> 'campaign') = 'object' then v_lead -> 'campaign' else '{}'::jsonb end,
      v_lead -> 'answers',
      v_run, v_variant, v_place,
      coalesce((v_lead ->> 'created')::timestamptz, now()),
      coalesce((v_lead ->> 'modified')::timestamptz, (v_lead ->> 'created')::timestamptz, now())
    )
    on conflict (zoho_id) do update set
      name = excluded.name,
      zoho_status = excluded.zoho_status,
      zoho_source = excluded.zoho_source,
      platform = excluded.platform,
      campaign = excluded.campaign,
      answers = excluded.answers,
      run_id = excluded.run_id,
      variant_id = excluded.variant_id,
      place = excluded.place,
      modified_in_zoho = excluded.modified_in_zoho,
      judge_status = case when l.answers is distinct from excluded.answers then 'queued' else l.judge_status end,
      judge_attempts = case when l.answers is distinct from excluded.answers then 0 else l.judge_attempts end,
      judge_claimed_at = case when l.answers is distinct from excluded.answers then null else l.judge_claimed_at end,
      judge_error = case when l.answers is distinct from excluded.answers then null else l.judge_error end,
      updated_at = now();
    v_count := v_count + 1;
  end loop;

  update public.team_settings
     -- greatest() passes over a null, so the first read sets it.
     set leads_synced_at = greatest(leads_synced_at, p_newest),
         leads_checked_at = now(),
         leads_sync_error = null
   where id = 1;
  return v_count;
end
$$;

-- Why Zoho could not be read: kept for the Leads page to show, until a read works.
create function public.leads_sync_fail(p_error text)
returns void
language sql
set search_path = ''
as $$
  update public.team_settings
     set leads_checked_at = now(), leads_sync_error = left(coalesce(nullif(btrim(p_error), ''), 'Zoho could not be read.'), 500)
   where id = 1;
$$;

-- The leads waiting to be judged, claimed so two runs never judge the same
-- one; a claim lost for ten minutes is taken again, three times at most. Each
-- comes with the team's criteria and up to eight of the team's own verdicts
-- with their reasons, as examples. Names never go to the model.
create function public.leads_take_due(p_limit integer default 10)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_out jsonb;
  v_criteria text;
  v_examples jsonb;
begin
  update public.leads
     set judge_status = 'failed', judge_claimed_at = null, judge_error = 'The lead could not be judged after three tries.'
   where judge_status = 'working' and judge_attempts >= 3 and judge_claimed_at < now() - interval '10 minutes';

  select lead_criteria into v_criteria from public.team_settings where id = 1;
  select coalesce(jsonb_agg(jsonb_build_object('answers', e.answers, 'verdict', e.person_verdict, 'why', e.person_note) order by e.person_at desc), '[]'::jsonb)
    into v_examples
    from (
      select answers, person_verdict, person_note, person_at from public.leads
       where person_verdict is not null and person_note is not null
       order by person_at desc
       limit 8
    ) e;

  with due as (
    select l.id
      from public.leads l
     where l.judge_status = 'queued' or (l.judge_status = 'working' and l.judge_claimed_at < now() - interval '10 minutes')
     order by l.created_in_zoho desc
     limit greatest(least(p_limit, 50), 0)
       for update skip locked
  ), claimed as (
    update public.leads l
       set judge_status = 'working', judge_claimed_at = now(), judge_attempts = l.judge_attempts + 1
      from due
     where l.id = due.id
    returning l.id, l.answers, l.platform, l.zoho_source
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'lead_id', c.id,
           'answers', c.answers,
           'platform', c.platform,
           'source', c.zoho_source,
           'criteria', v_criteria,
           'examples', v_examples,
           'brand', (select jsonb_build_object('company', b.company, 'offer', b.offer, 'audience', b.audience) from public.brand_profile b where b.id = 1)
         )), '[]'::jsonb)
    into v_out
    from claimed c;
  return v_out;
end
$$;

-- Claude's verdict on a lead. A qualified or not-qualified verdict stands only
-- on reasons that each quote one of the lead's own answers; a can't-tell may
-- say what is missing without a quote. Only a lead still being judged takes it:
-- one whose answers changed meanwhile is judged again.
create function public.lead_judged(p_lead_id uuid, p_verdict text, p_reasons jsonb, p_usage jsonb default null)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_lead public.leads;
  v_reason jsonb;
  v_value text;
begin
  insert into public.lead_usage (lead_id, model, input_tokens, output_tokens, cache_creation_input_tokens, cache_read_input_tokens)
  select p_lead_id, coalesce(p_usage ->> 'model', 'unknown'),
         coalesce((p_usage ->> 'input_tokens')::integer, 0), coalesce((p_usage ->> 'output_tokens')::integer, 0),
         coalesce((p_usage ->> 'cache_creation_input_tokens')::integer, 0), coalesce((p_usage ->> 'cache_read_input_tokens')::integer, 0)
   where p_usage is not null and jsonb_typeof(p_usage) = 'object'
     and exists (select 1 from public.leads where id = p_lead_id);
  select * into v_lead from public.leads where id = p_lead_id for update;
  if not found then
    raise exception 'That lead is gone';
  end if;
  if p_verdict is null or p_verdict not in ('qualified', 'not_qualified', 'unclear') then
    raise exception 'A verdict is qualified, not qualified or can''t tell';
  end if;
  if jsonb_typeof(p_reasons) is distinct from 'array' or jsonb_array_length(p_reasons) not between 1 and 6 then
    raise exception 'A verdict needs one to six reasons';
  end if;
  for v_reason in select value from jsonb_array_elements(p_reasons) loop
    if char_length(coalesce(v_reason ->> 'text', '')) not between 1 and 300 then
      raise exception 'A reason must be said in 300 characters or less';
    end if;
    if v_reason ->> 'quote' is null then
      if p_verdict <> 'unclear' then
        raise exception 'A verdict must quote the lead';
      end if;
      continue;
    end if;
    select a ->> 'value' into v_value
      from jsonb_array_elements(v_lead.answers) a
     where a ->> 'field' = v_reason ->> 'field'
     limit 1;
    if v_value is null or position(lower(btrim(v_reason ->> 'quote')) in lower(v_value)) = 0 then
      raise exception 'A reason quotes something the lead did not say';
    end if;
  end loop;

  update public.leads
     set verdict = p_verdict,
         reasons = p_reasons,
         judged_at = now(),
         judged_criteria_at = (select s.lead_criteria_at from public.team_settings s where s.id = 1),
         judge_status = 'done', judge_claimed_at = null, judge_error = null
   where id = p_lead_id and judge_status = 'working';
end
$$;

create function public.lead_judge_fail(p_lead_id uuid, p_error text, p_usage jsonb default null)
returns void
language plpgsql
set search_path = ''
as $$
begin
  insert into public.lead_usage (lead_id, model, input_tokens, output_tokens, cache_creation_input_tokens, cache_read_input_tokens)
  select p_lead_id, coalesce(p_usage ->> 'model', 'unknown'),
         coalesce((p_usage ->> 'input_tokens')::integer, 0), coalesce((p_usage ->> 'output_tokens')::integer, 0),
         coalesce((p_usage ->> 'cache_creation_input_tokens')::integer, 0), coalesce((p_usage ->> 'cache_read_input_tokens')::integer, 0)
   where p_usage is not null and jsonb_typeof(p_usage) = 'object'
     and exists (select 1 from public.leads where id = p_lead_id);
  update public.leads
     set judge_status = 'failed', judge_claimed_at = null, judge_error = left(coalesce(p_error, 'The lead could not be judged.'), 500)
   where id = p_lead_id and judge_status = 'working';
end
$$;

-- ---------------------------------------------------------------- tagged links

-- The team's link with the tags that tie a lead back to the post it followed.
-- lib/leads.ts builds the same for the publish dialog to show.
create function private.tagged_link(p_link text, p_run uuid, p_label text, p_place text)
returns text
language sql
immutable
set search_path = ''
as $$
  select p_link || case when position('?' in p_link) > 0 then '&' else '?' end
      || 'utm_source=' || p_place
      || '&utm_medium=social'
      || '&utm_campaign=qgr-' || left(p_run::text, 8)
      || '&utm_content=' || lower(p_label) || '-' || p_place;
$$;

-- Where posts send people, or null for no link.
create function public.set_post_link(p_link text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := private.require_team_member();
  v_link text := nullif(btrim(coalesce(p_link, '')), '');
begin
  if v_link is not null and (char_length(v_link) > 300 or v_link !~ '^https://[^\s?#]+(\?[^\s#]*)?$') then
    raise exception 'The link must start with https:// and have no # part';
  end if;
  update public.team_settings set post_link = v_link, updated_at = now(), updated_by = v_user where id = 1;
end
$$;

-- As before, and a place that asks for it ("link": true) carries the team's
-- link, tagged with this run, variant and place.
create or replace function public.schedule_post(p_variant_id uuid, p_targets jsonb, p_local_time text default null, p_thumbnail text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := private.require_team_member();
  v_variant public.ad_variants;
  v_tz text;
  v_when timestamptz;
  v_post uuid;
  v_target jsonb;
  v_place text;
  v_platform text;
  v_text text;
  v_path text;
  v_kind text;
  v_places text[] := '{}';
  v_link text;
  v_run uuid;
begin
  select * into v_variant from public.ad_variants where id = p_variant_id for update;
  if not found then
    raise exception 'Variant % not found', p_variant_id;
  end if;
  if v_variant.approved_at is null then
    raise exception 'Approve variant % before it is posted', v_variant.label;
  end if;

  select time_zone, post_link into v_tz, v_link from public.team_settings where id = 1;
  v_run := public.run_of_variant(p_variant_id);
  if p_local_time is null then
    v_when := now();
  else
    if p_local_time !~ '^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$' then
      raise exception 'The time is not readable';
    end if;
    v_when := p_local_time::timestamp at time zone v_tz;
    if v_when < now() - interval '1 minute' then
      raise exception 'Pick a time that has not passed';
    end if;
    if v_when > now() + interval '90 days' then
      raise exception 'Schedule up to 90 days ahead';
    end if;
  end if;

  if jsonb_typeof(p_targets) is distinct from 'array' or jsonb_array_length(p_targets) not between 1 and 3 then
    raise exception 'Pick where to post';
  end if;
  if (select count(distinct t ->> 'place') from jsonb_array_elements(p_targets) as x(t)) <> jsonb_array_length(p_targets) then
    raise exception 'A place is listed twice';
  end if;
  if p_thumbnail is not null and (p_thumbnail not like 'data:image/jpeg;base64,%' or length(p_thumbnail) > 60000) then
    raise exception 'The thumbnail is not a small JPEG';
  end if;

  insert into public.posts (variant_id, scheduled_for, thumbnail, created_by)
  values (p_variant_id, v_when, p_thumbnail, v_user)
  returning id into v_post;

  for v_target in select value from jsonb_array_elements(p_targets) loop
    v_place := v_target ->> 'place';
    v_platform := case v_place when 'facebook' then 'meta' when 'instagram' then 'meta' when 'linkedin' then 'linkedin' end;
    if v_platform is null then
      raise exception 'Posts go to Facebook, Instagram or LinkedIn';
    end if;
    v_text := coalesce(nullif(btrim(v_variant.posts ->> v_place), ''), btrim(v_variant.copy #>> array[v_platform, 'text']));
    if coalesce(v_text, '') = '' then
      raise exception 'Variant % has no % copy to post to %', v_variant.label,
        case v_platform when 'meta' then 'Meta' else 'LinkedIn' end, public.place_name(v_place);
    end if;
    -- The link posts send people to, tagged with this run, variant and place,
    -- so a lead who follows it is tied back to them. Instagram's words take
    -- no link anyone can follow, so it gets none.
    if (v_target ->> 'link')::boolean is true and v_place <> 'instagram' then
      if v_link is null then
        raise exception 'Say where posts send people first (Leads, Setup)';
      end if;
      v_text := v_text || E'\n\n' || private.tagged_link(v_link, v_run, v_variant.label, v_place);
    end if;
    if v_place = 'linkedin' and length(v_text) > 3000 then
      raise exception 'LinkedIn takes up to 3,000 characters';
    end if;
    if v_place = 'instagram' and length(v_text) > 2200 then
      raise exception 'Instagram takes up to 2,200 characters';
    end if;

    v_path := nullif(v_target ->> 'media_path', '');
    v_kind := nullif(v_target ->> 'media_kind', '');
    if v_path is not null then
      if v_path !~ ('^posts/' || v_user::text || '/[0-9a-f-]{36}\.(jpg|mp4)$') then
        raise exception 'The file for % is not one you uploaded', public.place_name(v_place);
      end if;
      if not exists (select 1 from storage.objects where bucket_id = 'post-media' and name = v_path) then
        raise exception 'The file for % has not finished uploading', public.place_name(v_place);
      end if;
      if v_kind is distinct from (case when v_path like '%.jpg' then 'image' else 'video' end) then
        raise exception 'The file for % is not the kind it says', public.place_name(v_place);
      end if;
    elsif v_place = 'instagram' then
      raise exception 'Instagram needs a picture or a video';
    else
      v_kind := null;
    end if;

    if exists (
      select 1 from public.posts p join public.post_targets t on t.post_id = p.id
       where p.variant_id = p_variant_id and t.place = v_place and t.status in ('scheduled', 'posting')
    ) then
      raise exception 'Variant % is already waiting to post to %', v_variant.label, public.place_name(v_place);
    end if;

    insert into public.post_targets (post_id, place, text, media_path, media_kind)
    values (v_post, v_place, v_text, v_path, v_kind);
    v_places := v_places || public.place_name(v_place);
  end loop;

  insert into public.run_events (run_id, text) values (
    v_run,
    format('Variant %s %s to %s', v_variant.label,
           case when p_local_time is null then 'sent' else 'scheduled' end,
           array_to_string(v_places, ', '))
  );
  return v_post;
end
$$;

-- ---------------------------------------------------------------- grants

revoke all on function private.tagged_link(text, uuid, text, text) from public, anon, authenticated;

revoke execute on function
  public.set_post_link(text),
  public.update_lead_criteria(text),
  public.set_leads_source(text, text, text),
  public.set_lead_verdict(uuid, text, text),
  public.judge_leads_again(uuid)
from public, anon;
grant execute on function
  public.set_post_link(text),
  public.update_lead_criteria(text),
  public.set_leads_source(text, text, text),
  public.set_lead_verdict(uuid, text, text),
  public.judge_leads_again(uuid)
to authenticated, service_role;

revoke execute on function
  public.leads_sync_plan(),
  public.leads_record(jsonb, timestamptz),
  public.leads_sync_fail(text),
  public.leads_take_due(integer),
  public.lead_judged(uuid, text, jsonb, jsonb),
  public.lead_judge_fail(uuid, text, jsonb)
from public, anon, authenticated;
grant execute on function
  public.leads_sync_plan(),
  public.leads_record(jsonb, timestamptz),
  public.leads_sync_fail(text),
  public.leads_take_due(integer),
  public.lead_judged(uuid, text, jsonb, jsonb),
  public.lead_judge_fail(uuid, text, jsonb)
to service_role;
