-- Where the Competitor Tracker reads a competitor's ads: sample ads, as until
-- now, or their real ads from Meta's Ad Library through Apify. Sample stays the
-- default; the team switches in Settings once Apify's token is in n8n.
alter table public.team_settings
  add column ads_source text not null default 'sample' check (ads_source in ('sample', 'apify'));

create function public.set_ads_source(p_source text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := private.require_team_member();
begin
  if p_source is null or p_source not in ('sample', 'apify') then
    raise exception 'The tracker reads sample ads or Apify''s';
  end if;
  update public.team_settings set ads_source = p_source, updated_at = now(), updated_by = v_user where id = 1;
end
$$;

-- As before, and the tracker is told where to read the ads from.
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
    ),
    'ads_source', case when p_stage = 'tracker' then
      coalesce((select s.ads_source from public.team_settings s where s.id = 1), 'sample') end,
    'results', case when p_stage = 'strategist' then (
      select coalesce(jsonb_agg(to_jsonb(r) order by r.posted_at desc), '[]'::jsonb)
        from (
          select v.angle, v.creative_text,
                 v.copy #>> array[case t.place when 'linkedin' then 'linkedin' else 'meta' end, 'headline'] as headline,
                 t.place, t.posted_at, t.reach, t.views, t.reactions, t.comments, t.shares, t.clicks
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

revoke execute on function public.set_ads_source(text) from public, anon;
grant execute on function public.set_ads_source(text) to authenticated, service_role;
