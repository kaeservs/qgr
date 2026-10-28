-- Every run said the same (the client's ask, 2026-10-28): the agents never saw
-- what the runs before had said, and the team's taglines were followed word for
-- word. agent_begin now hands the strategist the angles of the last six runs
-- (recent_angles) and the Content Agent the words of their ads (recent_ads:
-- the words on the picture, the headline and the openings of the copy and the
-- post), which their scripts tell them not to repeat. A run deleted, or one
-- started after this one, is not counted. Otherwise as before.

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
    'references', case when p_stage = 'content' and exists (select 1 from public.run_references where run_id = p_run_id) then (
      select jsonb_agg(jsonb_build_object('number', r.position + 1, 'note', r.note) order by r.position)
        from public.run_references r
       where r.run_id = p_run_id and r.status <> 'failed'
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
    -- What the team's last runs already said (the client's ask, 2026-10-28:
    -- every run read the same). The strategist sees their angles and the
    -- Content Agent their words, so each run says something new.
    'recent_angles', case when p_stage = 'strategist' then (
      select coalesce(jsonb_agg(jsonb_build_object('name', a.name, 'hook', a.hook) order by a.created_at desc, a.position), '[]'::jsonb)
        from (
          select a.name, a.hook, a.position, r.created_at
            from public.runs r
            join public.strategies s on s.run_id = r.id
            join public.strategy_angles a on a.strategy_id = s.id
           where r.id <> p_run_id and r.removed_at is null and r.created_at < v_run.created_at
             and r.id in (select r2.id from public.runs r2 join public.strategies s2 on s2.run_id = r2.id
                           where r2.id <> p_run_id and r2.removed_at is null and r2.created_at < v_run.created_at
                           order by r2.created_at desc limit 6)
        ) a
    ) end,
    'recent_ads', case when p_stage = 'content' then (
      select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
               'image_words', nullif(v.creative_text, ''),
               'headline', coalesce(v.copy #>> '{meta,headline}', v.copy #>> '{linkedin,headline}', v.copy #>> '{x,headline}'),
               'copy', left(coalesce(v.copy #>> '{meta,text}', v.copy #>> '{linkedin,text}', v.copy #>> '{x,text}'), 200),
               'post', left(coalesce(v.posts ->> 'facebook', v.posts ->> 'linkedin', v.posts ->> 'instagram'), 200)
             )) order by r.created_at desc, v.label), '[]'::jsonb)
        from public.runs r
        join public.ad_sets st on st.run_id = r.id
        join public.ad_variants v on v.ad_set_id = st.id
       where r.id in (select r2.id from public.runs r2
                       where r2.id <> p_run_id and r2.removed_at is null and r2.created_at < v_run.created_at
                         and exists (select 1 from public.ad_sets s2 where s2.run_id = r2.id)
                       order by r2.created_at desc limit 6)
    ) end,
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
