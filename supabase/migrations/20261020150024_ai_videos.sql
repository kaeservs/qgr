-- AI video, made by Higgsfield. A teammate writes a prompt on the AI video
-- page, picks one of three models, a length, a shape, a quality, sound or not,
-- and for two of the models a first picture, and sees Higgsfield's price for
-- it before asking. n8n ("QGR · AI video") sends the ask to Higgsfield through
-- its MCP, signed in with the team's own Higgsfield account, then checks the
-- job until it is done and copies the video into the private bucket
-- ai-videos, where it is kept in the library to start a run from.
--
-- Every video spends the plan's credits, so nothing is sent until the team
-- switches it on (team_settings.videos_live; until then the stand-in makes
-- nothing and says so), and each month's asks are held to the team's limit
-- (videos_cap, in credits, counted in the team's time zone).
--
-- An ask is sent once. If n8n cannot tell whether Higgsfield took it (the
-- answer was lost, or n8n stopped while sending), it is 'unknown' and never
-- sent again by itself: a person checks Higgsfield's history first, as with a
-- post (rule 11).

alter table public.team_settings
  add column videos_live boolean not null default false,
  add column videos_cap integer not null default 100 check (videos_cap between 0 and 100000);

-- ---------------------------------------------------------------- the videos

create table public.ai_videos (
  id uuid primary key default gen_random_uuid(),
  prompt text not null check (char_length(prompt) between 20 and 2000),
  model text not null check (model in ('seedance_2_0_mini', 'kling3_0', 'seedance_2_5')),
  seconds smallint not null,
  aspect text not null check (aspect in ('9:16', '1:1', '16:9')),
  quality text not null,
  sound boolean not null default false,
  -- The first frame, a file in video-refs.
  picture_path text check (picture_path ~ '^refs/[0-9a-f-]{36}/[0-9a-f-]{36}\.(png|jpg|webp)$'),
  -- Higgsfield's price when it was asked for; what the monthly limit counts.
  credits numeric(8, 2) not null default 0 check (credits >= 0),
  status text not null default 'asked' check (status in ('asked', 'making', 'ready', 'failed', 'unknown', 'stand_in')),
  job_id text check (char_length(job_id) <= 200),
  path text unique check (path ~ '^videos/[0-9a-f-]{36}\.mp4$'),
  error text check (char_length(error) <= 500),
  asked_by uuid references auth.users (id) on delete set null,
  asked_at timestamptz not null default now(),
  -- n8n took it to send.
  claimed_at timestamptz,
  -- n8n last asked Higgsfield how the job is going.
  checked_at timestamptz,
  finished_at timestamptz,
  -- Taken out of the library; the row stays, so the month's credits still count.
  removed_at timestamptz,
  -- What each model makes, as Higgsfield's catalogue says.
  constraint ai_videos_model_settings check (
    (model = 'seedance_2_0_mini' and quality in ('480p', '720p') and seconds between 4 and 15)
    or (model = 'kling3_0' and quality in ('std', 'pro') and seconds between 3 and 15)
    or (model = 'seedance_2_5' and quality in ('480p', '720p', '1080p') and seconds between 4 and 30 and picture_path is null)
  )
);
create index ai_videos_library on public.ai_videos (asked_at desc) where removed_at is null;
create index ai_videos_working on public.ai_videos (status) where status in ('asked', 'making');

alter table public.ai_videos enable row level security;
create policy "Team members read the AI videos" on public.ai_videos
  for select to authenticated using ((select private.is_team_member()));
revoke all on public.ai_videos from anon, authenticated, public;
grant select on public.ai_videos to authenticated;

-- ---------------------------------------------------------------- storage

-- Made videos, uploaded by n8n alone.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('ai-videos', 'ai-videos', false, 209715200, array['video/mp4'])
on conflict (id) do nothing;

create policy "Team members read AI videos" on storage.objects
  for select to authenticated
  using (bucket_id = 'ai-videos' and (select private.is_team_member()));

-- First pictures, uploaded by a teammate into their own folder.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('video-refs', 'video-refs', false, 10485760, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;

create policy "Team members read first pictures for AI video" on storage.objects
  for select to authenticated
  using (bucket_id = 'video-refs' and (select private.is_team_member()));

create policy "Team members upload first pictures into their own folder" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'video-refs'
    and (storage.foldername(name))[1] = 'refs'
    and (storage.foldername(name))[2] = (select auth.uid())::text
    and (select private.is_team_member())
  );

-- ---------------------------------------------------------------- the month's credits

-- This month's credits, in the team's time zone: every ask that is waiting,
-- being made, made, or may have been made. A failed ask never reached
-- Higgsfield, or Higgsfield gave its credits back.
create function private.videos_spent()
returns numeric
language sql
stable
set search_path = ''
as $$
  select coalesce(sum(v.credits), 0)
    from public.ai_videos v, public.team_settings s
   where s.id = 1
     and v.status in ('asked', 'making', 'ready', 'unknown')
     and v.asked_at >= (date_trunc('month', now() at time zone s.time_zone) at time zone s.time_zone)
$$;
revoke all on function private.videos_spent() from public, anon, authenticated;

-- What the page shows beside Generate: on or not, the limit, and what is used.
create function public.video_budget()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_team_member();
  return (select jsonb_build_object('live', s.videos_live, 'cap', s.videos_cap, 'spent', private.videos_spent())
            from public.team_settings s where s.id = 1);
end
$$;
revoke all on function public.video_budget() from public, anon;
grant execute on function public.video_budget() to authenticated;

-- ---------------------------------------------------------------- what people do

-- Making videos for real, and the month's limit in credits.
create function public.set_video_settings(p_live boolean, p_cap integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_team_member();
  if p_cap is null or p_cap < 0 or p_cap > 100000 then
    raise exception 'Set the monthly limit between 0 and 100,000 credits';
  end if;
  update public.team_settings set videos_live = coalesce(p_live, false), videos_cap = p_cap where id = 1;
end
$$;
revoke all on function public.set_video_settings(boolean, integer) from public, anon;
grant execute on function public.set_video_settings(boolean, integer) to authenticated;

-- A video asked for. While the team has not switched AI video on, the ask is
-- made by the stand-in, which makes nothing and costs nothing. Switched on,
-- it needs Higgsfield's price (p_credits, quoted on the page), and the month's
-- asks with it must stay within the limit. Four at most wait at once.
create function public.ask_for_video(
  p_prompt text,
  p_model text,
  p_seconds integer,
  p_aspect text,
  p_quality text,
  p_sound boolean,
  p_credits numeric,
  p_picture_path text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := private.require_team_member();
  v_settings public.team_settings;
  v_prompt text := btrim(regexp_replace(coalesce(p_prompt, ''), '[\u0001-\u0009\u000b-\u001f\u007f]', ' ', 'g'));
  v_spent numeric;
  v_id uuid;
begin
  -- One ask at a time against the limit.
  select * into v_settings from public.team_settings where id = 1 for update;

  if (select count(*) from public.ai_videos where status in ('asked', 'making')) >= 4 then
    raise exception 'Four videos are being made already: ask again once one is ready';
  end if;
  if p_picture_path is not null and not exists (select 1 from storage.objects o where o.bucket_id = 'video-refs' and o.name = p_picture_path) then
    raise exception 'The first picture has not finished uploading';
  end if;

  if v_settings.videos_live then
    if p_credits is null or p_credits <= 0 or p_credits > 10000 then
      raise exception 'Higgsfield''s price for this video is needed first';
    end if;
    v_spent := private.videos_spent();
    if v_spent + p_credits > v_settings.videos_cap then
      raise exception 'This would take this month''s AI video past its limit of % credits (% used). It can be raised in Settings.',
        v_settings.videos_cap, trim_scale(v_spent);
    end if;
  end if;

  insert into public.ai_videos (prompt, model, seconds, aspect, quality, sound, picture_path, credits, asked_by)
  values (v_prompt, p_model, p_seconds, p_aspect, p_quality, coalesce(p_sound, false), p_picture_path,
          case when v_settings.videos_live then p_credits else 0 end, v_user)
  returning id into v_id;
  return v_id;
end
$$;
revoke all on function public.ask_for_video(text, text, integer, text, text, boolean, numeric, text) from public, anon;
grant execute on function public.ask_for_video(text, text, integer, text, text, boolean, numeric, text) to authenticated;

-- A video taken out of the library. One still waiting to be sent is stopped
-- (nothing reaches Higgsfield); one being made is left to finish, since its
-- credits are spent either way.
create function public.remove_ai_video(p_id uuid)
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
  update public.ai_videos
     set removed_at = coalesce(removed_at, now()),
         status = case when status = 'asked' then 'failed' else status end,
         error = case when status = 'asked' then 'Stopped before it was sent to Higgsfield.' else error end
   where id = p_id;
end
$$;
revoke all on function public.remove_ai_video(uuid) from public, anon;
grant execute on function public.remove_ai_video(uuid) to authenticated;

-- ---------------------------------------------------------------- what n8n does

-- The asks to send. An ask claimed and never settled (n8n stopped while it was
-- sending) is not sent again: it is unknown until a person has checked.
create function public.video_take_due(p_limit integer default 3)
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
     order by v.asked_at
     limit greatest(p_limit, 0)
       for update skip locked
  ), claimed as (
    update public.ai_videos v
       set claimed_at = now()
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
           'live', coalesce(s.videos_live, false),
           'path', 'videos/' || c.id::text || '.mp4'
         ) order by c.asked_at), '[]'::jsonb)
    into v_out
    from claimed c
    left join public.team_settings s on s.id = 1;
  return v_out;
end
$$;

-- Higgsfield took it: its job, and its price if it said one.
create function public.video_started(p_id uuid, p_job_id text, p_credits numeric default null)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if coalesce(btrim(p_job_id), '') = '' then
    raise exception 'No job to record';
  end if;
  update public.ai_videos
     set status = 'making', job_id = btrim(p_job_id), checked_at = null,
         credits = case when p_credits is not null and p_credits >= 0 then p_credits else credits end
   where id = p_id and status = 'asked';
  if not found then
    raise exception 'That video is not waiting to be sent';
  end if;
end
$$;

-- Higgsfield may have taken it: never sent again by itself.
create function public.video_unknown(p_id uuid, p_error text)
returns void
language plpgsql
set search_path = ''
as $$
begin
  update public.ai_videos
     set status = 'unknown', finished_at = now(),
         error = left(coalesce(nullif(btrim(p_error), ''), 'Higgsfield''s answer was lost.'), 500)
   where id = p_id and status in ('asked', 'making');
end
$$;

-- It was not made: refused before it started, or Higgsfield's job failed.
create function public.video_fail(p_id uuid, p_error text)
returns void
language plpgsql
set search_path = ''
as $$
begin
  update public.ai_videos
     set status = 'failed', finished_at = now(),
         error = left(coalesce(nullif(btrim(p_error), ''), 'Higgsfield did not make it.'), 500)
   where id = p_id and status in ('asked', 'making');
end
$$;

-- The jobs to ask Higgsfield about, each at most every 45 seconds. A job
-- Higgsfield has not finished in two hours is left to a person.
create function public.video_take_making(p_limit integer default 10)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_out jsonb;
begin
  update public.ai_videos
     set status = 'unknown', finished_at = now(),
         error = 'Higgsfield had not finished it after two hours. Check its history.'
   where status = 'making' and claimed_at < now() - interval '2 hours';

  with due as (
    select v.id
      from public.ai_videos v
     where v.status = 'making' and v.job_id is not null
       and (v.checked_at is null or v.checked_at < now() - interval '45 seconds')
     order by v.checked_at nulls first, v.asked_at
     limit greatest(p_limit, 0)
       for update skip locked
  ), checked as (
    update public.ai_videos v set checked_at = now() from due where v.id = due.id
    returning v.id, v.job_id
  )
  select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'job_id', c.job_id, 'path', 'videos/' || c.id::text || '.mp4')), '[]'::jsonb)
    into v_out
    from checked c;
  return v_out;
end
$$;

-- The video is in Storage at its path and goes into the library. The stand-in
-- made nothing: the ask ends and says why.
create function public.video_finish(p_id uuid, p_path text default null, p_stand_in boolean default false)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if coalesce(p_stand_in, false) then
    update public.ai_videos
       set status = 'stand_in', finished_at = now(), credits = 0,
           error = 'Nothing was made: AI video is not switched on in Settings.'
     where id = p_id and status = 'asked';
    return;
  end if;
  if p_path is distinct from ('videos/' || p_id::text || '.mp4') then
    raise exception 'The video is not where this video goes';
  end if;
  if not exists (select 1 from storage.objects o where o.bucket_id = 'ai-videos' and o.name = p_path) then
    raise exception 'The video has not finished uploading';
  end if;
  update public.ai_videos
     set status = 'ready', path = p_path, error = null, finished_at = now()
   where id = p_id and status in ('making', 'unknown');
  if not found then
    raise exception 'That video is not being made';
  end if;
end
$$;

revoke all on function public.video_take_due(integer) from public, anon, authenticated;
revoke all on function public.video_started(uuid, text, numeric) from public, anon, authenticated;
revoke all on function public.video_unknown(uuid, text) from public, anon, authenticated;
revoke all on function public.video_fail(uuid, text) from public, anon, authenticated;
revoke all on function public.video_take_making(integer) from public, anon, authenticated;
revoke all on function public.video_finish(uuid, text, boolean) from public, anon, authenticated;
grant execute on function public.video_take_due(integer) to service_role;
grant execute on function public.video_started(uuid, text, numeric) to service_role;
grant execute on function public.video_unknown(uuid, text) to service_role;
grant execute on function public.video_fail(uuid, text) to service_role;
grant execute on function public.video_take_making(integer) to service_role;
grant execute on function public.video_finish(uuid, text, boolean) to service_role;
