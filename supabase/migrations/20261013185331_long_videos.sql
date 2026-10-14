-- Long videos: a raw recording (a webinar, a talk, an interview), heard in the
-- browser on the team's own computer and never uploaded. Only its transcript
-- is kept here. An agent ("QGR · Moments", in n8n) picks the moments worth an
-- ad from the transcript, by line, and the team cuts the ones they choose in
-- the browser: each cut is uploaded as an ordinary clip and starts an
-- ordinary run, which is recorded on its moment.

create table public.long_videos (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 120),
  -- What the file was, to know it again when it is picked again: { name, size, duration, width, height }.
  file jsonb not null,
  -- What is said, in caption-sized lines in the video's own seconds: [{ start, end, text }].
  transcript jsonb not null,
  guidance text check (guidance is null or char_length(guidance) <= 2000),
  status text not null default 'queued' check (status in ('queued', 'working', 'done', 'failed')),
  attempts integer not null default 0,
  claimed_at timestamptz,
  error text,
  -- [{ first, last, start, end, title, why, hook, source: 'agent' | 'team', run_ids: [uuid] }], best first.
  moments jsonb not null default '[]'::jsonb,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  finished_at timestamptz,
  removed_at timestamptz
);
create index long_videos_due on public.long_videos (status, claimed_at) where removed_at is null;

-- What the Moments agent spent, on failure too (moments_finish and
-- moments_fail record it). Its own table: agent_usage is a run's.
create table public.long_video_usage (
  id bigint generated always as identity primary key,
  long_video_id uuid not null references public.long_videos (id) on delete cascade,
  model text not null,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  cache_creation_input_tokens integer not null default 0,
  cache_read_input_tokens integer not null default 0,
  created_at timestamptz not null default now()
);
create index long_video_usage_video on public.long_video_usage (long_video_id);

alter table public.long_videos enable row level security;
alter table public.long_video_usage enable row level security;
revoke all on public.long_videos, public.long_video_usage from public, anon, authenticated;
grant select on public.long_videos, public.long_video_usage to authenticated;
create policy "Team members read long videos" on public.long_videos
  for select to authenticated using ((select private.is_team_member()));
create policy "Team members read what the moments cost" on public.long_video_usage
  for select to authenticated using ((select private.is_team_member()));

-- A transcript as the browser makes it: lines in order, each inside the video, none empty.
create function private.check_transcript(p_transcript jsonb, p_duration numeric)
returns void
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_line jsonb;
  v_previous numeric := 0;
begin
  if jsonb_typeof(p_transcript) is distinct from 'array' or jsonb_array_length(p_transcript) = 0 then
    raise exception 'The video has no transcript: nothing was heard in it';
  end if;
  if jsonb_array_length(p_transcript) > 8000 then
    raise exception 'The transcript is too long';
  end if;
  for v_line in select value from jsonb_array_elements(p_transcript) loop
    if jsonb_typeof(v_line -> 'start') is distinct from 'number' or jsonb_typeof(v_line -> 'end') is distinct from 'number'
       or jsonb_typeof(v_line -> 'text') is distinct from 'string' then
      raise exception 'A transcript line is not readable';
    end if;
    if (v_line ->> 'start')::numeric < v_previous - 0.01 or (v_line ->> 'end')::numeric <= (v_line ->> 'start')::numeric
       or (v_line ->> 'end')::numeric > p_duration + 1 then
      raise exception 'A transcript line is outside the video';
    end if;
    if char_length(btrim(v_line ->> 'text')) = 0 or char_length(v_line ->> 'text') > 200 then
      raise exception 'A transcript line is empty or too long';
    end if;
    v_previous := (v_line ->> 'start')::numeric;
  end loop;
end
$$;

-- A teammate keeps a long video's transcript and asks for its moments.
create function public.create_long_video(p_title text, p_file jsonb, p_transcript jsonb, p_guidance text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := private.require_team_member();
  v_duration numeric;
  v_id uuid;
begin
  if p_title is null or char_length(btrim(p_title)) = 0 or char_length(p_title) > 120 then
    raise exception 'Name the video in 120 characters or less';
  end if;
  if jsonb_typeof(p_file) is distinct from 'object' or jsonb_typeof(p_file -> 'duration') is distinct from 'number'
     or jsonb_typeof(p_file -> 'size') is distinct from 'number' or jsonb_typeof(p_file -> 'name') is distinct from 'string' then
    raise exception 'The video''s file is not described';
  end if;
  v_duration := (p_file ->> 'duration')::numeric;
  if v_duration <= 0 or v_duration > 3 * 3600 + 60 then
    raise exception 'A long video can be up to three hours';
  end if;
  perform private.check_transcript(p_transcript, v_duration);
  if p_guidance is not null and char_length(p_guidance) > 2000 then
    raise exception 'Keep the direction under 2,000 characters';
  end if;

  insert into public.long_videos (title, file, transcript, guidance, created_by)
  values (
    btrim(p_title),
    jsonb_build_object('name', left(p_file ->> 'name', 200), 'size', (p_file ->> 'size')::bigint, 'duration', v_duration,
      'width', coalesce((p_file ->> 'width')::integer, 0), 'height', coalesce((p_file ->> 'height')::integer, 0)),
    p_transcript,
    nullif(btrim(coalesce(p_guidance, '')), ''),
    v_user
  )
  returning id into v_id;
  return v_id;
end
$$;

-- Asks for the moments again: after a failure, or for a fresh pick. The
-- moments ads were made from, and the team's own, are kept.
create function public.ask_moments_again(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_team_member();
  update public.long_videos
     set status = 'queued', attempts = 0, claimed_at = null, error = null
   where id = p_id and removed_at is null and status in ('done', 'failed');
  if not found then
    raise exception 'That video is already being looked at, or is gone';
  end if;
end
$$;

-- Takes a long video out of the list. Its transcript stays; the runs made from it are untouched.
create function public.remove_long_video(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_team_member();
  update public.long_videos set removed_at = now() where id = p_id and removed_at is null;
end
$$;

-- A moment cut into a clip that started a run: recorded on the moment, or
-- added as the team's own when no moment has those lines.
create function public.record_moment_run(p_id uuid, p_first integer, p_last integer, p_title text, p_run_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_video public.long_videos;
  v_count integer;
  v_found boolean := false;
  v_moments jsonb := '[]'::jsonb;
  v_moment jsonb;
begin
  perform private.require_team_member();
  select * into v_video from public.long_videos where id = p_id and removed_at is null for update;
  if not found then
    raise exception 'That long video is gone';
  end if;
  if not exists (select 1 from public.runs where id = p_run_id) then
    raise exception 'That run does not exist';
  end if;
  v_count := jsonb_array_length(v_video.transcript);
  if p_first is null or p_last is null or p_first < 0 or p_last < p_first or p_last >= v_count then
    raise exception 'The moment is not inside the transcript';
  end if;

  for v_moment in select value from jsonb_array_elements(v_video.moments) loop
    if (v_moment ->> 'first')::integer = p_first and (v_moment ->> 'last')::integer = p_last then
      v_found := true;
      v_moment := jsonb_set(v_moment, '{run_ids}', coalesce(v_moment -> 'run_ids', '[]'::jsonb) || to_jsonb(p_run_id::text));
    end if;
    v_moments := v_moments || jsonb_build_array(v_moment);
  end loop;
  if not v_found then
    v_moments := v_moments || jsonb_build_array(jsonb_build_object(
      'first', p_first, 'last', p_last,
      'start', v_video.transcript -> p_first -> 'start', 'end', v_video.transcript -> p_last -> 'end',
      'title', left(coalesce(nullif(btrim(p_title), ''), 'Your moment'), 80), 'why', null, 'hook', null,
      'source', 'team', 'run_ids', jsonb_build_array(p_run_id::text)));
  end if;
  update public.long_videos set moments = v_moments where id = p_id;
end
$$;

-- n8n: the long videos waiting for their moments, claimed so two runs never
-- look at the same one. A claim lost for ten minutes is taken again, three
-- times at most.
create function public.moments_take_due(p_limit integer default 2)
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
    returning v.id, v.title, v.file, v.transcript, v.guidance
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'long_video_id', c.id,
           'title', c.title,
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

-- n8n: the moments found, by transcript line. Times are taken from the
-- transcript here, never from the model. The moments ads were made from,
-- and the team's own, stay; the agent's earlier pick is replaced.
create function public.moments_finish(p_id uuid, p_moments jsonb, p_usage jsonb default null)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_video public.long_videos;
  v_count integer;
  v_kept jsonb;
  v_new jsonb := '[]'::jsonb;
  v_m jsonb;
  v_first integer;
  v_last integer;
begin
  select * into v_video from public.long_videos where id = p_id for update;
  if not found then
    raise exception 'That long video is gone';
  end if;
  insert into public.long_video_usage (long_video_id, model, input_tokens, output_tokens, cache_creation_input_tokens, cache_read_input_tokens)
  select p_id, coalesce(p_usage ->> 'model', 'unknown'),
         coalesce((p_usage ->> 'input_tokens')::integer, 0), coalesce((p_usage ->> 'output_tokens')::integer, 0),
         coalesce((p_usage ->> 'cache_creation_input_tokens')::integer, 0), coalesce((p_usage ->> 'cache_read_input_tokens')::integer, 0)
   where p_usage is not null and jsonb_typeof(p_usage) = 'object'
     and exists (select 1 from public.long_videos where id = p_id);
  if jsonb_typeof(p_moments) is distinct from 'array' or jsonb_array_length(p_moments) = 0 or jsonb_array_length(p_moments) > 12 then
    raise exception 'The moments must be one to twelve';
  end if;
  v_count := jsonb_array_length(v_video.transcript);

  select coalesce(jsonb_agg(m), '[]'::jsonb) into v_kept
    from jsonb_array_elements(v_video.moments) m
   where m ->> 'source' = 'team' or jsonb_array_length(coalesce(m -> 'run_ids', '[]'::jsonb)) > 0;

  for v_m in select value from jsonb_array_elements(p_moments) loop
    v_first := (v_m ->> 'first')::integer;
    v_last := (v_m ->> 'last')::integer;
    if v_first is null or v_last is null or v_first < 0 or v_last < v_first or v_last >= v_count then
      raise exception 'A moment is not inside the transcript';
    end if;
    if char_length(coalesce(v_m ->> 'title', '')) not between 1 and 80 then
      raise exception 'A moment needs a title of 80 characters or less';
    end if;
    -- A moment already kept with the same lines is not added twice.
    if exists (select 1 from jsonb_array_elements(v_kept) k where (k ->> 'first')::integer = v_first and (k ->> 'last')::integer = v_last) then
      continue;
    end if;
    v_new := v_new || jsonb_build_array(jsonb_build_object(
      'first', v_first, 'last', v_last,
      'start', v_video.transcript -> v_first -> 'start', 'end', v_video.transcript -> v_last -> 'end',
      'title', v_m ->> 'title', 'why', left(v_m ->> 'why', 400), 'hook', left(v_m ->> 'hook', 200),
      'warnings', coalesce(v_m -> 'warnings', '[]'::jsonb),
      'source', 'agent', 'run_ids', '[]'::jsonb));
  end loop;

  update public.long_videos
     set moments = v_new || v_kept, status = 'done', claimed_at = null, error = null, finished_at = now()
   where id = p_id;
end
$$;

create function public.moments_fail(p_id uuid, p_error text, p_usage jsonb default null)
returns void
language plpgsql
set search_path = ''
as $$
begin
  insert into public.long_video_usage (long_video_id, model, input_tokens, output_tokens, cache_creation_input_tokens, cache_read_input_tokens)
  select p_id, coalesce(p_usage ->> 'model', 'unknown'),
         coalesce((p_usage ->> 'input_tokens')::integer, 0), coalesce((p_usage ->> 'output_tokens')::integer, 0),
         coalesce((p_usage ->> 'cache_creation_input_tokens')::integer, 0), coalesce((p_usage ->> 'cache_read_input_tokens')::integer, 0)
   where p_usage is not null and jsonb_typeof(p_usage) = 'object'
     and exists (select 1 from public.long_videos where id = p_id);
  update public.long_videos
     set status = 'failed', claimed_at = null, error = left(coalesce(p_error, 'The moments could not be found.'), 500), finished_at = now()
   where id = p_id;
end
$$;

revoke all on function private.check_transcript(jsonb, numeric) from public, anon, authenticated;

revoke execute on function
  public.create_long_video(text, jsonb, jsonb, text),
  public.ask_moments_again(uuid),
  public.remove_long_video(uuid),
  public.record_moment_run(uuid, integer, integer, text, uuid)
from public, anon;
grant execute on function
  public.create_long_video(text, jsonb, jsonb, text),
  public.ask_moments_again(uuid),
  public.remove_long_video(uuid),
  public.record_moment_run(uuid, integer, integer, text, uuid)
to authenticated, service_role;

revoke execute on function
  public.moments_take_due(integer),
  public.moments_finish(uuid, jsonb, jsonb),
  public.moments_fail(uuid, text, jsonb)
from public, anon, authenticated;
grant execute on function
  public.moments_take_due(integer),
  public.moments_finish(uuid, jsonb, jsonb),
  public.moments_fail(uuid, text, jsonb)
to service_role;
