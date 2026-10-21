-- A long video's details changed after it is kept: its name, a description
-- of what it is about, and the direction for the agents. And a moment's
-- title, description (why) and hook, saved; a moment of the team's own kept
-- as soon as it is added rather than only once ads are made from it.

alter table public.long_videos
  add column description text check (description is null or char_length(description) <= 2000);

-- The name, the description and the direction, as the team writes them. An
-- empty description or direction is none.
create function public.update_long_video(p_id uuid, p_title text, p_description text, p_guidance text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_team_member();
  if char_length(btrim(coalesce(p_title, ''))) not between 1 and 120 then
    raise exception 'Name the video, in 120 characters or less';
  end if;
  if char_length(coalesce(p_description, '')) > 2000 then
    raise exception 'Keep the description under 2,000 characters';
  end if;
  if char_length(coalesce(p_guidance, '')) > 2000 then
    raise exception 'Keep the direction under 2,000 characters';
  end if;
  update public.long_videos
     set title = regexp_replace(btrim(p_title), '\s+', ' ', 'g'),
         description = nullif(btrim(coalesce(p_description, '')), ''),
         guidance = nullif(btrim(coalesce(p_guidance, '')), '')
   where id = p_id and removed_at is null;
  if not found then
    raise exception 'That long video is gone';
  end if;
end
$$;

-- A moment as the team leaves it: the one at (p_was_first, p_was_last), or a
-- new one when those are null, now at (p_first, p_last) with its title, why
-- and hook. The hook's flags are the app's guardrails (rule 6), kept as given.
-- A moment saved by the team is the team's own, so asking for the moments
-- again keeps it. One that ads were made from keeps its lines: moved, it is
-- kept as it was and the new lines are added as another.
create function public.save_moment(
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

-- Takes a moment out of the list; one that ads were made from stays, with its runs.
create function public.remove_moment(p_id uuid, p_first integer, p_last integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_video public.long_videos;
  v_moment jsonb;
begin
  perform private.require_team_member();
  select * into v_video from public.long_videos where id = p_id and removed_at is null for update;
  if not found then
    raise exception 'That long video is gone';
  end if;
  select m into v_moment from jsonb_array_elements(v_video.moments) m
   where (m ->> 'first')::integer = p_first and (m ->> 'last')::integer = p_last;
  if v_moment is null then
    return;
  end if;
  if jsonb_array_length(coalesce(v_moment -> 'run_ids', '[]'::jsonb)) > 0 then
    raise exception 'Ads were made from that moment, so it stays with its runs';
  end if;
  update public.long_videos
     set moments = (select coalesce(jsonb_agg(m), '[]'::jsonb) from jsonb_array_elements(v_video.moments) m
                     where not ((m ->> 'first')::integer = p_first and (m ->> 'last')::integer = p_last))
   where id = p_id;
end
$$;

-- The Moments agent reads the description too, when there is one.
create or replace function public.moments_take_due(p_limit integer default 2)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_out jsonb;
begin
  update public.long_videos
     set status = 'failed', claimed_at = null, error = 'The moments could not be found after three tries.'
   where status = 'working' and attempts >= 3 and claimed_at < now() - interval '10 minutes';

  with due as (
    select v.id
      from public.long_videos v
     where v.removed_at is null
       and (v.status = 'queued' or (v.status = 'working' and v.claimed_at < now() - interval '10 minutes'))
     order by v.created_at
     limit greatest(p_limit, 0)
       for update skip locked
  ), claimed as (
    update public.long_videos v
       set status = 'working', claimed_at = now(), attempts = v.attempts + 1
      from due
     where v.id = due.id
    returning v.id, v.title, v.file, v.transcript, v.guidance, v.description
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'long_video_id', c.id,
           'title', c.title,
           'description', c.description,
           'duration', (c.file ->> 'duration')::numeric,
           'transcript', c.transcript,
           'guidance', c.guidance,
           'brand', (select to_jsonb(b) - 'id' - 'updated_at' from public.brand_profile b where b.id = 1)
         )), '[]'::jsonb)
    into v_out
    from claimed c;
  return v_out;
end
$$;

revoke execute on function
  public.update_long_video(uuid, text, text, text),
  public.save_moment(uuid, integer, integer, integer, integer, text, text, text, jsonb),
  public.remove_moment(uuid, integer, integer)
from public, anon;
grant execute on function
  public.update_long_video(uuid, text, text, text),
  public.save_moment(uuid, integer, integer, integer, integer, text, text, text, jsonb),
  public.remove_moment(uuid, integer, integer)
to authenticated, service_role;
