-- Two fixes found in review before the client tests:
-- - A removed long video's edit no longer holds what it named: its AI videos
--   can leave the library and its edit files be removed (edit_uses read the
--   edits of removed long videos too, which nothing could reach to change).
-- - Moving a moment that ads were made from adds another moment, so the
--   40-moment limit is held there too.

create or replace function private.edit_uses(p_path text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.ad_variants v where v.video_edit is not null and strpos(v.video_edit::text, '"' || p_path || '"') > 0)
      or exists (select 1 from public.long_videos l where l.removed_at is null and l.edit is not null and strpos(l.edit::text, '"' || p_path || '"') > 0)
      or exists (select 1 from public.runs r where r.media ? 'edit' and strpos((r.media -> 'edit')::text, '"' || p_path || '"') > 0)
$$;

create or replace function public.save_moment(
  p_id uuid, p_was_first integer, p_was_last integer, p_first integer, p_last integer,
  p_title text, p_why text, p_hook text, p_warnings jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_video public.long_videos;
  v_count integer;
  v_found boolean := false;
  v_moved boolean;
  v_moments jsonb := '[]'::jsonb;
  v_moment jsonb;
  v_saved jsonb;
begin
  perform private.require_team_member();
  select * into v_video from public.long_videos where id = p_id and removed_at is null for update;
  if not found then
    raise exception 'That long video is gone';
  end if;
  v_count := jsonb_array_length(v_video.transcript);
  if p_first is null or p_last is null or p_first < 0 or p_last < p_first or p_last >= v_count then
    raise exception 'The moment is not inside the transcript';
  end if;
  if (v_video.transcript -> p_last ->> 'end')::numeric - (v_video.transcript -> p_first ->> 'start')::numeric > 150 then
    raise exception 'Keep a moment to two and a half minutes or less';
  end if;
  if char_length(btrim(coalesce(p_title, ''))) not between 1 and 80 then
    raise exception 'Give the moment a title of 80 characters or less';
  end if;
  if char_length(coalesce(p_why, '')) > 400 then
    raise exception 'Keep the moment''s description under 400 characters';
  end if;
  if char_length(coalesce(p_hook, '')) > 200 then
    raise exception 'Keep the hook under 200 characters';
  end if;
  if p_warnings is not null and jsonb_typeof(p_warnings) is distinct from 'array' then
    raise exception 'The flags are not a list';
  end if;
  -- Two moments never share their lines.
  if exists (
    select 1 from jsonb_array_elements(v_video.moments) m
     where (m ->> 'first')::integer = p_first and (m ->> 'last')::integer = p_last
       and not ((m ->> 'first')::integer is not distinct from p_was_first and (m ->> 'last')::integer is not distinct from p_was_last)
  ) then
    raise exception 'That moment is already in the list';
  end if;

  v_saved := jsonb_build_object(
    'first', p_first, 'last', p_last,
    'start', v_video.transcript -> p_first -> 'start', 'end', v_video.transcript -> p_last -> 'end',
    'title', regexp_replace(btrim(p_title), '\s+', ' ', 'g'),
    'why', nullif(btrim(coalesce(p_why, '')), ''),
    'hook', nullif(btrim(coalesce(p_hook, '')), ''),
    'warnings', coalesce(p_warnings, '[]'::jsonb),
    'source', 'team', 'run_ids', '[]'::jsonb);

  for v_moment in select value from jsonb_array_elements(v_video.moments) loop
    if p_was_first is not null and (v_moment ->> 'first')::integer = p_was_first and (v_moment ->> 'last')::integer = p_was_last then
      v_found := true;
      v_moved := p_first <> p_was_first or p_last <> p_was_last;
      if v_moved and jsonb_array_length(coalesce(v_moment -> 'run_ids', '[]'::jsonb)) > 0 then
        -- Kept as it was, the new lines another moment: the list grows, so the limit holds here too.
        if jsonb_array_length(v_video.moments) >= 40 then
          raise exception 'A video keeps up to 40 moments: take one out first';
        end if;
        v_moments := v_moments || jsonb_build_array(v_moment, v_saved);
      else
        v_moments := v_moments || jsonb_build_array(v_saved || jsonb_build_object('run_ids', coalesce(v_moment -> 'run_ids', '[]'::jsonb)));
      end if;
    else
      v_moments := v_moments || jsonb_build_array(v_moment);
    end if;
  end loop;
  if p_was_first is not null and not v_found then
    raise exception 'That moment is gone: reload the page';
  end if;
  if not v_found then
    if jsonb_array_length(v_video.moments) >= 40 then
      raise exception 'A video keeps up to 40 moments';
    end if;
    v_moments := v_moments || jsonb_build_array(v_saved);
  end if;
  update public.long_videos set moments = v_moments where id = p_id;
end
$$;
