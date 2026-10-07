-- QGR marketing agents, schema v1.
--
-- Who touches what:
--   * The app's server starts runs with start_run().
--   * The n8n agents call agent_begin() / agent_finish_*() / agent_fail(). They
--     never write tables directly: each function checks its input and writes
--     everything for one step in one transaction, so a failed agent never leaves
--     half a report behind.
--   * RLS is on for every table with no policies yet, and anon/authenticated
--     have no grants: only the service role (n8n, the app's server) can read or
--     write. Policies for signed-in teammates come with sign-in.
--
-- Numbers (days running, versions, angle counts, budget shares) are computed by
-- the workflow from the data, never taken from the model's prose.

-- ---------------------------------------------------------------- tables

create table public.brand_profile (
  id smallint primary key default 1 check (id = 1),
  company text not null,
  website text not null,
  offer text not null,
  audience text not null,
  voice text[] not null default '{}',
  guardrails text[] not null default '{}',
  page_name text not null,
  x_handle text not null,
  updated_at timestamptz not null default now()
);

insert into public.brand_profile (company, website, offer, audience, voice, guardrails, page_name, x_handle)
values (
  'Quantum Global Residency',
  'quantumglobalresidency.com',
  'EB-5 investor visa guidance with independent due diligence on every project, from first call to green card.',
  'Indian professionals and families planning a move to the U.S., many on H-1B visas.',
  array['Calm', 'Expert', 'Plain English'],
  array[
    'Never promise an outcome, a timeline or a return',
    'Present processing times as estimates',
    'Say plainly that EB-5 is an investment with risk',
    'End on the free consultation'
  ],
  'Quantum Global',
  '@quantumglobal'
);

create table public.competitors (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  -- Null for a competitor known only from uploaded ads.
  domain text unique,
  created_at timestamptz not null default now()
);
create unique index competitors_name_without_domain on public.competitors (lower(name)) where domain is null;

create table public.runs (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(title) between 1 and 120),
  kind text not null check (kind in ('competitor', 'custom')),
  input text not null check (input in ('website', 'ad_link', 'upload', 'podcast', 'blog', 'video', 'text')),
  url text,
  competitor_name text,
  files text[],
  excerpt text,
  platforms text[] not null check (cardinality(platforms) between 1 and 3 and platforms <@ array['meta', 'linkedin', 'x']),
  goal text not null check (goal in ('consultations', 'webinar', 'awareness', 'guide')),
  summary text,
  competitor_id uuid references public.competitors (id) on delete set null,
  created_at timestamptz not null default now(),
  approved_at timestamptz,
  constraint runs_kind_matches_input check ((kind = 'competitor') = (input in ('website', 'ad_link', 'upload'))),
  -- coalesce: a check that evaluates to null passes, so a missing field must read as false.
  constraint runs_source_present check (
    case input
      when 'upload' then coalesce(competitor_name is not null and cardinality(files) between 1 and 10, false)
      when 'text' then coalesce(length(excerpt) between 50 and 20000, false)
      else coalesce(url ~ '^https?://', false)
    end
  )
);
create index runs_created_at on public.runs (created_at desc);
create index runs_competitor on public.runs (competitor_id);

-- A run's status is derived from these rows, never stored on the run.
create table public.run_stages (
  run_id uuid not null references public.runs (id) on delete cascade,
  stage text not null check (stage in ('tracker', 'strategist', 'content')),
  status text not null check (status in ('skipped', 'queued', 'running', 'done', 'failed')),
  summary text,
  error text,
  started_at timestamptz,
  finished_at timestamptz,
  primary key (run_id, stage)
);

create table public.run_events (
  id bigint generated always as identity primary key,
  run_id uuid not null references public.runs (id) on delete cascade,
  at timestamptz not null default now(),
  text text not null
);
create index run_events_run on public.run_events (run_id, at);

create table public.competitor_reports (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null unique references public.runs (id) on delete cascade,
  competitor_id uuid not null references public.competitors (id) on delete cascade,
  -- 'placeholder' means the ads were sample data: the dashboard must say so.
  data_source text not null check (data_source in ('apify', 'placeholder', 'upload')),
  active_ads integer not null check (active_ads >= 0),
  platforms text[] not null,
  summary text not null,
  website_summary text,
  insights text[] not null check (cardinality(insights) between 1 and 5),
  angles jsonb not null check (jsonb_typeof(angles) = 'array'),
  created_at timestamptz not null default now()
);
create index competitor_reports_competitor on public.competitor_reports (competitor_id, created_at desc);

create table public.hooks (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.competitor_reports (id) on delete cascade,
  rank smallint not null check (rank >= 1),
  text text not null,
  platform text not null check (platform in ('meta', 'linkedin', 'x')),
  format text not null check (format in ('video', 'image', 'carousel', 'document', 'text')),
  days_running integer not null check (days_running >= 0),
  variations integer not null check (variations >= 1),
  unique (report_id, rank)
);

create table public.competitor_ads (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.competitor_reports (id) on delete cascade,
  platform text not null check (platform in ('meta', 'linkedin', 'x')),
  format text not null check (format in ('video', 'image', 'carousel', 'document', 'text')),
  text text not null,
  days_running integer not null check (days_running >= 0),
  ad_url text,
  media_url text
);
create index competitor_ads_report on public.competitor_ads (report_id);

create table public.strategies (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null unique references public.runs (id) on delete cascade,
  competitor_id uuid references public.competitors (id) on delete set null,
  title text not null,
  source_label text,
  goal text not null,
  positioning text not null,
  audiences text[] not null check (cardinality(audiences) between 1 and 3),
  channels jsonb not null check (jsonb_typeof(channels) = 'array'),
  guardrails text[] not null,
  created_at timestamptz not null default now(),
  approved_at timestamptz
);
create index strategies_competitor on public.strategies (competitor_id);

create table public.strategy_angles (
  id uuid primary key default gen_random_uuid(),
  strategy_id uuid not null references public.strategies (id) on delete cascade,
  position smallint not null check (position between 0 and 2),
  name text not null,
  why text not null,
  hook text not null,
  based_on_hook text,
  unique (strategy_id, position)
);

create table public.ad_sets (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null unique references public.runs (id) on delete cascade,
  strategy_id uuid not null references public.strategies (id) on delete cascade,
  title text not null,
  created_at timestamptz not null default now()
);
create index ad_sets_strategy on public.ad_sets (strategy_id);

create table public.ad_variants (
  id uuid primary key default gen_random_uuid(),
  ad_set_id uuid not null references public.ad_sets (id) on delete cascade,
  label text not null check (label in ('A', 'B', 'C')),
  angle text not null,
  creative_text text not null,
  creative_style text not null check (creative_style in ('arcs', 'split', 'spotlight')),
  -- Written now so an image model (ChatGPT, Higgsfield) can be plugged in later.
  image_prompt text,
  image_url text,
  copy jsonb not null check (jsonb_typeof(copy) = 'object'),
  -- Phrases the workflow flagged against the guardrails, for a person to judge.
  warnings text[] not null default '{}',
  approved_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (ad_set_id, label)
);

-- Every model call's usage. Cost telemetry added later cannot be backfilled.
create table public.agent_usage (
  id bigint generated always as identity primary key,
  run_id uuid not null references public.runs (id) on delete cascade,
  stage text not null check (stage in ('tracker', 'strategist', 'content')),
  model text not null,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  cache_creation_input_tokens integer not null default 0,
  cache_read_input_tokens integer not null default 0,
  created_at timestamptz not null default now()
);
create index agent_usage_run on public.agent_usage (run_id);

-- ---------------------------------------------------------------- access

alter table public.brand_profile enable row level security;
alter table public.competitors enable row level security;
alter table public.runs enable row level security;
alter table public.run_stages enable row level security;
alter table public.run_events enable row level security;
alter table public.competitor_reports enable row level security;
alter table public.hooks enable row level security;
alter table public.competitor_ads enable row level security;
alter table public.strategies enable row level security;
alter table public.strategy_angles enable row level security;
alter table public.ad_sets enable row level security;
alter table public.ad_variants enable row level security;
alter table public.agent_usage enable row level security;

revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

-- ---------------------------------------------------------------- helpers

create function public.agent_name(p_stage text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_stage
    when 'tracker' then 'Competitor Tracker'
    when 'strategist' then 'Ad Strategist'
    when 'content' then 'Content Agent'
  end
$$;

create function public.assert_stage_running(p_run_id uuid, p_stage text)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.run_stages
     where run_id = p_run_id and stage = p_stage and status = 'running'
  ) then
    raise exception 'The % is not running on run %', public.agent_name(p_stage), p_run_id;
  end if;
end
$$;

create function public.finish_stage(p_run_id uuid, p_stage text, p_summary text)
returns void
language plpgsql
set search_path = ''
as $$
begin
  update public.run_stages
     set status = 'done', summary = p_summary, error = null, finished_at = now()
   where run_id = p_run_id and stage = p_stage;
  insert into public.run_events (run_id, text) values (p_run_id, p_summary);
end
$$;

create function public.record_usage(p_run_id uuid, p_stage text, p_usage jsonb)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if p_usage is null or jsonb_typeof(p_usage) <> 'object' then
    return;
  end if;
  insert into public.agent_usage
    (run_id, stage, model, input_tokens, output_tokens, cache_creation_input_tokens, cache_read_input_tokens)
  values (
    p_run_id,
    p_stage,
    coalesce(p_usage ->> 'model', 'unknown'),
    coalesce((p_usage ->> 'input_tokens')::integer, 0),
    coalesce((p_usage ->> 'output_tokens')::integer, 0),
    coalesce((p_usage ->> 'cache_creation_input_tokens')::integer, 0),
    coalesce((p_usage ->> 'cache_read_input_tokens')::integer, 0)
  );
end
$$;

-- ---------------------------------------------------------------- the app

-- Records a run and its three stages. A custom run has no competitor to track,
-- so its tracker is skipped from the start.
create function public.start_run(
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
set search_path = ''
as $$
declare
  v_id uuid;
begin
  insert into public.runs (title, kind, input, url, competitor_name, files, excerpt, platforms, goal)
  values (p_title, p_kind, p_input, p_url, p_competitor_name, p_files, p_excerpt, p_platforms, p_goal)
  returning id into v_id;

  insert into public.run_stages (run_id, stage, status) values
    (v_id, 'tracker', case when p_kind = 'custom' then 'skipped' else 'queued' end),
    (v_id, 'strategist', 'queued'),
    (v_id, 'content', 'queued');

  insert into public.run_events (run_id, text) values (v_id, 'Run started');
  if p_kind = 'custom' then
    insert into public.run_events (run_id, text)
    values (v_id, 'Competitor Tracker skipped: custom runs start at the strategy');
  end if;
  return v_id;
end
$$;

-- ---------------------------------------------------------------- the agents

-- Marks a stage running and returns everything the agent needs: the run, the
-- brand profile, and the outputs of the agents before it.
create function public.agent_begin(p_run_id uuid, p_stage text)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_run public.runs;
  v_status text;
  v_before text;
begin
  select * into v_run from public.runs where id = p_run_id;
  if not found then
    raise exception 'Run % not found', p_run_id;
  end if;

  select status into v_status
    from public.run_stages
   where run_id = p_run_id and stage = p_stage
     for update;
  if v_status is null then
    raise exception 'Unknown stage %', p_stage;
  end if;
  if v_status not in ('queued', 'failed') then
    raise exception 'The % is %, not waiting to start', public.agent_name(p_stage), v_status;
  end if;

  if p_stage <> 'tracker' then
    select status into v_before
      from public.run_stages
     where run_id = p_run_id
       and stage = case p_stage when 'strategist' then 'tracker' else 'strategist' end;
    if v_before not in ('done', 'skipped') then
      raise exception 'The agent before the % has not finished (it is %)', public.agent_name(p_stage), v_before;
    end if;
  end if;

  update public.run_stages
     set status = 'running', started_at = now(), finished_at = null, error = null, summary = null
   where run_id = p_run_id and stage = p_stage;
  insert into public.run_events (run_id, text) values (p_run_id, public.agent_name(p_stage) || ' started');

  return jsonb_build_object(
    'stage', p_stage,
    'run', to_jsonb(v_run),
    'brand', (select to_jsonb(b) - 'id' - 'updated_at' from public.brand_profile b where b.id = 1),
    'report', (
      select jsonb_build_object(
        'competitor', c.name,
        'domain', c.domain,
        'data_source', r.data_source,
        'active_ads', r.active_ads,
        'summary', r.summary,
        'website_summary', r.website_summary,
        'insights', to_jsonb(r.insights),
        'angles', r.angles,
        'hooks', coalesce((
          select jsonb_agg(jsonb_build_object(
                   'rank', h.rank, 'text', h.text, 'platform', h.platform, 'format', h.format,
                   'days_running', h.days_running, 'variations', h.variations) order by h.rank)
            from public.hooks h
           where h.report_id = r.id), '[]'::jsonb)
      )
      from public.competitor_reports r
      join public.competitors c on c.id = r.competitor_id
      where r.run_id = p_run_id
    ),
    'strategy', (
      select jsonb_build_object(
        'title', s.title,
        'positioning', s.positioning,
        'audiences', to_jsonb(s.audiences),
        'channels', s.channels,
        'guardrails', to_jsonb(s.guardrails),
        'angles', coalesce((
          select jsonb_agg(jsonb_build_object(
                   'position', a.position, 'name', a.name, 'why', a.why, 'hook', a.hook,
                   'based_on_hook', a.based_on_hook) order by a.position)
            from public.strategy_angles a
           where a.strategy_id = s.id), '[]'::jsonb)
      )
      from public.strategies s
      where s.run_id = p_run_id
    )
  );
end
$$;

create function public.agent_finish_tracker(p_run_id uuid, p_report jsonb, p_usage jsonb default null)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_name text := nullif(btrim(p_report #>> '{competitor,name}'), '');
  v_domain text := nullif(lower(btrim(p_report #>> '{competitor,domain}')), '');
  v_competitor uuid;
  v_report uuid;
  v_hooks integer;
begin
  perform public.assert_stage_running(p_run_id, 'tracker');
  if v_name is null then
    raise exception 'The report names no competitor';
  end if;
  if jsonb_typeof(p_report -> 'hooks') is distinct from 'array' or jsonb_array_length(p_report -> 'hooks') = 0 then
    raise exception 'The report has no hooks';
  end if;
  if jsonb_typeof(p_report -> 'insights') is distinct from 'array' then
    raise exception 'The report has no insights';
  end if;

  if v_domain is not null then
    insert into public.competitors (name, domain) values (v_name, v_domain)
    on conflict (domain) do update set name = excluded.name
    returning id into v_competitor;
  else
    select id into v_competitor from public.competitors where domain is null and lower(name) = lower(v_name);
    if v_competitor is null then
      insert into public.competitors (name) values (v_name) returning id into v_competitor;
    end if;
  end if;

  insert into public.competitor_reports
    (run_id, competitor_id, data_source, active_ads, platforms, summary, website_summary, insights, angles)
  values (
    p_run_id,
    v_competitor,
    p_report ->> 'data_source',
    (p_report ->> 'active_ads')::integer,
    array(select jsonb_array_elements_text(coalesce(p_report -> 'platforms', '[]'::jsonb))),
    p_report ->> 'summary',
    p_report ->> 'website_summary',
    array(select jsonb_array_elements_text(p_report -> 'insights')),
    coalesce(p_report -> 'angles', '[]'::jsonb)
  )
  returning id into v_report;

  insert into public.hooks (report_id, rank, text, platform, format, days_running, variations)
  select v_report, t.ord::smallint, t.h ->> 'text', t.h ->> 'platform', t.h ->> 'format',
         (t.h ->> 'days_running')::integer, (t.h ->> 'variations')::integer
    from jsonb_array_elements(p_report -> 'hooks') with ordinality as t(h, ord);

  insert into public.competitor_ads (report_id, platform, format, text, days_running, ad_url, media_url)
  select v_report, a ->> 'platform', a ->> 'format', a ->> 'text', (a ->> 'days_running')::integer,
         a ->> 'ad_url', a ->> 'media_url'
    from jsonb_array_elements(coalesce(p_report -> 'ads', '[]'::jsonb)) as t(a);

  update public.runs set competitor_id = v_competitor, summary = p_report ->> 'summary' where id = p_run_id;

  if p_report ->> 'data_source' = 'placeholder' then
    insert into public.run_events (run_id, text)
    values (p_run_id, 'Used sample ads: Apify is not connected yet');
  end if;

  v_hooks := jsonb_array_length(p_report -> 'hooks');
  perform public.finish_stage(
    p_run_id, 'tracker',
    format('Scanned %s active ads and found %s winning hook%s.', p_report ->> 'active_ads', v_hooks,
           case when v_hooks = 1 then '' else 's' end));
  perform public.record_usage(p_run_id, 'tracker', p_usage);
  return v_report;
end
$$;

create function public.agent_finish_strategist(p_run_id uuid, p_strategy jsonb, p_usage jsonb default null)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_run public.runs;
  v_strategy uuid;
begin
  perform public.assert_stage_running(p_run_id, 'strategist');
  select * into v_run from public.runs where id = p_run_id;

  if jsonb_typeof(p_strategy -> 'angles') is distinct from 'array' or jsonb_array_length(p_strategy -> 'angles') <> 3 then
    raise exception 'A strategy needs exactly three angles';
  end if;
  if coalesce(btrim(p_strategy ->> 'positioning'), '') = '' then
    raise exception 'The strategy has no positioning';
  end if;

  insert into public.strategies
    (run_id, competitor_id, title, source_label, goal, positioning, audiences, channels, guardrails)
  values (
    p_run_id,
    v_run.competitor_id,
    coalesce(nullif(btrim(p_strategy ->> 'title'), ''), v_run.title),
    p_strategy ->> 'source_label',
    v_run.goal,
    p_strategy ->> 'positioning',
    array(select jsonb_array_elements_text(p_strategy -> 'audiences')),
    coalesce(p_strategy -> 'channels', '[]'::jsonb),
    array(select jsonb_array_elements_text(coalesce(p_strategy -> 'guardrails', '[]'::jsonb)))
  )
  returning id into v_strategy;

  insert into public.strategy_angles (strategy_id, position, name, why, hook, based_on_hook)
  select v_strategy, (t.ord - 1)::smallint, t.a ->> 'name', t.a ->> 'why', t.a ->> 'hook', t.a ->> 'based_on_hook'
    from jsonb_array_elements(p_strategy -> 'angles') with ordinality as t(a, ord);

  -- A custom run has no tracker summary; its strategy's one-liner stands in.
  update public.runs
     set summary = coalesce(summary, nullif(btrim(p_strategy ->> 'summary'), ''))
   where id = p_run_id;

  perform public.finish_stage(p_run_id, 'strategist', 'Built a strategy with 3 angles.');
  perform public.record_usage(p_run_id, 'strategist', p_usage);
  return v_strategy;
end
$$;

create function public.agent_finish_content(p_run_id uuid, p_ad_set jsonb, p_usage jsonb default null)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_run public.runs;
  v_strategy uuid;
  v_ad_set uuid;
  v_variant jsonb;
  v_platform text;
  v_labels text[];
begin
  perform public.assert_stage_running(p_run_id, 'content');
  select * into v_run from public.runs where id = p_run_id;
  select id into v_strategy from public.strategies where run_id = p_run_id;
  if v_strategy is null then
    raise exception 'Run % has no strategy to write ads from', p_run_id;
  end if;

  if jsonb_typeof(p_ad_set -> 'variants') is distinct from 'array' then
    raise exception 'The ad set has no variants';
  end if;
  select array_agg(v ->> 'label' order by v ->> 'label') into v_labels
    from jsonb_array_elements(p_ad_set -> 'variants') as t(v);
  if v_labels is distinct from array['A', 'B', 'C'] then
    raise exception 'An ad set needs exactly variants A, B and C, got %', v_labels;
  end if;

  -- Copy for exactly the platforms this run asked for, each with text and a headline.
  for v_variant in select v from jsonb_array_elements(p_ad_set -> 'variants') as t(v) loop
    if jsonb_typeof(v_variant -> 'copy') is distinct from 'object' then
      raise exception 'Variant % has no copy', v_variant ->> 'label';
    end if;
    foreach v_platform in array v_run.platforms loop
      if coalesce(btrim(v_variant #>> array['copy', v_platform, 'text']), '') = ''
         or coalesce(btrim(v_variant #>> array['copy', v_platform, 'headline']), '') = '' then
        raise exception 'Variant % is missing its % copy', v_variant ->> 'label', v_platform;
      end if;
    end loop;
    if exists (select 1 from jsonb_object_keys(v_variant -> 'copy') k where not (k = any (v_run.platforms))) then
      raise exception 'Variant % has copy for a platform this run did not ask for', v_variant ->> 'label';
    end if;
  end loop;

  insert into public.ad_sets (run_id, strategy_id, title)
  values (
    p_run_id,
    v_strategy,
    coalesce(nullif(btrim(p_ad_set ->> 'title'), ''), (select title from public.strategies where id = v_strategy))
  )
  returning id into v_ad_set;

  insert into public.ad_variants
    (ad_set_id, label, angle, creative_text, creative_style, image_prompt, image_url, copy, warnings)
  select v_ad_set, v ->> 'label', v ->> 'angle', v ->> 'creative_text', v ->> 'creative_style',
         v ->> 'image_prompt', v ->> 'image_url', v -> 'copy',
         array(select jsonb_array_elements_text(coalesce(v -> 'warnings', '[]'::jsonb)))
    from jsonb_array_elements(p_ad_set -> 'variants') as t(v);

  perform public.finish_stage(
    p_run_id, 'content',
    format('Wrote 3 ad variants for %s.',
           array_to_string(array(
             select case p when 'meta' then 'Meta' when 'linkedin' then 'LinkedIn' else 'X' end
               from unnest(v_run.platforms) as p), ', ')));
  insert into public.run_events (run_id, text) values (p_run_id, 'Ready for review');
  perform public.record_usage(p_run_id, 'content', p_usage);
  return v_ad_set;
end
$$;

create function public.agent_fail(p_run_id uuid, p_stage text, p_error text, p_usage jsonb default null)
returns void
language plpgsql
set search_path = ''
as $$
begin
  update public.run_stages
     set status = 'failed', error = left(coalesce(nullif(btrim(p_error), ''), 'Unknown error'), 500), finished_at = now()
   where run_id = p_run_id and stage = p_stage;
  if not found then
    raise exception 'Run % has no % stage', p_run_id, p_stage;
  end if;
  insert into public.run_events (run_id, text) values (p_run_id, 'Stopped: the ' || public.agent_name(p_stage) || ' failed');
  perform public.record_usage(p_run_id, p_stage, p_usage);
end
$$;

-- Postgres lets everyone execute a new function; only the service role may run these.
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on all functions in schema public to service_role;
