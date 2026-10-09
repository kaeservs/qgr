-- Posts, scheduled scans and the agents' switches.
--
-- * team_settings: one row the team edits on Settings: its time zone, which
--   agents start by themselves, when tracked competitors are scanned, and the
--   Pages posts go to. The keys that post live in n8n, never here.
-- * run_stages.waiting_since: an agent that waits for a person because its
--   switch is off. The pipeline asks pipeline_next() before each agent; a
--   person starts a waiting or failed agent with continue_run().
-- * start_due_scans(): n8n's clock calls it every hour. When the team's
--   schedule falls due it starts a scan of every tracked competitor.
-- * posts, post_targets: an approved variant sent or scheduled to Facebook,
--   Instagram or LinkedIn, holding exactly the words and the file that go out.
--   n8n's publisher takes the due ones, posts them and records what happened.
-- * Editing an approved variant takes its approval back, and a variant with a
--   post waiting to go out cannot be edited: nothing goes out unapproved.
--
-- Nothing here drops or replaces a table, a column or a constraint: functions
-- keep their signatures, so this applies over the live schema as it stands.

-- ---------------------------------------------------------------- settings

create table public.team_settings (
  id smallint primary key default 1 check (id = 1),
  -- Scans run and posts are scheduled in this zone's wall time.
  time_zone text not null default 'America/New_York',
  -- Off: the agent waits for a person after the one before it finishes.
  strategist_auto boolean not null default true,
  content_auto boolean not null default true,
  scan_every text not null default 'off' check (scan_every in ('off', 'day', 'week')),
  -- ISO weekday, Monday = 1; used when scans are weekly.
  scan_day smallint not null default 1 check (scan_day between 1 and 7),
  scan_hour smallint not null default 9 check (scan_hour between 0 and 23),
  -- A schedule never fires for a time before it was set.
  scan_changed_at timestamptz not null default now(),
  last_scan_at timestamptz,
  facebook_page_id text check (facebook_page_id ~ '^[0-9]{5,25}$'),
  facebook_page_name text check (length(facebook_page_name) between 1 and 120),
  instagram_account_id text check (instagram_account_id ~ '^[0-9]{5,25}$'),
  instagram_username text check (instagram_username ~ '^[A-Za-z0-9._]{1,30}$'),
  linkedin_org_id text check (linkedin_org_id ~ '^[0-9]{1,20}$'),
  linkedin_page_name text check (length(linkedin_page_name) between 1 and 120),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);
insert into public.team_settings default values;
create index team_settings_updated_by on public.team_settings (updated_by);

-- A competitor the team no longer follows is left out of scheduled scans.
alter table public.competitors add column tracked boolean not null default true;

-- ---------------------------------------------------------------- waiting agents

alter table public.run_stages add column waiting_since timestamptz;
alter table public.run_stages
  add constraint run_stages_waiting_is_queued check (waiting_since is null or status = 'queued');

-- As before, and an agent that waits for a person does not start by itself.
create or replace function public.agent_begin(p_run_id uuid, p_stage text)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_run public.runs;
  v_status text;
  v_waiting timestamptz;
  v_before text;
begin
  select * into v_run from public.runs where id = p_run_id;
  if not found then
    raise exception 'Run % not found', p_run_id;
  end if;

  select status, waiting_since into v_status, v_waiting
    from public.run_stages
   where run_id = p_run_id and stage = p_stage
     for update;
  if v_status is null then
    raise exception 'Unknown stage %', p_stage;
  end if;
  if v_status not in ('queued', 'failed') then
    raise exception 'The % is %, not waiting to start', public.agent_name(p_stage), v_status;
  end if;
  if v_waiting is not null then
    raise exception 'The % waits for a person to start it', public.agent_name(p_stage);
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

-- Asked by the pipeline when an agent has finished, before the next starts.
-- True: start it now. False: its switch is off, so it waits for a person, or
-- it is not waiting to start at all. A person starting a run starts its first
-- agent; the switches decide only what follows.
create function public.pipeline_next(p_run_id uuid, p_stage text)
returns boolean
language plpgsql
set search_path = ''
as $$
declare
  v_status text;
  v_waiting timestamptz;
  v_auto boolean;
begin
  select status, waiting_since into v_status, v_waiting
    from public.run_stages
   where run_id = p_run_id and stage = p_stage
     for update;
  if v_status is distinct from 'queued' or v_waiting is not null then
    return false;
  end if;
  select case p_stage when 'strategist' then strategist_auto when 'content' then content_auto else true end
    into v_auto
    from public.team_settings
   where id = 1;
  if coalesce(v_auto, true) then
    return true;
  end if;
  update public.run_stages set waiting_since = now() where run_id = p_run_id and stage = p_stage;
  insert into public.run_events (run_id, text) values (
    p_run_id,
    case p_stage
      when 'strategist' then 'The Ad Strategist waits for you: it does not start by itself after a scan'
      else 'The Content Agent waits for your go-ahead: it does not write ads by itself'
    end
  );
  return false;
end
$$;

-- A person starts the agent a run waits on: one whose switch is off, or one
-- that failed, which runs again where it stopped. Returns that agent's stage,
-- for the app to hand to n8n.
create function public.continue_run(p_run_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_stage text;
  v_status text;
begin
  perform private.require_team_member();
  if not exists (select 1 from public.runs where id = p_run_id) then
    raise exception 'Run % not found', p_run_id;
  end if;
  if exists (select 1 from public.run_stages where run_id = p_run_id and status = 'running') then
    raise exception 'An agent is already working on this run';
  end if;
  select stage, status into v_stage, v_status
    from public.run_stages
   where run_id = p_run_id and (waiting_since is not null or status = 'failed')
   order by case stage when 'tracker' then 1 when 'strategist' then 2 else 3 end
   limit 1
     for update;
  if v_stage is null then
    raise exception 'Nothing on this run is waiting for you';
  end if;
  update public.run_stages set waiting_since = null where run_id = p_run_id and stage = v_stage;
  insert into public.run_events (run_id, text) values (
    p_run_id,
    case when v_status = 'failed' then 'Trying the ' || public.agent_name(v_stage) || ' again'
         else 'Go-ahead given for the ' || public.agent_name(v_stage) end
  );
  return v_stage;
end
$$;

-- The app could not hand a go-ahead to n8n. The agent waits again (a failed
-- one stays failed), and the run says why.
create function public.report_continue_failure(p_run_id uuid, p_stage text, p_error text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_error text := left(coalesce(nullif(btrim(p_error), ''), 'The agents could not be reached.'), 500);
begin
  perform private.require_team_member();
  update public.run_stages set waiting_since = now()
   where run_id = p_run_id and stage = p_stage and status = 'queued' and waiting_since is null;
  update public.run_stages set error = v_error
   where run_id = p_run_id and stage = p_stage and status = 'failed';
  if not found and not exists (select 1 from public.run_stages where run_id = p_run_id and stage = p_stage and waiting_since is not null) then
    raise exception 'The % is not waiting to start', public.agent_name(p_stage);
  end if;
  insert into public.run_events (run_id, text)
  values (p_run_id, 'Could not start the ' || public.agent_name(p_stage) || ': ' || v_error);
end
$$;

-- ---------------------------------------------------------------- scheduled scans

-- The latest time a schedule fell due at or before p_at, in the zone's wall
-- time, so 9:00 stays 9:00 across daylight saving. Null when scans are off.
create function public.scan_slot(p_every text, p_day integer, p_hour integer, p_time_zone text, p_at timestamptz)
returns timestamptz
language plpgsql
stable
set search_path = ''
as $$
declare
  v_local timestamp := p_at at time zone p_time_zone;
  v_slot timestamp;
begin
  if p_every = 'day' then
    v_slot := date_trunc('day', v_local) + make_interval(hours => p_hour);
    if v_slot > v_local then
      v_slot := v_slot - interval '1 day';
    end if;
  elsif p_every = 'week' then
    v_slot := date_trunc('week', v_local) + make_interval(days => p_day - 1, hours => p_hour);
    if v_slot > v_local then
      v_slot := v_slot - interval '7 days';
    end if;
  else
    return null;
  end if;
  return v_slot at time zone p_time_zone;
end
$$;

-- When the next scheduled scan is due, for the dashboard. Null when scans are
-- off, and for anyone not on the team.
create function public.next_scan_at()
returns timestamptz
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  s public.team_settings;
  v_slot timestamptz;
  v_local timestamp;
begin
  if not private.is_team_member() then
    return null;
  end if;
  select * into s from public.team_settings where id = 1;
  if s.scan_every = 'off' then
    return null;
  end if;
  v_slot := public.scan_slot(s.scan_every, s.scan_day, s.scan_hour, s.time_zone, now());
  -- The slot just past is next only if it has not been scanned yet and the schedule predates it.
  if v_slot >= s.scan_changed_at and v_slot > coalesce(s.last_scan_at, '-infinity'::timestamptz) then
    return v_slot;
  end if;
  v_local := (v_slot at time zone s.time_zone) + case s.scan_every when 'day' then interval '1 day' else interval '7 days' end;
  return v_local at time zone s.time_zone;
end
$$;

-- Called by n8n's clock every hour. When the schedule has fallen due since the
-- last scan, starts a scan of each tracked competitor that has a website, at
-- most p_max, the most recently scanned first, and returns the runs for n8n
-- to hand to the pipeline. Each scan keeps the platforms and goal of that
-- competitor's last run. The agents never fetch, so a scan carries the
-- website as the app last read it, and says so.
create function public.start_due_scans(p_max integer default 10)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  s public.team_settings;
  v_slot timestamptz;
  v_out jsonb := '[]'::jsonb;
  c record;
  v_last public.runs;
  v_page jsonb;
  v_id uuid;
begin
  select * into s from public.team_settings where id = 1 for update;
  if s.scan_every = 'off' then
    return v_out;
  end if;
  v_slot := public.scan_slot(s.scan_every, s.scan_day, s.scan_hour, s.time_zone, now());
  if v_slot < s.scan_changed_at or v_slot <= coalesce(s.last_scan_at, '-infinity'::timestamptz) then
    return v_out;
  end if;
  update public.team_settings set last_scan_at = now() where id = 1;

  for c in
    select co.id, co.name, co.domain
      from public.competitors co
     where co.tracked and co.domain is not null
     order by (select max(r.created_at) from public.competitor_reports r where r.competitor_id = co.id) desc nulls last
     limit greatest(p_max, 0)
  loop
    select * into v_last from public.runs where competitor_id = c.id order by created_at desc limit 1;
    select r.page into v_page
      from public.runs r
     where r.competitor_id = c.id and r.page is not null and (r.page ->> 'ok')::boolean
     order by r.created_at desc
     limit 1;
    v_id := public.start_run(
      'competitor', 'website', left(c.name || ' · scheduled scan', 120),
      coalesce(v_last.platforms, array['meta', 'linkedin', 'x']),
      coalesce(v_last.goal, 'consultations'),
      p_url => 'https://' || c.domain
    );
    update public.runs set page = v_page where id = v_id;
    insert into public.run_events (run_id, text) values (
      v_id,
      case when v_page is null
        then 'Scheduled scan. The website was not read: a scheduled scan works from their ads'
        else format('Scheduled scan, with their website as the app last read it (%s)',
                    to_char(((v_page ->> 'readAt')::timestamptz) at time zone s.time_zone, 'FMDD Mon YYYY'))
      end
    );
    v_out := v_out || jsonb_build_array(jsonb_build_object('run_id', v_id, 'competitor', c.name));
  end loop;
  return v_out;
end
$$;

-- ---------------------------------------------------------------- posts

create table public.posts (
  id uuid primary key default gen_random_uuid(),
  variant_id uuid not null references public.ad_variants (id) on delete cascade,
  scheduled_for timestamptz not null,
  -- A small picture of what goes out, so the list still shows it once the file is gone.
  thumbnail text check (thumbnail is null or (thumbnail like 'data:image/jpeg;base64,%' and length(thumbnail) <= 60000)),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index posts_variant on public.posts (variant_id);
create index posts_scheduled_for on public.posts (scheduled_for);
create index posts_created_by on public.posts (created_by);

-- One place a post goes. The words are copied from the approved variant when
-- the post is made, and the file was made from it in the browser: what goes
-- out is what was approved, whatever happens to the variant after.
create table public.post_targets (
  post_id uuid not null references public.posts (id) on delete cascade,
  place text not null check (place in ('facebook', 'instagram', 'linkedin')),
  text text not null check (length(text) between 1 and 3000),
  media_path text check (media_path ~ '^posts/[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|mp4)$'),
  media_kind text check (media_kind in ('image', 'video')),
  -- scheduled → posting → posted, or failed (nothing went out; a person can
  -- try again) or unknown (it may have gone out; never sent again by itself).
  status text not null default 'scheduled' check (status in ('scheduled', 'posting', 'posted', 'failed', 'unknown', 'cancelled')),
  attempts smallint not null default 0,
  claimed_at timestamptz,
  posted_at timestamptz,
  remote_id text check (length(remote_id) <= 200),
  remote_url text check (remote_url ~ '^https://' and length(remote_url) <= 500),
  -- Went through a stand-in for the platform: nothing was really posted.
  stand_in boolean not null default false,
  error text check (length(error) <= 500),
  updated_at timestamptz not null default now(),
  primary key (post_id, place),
  constraint post_targets_media check ((media_path is null) = (media_kind is null)),
  constraint post_targets_media_kind check (media_path is null or (media_kind = 'image') = (media_path like '%.jpg')),
  -- Instagram takes a picture or a video, never words alone.
  constraint post_targets_instagram_media check (place <> 'instagram' or media_path is not null),
  constraint post_targets_posted check ((status = 'posted') = (posted_at is not null))
);
create index post_targets_open on public.post_targets (status) where status in ('scheduled', 'posting');
create index post_targets_media_path on public.post_targets (media_path) where media_path is not null;

-- The run a variant belongs to, for its activity.
create function public.run_of_variant(p_variant_id uuid)
returns uuid
language sql
stable
set search_path = ''
as $$
  select s.run_id from public.ad_variants v join public.ad_sets s on s.id = v.ad_set_id where v.id = p_variant_id
$$;

create function public.place_name(p_place text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_place when 'facebook' then 'Facebook' when 'instagram' then 'Instagram' when 'linkedin' then 'LinkedIn' end
$$;

-- Sends (p_local_time null) or schedules an approved variant. p_targets is
-- [{ place, media_path, media_kind }]: the files the browser made from the
-- variant and uploaded into the teammate's own folder. p_local_time is wall
-- time in the team's zone, 'YYYY-MM-DD HH24:MI'.
create function public.schedule_post(p_variant_id uuid, p_targets jsonb, p_local_time text default null, p_thumbnail text default null)
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
begin
  select * into v_variant from public.ad_variants where id = p_variant_id for update;
  if not found then
    raise exception 'Variant % not found', p_variant_id;
  end if;
  if v_variant.approved_at is null then
    raise exception 'Approve variant % before it is posted', v_variant.label;
  end if;

  select time_zone into v_tz from public.team_settings where id = 1;
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
    v_text := btrim(v_variant.copy #>> array[v_platform, 'text']);
    if coalesce(v_text, '') = '' then
      raise exception 'Variant % has no % copy to post to %', v_variant.label,
        case v_platform when 'meta' then 'Meta' else 'LinkedIn' end, public.place_name(v_place);
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
    public.run_of_variant(p_variant_id),
    format('Variant %s %s to %s', v_variant.label,
           case when p_local_time is null then 'sent' else 'scheduled' end,
           array_to_string(v_places, ', '))
  );
  return v_post;
end
$$;

-- Stops the places of a post that have not gone out yet. Returns the files no
-- open post needs any more, for the app to remove from Storage.
create function public.cancel_post(p_post_id uuid)
returns text[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_variant uuid;
  v_count integer;
  v_paths text[];
begin
  perform private.require_team_member();
  select variant_id into v_variant from public.posts where id = p_post_id;
  if v_variant is null then
    raise exception 'Post % not found', p_post_id;
  end if;
  -- A place that failed, or whose result is unknown, is set aside the same way.
  with stopped as (
    update public.post_targets
       set status = 'cancelled', updated_at = now()
     where post_id = p_post_id and status in ('scheduled', 'failed', 'unknown')
    returning media_path
  )
  select count(*), array_agg(distinct media_path) filter (where media_path is not null)
    into v_count, v_paths
    from stopped;
  if v_count = 0 then
    raise exception 'Nothing on this post is waiting to go out';
  end if;
  insert into public.run_events (run_id, text) values (public.run_of_variant(v_variant), 'A post was cancelled before it went out');
  return coalesce(array(
    select p from unnest(v_paths) as p
     where not exists (
       select 1 from public.post_targets t
        where t.media_path = p and t.status in ('scheduled', 'posting', 'failed', 'unknown'))
  ), '{}');
end
$$;

-- A place that failed, or whose result is unknown, goes out again now.
create function public.retry_post(p_post_id uuid, p_place text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_variant uuid;
begin
  perform private.require_team_member();
  update public.post_targets
     set status = 'scheduled', error = null, claimed_at = null, updated_at = now()
   where post_id = p_post_id and place = p_place and status in ('failed', 'unknown');
  if not found then
    raise exception 'That post is not waiting to be tried again';
  end if;
  update public.posts set scheduled_for = least(scheduled_for, now()) where id = p_post_id
  returning variant_id into v_variant;
  insert into public.run_events (run_id, text)
  values (public.run_of_variant(v_variant), 'Trying the ' || public.place_name(p_place) || ' post again');
end
$$;

-- ---------------------------------------------------------------- the publisher

-- Called by n8n's publisher: claims the places that are due and returns what
-- to post where. A place claimed over 15 minutes ago that never settled was
-- interrupted mid-send, so whether it went out is unknown: it is never sent
-- again by itself, a person checks the Page first.
create function public.publisher_take_due(p_limit integer default 10)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_out jsonb;
begin
  with lost as (
    update public.post_targets t
       set status = 'unknown', updated_at = now(),
           error = 'The publisher stopped while sending this. Check the Page before trying again.'
     where t.status = 'posting' and t.claimed_at < now() - interval '15 minutes'
    returning t.post_id, t.place
  )
  insert into public.run_events (run_id, text)
  select public.run_of_variant(p.variant_id), 'Not sure the ' || public.place_name(l.place) || ' post went out: check the Page'
    from lost l join public.posts p on p.id = l.post_id;

  with due as (
    select t.post_id, t.place
      from public.post_targets t
      join public.posts p on p.id = t.post_id
     where t.status = 'scheduled' and p.scheduled_for <= now()
     order by p.scheduled_for
     limit greatest(p_limit, 0)
       for update of t skip locked
  ), claimed as (
    update public.post_targets t
       set status = 'posting', claimed_at = now(), attempts = t.attempts + 1, updated_at = now()
      from due
     where t.post_id = due.post_id and t.place = due.place
    returning t.post_id, t.place, t.text, t.media_path, t.media_kind
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'post_id', c.post_id,
           'place', c.place,
           'text', c.text,
           'media_path', c.media_path,
           'media_kind', c.media_kind,
           'page', case c.place
             when 'facebook' then jsonb_build_object('id', s.facebook_page_id, 'name', s.facebook_page_name)
             when 'instagram' then jsonb_build_object('id', s.instagram_account_id, 'name', s.instagram_username)
             else jsonb_build_object('id', s.linkedin_org_id, 'name', s.linkedin_page_name)
           end
         ) order by c.post_id, c.place), '[]'::jsonb)
    into v_out
    from claimed c
    cross join public.team_settings s
   where s.id = 1;
  return v_out;
end
$$;

-- The place went out (or through its stand-in). Returns the file to remove
-- from Storage once no open post needs it: the platform keeps its own copy.
create function public.publisher_finish(p_post_id uuid, p_place text, p_remote_id text default null, p_remote_url text default null, p_stand_in boolean default false)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_target public.post_targets;
  v_variant public.ad_variants;
begin
  update public.post_targets
     set status = 'posted', posted_at = now(), updated_at = now(), error = null,
         remote_id = nullif(btrim(p_remote_id), ''), remote_url = nullif(btrim(p_remote_url), ''),
         stand_in = coalesce(p_stand_in, false)
   where post_id = p_post_id and place = p_place and status in ('posting', 'unknown')
  returning * into v_target;
  if not found then
    raise exception 'The % post was not being sent', public.place_name(p_place);
  end if;
  select v.* into v_variant from public.posts p join public.ad_variants v on v.id = p.variant_id where p.id = p_post_id;
  insert into public.run_events (run_id, text) values (
    public.run_of_variant(v_variant.id),
    case when v_target.stand_in
      then format('Variant %s went through the %s stand-in: nothing was posted', v_variant.label, public.place_name(p_place))
      else format('Variant %s posted to %s', v_variant.label, public.place_name(p_place))
    end
  );
  return jsonb_build_object(
    'remove_media',
    case when v_target.media_path is not null and not exists (
      select 1 from public.post_targets t
       where t.media_path = v_target.media_path and t.status in ('scheduled', 'posting', 'failed', 'unknown'))
    then v_target.media_path end
  );
end
$$;

-- The place did not go out. p_unknown: it may have (the platform did not
-- answer after the post was sent), so it is never sent again by itself.
create function public.publisher_fail(p_post_id uuid, p_place text, p_error text, p_unknown boolean default false)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_variant public.ad_variants;
  v_error text := left(coalesce(nullif(btrim(p_error), ''), 'Unknown error'), 500);
begin
  update public.post_targets
     set status = case when p_unknown then 'unknown' else 'failed' end, error = v_error, updated_at = now()
   where post_id = p_post_id and place = p_place and status = 'posting';
  if not found then
    raise exception 'The % post was not being sent', public.place_name(p_place);
  end if;
  select v.* into v_variant from public.posts p join public.ad_variants v on v.id = p.variant_id where p.id = p_post_id;
  insert into public.run_events (run_id, text) values (
    public.run_of_variant(v_variant.id),
    case when p_unknown
      then format('Not sure variant %s went out on %s: %s', v_variant.label, public.place_name(p_place), v_error)
      else format('Posting variant %s to %s failed: %s', v_variant.label, public.place_name(p_place), v_error)
    end
  );
end
$$;

-- ---------------------------------------------------------------- what people change

create function public.update_agent_settings(
  p_strategist_auto boolean,
  p_content_auto boolean,
  p_scan_every text,
  p_scan_day integer,
  p_scan_hour integer,
  p_time_zone text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := private.require_team_member();
  s public.team_settings;
begin
  if p_scan_every not in ('off', 'day', 'week') then
    raise exception 'Scans run every day, every week, or not at all';
  end if;
  if p_scan_day not between 1 and 7 or p_scan_hour not between 0 and 23 then
    raise exception 'Pick a day and an hour for scans';
  end if;
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = p_time_zone) then
    raise exception 'Unknown time zone %', p_time_zone;
  end if;
  select * into s from public.team_settings where id = 1 for update;
  update public.team_settings
     set strategist_auto = p_strategist_auto,
         content_auto = p_content_auto,
         scan_every = p_scan_every,
         scan_day = p_scan_day,
         scan_hour = p_scan_hour,
         time_zone = p_time_zone,
         scan_changed_at = case
           when (s.scan_every, s.scan_day, s.scan_hour, s.time_zone) is distinct from (p_scan_every, p_scan_day::smallint, p_scan_hour::smallint, p_time_zone)
           then now() else s.scan_changed_at end,
         updated_at = now(),
         updated_by = v_user
   where id = 1;
end
$$;

-- The Pages posts go to. Empty clears one. The keys that post are n8n's.
create function public.update_publishing_settings(
  p_facebook_page_id text,
  p_facebook_page_name text,
  p_instagram_account_id text,
  p_instagram_username text,
  p_linkedin_org_id text,
  p_linkedin_page_name text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := private.require_team_member();
begin
  update public.team_settings
     set facebook_page_id = nullif(btrim(p_facebook_page_id), ''),
         facebook_page_name = nullif(btrim(p_facebook_page_name), ''),
         instagram_account_id = nullif(btrim(p_instagram_account_id), ''),
         instagram_username = nullif(ltrim(btrim(p_instagram_username), '@'), ''),
         linkedin_org_id = nullif(btrim(p_linkedin_org_id), ''),
         linkedin_page_name = nullif(btrim(p_linkedin_page_name), ''),
         updated_at = now(),
         updated_by = v_user
   where id = 1;
end
$$;

create function public.set_competitor_tracked(p_competitor_id uuid, p_tracked boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_team_member();
  update public.competitors set tracked = p_tracked where id = p_competitor_id;
  if not found then
    raise exception 'Competitor % not found', p_competitor_id;
  end if;
end
$$;

-- ---------------------------------------------------------------- approvals hold

-- As before, and: a variant waiting to post cannot be edited, and a change to
-- an approved variant takes the approval back. Saving the same words changes
-- nothing.
create or replace function public.save_variant(p_variant_id uuid, p_creative_text text, p_copy jsonb, p_warnings text[])
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

  if v_variant.creative_text = btrim(p_creative_text) and v_variant.copy = p_copy then
    return;
  end if;
  if exists (
    select 1 from public.posts p join public.post_targets t on t.post_id = p.id
     where p.variant_id = p_variant_id and t.status in ('scheduled', 'posting')
  ) then
    raise exception 'Variant % is waiting to post. Cancel the post before changing it', v_variant.label;
  end if;

  update public.ad_variants
     set creative_text = btrim(p_creative_text),
         copy = p_copy,
         warnings = coalesce(p_warnings, '{}'),
         approved_at = null,
         approved_by = null,
         updated_at = now(),
         updated_by = v_user
   where id = p_variant_id;
  perform public.unapproved(v_variant, v_run, 'edited');
end
$$;

-- After a change to an approved variant: the run is approved again only once
-- one of its variants is.
create function public.unapproved(p_was public.ad_variants, p_run uuid, p_what text)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if p_was.approved_at is not null
     and not exists (select 1 from public.ad_variants v where v.ad_set_id = p_was.ad_set_id and v.approved_at is not null) then
    update public.runs set approved_at = null where id = p_run;
  end if;
  insert into public.run_events (run_id, text) values (
    p_run,
    'Variant ' || p_was.label || ' ' || p_what
      || case when p_was.approved_at is not null then ': it needs approving again' else '' end
  );
end
$$;

create or replace function public.save_video_edit(p_variant_id uuid, p_edit jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := private.require_team_member();
  v_variant public.ad_variants;
  v_run public.runs;
  v_duration numeric;
  v_part jsonb;
begin
  select * into v_variant from public.ad_variants where id = p_variant_id for update;
  if not found then
    raise exception 'Variant % not found', p_variant_id;
  end if;
  select r.* into v_run
    from public.ad_sets s
    join public.runs r on r.id = s.run_id
   where s.id = v_variant.ad_set_id;
  if v_run.media_path is null then
    raise exception 'This variant has no clip to edit';
  end if;
  v_duration := (v_run.media ->> 'duration')::numeric;

  if p_edit is not null then
    if jsonb_typeof(p_edit) <> 'object' or pg_column_size(p_edit) >= 32768 then
      raise exception 'The edit is not readable';
    end if;
    if jsonb_typeof(p_edit -> 'keep') is distinct from 'array' or jsonb_array_length(p_edit -> 'keep') not between 1 and 50 then
      raise exception 'Keep at least one part of the clip';
    end if;
    for v_part in select value from jsonb_array_elements(p_edit -> 'keep') loop
      if jsonb_typeof(v_part -> 'start') is distinct from 'number' or jsonb_typeof(v_part -> 'end') is distinct from 'number'
         or (v_part ->> 'start')::numeric < 0
         or (v_part ->> 'end')::numeric > v_duration + 0.5
         or (v_part ->> 'end')::numeric - (v_part ->> 'start')::numeric < 0.1 then
        raise exception 'A kept part is outside the clip';
      end if;
    end loop;
    if p_edit ? 'captions' and (jsonb_typeof(p_edit -> 'captions') <> 'array' or jsonb_array_length(p_edit -> 'captions') > 100) then
      raise exception 'Up to 100 captions';
    end if;
  end if;

  if v_variant.video_edit is not distinct from p_edit then
    return;
  end if;
  if exists (
    select 1 from public.posts p join public.post_targets t on t.post_id = p.id
     where p.variant_id = p_variant_id and t.status in ('scheduled', 'posting')
  ) then
    raise exception 'Variant % is waiting to post. Cancel the post before changing it', v_variant.label;
  end if;

  update public.ad_variants
     set video_edit = p_edit, approved_at = null, approved_by = null, updated_at = now(), updated_by = v_user
   where id = p_variant_id;
  perform public.unapproved(v_variant, v_run.id, case when p_edit is null then 'video reset' else 'video edited' end);
end
$$;

-- An uploaded clip may carry its transcript (lines in the clip's seconds) in
-- runs.media; it stays small.
alter table public.runs add constraint runs_media_size check (media is null or pg_column_size(media) < 131072);

-- ---------------------------------------------------------------- storage

-- The files posts go out with: a picture or an MP4 made in the browser from
-- an approved variant. Removed once every place that needs one has it.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('post-media', 'post-media', false, 52428800, array['image/jpeg', 'video/mp4'])
on conflict (id) do nothing;

create policy "Team members read post media" on storage.objects
  for select to authenticated
  using (bucket_id = 'post-media' and (select private.is_team_member()));

create policy "Team members upload post media into their own folder" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'post-media'
    and (storage.foldername(name))[1] = 'posts'
    and (storage.foldername(name))[2] = (select auth.uid())::text
    and (select private.is_team_member())
  );

-- A file no open post needs: one left behind by a post that was cancelled or
-- never made. One a post still waits on stays.
create policy "Team members remove post media nothing waits on" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'post-media'
    and (select private.is_team_member())
    and not exists (
      select 1 from public.post_targets t
       where t.media_path = objects.name and t.status in ('scheduled', 'posting', 'failed', 'unknown'))
  );

-- ---------------------------------------------------------------- access

alter table public.team_settings enable row level security;
alter table public.posts enable row level security;
alter table public.post_targets enable row level security;
revoke all on public.team_settings, public.posts, public.post_targets from anon, authenticated;
grant select on public.team_settings, public.posts, public.post_targets to authenticated;

create policy "Team members read the team settings" on public.team_settings
  for select to authenticated using ((select private.is_team_member()));
create policy "Team members read posts" on public.posts
  for select to authenticated using ((select private.is_team_member()));
create policy "Team members read where posts go" on public.post_targets
  for select to authenticated using ((select private.is_team_member()));

revoke execute on function
  public.pipeline_next(uuid, text),
  public.scan_slot(text, integer, integer, text, timestamptz),
  public.start_due_scans(integer),
  public.run_of_variant(uuid),
  public.place_name(text),
  public.publisher_take_due(integer),
  public.publisher_finish(uuid, text, text, text, boolean),
  public.publisher_fail(uuid, text, text, boolean),
  public.unapproved(public.ad_variants, uuid, text)
from public, anon, authenticated;
grant execute on function
  public.pipeline_next(uuid, text),
  public.scan_slot(text, integer, integer, text, timestamptz),
  public.start_due_scans(integer),
  public.run_of_variant(uuid),
  public.place_name(text),
  public.publisher_take_due(integer),
  public.publisher_finish(uuid, text, text, text, boolean),
  public.publisher_fail(uuid, text, text, boolean),
  public.unapproved(public.ad_variants, uuid, text)
to service_role;

revoke execute on function
  public.continue_run(uuid),
  public.report_continue_failure(uuid, text, text),
  public.next_scan_at(),
  public.schedule_post(uuid, jsonb, text, text),
  public.cancel_post(uuid),
  public.retry_post(uuid, text),
  public.update_agent_settings(boolean, boolean, text, integer, integer, text),
  public.update_publishing_settings(text, text, text, text, text, text),
  public.set_competitor_tracked(uuid, boolean)
from public, anon;
grant execute on function
  public.continue_run(uuid),
  public.report_continue_failure(uuid, text, text),
  public.next_scan_at(),
  public.schedule_post(uuid, jsonb, text, text),
  public.cancel_post(uuid),
  public.retry_post(uuid, text),
  public.update_agent_settings(boolean, boolean, text, integer, integer, text),
  public.update_publishing_settings(text, text, text, text, text, text),
  public.set_competitor_tracked(uuid, boolean)
to authenticated, service_role;
