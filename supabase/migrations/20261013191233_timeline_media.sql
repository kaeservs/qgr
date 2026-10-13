-- The video editor's timeline: an edit can now hold several pieces (parts of
-- the run's clip, other videos, pictures, title cards), texts over the video
-- and music. It is still instructions on the variant (ad_variants.video_edit);
-- what it adds are the files it uses besides the run's clip, kept in the
-- private bucket edit-media at media/{uploader}/{uuid}.{ext}.
--
-- save_video_edit checks again what the app checks first (lib/video/edit.ts):
-- the kept parts of the run's clip (derived from the sequence, so an older
-- reader of the edit understands it), at most 40 pieces and 30 texts, and every
-- file it names uploaded to edit-media. A timeline is longer JSON than a cut,
-- so the edit may be up to 64 KB.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'edit-media', 'edit-media', false, 52428800,
  array['video/mp4', 'video/webm', 'video/quicktime', 'image/jpeg', 'image/png', 'image/webp',
        'audio/mpeg', 'audio/mp4', 'audio/aac', 'audio/wav', 'audio/x-wav', 'audio/ogg', 'audio/webm']
)
on conflict (id) do nothing;

create policy "Team members read edit media" on storage.objects
  for select to authenticated
  using (bucket_id = 'edit-media' and (select private.is_team_member()));

create policy "Team members upload edit media into their own folder" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'edit-media'
    and (storage.foldername(name))[1] = 'media'
    and (storage.foldername(name))[2] = (select auth.uid())::text
    and (select private.is_team_member())
  );

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
  v_part jsonb;
  v_path text;
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
    if jsonb_typeof(p_edit) <> 'object' or pg_column_size(p_edit) >= 65536 then
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
    if p_edit ? 'sequence' and (jsonb_typeof(p_edit -> 'sequence') <> 'array' or jsonb_array_length(p_edit -> 'sequence') not between 1 and 40) then
      raise exception 'Up to 40 pieces in a video';
    end if;
    if p_edit ? 'overlays' and (jsonb_typeof(p_edit -> 'overlays') <> 'array' or jsonb_array_length(p_edit -> 'overlays') > 30) then
      raise exception 'Up to 30 texts on a video';
    end if;
    -- Every file the edit names besides the run's clip was uploaded here.
    for v_path in
      select s -> 'media' ->> 'path'
        from jsonb_array_elements(case when jsonb_typeof(p_edit -> 'sequence') = 'array' then p_edit -> 'sequence' else '[]'::jsonb end) s
       where jsonb_typeof(s -> 'media') = 'object'
      union all
      select p_edit -> 'music' -> 'media' ->> 'path' where jsonb_typeof(p_edit -> 'music') = 'object'
    loop
      if v_path is null or not exists (select 1 from storage.objects where bucket_id = 'edit-media' and name = v_path) then
        raise exception 'A file in the edit was not uploaded';
      end if;
    end loop;
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
