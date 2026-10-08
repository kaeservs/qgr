-- Pages, clips and video edits.
--
-- * runs.page: what the app read from a pasted link (its title and words, or
--   why it could not be read), stored when the run starts. The agents read it
--   from here and never fetch a link themselves (lib/page/read.ts).
-- * runs.media_path, runs.media: the clip a custom video run starts from. It is
--   cut in the browser and uploaded to Storage (bucket run-media) before the
--   run starts. What is said in it goes in runs.excerpt: there is no transcript.
-- * ad_variants.video_edit: one variant's edit of that clip: the parts kept,
--   the frame, the words and captions on it, the sound. Instructions, not a
--   file: the video is rendered from them in the browser when it is exported.

-- ---------------------------------------------------------------- columns

alter table public.runs
  add column page jsonb,
  add column media_path text,
  add column media jsonb;

alter table public.runs
  add constraint runs_page_shape check (page is null or (jsonb_typeof(page) = 'object' and pg_column_size(page) < 65536)),
  add constraint runs_media_shape check (
    (media_path is null) = (media is null)
    and (media_path is null or coalesce(
      media_path ~ '^uploads/[0-9a-f-]{36}/[0-9a-f-]{36}\.(mp4|webm|mov)$'
      and jsonb_typeof(media) = 'object'
      and jsonb_typeof(media -> 'duration') = 'number'
      and (media ->> 'duration')::numeric > 0
      and (media ->> 'duration')::numeric <= 600,
      false
    ))
  ),
  add constraint runs_media_is_a_video check (media_path is null or input = 'video');

alter table public.runs drop constraint runs_source_present;
alter table public.runs add constraint runs_source_present check (
  case input
    when 'upload' then coalesce(competitor_name is not null and cardinality(files) between 1 and 10, false)
    when 'text' then coalesce(length(excerpt) between 50 and 20000, false)
    -- A video is a link, or an uploaded clip with notes on what is said in it.
    when 'video' then coalesce(url ~ '^https?://', false)
      or coalesce(media_path is not null and length(btrim(excerpt)) between 20 and 20000, false)
    else coalesce(url ~ '^https?://', false)
  end
);

alter table public.ad_variants
  add column video_edit jsonb
    constraint ad_variants_video_edit_shape check (video_edit is null or (jsonb_typeof(video_edit) = 'object' and pg_column_size(video_edit) < 32768));

-- ---------------------------------------------------------------- starting a run

drop function public.create_run(text, text, text, text[], text, text, text, text[], text);
drop function public.start_run(text, text, text, text[], text, text, text, text[], text);

-- Records a run and its three stages. A custom run has no competitor to track,
-- so its tracker is skipped from the start.
create function public.start_run(
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
set search_path = ''
as $$
declare
  v_id uuid;
  v_host text;
  v_seconds integer;
begin
  insert into public.runs (title, kind, input, url, competitor_name, files, excerpt, platforms, goal, page, media_path, media)
  values (p_title, p_kind, p_input, p_url, p_competitor_name, p_files, p_excerpt, p_platforms, p_goal, p_page, p_media_path, p_media)
  returning id into v_id;

  insert into public.run_stages (run_id, stage, status) values
    (v_id, 'tracker', case when p_kind = 'custom' then 'skipped' else 'queued' end),
    (v_id, 'strategist', 'queued'),
    (v_id, 'content', 'queued');

  insert into public.run_events (run_id, text) values (v_id, 'Run started');
  if p_kind = 'custom' then
    insert into public.run_events (run_id, text)
    values (v_id, 'Competitor Tracker skipped: custom runs start at the strategy');
  end if;

  if p_page is not null then
    v_host := coalesce(substring(p_page ->> 'url' from '^https?://(?:www\.)?([^/:?#]+)'), 'the page');
    insert into public.run_events (run_id, text) values (
      v_id,
      case when (p_page ->> 'ok')::boolean
        then format('Read %s: %s words', coalesce(nullif(btrim(p_page ->> 'title'), ''), v_host), coalesce(p_page ->> 'words', '0'))
        else format('Could not read %s: %s', v_host, coalesce(p_page ->> 'error', 'no reason given'))
      end
    );
  end if;

  if p_media_path is not null then
    v_seconds := round((p_media ->> 'duration')::numeric);
    insert into public.run_events (run_id, text)
    values (v_id, format('Clip uploaded: %s:%s', v_seconds / 60, lpad((v_seconds % 60)::text, 2, '0')));
  end if;
  return v_id;
end
$$;

-- Starts a run for the signed-in teammate. An uploaded clip must have finished
-- uploading; it may be a teammate's, so anyone on the team can retry a run.
-- The app's server then hands the run's id to n8n; if n8n cannot be reached it
-- calls report_start_failure.
create function public.create_run(
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
begin
  if cardinality(p_platforms) <> (select count(distinct p) from unnest(p_platforms) as p) then
    raise exception 'A platform is listed twice';
  end if;
  if p_media_path is not null and not exists (select 1 from storage.objects where bucket_id = 'run-media' and name = p_media_path) then
    raise exception 'The clip has not finished uploading';
  end if;
  v_id := public.start_run(p_kind, p_input, p_title, p_platforms, p_goal, p_url, p_competitor_name, p_files, p_excerpt, p_page, p_media_path, p_media);
  update public.runs set created_by = v_user where id = v_id;
  return v_id;
end
$$;

-- ---------------------------------------------------------------- editing a clip

-- Saves one variant's edit of its run's clip, or clears it (null) back to the
-- whole clip. The app checks the edit in full (lib/video/edit.ts); this checks
-- what the database must hold true: the kept parts are inside the clip.
create function public.save_video_edit(p_variant_id uuid, p_edit jsonb)
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

  update public.ad_variants
     set video_edit = p_edit, updated_at = now(), updated_by = v_user
   where id = p_variant_id;
  insert into public.run_events (run_id, text)
  values (v_run.id, 'Variant ' || v_variant.label || case when p_edit is null then ' video reset' else ' video edited' end);
end
$$;

-- ---------------------------------------------------------------- storage

-- Private: teammates read through links the app's server signs for them.
-- 50 MB is the Free plan's ceiling; the browser cuts and compresses a clip to
-- fit under it before uploading.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('run-media', 'run-media', false, 52428800, array['video/mp4', 'video/webm', 'video/quicktime'])
on conflict (id) do nothing;

create policy "Team members read run media" on storage.objects
  for select to authenticated
  using (bucket_id = 'run-media' and (select private.is_team_member()));

-- Uploads go through a signed upload link the server creates as the teammate,
-- into their own folder only. No update: a clip is never replaced.
create policy "Team members upload clips into their own folder" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'run-media'
    and (storage.foldername(name))[1] = 'uploads'
    and (storage.foldername(name))[2] = (select auth.uid())::text
    and (select private.is_team_member())
  );

-- A clip cut again, or taken away before its run started, is removed by the
-- person who uploaded it, so Free's storage is not filled with clips nothing
-- uses. A clip a run uses stays.
create policy "Team members remove their own unused clips" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'run-media'
    and (storage.foldername(name))[1] = 'uploads'
    and (storage.foldername(name))[2] = (select auth.uid())::text
    and (select private.is_team_member())
    and not exists (select 1 from public.runs r where r.media_path = objects.name)
  );

-- ---------------------------------------------------------------- access

revoke execute on function
  public.start_run(text, text, text, text[], text, text, text, text[], text, jsonb, text, jsonb)
from public, anon, authenticated;
grant execute on function
  public.start_run(text, text, text, text[], text, text, text, text[], text, jsonb, text, jsonb)
to service_role;

revoke execute on function
  public.create_run(text, text, text, text[], text, text, text, text[], text, jsonb, text, jsonb),
  public.save_video_edit(uuid, jsonb)
from public, anon;
grant execute on function
  public.create_run(text, text, text, text[], text, text, text, text[], text, jsonb, text, jsonb),
  public.save_video_edit(uuid, jsonb)
to authenticated, service_role;
