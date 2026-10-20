-- An ad's own AI video is its clip once Higgsfield has made it: the studio
-- edits it as it edits a run's clip, and save_video_edit holds the edit to the
-- video's length. A run from a clip is as before.

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
