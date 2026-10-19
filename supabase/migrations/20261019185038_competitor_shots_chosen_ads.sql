-- Two ways into a competitor that are not their website:
--
-- * Screenshots of their ads. A teammate saves a few (from a feed, Meta's Ad
--   Library, LinkedIn) and starts a run from them: the run's input is
--   'upload', its files the screenshots, kept in the private bucket
--   competitor-shots at shots/{uploader}/{uuid}.{ext}. The tracker has
--   Claude read the ads out of the pictures. A screenshot rarely shows how
--   long an ad has run, so an ad's days are known only when it shows the date
--   it started (days_known); the dashboard shows nothing in their place.
--
-- * A few of a report's ads, chosen by a person. start_run_from_ads starts a
--   run at the strategist, with the report it came from (source_report_id) and
--   the ads chosen (chosen_ad_ids); agent_begin hands both to the strategist
--   and the Content Agent. The tracker's report keeps every ad it read now,
--   not only four examples, so there is something to choose from.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('competitor-shots', 'competitor-shots', false, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "Team members read competitor screenshots" on storage.objects
  for select to authenticated
  using (bucket_id = 'competitor-shots' and (select private.is_team_member()));

create policy "Team members upload competitor screenshots into their own folder" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'competitor-shots'
    and (storage.foldername(name))[1] = 'shots'
    and (storage.foldername(name))[2] = (select auth.uid())::text
    and (select private.is_team_member())
  );

alter table public.runs
  add column source_report_id uuid references public.competitor_reports (id) on delete set null,
  add column chosen_ad_ids uuid[]
    constraint runs_chosen_ads_count check (chosen_ad_ids is null or cardinality(chosen_ad_ids) between 1 and 20);

alter table public.competitor_ads
  add column headline text,
  add column cta text,
  add column page_name text,
  add column angle text,
  add column screenshot_path text,
  add column position smallint,
  add column days_known boolean not null default true;

alter table public.hooks
  add column days_known boolean not null default true;

-- ---------------------------------------------------------------- starting a run

-- As before; a run from screenshots names files that are in competitor-shots.
create or replace function public.create_run(
  p_kind text,
  p_input text,
  p_title text,
  p_platforms text[],
  p_goal text,
  p_url text default null,
  p_competitor_name text default null,
  p_files text[] default null,
  p_excerpt text default null,
  p_page jsonb default null,
  p_media_path text default null,
  p_media jsonb default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := private.require_team_member();
  v_id uuid;
  v_file text;
begin
  if cardinality(p_platforms) <> (select count(distinct p) from unnest(p_platforms) as p) then
    raise exception 'A platform is listed twice';
  end if;
  if p_media_path is not null and not exists (select 1 from storage.objects where bucket_id = 'run-media' and name = p_media_path) then
    raise exception 'The clip has not finished uploading';
  end if;
  if p_input = 'upload' then
    if coalesce(cardinality(p_files), 0) not between 1 and 10 then
      raise exception 'Add between 1 and 10 screenshots';
    end if;
    if cardinality(p_files) <> (select count(distinct f) from unnest(p_files) as f) then
      raise exception 'A screenshot is listed twice';
    end if;
    foreach v_file in array p_files loop
      if v_file !~ '^shots/[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp)$' then
        raise exception 'A screenshot is not one uploaded here';
      end if;
      if not exists (select 1 from storage.objects where bucket_id = 'competitor-shots' and name = v_file) then
        raise exception 'A screenshot has not finished uploading';
      end if;
    end loop;
  end if;
  v_id := public.start_run(p_kind, p_input, p_title, p_platforms, p_goal, p_url, p_competitor_name, p_files, p_excerpt, p_page, p_media_path, p_media);
  update public.runs set created_by = v_user where id = v_id;
  if p_input = 'upload' then
    insert into public.run_events (run_id, text)
    values (v_id, format('%s screenshot%s of their ads', cardinality(p_files), case when cardinality(p_files) = 1 then '' else 's' end));
  end if;
  return v_id;
end
$$;

-- Starts a run from a few of a report's ads, chosen by the signed-in teammate.
-- The tracker is skipped: the report is already there. The run keeps the
-- competitor's source (their website, a library link or the screenshots), so
-- it reads like any other run on them.
create function public.start_run_from_ads(
  p_report_id uuid,
  p_ad_ids uuid[],
  p_platforms text[],
  p_goal text,
  p_title text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := private.require_team_member();
  v_report public.competitor_reports;
  v_source public.runs;
  v_name text;
  v_count integer := coalesce(cardinality(p_ad_ids), 0);
  v_id uuid;
begin
  select * into v_report from public.competitor_reports where id = p_report_id;
  if not found then
    raise exception 'That report is not there any more';
  end if;
  if v_count not between 1 and 20 then
    raise exception 'Choose between 1 and 20 ads';
  end if;
  if v_count <> (select count(distinct a) from unnest(p_ad_ids) as a)
     or v_count <> (select count(*) from public.competitor_ads where report_id = p_report_id and id = any (p_ad_ids)) then
    raise exception 'Choose ads from this report';
  end if;
  if cardinality(p_platforms) <> (select count(distinct p) from unnest(p_platforms) as p) then
    raise exception 'A platform is listed twice';
  end if;

  select * into v_source from public.runs where id = v_report.run_id;
  select name into v_name from public.competitors where id = v_report.competitor_id;

  insert into public.runs
    (title, kind, input, url, competitor_name, files, page, platforms, goal,
     competitor_id, source_report_id, chosen_ad_ids, guidance, created_by)
  values (
    left(coalesce(nullif(btrim(p_title), ''), format('%s · %s chosen ad%s', v_name, v_count, case when v_count = 1 then '' else 's' end)), 120),
    'competitor', v_source.input, v_source.url, v_source.competitor_name, v_source.files, v_source.page,
    p_platforms, p_goal, v_report.competitor_id, p_report_id, p_ad_ids, null, v_user
  )
  returning id into v_id;

  insert into public.run_stages (run_id, stage, status) values
    (v_id, 'tracker', 'skipped'),
    (v_id, 'strategist', 'queued'),
    (v_id, 'content', 'queued');
  insert into public.run_events (run_id, text) values
    (v_id, 'Run started'),
    (v_id, format('Competitor Tracker skipped: built on %s ad%s chosen from the report on %s',
                  v_count, case when v_count = 1 then '' else 's' end, v_name));
  return v_id;
end
$$;

revoke all on function public.start_run_from_ads(uuid, uuid[], text[], text, text) from public, anon;
grant execute on function public.start_run_from_ads(uuid, uuid[], text[], text, text) to authenticated;

-- ---------------------------------------------------------------- the tracker

-- As before, keeping every ad the tracker read, in its order, with what the
-- strategist reads from a chosen one (headline, call to action, angle), and
-- whether its days running are known. A report from screenshots is said so.
create or replace function public.agent_finish_tracker(p_run_id uuid, p_report jsonb, p_usage jsonb default null)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_name text := nullif(btrim(p_report #>> '{competitor,name}'), '');
  v_domain text := nullif(lower(btrim(p_report #>> '{competitor,domain}')), '');
  v_run public.runs;
  v_competitor uuid;
  v_report uuid;
  v_hooks integer;
  v_ads integer;
begin
  perform public.assert_stage_running(p_run_id, 'tracker');
  select * into v_run from public.runs where id = p_run_id;
  if v_name is null then
    raise exception 'The report names no competitor';
  end if;
  if jsonb_typeof(p_report -> 'hooks') is distinct from 'array' or jsonb_array_length(p_report -> 'hooks') = 0 then
    raise exception 'The report has no hooks';
  end if;
  if jsonb_typeof(p_report -> 'insights') is distinct from 'array' then
    raise exception 'The report has no insights';
  end if;
  if exists (
    select 1 from jsonb_array_elements(coalesce(p_report -> 'ads', '[]'::jsonb)) a
     where a ->> 'screenshot_path' is not null
       and not (a ->> 'screenshot_path' = any (coalesce(v_run.files, '{}')))
  ) then
    raise exception 'An ad names a screenshot that is not this run''s';
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

  insert into public.hooks (report_id, rank, text, platform, format, days_running, variations, days_known)
  select v_report, t.ord::smallint, t.h ->> 'text', t.h ->> 'platform', t.h ->> 'format',
         (t.h ->> 'days_running')::integer, (t.h ->> 'variations')::integer,
         coalesce((t.h ->> 'days_known')::boolean, true)
    from jsonb_array_elements(p_report -> 'hooks') with ordinality as t(h, ord);

  insert into public.competitor_ads
    (report_id, platform, format, text, days_running, ad_url, media_url,
     headline, cta, page_name, angle, screenshot_path, position, days_known)
  select v_report, t.a ->> 'platform', t.a ->> 'format', t.a ->> 'text', (t.a ->> 'days_running')::integer,
         t.a ->> 'ad_url', t.a ->> 'media_url',
         nullif(btrim(t.a ->> 'headline'), ''), nullif(btrim(t.a ->> 'cta'), ''), nullif(btrim(t.a ->> 'page_name'), ''),
         nullif(btrim(t.a ->> 'angle'), ''), t.a ->> 'screenshot_path', (t.ord - 1)::smallint,
         coalesce((t.a ->> 'days_known')::boolean, true)
    from jsonb_array_elements(coalesce(p_report -> 'ads', '[]'::jsonb)) with ordinality as t(a, ord);

  update public.runs set competitor_id = v_competitor, summary = p_report ->> 'summary' where id = p_run_id;

  if p_report ->> 'data_source' = 'placeholder' then
    insert into public.run_events (run_id, text)
    values (p_run_id, 'Used sample ads: Apify is not connected yet');
  end if;

  v_hooks := jsonb_array_length(p_report -> 'hooks');
  v_ads := (p_report ->> 'active_ads')::integer;
  perform public.finish_stage(
    p_run_id, 'tracker',
    case when p_report ->> 'data_source' = 'upload'
      then format('Read %s ad%s from %s screenshot%s and found %s hook%s.',
                  v_ads, case when v_ads = 1 then '' else 's' end,
                  coalesce(cardinality(v_run.files), 0), case when cardinality(v_run.files) = 1 then '' else 's' end,
                  v_hooks, case when v_hooks = 1 then '' else 's' end)
      else format('Scanned %s active ads and found %s winning hook%s.', v_ads, v_hooks,
                  case when v_hooks = 1 then '' else 's' end)
    end);
  perform public.record_usage(p_run_id, 'tracker', p_usage);
  return v_report;
end
$$;

-- As before. The report is the run's own, or the one its ads were chosen
-- from; an unknown days running reads as null; and a run from chosen ads
-- hands them to the strategist and the Content Agent, in the order chosen.
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
    'examples', (
      select coalesce(jsonb_agg(jsonb_build_object('place', e.place, 'text', e.text, 'note', e.note, 'source', e.source)
                                order by e.created_at desc), '[]'::jsonb)
        from (select * from public.brand_examples where removed_at is null order by created_at desc limit 12) e
    ),
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
                   'days_running', case when h.days_known then h.days_running end,
                   'variations', h.variations) order by h.rank)
            from public.hooks h
           where h.report_id = r.id), '[]'::jsonb)
      )
      from public.competitor_reports r
      join public.competitors c on c.id = r.competitor_id
      where case when v_run.source_report_id is not null then r.id = v_run.source_report_id else r.run_id = p_run_id end
    ),
    'chosen_ads', case when p_stage in ('strategist', 'content') and v_run.chosen_ad_ids is not null then (
      select coalesce(jsonb_agg(jsonb_build_object(
               'platform', a.platform, 'format', a.format, 'text', a.text, 'headline', a.headline,
               'cta', a.cta, 'angle', a.angle,
               'days_running', case when a.days_known then a.days_running end) order by t.ord), '[]'::jsonb)
        from unnest(v_run.chosen_ad_ids) with ordinality as t(id, ord)
        join public.competitor_ads a on a.id = t.id
    ) end,
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
    ),
    'ads_source', case when p_stage = 'tracker' then
      coalesce((select s.ads_source from public.team_settings s where s.id = 1), 'sample') end,
    'results', case when p_stage in ('strategist', 'content') then (
      select coalesce(jsonb_agg(to_jsonb(r) order by r.posted_at desc), '[]'::jsonb)
        from (
          select v.angle, v.creative_text,
                 v.copy #>> array[case t.place when 'linkedin' then 'linkedin' else 'meta' end, 'headline'] as headline,
                 t.place, t.text, t.posted_at, t.reach, t.views, t.reactions, t.comments, t.shares, t.clicks
            from public.post_targets t
            join public.posts p on p.id = t.post_id
            join public.ad_variants v on v.id = p.variant_id
           where t.status = 'posted' and not t.stand_in
             and coalesce(t.reach, t.views) is not null
             and t.posted_at > now() - interval '180 days'
           order by t.posted_at desc
           limit 40
        ) r
    ) end
  );
end
$$;
