-- Brand memory and posts written in full, part 3: what the agents are given and
-- what goes out. Replaced with the same arguments, so their grants stay.

-- As before, and every stage now gets the brand memory: the brand (with its
-- topics, format notes and picture style, which to_jsonb carries) and the
-- posts that work. The strategist and the Content Agent get how recent posts
-- did, with each post's words, so the Content Agent can follow what engaged.
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
        from (select * from public.brand_examples order by created_at desc limit 12) e
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

-- As before, and a variant may come with its posts: one per place the run
-- posts to, each in full. They are optional here so a Content Agent from
-- before them still saves; its read step asks for every place.
create or replace function public.agent_finish_content(p_run_id uuid, p_ad_set jsonb, p_usage jsonb default null)
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
    if v_variant ? 'posts' then
      if jsonb_typeof(v_variant -> 'posts') <> 'object' then
        raise exception 'Variant % has posts that cannot be read', v_variant ->> 'label';
      end if;
      if exists (
        select 1 from jsonb_each(v_variant -> 'posts') as e
         where e.key not in ('facebook', 'instagram', 'linkedin')
            or not ((case e.key when 'linkedin' then 'linkedin' else 'meta' end) = any (v_run.platforms))
            or jsonb_typeof(e.value) <> 'string'
            or length(btrim(e.value #>> '{}')) not between 1 and 3000
      ) then
        raise exception 'Variant % has a post that is empty, too long or for a place this run does not post to', v_variant ->> 'label';
      end if;
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
    (ad_set_id, label, angle, creative_text, creative_style, image_prompt, image_url, copy, posts, warnings)
  select v_ad_set, v ->> 'label', v ->> 'angle', v ->> 'creative_text', v ->> 'creative_style',
         v ->> 'image_prompt', v ->> 'image_url', v -> 'copy',
         coalesce((select jsonb_object_agg(e.key, btrim(e.value #>> '{}')) from jsonb_each(v -> 'posts') as e), '{}'::jsonb),
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

-- As before, and each place goes out with the variant's post for it, in full,
-- when it has one; otherwise with its ad copy, as before.
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
    v_text := coalesce(nullif(btrim(v_variant.posts ->> v_place), ''), btrim(v_variant.copy #>> array[v_platform, 'text']));
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
