-- AI videos inside a video edit, and a long video edited whole.
--
-- An edit can now name an AI video from the library (its path is 'ai:<id>'),
-- as a piece of the sequence (inserted: what follows plays later) or as a
-- cutaway (over the video for a stretch while its sound goes on). The video
-- may still be being made when the edit is saved: the editor shows it as
-- waiting and nothing is exported or started from the edit until it is ready.
-- It is linked, never copied, so one file serves the library and every edit,
-- and the library cannot take away a video an edit uses.
--
-- A long video can be edited whole (cut down, AI videos put in) on the team's
-- computer; the file is still never uploaded, only the edit is kept here, so
-- the work survives a reload while its AI videos are made.
--
-- "Write it from what's said here" asks Claude (n8n, "QGR · AI video") for an
-- AI video's prompt from the transcript around the playhead; what it spent is
-- kept in video_prompt_usage, on failure too.

-- ---------------------------------------------------------------- one check for every edit

-- An edit as the app sends it: its parts inside the clip, within the counts,
-- and every file it names either uploaded to edit-media or an AI video still
-- in the library and not failed. save_video_edit and save_long_video_edit
-- both hold an edit to it.
create function private.check_video_edit(p_edit jsonb, p_duration numeric)
returns void
language plpgsql
stable
set search_path = ''
as $$
declare
  v_part jsonb;
  v_path text;
begin
  if jsonb_typeof(p_edit) <> 'object' or pg_column_size(p_edit) >= 65536 then
    raise exception 'The edit is not readable';
  end if;
  if jsonb_typeof(p_edit -> 'keep') is distinct from 'array' or jsonb_array_length(p_edit -> 'keep') not between 1 and 50 then
    raise exception 'Keep at least one part of the clip';
  end if;
  for v_part in select value from jsonb_array_elements(p_edit -> 'keep') loop
    if jsonb_typeof(v_part -> 'start') is distinct from 'number' or jsonb_typeof(v_part -> 'end') is distinct from 'number'
       or (v_part ->> 'start')::numeric < 0
       or (v_part ->> 'end')::numeric > p_duration + 0.5
       or (v_part ->> 'end')::numeric - (v_part ->> 'start')::numeric < 0.1 then
      raise exception 'A kept part is outside the clip';
    end if;
  end loop;
  if p_edit ? 'captions' and (jsonb_typeof(p_edit -> 'captions') <> 'array' or jsonb_array_length(p_edit -> 'captions') > 100) then
    raise exception 'Up to 100 captions';
  end if;
  if p_edit ? 'sequence' and (jsonb_typeof(p_edit -> 'sequence') <> 'array' or jsonb_array_length(p_edit -> 'sequence') not between 1 and 40) then
    raise exception 'Up to 40 pieces in a video';
  end if;
  if p_edit ? 'overlays' and (jsonb_typeof(p_edit -> 'overlays') <> 'array' or jsonb_array_length(p_edit -> 'overlays') > 30) then
    raise exception 'Up to 30 texts on a video';
  end if;
  if p_edit ? 'cutaways' and (jsonb_typeof(p_edit -> 'cutaways') <> 'array' or jsonb_array_length(p_edit -> 'cutaways') > 20) then
    raise exception 'Up to 20 videos over the video';
  end if;

  -- Every file the edit names besides the clip itself.
  for v_path in
    select s -> 'media' ->> 'path'
      from jsonb_array_elements(case when jsonb_typeof(p_edit -> 'sequence') = 'array' then p_edit -> 'sequence' else '[]'::jsonb end) s
     where jsonb_typeof(s -> 'media') = 'object'
    union all
    select c -> 'media' ->> 'path'
      from jsonb_array_elements(case when jsonb_typeof(p_edit -> 'cutaways') = 'array' then p_edit -> 'cutaways' else '[]'::jsonb end) c
    union all
    select p_edit -> 'music' -> 'media' ->> 'path' where jsonb_typeof(p_edit -> 'music') = 'object'
  loop
    if v_path like 'ai:%' then
      if not exists (
        select 1 from public.ai_videos a
         where a.id::text = substr(v_path, 4) and a.removed_at is null and a.status in ('asked', 'making', 'ready')
      ) then
        raise exception 'An AI video in the edit was not made or is no longer in the library: take it out of the edit';
      end if;
    elsif v_path is null or not exists (select 1 from storage.objects where bucket_id = 'edit-media' and name = v_path) then
      raise exception 'A file in the edit was not uploaded';
    end if;
  end loop;
end
$$;
revoke all on function private.check_video_edit(jsonb, numeric) from public, anon, authenticated;

-- The same function as before, its checks now the shared ones (and with them
-- AI videos and cutaways).
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
begin
  select * into v_variant from public.ad_variants where id = p_variant_id for update;
  if not found then
    raise exception 'Variant % not found', p_variant_id;
  end if;
  select r.* into v_run
    from public.ad_sets s
    join public.runs r on r.id = s.run_id
   where s.id = v_variant.ad_set_id;
  if v_run.media_path is not null then
    v_duration := (v_run.media ->> 'duration')::numeric;
  else
    select a.seconds into v_duration
      from public.ai_videos a
     where a.variant_id = p_variant_id and a.status = 'ready'
     order by a.asked_at desc
     limit 1;
    if v_duration is null then
      raise exception 'This variant has no clip to edit';
    end if;
  end if;

  if p_edit is not null then
    perform private.check_video_edit(p_edit, v_duration);
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

-- ---------------------------------------------------------------- a long video edited whole

alter table public.long_videos
  add column edit jsonb,
  add column edited_at timestamptz;

-- The team's edit of the whole video, held to the video's own length; null
-- takes it back to the video as it is.
create function public.save_long_video_edit(p_id uuid, p_edit jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_video public.long_videos;
begin
  perform private.require_team_member();
  select * into v_video from public.long_videos where id = p_id and removed_at is null for update;
  if not found then
    raise exception 'That long video no longer exists';
  end if;
  if p_edit is not null then
    perform private.check_video_edit(p_edit, (v_video.file ->> 'duration')::numeric);
  end if;
  if v_video.edit is not distinct from p_edit then
    return;
  end if;
  update public.long_videos set edit = p_edit, edited_at = now() where id = p_id;
end
$$;
revoke all on function public.save_long_video_edit(uuid, jsonb) from public, anon;
grant execute on function public.save_long_video_edit(uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------- what an edit uses stays

-- Whether any saved edit (an ad's, a long video's, or one a run started with)
-- names this path.
create function private.edit_uses(p_path text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.ad_variants v where v.video_edit is not null and strpos(v.video_edit::text, '"' || p_path || '"') > 0)
      or exists (select 1 from public.long_videos l where l.edit is not null and strpos(l.edit::text, '"' || p_path || '"') > 0)
      or exists (select 1 from public.runs r where r.media ? 'edit' and strpos((r.media -> 'edit')::text, '"' || p_path || '"') > 0)
$$;
revoke all on function private.edit_uses(text) from public, anon;
grant execute on function private.edit_uses(text) to authenticated;

-- A file added to an edit and left out goes again; one any saved edit uses
-- stays (a long video's, and a run's, now too).
alter policy "Team members remove their own edit media no edit uses" on storage.objects
  using (
    bucket_id = 'edit-media'
    and (storage.foldername(name))[2] = (select auth.uid())::text
    and (select private.is_team_member())
    and not private.edit_uses(objects.name)
  );

-- The library keeps a video an edit uses.
create or replace function public.remove_ai_video(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_video public.ai_videos;
begin
  perform private.require_team_member();
  select * into v_video from public.ai_videos where id = p_id for update;
  if not found then
    raise exception 'That video no longer exists';
  end if;
  if v_video.status = 'making' or (v_video.status = 'asked' and v_video.claimed_at is not null) then
    raise exception 'It is being made: take it away once it is ready';
  end if;
  if private.edit_uses('ai:' || p_id::text) then
    raise exception 'A video edit uses it: take it out of the edit first';
  end if;
  update public.ai_videos
     set removed_at = coalesce(removed_at, now()),
         status = case when status = 'asked' then 'failed' else status end,
         error = case when status = 'asked' then 'Stopped before it was sent to Higgsfield.' else error end
   where id = p_id;
end
$$;

-- ---------------------------------------------------------------- what the prompt writer spent

create table public.video_prompt_usage (
  id bigint generated always as identity primary key,
  -- The long video whose transcript it read, when it was one.
  long_video_id uuid references public.long_videos (id) on delete set null,
  model text not null,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  cache_creation_input_tokens integer not null default 0,
  cache_read_input_tokens integer not null default 0,
  created_at timestamptz not null default now()
);
alter table public.video_prompt_usage enable row level security;
revoke all on public.video_prompt_usage from public, anon, authenticated;
grant select on public.video_prompt_usage to authenticated;
create policy "Team members read what the prompt writer cost" on public.video_prompt_usage
  for select to authenticated using ((select private.is_team_member()));

-- n8n records each call, answered or not.
create function public.video_prompt_used(p_long_video_id uuid, p_model text, p_usage jsonb)
returns void
language plpgsql
set search_path = ''
as $$
begin
  insert into public.video_prompt_usage (long_video_id, model, input_tokens, output_tokens, cache_creation_input_tokens, cache_read_input_tokens)
  values (
    (select id from public.long_videos where id = p_long_video_id),
    coalesce(nullif(btrim(p_model), ''), 'unknown'),
    coalesce((p_usage ->> 'input_tokens')::integer, 0),
    coalesce((p_usage ->> 'output_tokens')::integer, 0),
    coalesce((p_usage ->> 'cache_creation_input_tokens')::integer, 0),
    coalesce((p_usage ->> 'cache_read_input_tokens')::integer, 0)
  );
end
$$;
revoke all on function public.video_prompt_used(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.video_prompt_used(uuid, text, jsonb) to service_role;
