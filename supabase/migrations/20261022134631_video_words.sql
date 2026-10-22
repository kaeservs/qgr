-- A video's words can take a font and a colour of their own, as a picture
-- ad's can (the client's feedback, 2026-10-22): lib/video/edit.ts is the
-- app's rule, and every saved edit is checked again here. Same arguments, so
-- its grants are kept.

create or replace function private.check_video_edit(p_edit jsonb, p_duration numeric)
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
  if p_edit -> 'text' ? 'font' and coalesce(p_edit -> 'text' ->> 'font', '') <> all (array['lexend', 'oswald', 'montserrat', 'playfair']) then
    raise exception 'Pick one of the fonts offered';
  end if;
  if p_edit -> 'text' ? 'color' and coalesce(p_edit -> 'text' ->> 'color', '') !~ '^#[0-9a-f]{6}$' then
    raise exception 'Pick a colour for the words';
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
