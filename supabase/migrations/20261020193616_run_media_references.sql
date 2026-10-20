-- What a run's ads are made of, asked after Start run, and the team's
-- reference pictures for Higgsfield.
--
-- * runs.ai_media: 'design' (the words on the drawn design, no AI picture),
--   'pictures' (an AI picture for every ad) or 'video' (an AI video for every
--   ad). Null is a run nobody asked (a scheduled scan, or one from before):
--   the team's switch decides its pictures, as it always did.
-- * runs.ai_video: a video run's settings and Higgsfield's price for one
--   video, asked by the server at Start run. References do not change the
--   price (measured 2026-10-20: GPT Image 2.5 0.25 credits and Seedance 2.0
--   Mini 4 s 480p 2 credits with none, one or two).
-- * run_references: up to four pictures from the bucket run-refs, each with
--   an optional note on what it shows. n8n imports each into Higgsfield once
--   (media_import_url, free) and keeps its media id; every picture and video
--   of the run then hands those ids to Higgsfield as image_references. GPT
--   Image 2.5 and Seedance 2.0 Mini both take them.
-- * A run with references has its pictures made by Higgsfield whatever the
--   team's image model is: the other models take no references.
-- * A video run asks Higgsfield for one video per ad as the ads are saved,
--   held to the month's one Higgsfield limit (rule 12 in CLAUDE.md).

-- ---------------------------------------------------------------- storage

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('run-refs', 'run-refs', false, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "Team members read reference pictures" on storage.objects
  for select to authenticated
  using (bucket_id = 'run-refs' and (select private.is_team_member()));

create policy "Team members upload reference pictures into their own folder" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'run-refs'
    and (storage.foldername(name))[1] = 'refs'
    and (storage.foldername(name))[2] = (select auth.uid())::text
    and (select private.is_team_member())
  );

-- ---------------------------------------------------------------- tables

alter table public.runs
  add column ai_media text check (ai_media in ('design', 'pictures', 'video')),
  add column ai_video jsonb check (ai_video is null or jsonb_typeof(ai_video) = 'object');

create table public.run_references (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.runs (id) on delete cascade,
  position smallint not null check (position between 0 and 3),
  path text not null check (path ~ '^refs/[0-9a-f-]{36}/[0-9a-f-]{36}\.(png|jpg|webp)$'),
  note text check (char_length(note) <= 120),
  -- waiting: not yet imported; ready: Higgsfield has it (media_id); failed:
  -- Higgsfield could not take it, and the run goes on without it.
  status text not null default 'waiting' check (status in ('waiting', 'ready', 'failed')),
  media_id text check (char_length(media_id) <= 200),
  error text check (char_length(error) <= 500),
  claimed_at timestamptz,
  tries smallint not null default 0,
  created_at timestamptz not null default now(),
  unique (run_id, position)
);
create index run_references_waiting on public.run_references (created_at) where status = 'waiting';

alter table public.run_references enable row level security;
create policy "Team members read reference pictures of runs" on public.run_references
  for select to authenticated using ((select private.is_team_member()));
revoke all on public.run_references from anon, authenticated, public;
grant select on public.run_references to authenticated;

-- What the Content Agent writes for a video run: the scene and how the camera moves.
alter table public.ad_variants
  add column video_prompt text check (char_length(video_prompt) <= 1200);

-- A video asked for one ad of a video run.
alter table public.ai_videos
  add column variant_id uuid references public.ad_variants (id) on delete set null;
create index ai_videos_variant on public.ai_videos (variant_id) where variant_id is not null;

-- ---------------------------------------------------------------- the question after Start run

-- What the run's ads are made of, its reference pictures and, for video, the
-- settings and Higgsfield's price for one video. Set as the run starts (as
-- its direction is): only while no agent has started.
create function public.set_run_media(p_run_id uuid, p_kind text, p_references jsonb default '[]'::jsonb, p_video jsonb default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_settings public.team_settings;
  v_refs jsonb := coalesce(p_references, '[]'::jsonb);
  v_ref jsonb;
  v_path text;
  v_note text;
  v_count integer;
  v_video jsonb;
  v_seconds integer;
  v_credits numeric;
  v_spent numeric;
  v_position integer := 0;
begin
  perform private.require_team_member();
  if p_kind is null or p_kind not in ('design', 'pictures', 'video') then
    raise exception 'Say whether the ads use the design, AI pictures or AI video';
  end if;
  if not exists (select 1 from public.runs where id = p_run_id) then
    raise exception 'Run % not found', p_run_id;
  end if;
  if exists (select 1 from public.run_stages where run_id = p_run_id and status not in ('queued', 'skipped')) then
    raise exception 'The agents have started on this run, so what its ads are made of is set';
  end if;
  if exists (select 1 from public.run_references where run_id = p_run_id) then
    raise exception 'This run''s reference pictures are set already';
  end if;

  if jsonb_typeof(v_refs) <> 'array' then
    raise exception 'The reference pictures could not be read';
  end if;
  v_count := jsonb_array_length(v_refs);
  if v_count > 4 then
    raise exception 'Add up to four reference pictures';
  end if;
  if v_count > 0 and p_kind = 'design' then
    raise exception 'Reference pictures are for AI pictures or AI video: the design uses none';
  end if;

  select * into v_settings from public.team_settings where id = 1 for update;
  if p_kind = 'video' then
    if not coalesce(v_settings.videos_live, false) then
      raise exception 'AI video is off: switch it on in Settings, AI video, first';
    end if;
    if p_video is null or jsonb_typeof(p_video) <> 'object' then
      raise exception 'Say how long and how sharp the videos are';
    end if;
    v_seconds := (p_video ->> 'seconds')::integer;
    if v_seconds is null or v_seconds not between 4 and 15 then
      raise exception 'A video is 4 to 15 seconds long';
    end if;
    if coalesce(p_video ->> 'quality', '') not in ('480p', '720p') then
      raise exception 'A video is 480p or 720p';
    end if;
    if coalesce(p_video ->> 'aspect', '') not in ('9:16', '1:1', '16:9') then
      raise exception 'A video is 9:16, 1:1 or 16:9';
    end if;
    v_credits := (p_video ->> 'credits')::numeric;
    if v_credits is null or v_credits <= 0 or v_credits > 10000 then
      raise exception 'Higgsfield''s price for these videos is needed first';
    end if;
    v_spent := private.videos_spent();
    if v_spent + 3 * v_credits > v_settings.videos_cap then
      raise exception 'Three videos would take this month''s Higgsfield spending past its limit of % credits (% used). It can be raised in Settings.',
        v_settings.videos_cap, trim_scale(v_spent);
    end if;
    v_video := jsonb_build_object('model', 'seedance_2_0_mini', 'seconds', v_seconds, 'quality', p_video ->> 'quality',
                                  'aspect', p_video ->> 'aspect', 'credits', v_credits);
  elsif p_video is not null then
    raise exception 'Only a video run has video settings';
  end if;

  for v_ref in select r from jsonb_array_elements(v_refs) as t(r) loop
    v_path := v_ref ->> 'path';
    v_note := nullif(btrim(regexp_replace(coalesce(v_ref ->> 'note', ''), '[\u0001-\u001f\u007f]', ' ', 'g')), '');
    if v_path is null or v_path !~ '^refs/[0-9a-f-]{36}/[0-9a-f-]{36}\.(png|jpg|webp)$' then
      raise exception 'A reference picture could not be read';
    end if;
    if not exists (select 1 from storage.objects o where o.bucket_id = 'run-refs' and o.name = v_path) then
      raise exception 'A reference picture has not finished uploading';
    end if;
    if char_length(coalesce(v_note, '')) > 120 then
      raise exception 'Keep what a reference shows under 120 characters';
    end if;
    if exists (select 1 from public.run_references where run_id = p_run_id and path = v_path) then
      raise exception 'The same reference picture is there twice';
    end if;
    insert into public.run_references (run_id, position, path, note) values (p_run_id, v_position, v_path, v_note);
    v_position := v_position + 1;
  end loop;

  update public.runs set ai_media = p_kind, ai_video = v_video where id = p_run_id;
  insert into public.run_events (run_id, text) values (
    p_run_id,
    case p_kind
      when 'design' then 'The ads use the drawn design: no AI pictures'
      when 'pictures' then 'Every ad gets an AI picture'
      else format('Every ad gets an AI video (%s s, %s, %s; %s credits each)', v_seconds, v_video ->> 'quality', v_video ->> 'aspect', trim_scale(v_credits))
    end
    || case when v_count = 1 then ', with one reference picture for Higgsfield'
            when v_count > 1 then format(', with %s reference pictures for Higgsfield', v_count)
            else '' end
  );
end
$$;

-- ---------------------------------------------------------------- pictures and videos for new ads

-- As before, and a run that was asked decides for its own ads: AI pictures
-- ask for one, the design and video ask for none. A run nobody asked (a
-- scheduled scan, or one from before) follows the team's switch.
create or replace function private.ask_picture_for_new_ad()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_media text;
  v_ask boolean;
begin
  select r.ai_media into v_media
    from public.ad_sets s join public.runs r on r.id = s.run_id
   where s.id = new.ad_set_id;
  if v_media is null then
    v_ask := coalesce((select s.pictures_auto from public.team_settings s where s.id = 1), false);
  else
    v_ask := v_media = 'pictures';
  end if;
  if coalesce(btrim(new.image_prompt), '') <> '' and v_ask then
    new.picture_status := 'making';
    new.picture_requested_at := now();
  end if;
  return new;
end
$$;

-- A video run asks Higgsfield for one video per ad as the ad is saved, at the
-- settings and price the team saw at Start run, held to the month's limit.
-- It runs as its owner: n8n saves the ads as the service role, which has no
-- use of the private schema the month's spending is counted in.
create function private.ask_video_for_new_ad()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run public.runs;
  v_settings public.team_settings;
  v_prompt text;
  v_credits numeric;
  v_spent numeric;
begin
  select r.* into v_run
    from public.ad_sets s join public.runs r on r.id = s.run_id
   where s.id = new.ad_set_id;
  if v_run.ai_media is distinct from 'video' or v_run.ai_video is null then
    return new;
  end if;
  select * into v_settings from public.team_settings where id = 1 for update;
  v_prompt := left(btrim(coalesce(nullif(btrim(new.video_prompt), ''), nullif(btrim(new.image_prompt), ''),
                                  'A calm, wide establishing shot in QGR indigo and gold. ' || coalesce(new.creative_text, ''))), 2000);
  if char_length(v_prompt) < 20 then
    v_prompt := v_prompt || ' A slow, steady camera.';
  end if;
  v_credits := (v_run.ai_video ->> 'credits')::numeric;
  v_spent := private.videos_spent();

  insert into public.ai_videos (prompt, model, seconds, aspect, quality, sound, credits, asked_by, variant_id,
                                status, error, finished_at)
  values (
    v_prompt, 'seedance_2_0_mini', (v_run.ai_video ->> 'seconds')::smallint, v_run.ai_video ->> 'aspect',
    v_run.ai_video ->> 'quality', false,
    case when v_spent + v_credits > v_settings.videos_cap then 0 else v_credits end,
    v_run.created_by, new.id,
    case when v_spent + v_credits > v_settings.videos_cap then 'failed' else 'asked' end,
    case when v_spent + v_credits > v_settings.videos_cap
         then format('Not asked: it would take this month''s Higgsfield spending past its limit of %s credits. Raise it in Settings, then ask from the AI video page.', v_settings.videos_cap) end,
    case when v_spent + v_credits > v_settings.videos_cap then now() end
  );
  insert into public.run_events (run_id, text) values (
    v_run.id,
    case when v_spent + v_credits > v_settings.videos_cap
         then 'The video for variant ' || new.label || ' was not asked for: the month''s Higgsfield limit would be passed'
         else 'Asked Higgsfield for variant ' || new.label || '''s video' end
  );
  return new;
end
$$;

create trigger ad_variants_ask_video
  after insert on public.ad_variants
  for each row execute function private.ask_video_for_new_ad();

-- As before, keeping each variant's video_prompt.
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
    if char_length(coalesce(v_variant ->> 'video_prompt', '')) > 1200 then
      raise exception 'Variant % has a video prompt past 1,200 characters', v_variant ->> 'label';
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
    (ad_set_id, label, angle, creative_text, creative_style, image_prompt, image_url, copy, posts, warnings, video_prompt)
  select v_ad_set, v ->> 'label', v ->> 'angle', v ->> 'creative_text', v ->> 'creative_style',
         v ->> 'image_prompt', v ->> 'image_url', v -> 'copy',
         coalesce((select jsonb_object_agg(e.key, btrim(e.value #>> '{}')) from jsonb_each(v -> 'posts') as e), '{}'::jsonb),
         array(select jsonb_array_elements_text(coalesce(v -> 'warnings', '[]'::jsonb))),
         nullif(btrim(v ->> 'video_prompt'), '')
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

-- ---------------------------------------------------------------- importing the references (n8n)

-- The reference pictures Higgsfield does not have yet, claimed so two runs of
-- n8n never take the same one; a claim lost for ten minutes is taken again,
-- three tries at most.
create function public.reference_take_due(p_limit integer default 8)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_out jsonb;
begin
  with gave_up as (
    update public.run_references
       set status = 'failed', claimed_at = null,
           error = 'Higgsfield could not take this reference picture after three tries.'
     where status = 'waiting' and tries >= 3 and claimed_at < now() - interval '10 minutes'
    returning run_id, position
  )
  insert into public.run_events (run_id, text)
  select run_id, format('Reference picture %s could not be given to Higgsfield after three tries: the run goes on without it', position + 1)
    from gave_up;

  with due as (
    select r.id
      from public.run_references r
     where r.status = 'waiting' and r.tries < 3
       and (r.claimed_at is null or r.claimed_at < now() - interval '10 minutes')
     order by r.created_at, r.position
     limit greatest(p_limit, 0)
       for update skip locked
  ), claimed as (
    update public.run_references r
       set claimed_at = now(), tries = r.tries + 1
      from due
     where r.id = due.id
    returning r.id, r.run_id, r.position, r.path
  )
  select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'run_id', c.run_id, 'position', c.position, 'path', c.path)
                            order by c.run_id, c.position), '[]'::jsonb)
    into v_out
    from claimed c;
  return v_out;
end
$$;

-- Higgsfield has the picture: its media id goes with every picture and video of the run.
create function public.reference_ready(p_id uuid, p_media_id text)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if coalesce(btrim(p_media_id), '') = '' or char_length(p_media_id) > 200 then
    raise exception 'A media id is needed';
  end if;
  update public.run_references
     set status = 'ready', media_id = btrim(p_media_id), error = null, claimed_at = null
   where id = p_id and status = 'waiting';
end
$$;

-- Higgsfield refused the picture: the run goes on without it, and says so.
create function public.reference_failed(p_id uuid, p_error text)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_ref public.run_references;
  v_error text := left(coalesce(nullif(btrim(p_error), ''), 'Higgsfield could not take it'), 500);
begin
  update public.run_references
     set status = 'failed', error = v_error, claimed_at = null
   where id = p_id and status = 'waiting'
  returning * into v_ref;
  if found then
    insert into public.run_events (run_id, text)
    values (v_ref.run_id, format('Reference picture %s could not be given to Higgsfield (%s): the run goes on without it', v_ref.position + 1, v_error));
  end if;
end
$$;

-- Higgsfield or Storage could not be reached: taken again at the next run of n8n.
create function public.reference_release(p_id uuid, p_error text)
returns void
language plpgsql
set search_path = ''
as $$
begin
  update public.run_references
     set claimed_at = null, error = left(nullif(btrim(p_error), ''), 500)
   where id = p_id and status = 'waiting';
end
$$;

-- ---------------------------------------------------------------- pictures and videos with the references

-- As before, with the run's references: an ad whose run has references still
-- being given to Higgsfield waits for them, and one whose run has them is
-- drawn by Higgsfield with them, whatever the team's image model.
create or replace function public.picture_take_due(p_limit integer default 5)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_out jsonb;
begin
  update public.ad_variants v
     set picture_status = 'failed', picture_claimed_at = null,
         picture_error = 'The picture could not be made after three tries.'
   where v.picture_status = 'making' and v.picture_attempts >= 3
     and v.picture_claimed_at < now() - interval '10 minutes'
     and not public.picture_in_flight(v.id);

  with due as (
    select v.id
      from public.ad_variants v
     where v.picture_status = 'making'
       and (v.picture_claimed_at is null or v.picture_claimed_at < now() - interval '10 minutes')
       and not public.picture_in_flight(v.id)
       and not exists (
         select 1 from public.ad_sets s join public.run_references r on r.run_id = s.run_id
          where s.id = v.ad_set_id and r.status = 'waiting')
     order by v.picture_requested_at nulls first
     limit greatest(p_limit, 0)
       for update skip locked
  ), claimed as (
    update public.ad_variants v
       set picture_claimed_at = now(), picture_attempts = v.picture_attempts + 1
      from due
     where v.id = due.id
    returning v.id, v.label, v.image_prompt, v.creative_style, v.ad_set_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'variant_id', c.id,
           'label', c.label,
           'prompt', c.image_prompt,
           'style', c.creative_style,
           'look', (select b.picture_style from public.brand_profile b where b.id = 1),
           'model', case when refs.ids is not null then 'higgsfield' else coalesce(s.pictures_model, 'stand-in') end,
           'account', s.cloudflare_account,
           'quality', coalesce(s.pictures_quality, 'low'),
           'path', 'pictures/' || c.id::text || '/' || gen_random_uuid()::text || '.png',
           'references', coalesce(refs.ids, '[]'::jsonb)
         )), '[]'::jsonb)
    into v_out
    from claimed c
    left join lateral (
      select jsonb_agg(r.media_id order by r.position) as ids
        from public.ad_sets a join public.run_references r on r.run_id = a.run_id
       where a.id = c.ad_set_id and r.status = 'ready'
    ) refs on true
    left join public.team_settings s on s.id = 1;
  return v_out;
end
$$;

-- As before, with the run's references for a video asked for one of its ads:
-- one whose run has references still being given to Higgsfield waits.
create or replace function public.video_take_due(p_limit integer default 3)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_out jsonb;
begin
  update public.ai_videos
     set status = 'unknown', finished_at = now(),
         error = 'n8n stopped while sending it. Check Higgsfield''s history before asking again.'
   where status = 'asked' and claimed_at < now() - interval '10 minutes';

  with due as (
    select v.id
      from public.ai_videos v
     where v.status = 'asked' and v.claimed_at is null
       and not exists (
         select 1 from public.ad_variants av
           join public.ad_sets s on s.id = av.ad_set_id
           join public.run_references r on r.run_id = s.run_id
          where av.id = v.variant_id and r.status = 'waiting')
     order by v.asked_at
     limit greatest(p_limit, 0)
       for update skip locked
  ), claimed as (
    update public.ai_videos v
       set claimed_at = now(), tries = v.tries + 1
      from due
     where v.id = due.id
    returning v.*
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', c.id,
           'prompt', c.prompt,
           'model', c.model,
           'seconds', c.seconds,
           'aspect', c.aspect,
           'quality', c.quality,
           'sound', c.sound,
           'picture_path', c.picture_path,
           'look', (select nullif(btrim(b.picture_style), '') from public.brand_profile b where b.id = 1),
           'live', coalesce(s.videos_live, false),
           'path', 'videos/' || c.id::text || '.mp4',
           'references', coalesce((
             select jsonb_agg(r.media_id order by r.position)
               from public.ad_variants av
               join public.ad_sets a on a.id = av.ad_set_id
               join public.run_references r on r.run_id = a.run_id
              where av.id = c.variant_id and r.status = 'ready'), '[]'::jsonb)
         ) order by c.asked_at), '[]'::jsonb)
    into v_out
    from claimed c
    left join public.team_settings s on s.id = 1;
  return v_out;
end
$$;

-- ---------------------------------------------------------------- what the Content Agent reads

-- As before, and the Content Agent gets the run's reference pictures (their
-- numbers and the team's notes), when it has some.
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

-- ---------------------------------------------------------------- grants

revoke all on function public.set_run_media(uuid, text, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.set_run_media(uuid, text, jsonb, jsonb) to authenticated;

revoke all on function private.ask_video_for_new_ad() from public, anon, authenticated;

revoke all on function public.reference_take_due(integer) from public, anon, authenticated;
revoke all on function public.reference_ready(uuid, text) from public, anon, authenticated;
revoke all on function public.reference_failed(uuid, text) from public, anon, authenticated;
revoke all on function public.reference_release(uuid, text) from public, anon, authenticated;
grant execute on function public.reference_take_due(integer) to service_role;
grant execute on function public.reference_ready(uuid, text) to service_role;
grant execute on function public.reference_failed(uuid, text) to service_role;
grant execute on function public.reference_release(uuid, text) to service_role;
