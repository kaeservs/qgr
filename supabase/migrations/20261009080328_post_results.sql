-- How posts did: each place's numbers as its platform reports them, read by
-- n8n's "QGR · Post results" every six hours for four weeks after it went
-- out. Only what really went out has results: a stand-in posted nothing. The
-- strategist reads them, so the next strategy leans on what worked.

alter table public.post_targets
  add column reach integer check (reach >= 0),
  add column views integer check (views >= 0),
  add column reactions integer check (reactions >= 0),
  add column comments integer check (comments >= 0),
  add column shares integer check (shares >= 0),
  add column clicks integer check (clicks >= 0),
  -- When the numbers were last read, or last tried.
  add column results_at timestamptz,
  -- Why the last read failed; the numbers before it are kept.
  add column results_error text check (length(results_error) <= 500);

-- Called by n8n: the places to read results for, the longest unread first.
create function public.results_take_due(p_limit integer default 50)
returns jsonb
language sql
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'post_id', t.post_id,
           'place', t.place,
           'remote_id', t.remote_id,
           'media_kind', t.media_kind,
           'posted_at', t.posted_at,
           'page', case t.place
             when 'facebook' then jsonb_build_object('id', s.facebook_page_id)
             when 'instagram' then jsonb_build_object('id', s.instagram_account_id)
             else jsonb_build_object('id', s.linkedin_org_id)
           end
         ) order by t.results_at nulls first, t.posted_at desc), '[]'::jsonb)
    from (
      select *
        from public.post_targets x
       where x.status = 'posted' and not x.stand_in and x.remote_id is not null
         and x.posted_at > now() - interval '28 days'
         and (x.results_at is null or x.results_at < now() - interval '6 hours')
       order by x.results_at nulls first, x.posted_at desc
       limit greatest(p_limit, 0)
    ) t
    cross join public.team_settings s
   where s.id = 1
$$;

-- The numbers a platform gave for one place: each a count, or null when the
-- platform does not report it for that kind of post.
create function public.results_record(p_post_id uuid, p_place text, p_results jsonb)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_key text;
  v_value jsonb;
begin
  if jsonb_typeof(p_results) is distinct from 'object' then
    raise exception 'Results are an object of counts';
  end if;
  for v_key, v_value in select key, value from jsonb_each(p_results) loop
    if v_key not in ('reach', 'views', 'reactions', 'comments', 'shares', 'clicks') then
      raise exception 'Unknown result %', v_key;
    end if;
    if jsonb_typeof(v_value) <> 'null' and (
      jsonb_typeof(v_value) <> 'number'
      or (v_value #>> '{}')::numeric < 0
      or (v_value #>> '{}')::numeric <> trunc((v_value #>> '{}')::numeric)
      or (v_value #>> '{}')::numeric > 2147483647
    ) then
      raise exception 'The % result is not a count', v_key;
    end if;
  end loop;

  update public.post_targets
     set reach = (p_results ->> 'reach')::integer,
         views = (p_results ->> 'views')::integer,
         reactions = (p_results ->> 'reactions')::integer,
         comments = (p_results ->> 'comments')::integer,
         shares = (p_results ->> 'shares')::integer,
         clicks = (p_results ->> 'clicks')::integer,
         results_at = now(), results_error = null, updated_at = now()
   where post_id = p_post_id and place = p_place and status = 'posted' and not stand_in;
  if not found then
    raise exception 'The % post has not gone out', public.place_name(p_place);
  end if;
end
$$;

-- The platform did not give the results. The last numbers stay; the reason
-- shows beside them, and the place is tried again in six hours.
create function public.results_fail(p_post_id uuid, p_place text, p_error text)
returns void
language plpgsql
set search_path = ''
as $$
begin
  update public.post_targets
     set results_error = left(coalesce(nullif(btrim(p_error), ''), 'The platform did not give the results'), 500),
         results_at = now(), updated_at = now()
   where post_id = p_post_id and place = p_place and status = 'posted' and not stand_in;
  if not found then
    raise exception 'The % post has not gone out', public.place_name(p_place);
  end if;
end
$$;

-- As before, and the strategist is given how the team's own recent posts did:
-- each place that went out for real and has results, newest first.
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

revoke execute on function
  public.results_take_due(integer),
  public.results_record(uuid, text, jsonb),
  public.results_fail(uuid, text, text)
from public, anon, authenticated;
grant execute on function
  public.results_take_due(integer),
  public.results_record(uuid, text, jsonb),
  public.results_fail(uuid, text, text)
to service_role;
