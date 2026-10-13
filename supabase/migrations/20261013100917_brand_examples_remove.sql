-- Brand memory, part 4: taking a post out of it. It is kept out of the page
-- and the agents' material from then on (removed_at), never erased here, and a
-- post marked "This worked" again comes back with its note.

alter table public.brand_examples add column removed_at timestamptz;

create function public.remove_brand_example(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_team_member();
  update public.brand_examples set removed_at = now() where id = p_id and removed_at is null;
  if not found then
    raise exception 'That post is not in brand memory';
  end if;
end
$$;

revoke execute on function public.remove_brand_example(uuid) from public, anon;
grant execute on function public.remove_brand_example(uuid) to authenticated, service_role;

-- As before, counting only the posts still in brand memory.
create or replace function public.add_brand_example(p_place text, p_text text, p_note text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := private.require_team_member();
  v_id uuid;
begin
  if p_place is null or p_place not in ('facebook', 'instagram', 'linkedin', 'x') then
    raise exception 'A post that works is from Facebook, Instagram, LinkedIn or X';
  end if;
  if coalesce(length(btrim(p_text)), 0) not between 1 and 3000 then
    raise exception 'Paste the post, up to 3,000 characters';
  end if;
  if length(btrim(p_note)) > 300 then
    raise exception 'Keep the note under 300 characters';
  end if;
  if (select count(*) from public.brand_examples where removed_at is null) >= 60 then
    raise exception 'Brand memory keeps up to 60 posts. Remove one first';
  end if;
  insert into public.brand_examples (place, text, note, source, created_by)
  values (p_place, btrim(p_text), nullif(btrim(coalesce(p_note, '')), ''), 'pasted', v_user)
  returning id into v_id;
  return v_id;
end
$$;

-- As before; a post taken out of brand memory and marked again comes back.
create or replace function public.remember_post(p_post_id uuid, p_place text, p_note text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := private.require_team_member();
  v_text text;
  v_id uuid;
  v_removed timestamptz;
begin
  select t.text into v_text
    from public.post_targets t
   where t.post_id = p_post_id and t.place = p_place and t.status = 'posted';
  if v_text is null then
    raise exception 'Only a post that went out can be kept as one that works';
  end if;
  if length(btrim(p_note)) > 300 then
    raise exception 'Keep the note under 300 characters';
  end if;
  select id, removed_at into v_id, v_removed from public.brand_examples where post_id = p_post_id and place = p_place;
  if v_id is not null and v_removed is null then
    raise exception 'That post is already in brand memory';
  end if;
  if (select count(*) from public.brand_examples where removed_at is null) >= 60 then
    raise exception 'Brand memory keeps up to 60 posts. Remove one first';
  end if;
  if v_id is not null then
    update public.brand_examples
       set removed_at = null,
           note = coalesce(nullif(btrim(coalesce(p_note, '')), ''), note),
           created_by = v_user,
           created_at = now()
     where id = v_id;
    return v_id;
  end if;
  insert into public.brand_examples (place, text, note, source, post_id, created_by)
  values (p_place, v_text, nullif(btrim(coalesce(p_note, '')), ''), 'marked', p_post_id, v_user)
  returning id into v_id;
  return v_id;
end
$$;

-- As before, with only the posts still in brand memory.
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
