-- Picks inside a run. A run can be started with "Let me pick the ads and
-- angles" (runs.pick_first): it then waits after the Competitor Tracker for
-- the team to tick the report's ads the Ad Strategist works from, and after
-- the Ad Strategist for the angles the Content Agent writes from. "Use all"
-- (or every box ticked) goes on with everything, as a run always did.
--
-- * The ads picked are kept as runs.chosen_ad_ids, which agent_begin already
--   hands to the strategist and the Content Agent (a run from chosen ads,
--   20261019185038): the report is the run's own here.
-- * The angles picked are kept as runs.chosen_angle_ids; agent_begin hands the
--   Content Agent their positions, and it spreads its three variants over them.
-- * The same pickers serve a run that waits because a switch is off.

alter table public.runs
  add column pick_first boolean not null default false,
  add column chosen_angle_ids uuid[]
    constraint runs_chosen_angles_count check (chosen_angle_ids is null or cardinality(chosen_angle_ids) between 1 and 3);

-- Whether the run waits for the team's picks, set as it starts (as its
-- direction is): only while no agent has started.
create function public.set_run_pick_first(p_run_id uuid, p_on boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_team_member();
  if p_on is null then
    raise exception 'Say whether the run waits for your picks';
  end if;
  if not exists (select 1 from public.runs where id = p_run_id) then
    raise exception 'Run % not found', p_run_id;
  end if;
  if exists (select 1 from public.run_stages where run_id = p_run_id and status not in ('queued', 'skipped')) then
    raise exception 'The agents have started on this run, so whether it waits for your picks is set';
  end if;
  update public.runs set pick_first = p_on where id = p_run_id;
end
$$;

-- As before, and a run that asked to pick first waits: before the strategist
-- when its own report has ads and none were chosen, and before the Content
-- Agent. A switch that is off still holds the stage as it did.
create or replace function public.pipeline_next(p_run_id uuid, p_stage text)
returns boolean
language plpgsql
set search_path = ''
as $$
declare
  v_status text;
  v_waiting timestamptz;
  v_auto boolean;
  v_run public.runs;
begin
  select status, waiting_since into v_status, v_waiting
    from public.run_stages
   where run_id = p_run_id and stage = p_stage
     for update;
  if v_status is distinct from 'queued' or v_waiting is not null then
    return false;
  end if;
  select * into v_run from public.runs where id = p_run_id;
  if v_run.pick_first and (
       p_stage = 'content'
       or (p_stage = 'strategist' and v_run.chosen_ad_ids is null and exists (
             select 1 from public.competitor_ads a
               join public.competitor_reports r on r.id = a.report_id
              where r.run_id = p_run_id))) then
    update public.run_stages set waiting_since = now() where run_id = p_run_id and stage = p_stage;
    insert into public.run_events (run_id, text) values (
      p_run_id,
      case p_stage
        when 'strategist' then 'The Ad Strategist waits for you to pick the ads it works from'
        else 'The Content Agent waits for you to pick the angles it writes from'
      end
    );
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

-- The go-ahead for a waiting Ad Strategist, with the report's ads it works
-- from, in the order picked. None, or all of them, is every ad, as before.
create function public.continue_with_ads(p_run_id uuid, p_ad_ids uuid[])
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run public.runs;
  v_report uuid;
  v_ids uuid[];
  v_total integer;
  v_count integer;
begin
  perform private.require_team_member();
  select * into v_run from public.runs where id = p_run_id for update;
  if not found then
    raise exception 'Run % not found', p_run_id;
  end if;
  perform 1 from public.run_stages
   where run_id = p_run_id and stage = 'strategist' and status = 'queued' and waiting_since is not null
     for update;
  if not found then
    raise exception 'The Ad Strategist is not waiting for your go-ahead on this run';
  end if;
  select r.id into v_report
    from public.competitor_reports r
   where case when v_run.source_report_id is not null then r.id = v_run.source_report_id else r.run_id = p_run_id end
   order by r.created_at desc
   limit 1;
  select coalesce(array_agg(id order by ord), '{}') into v_ids
    from (select distinct on (t.id) t.id, t.ord
            from unnest(coalesce(p_ad_ids, '{}'::uuid[])) with ordinality as t(id, ord)
           order by t.id, t.ord) picked;
  v_count := cardinality(v_ids);
  select count(*) into v_total from public.competitor_ads where report_id = v_report;
  if v_count > 0 then
    if v_report is null or exists (
         select 1 from unnest(v_ids) as t(id)
          where not exists (select 1 from public.competitor_ads a where a.id = t.id and a.report_id = v_report)) then
      raise exception 'Pick the ads from this run''s report';
    end if;
    if v_count < v_total and v_count > 20 then
      raise exception 'Pick up to 20 ads, or use them all';
    end if;
  end if;
  update public.runs
     set chosen_ad_ids = case when v_count between 1 and v_total - 1 then v_ids end
   where id = p_run_id;
  update public.run_stages set waiting_since = null where run_id = p_run_id and stage = 'strategist';
  insert into public.run_events (run_id, text) values (
    p_run_id,
    case when v_count between 1 and v_total - 1
      then format('Go-ahead given for the Ad Strategist, with %s of the report''s %s ads', v_count, v_total)
      else 'Go-ahead given for the Ad Strategist, with all of the report''s ads' end
  );
  return 'strategist';
end
$$;

-- The go-ahead for a waiting Content Agent, with the strategy's angles it
-- writes from. None, or all three, is every angle, as before.
create function public.continue_with_angles(p_run_id uuid, p_angle_ids uuid[])
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_strategy uuid;
  v_ids uuid[];
  v_total integer;
  v_count integer;
begin
  perform private.require_team_member();
  perform 1 from public.runs where id = p_run_id for update;
  if not found then
    raise exception 'Run % not found', p_run_id;
  end if;
  perform 1 from public.run_stages
   where run_id = p_run_id and stage = 'content' and status = 'queued' and waiting_since is not null
     for update;
  if not found then
    raise exception 'The Content Agent is not waiting for your go-ahead on this run';
  end if;
  select s.id into v_strategy from public.strategies s where s.run_id = p_run_id order by s.created_at desc limit 1;
  select count(*) into v_total from public.strategy_angles where strategy_id = v_strategy;
  select coalesce(array_agg(a.id order by a.position), '{}') into v_ids
    from public.strategy_angles a
   where a.strategy_id = v_strategy and a.id = any (coalesce(p_angle_ids, '{}'::uuid[]));
  v_count := cardinality(v_ids);
  if v_count < (select count(distinct x) from unnest(coalesce(p_angle_ids, '{}'::uuid[])) as t(x)) then
    raise exception 'Pick the angles from this run''s strategy';
  end if;
  update public.runs
     set chosen_angle_ids = case when v_count between 1 and v_total - 1 then v_ids end
   where id = p_run_id;
  update public.run_stages set waiting_since = null where run_id = p_run_id and stage = 'content';
  insert into public.run_events (run_id, text) values (
    p_run_id,
    case when v_count between 1 and v_total - 1
      then format('Go-ahead given for the Content Agent, from %s of the strategy''s %s angles', v_count, v_total)
      else 'Go-ahead given for the Content Agent, from every angle' end
  );
  return 'content';
end
$$;

-- As before, and the Content Agent gets the positions of the angles picked
-- (chosen_angles), when some were.
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
    'chosen_angles', case when p_stage = 'content' and v_run.chosen_angle_ids is not null then (
      select coalesce(jsonb_agg(a.position order by a.position), '[]'::jsonb)
        from public.strategy_angles a
        join public.strategies s on s.id = a.strategy_id
       where s.run_id = p_run_id and a.id = any (v_run.chosen_angle_ids)
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

revoke all on function public.set_run_pick_first(uuid, boolean) from public, anon, authenticated;
revoke all on function public.continue_with_ads(uuid, uuid[]) from public, anon, authenticated;
revoke all on function public.continue_with_angles(uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.set_run_pick_first(uuid, boolean) to authenticated;
grant execute on function public.continue_with_ads(uuid, uuid[]) to authenticated;
grant execute on function public.continue_with_angles(uuid, uuid[]) to authenticated;
