-- Pictures by Higgsfield. A third image model beside the stand-in and
-- Cloudflare: GPT Image 2.5 through Higgsfield's MCP, signed in with the
-- team's own Higgsfield account, so every picture spends the plan's credits.
-- They count against the same monthly limit as AI video (videos_cap), which is
-- the team's one Higgsfield budget.
--
-- Higgsfield takes a picture as a job and makes it in its own time, so a
-- picture is sent once and its job checked until it is done, as a video's is.
-- Each sending is a row here: what it costs, the job, and how it ended. The
-- variant keeps its picture_status as before, so the studio reads it as it
-- always has. A send whose answer was lost may still have been made, so it is
-- never sent again by itself (Higgsfield: do not automatically resubmit).
--
-- 'higgsfield' joins the image models in the next migration, which swaps the
-- column's check and so waits for the owner to confirm it.

-- ---------------------------------------------------------------- settings

-- How carefully GPT Image 2.5 draws: low is the cheapest (0.25 credits a
-- picture on 2026-10-20, priced by Higgsfield with get_cost).
alter table public.team_settings
  add column pictures_quality text not null default 'low' check (pictures_quality in ('low', 'medium', 'high'));

-- As before, and Higgsfield: its login is the "Higgsfield" credential in n8n,
-- so it needs nothing here.
create or replace function public.set_pictures_model(p_model text, p_account text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := private.require_team_member();
  v_account text := lower(nullif(btrim(coalesce(p_account, '')), ''));
begin
  if p_model is null or p_model not in ('stand-in', 'cloudflare', 'higgsfield') then
    raise exception 'Pictures are made by the stand-in, Cloudflare Workers AI or Higgsfield';
  end if;
  if v_account !~ '^[0-9a-f]{32}$' then
    raise exception 'A Cloudflare account ID is 32 characters, 0-9 and a-f';
  end if;
  if p_model = 'cloudflare' and coalesce(v_account, (select s.cloudflare_account from public.team_settings s where s.id = 1)) is null then
    raise exception 'Cloudflare Workers AI needs your Cloudflare account ID';
  end if;
  update public.team_settings
     set pictures_model = p_model, cloudflare_account = coalesce(v_account, cloudflare_account),
         updated_at = now(), updated_by = v_user
   where id = 1;
end
$$;

create function public.set_pictures_quality(p_quality text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := private.require_team_member();
begin
  if p_quality is null or p_quality not in ('low', 'medium', 'high') then
    raise exception 'Higgsfield draws pictures at low, medium or high quality';
  end if;
  update public.team_settings set pictures_quality = p_quality, updated_at = now(), updated_by = v_user where id = 1;
end
$$;

-- ---------------------------------------------------------------- what was sent

create table public.higgsfield_pictures (
  id uuid primary key default gen_random_uuid(),
  -- The ad it was for. A plain id, not a foreign key: the row outlives its
  -- ad, so the month's credits still count it, and never stands in the way
  -- of an ad going.
  variant_id uuid,
  -- Where the picture goes in ad-pictures; its extension follows what arrives.
  path text not null check (path ~ '^pictures/[0-9a-f-]{36}/[0-9a-f-]{36}\.(png|jpg|webp)$'),
  model text not null default 'gpt_image_2_5' check (model in ('gpt_image_2_5')),
  quality text not null check (quality in ('low', 'medium', 'high')),
  -- Higgsfield's price when it was sent; what the monthly limit counts.
  credits numeric(8, 2) not null check (credits >= 0),
  -- sending: asked, no answer yet; making: Higgsfield has its job; ready: in
  -- ad-pictures; failed: refused, or the job failed; unknown: the answer was
  -- lost, so it may have been made; released: Higgsfield was not reached and
  -- nothing was sent.
  status text not null default 'sending' check (status in ('sending', 'making', 'ready', 'failed', 'unknown', 'released')),
  job_id text check (char_length(job_id) <= 200),
  error text check (char_length(error) <= 500),
  asked_at timestamptz not null default now(),
  checked_at timestamptz,
  finished_at timestamptz
);
create index higgsfield_pictures_variant on public.higgsfield_pictures (variant_id) where status in ('sending', 'making');
create index higgsfield_pictures_month on public.higgsfield_pictures (asked_at);

alter table public.higgsfield_pictures enable row level security;
create policy "Team members read the pictures sent to Higgsfield" on public.higgsfield_pictures
  for select to authenticated using ((select private.is_team_member()));
revoke all on public.higgsfield_pictures from anon, authenticated, public;
grant select on public.higgsfield_pictures to authenticated;

-- ---------------------------------------------------------------- the month's credits

-- This month's start, in the team's time zone.
create function private.higgsfield_month()
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select date_trunc('month', now() at time zone s.time_zone) at time zone s.time_zone
    from public.team_settings s where s.id = 1
$$;

-- What pictures have spent this month: every one sent, being made, made or
-- unknown. One refused, failed or never sent spent nothing.
create function private.pictures_spent()
returns numeric
language sql
stable
set search_path = ''
as $$
  select coalesce(sum(p.credits), 0)
    from public.higgsfield_pictures p
   where p.status in ('sending', 'making', 'ready', 'unknown')
     and p.asked_at >= private.higgsfield_month()
$$;

-- Named for videos, which came first: it is the team's whole Higgsfield
-- spending this month, videos and pictures, against the one limit.
create or replace function private.videos_spent()
returns numeric
language sql
stable
set search_path = ''
as $$
  select coalesce((select sum(v.credits)
                     from public.ai_videos v
                    where v.status in ('asked', 'making', 'ready', 'unknown')
                      and v.asked_at >= private.higgsfield_month()), 0)
       + private.pictures_spent()
$$;

-- As before, with what pictures spent of it.
create or replace function public.video_budget()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_team_member();
  return (select jsonb_build_object('live', s.videos_live, 'cap', s.videos_cap, 'spent', private.videos_spent(), 'pictures', private.pictures_spent())
            from public.team_settings s where s.id = 1);
end
$$;

-- ---------------------------------------------------------------- the asks

-- A picture being sent to Higgsfield, or made by it: never taken again.
-- (n8n's functions run as the service role, which has no use of the private
-- schema, so their helpers live here, granted to it alone.)
create function public.picture_in_flight(p_variant_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (select 1 from public.higgsfield_pictures h where h.variant_id = p_variant_id and h.status in ('sending', 'making'))
$$;

-- As before, leaving out an ad whose picture Higgsfield already has, and with
-- the team's quality for Higgsfield.
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
     order by v.picture_requested_at nulls first
     limit greatest(p_limit, 0)
       for update skip locked
  ), claimed as (
    update public.ad_variants v
       set picture_claimed_at = now(), picture_attempts = v.picture_attempts + 1
      from due
     where v.id = due.id
    returning v.id, v.label, v.image_prompt, v.creative_style
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'variant_id', c.id,
           'label', c.label,
           'prompt', c.image_prompt,
           'style', c.creative_style,
           'look', (select b.picture_style from public.brand_profile b where b.id = 1),
           'model', coalesce(s.pictures_model, 'stand-in'),
           'account', s.cloudflare_account,
           'quality', coalesce(s.pictures_quality, 'low'),
           'path', 'pictures/' || c.id::text || '/' || gen_random_uuid()::text || '.png'
         )), '[]'::jsonb)
    into v_out
    from claimed c
    left join public.team_settings s on s.id = 1;
  return v_out;
end
$$;

-- An ask n8n could not get going (the image model was not reached): it is
-- taken again at the next run, three tries at most.
create function public.picture_release(p_variant_id uuid, p_error text)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_variant public.ad_variants;
  v_message text := left('The picture could not be made after three tries: nothing was spent. Ask again later. ('
                         || coalesce(nullif(btrim(p_error), ''), 'no answer') || ')', 500);
begin
  update public.ad_variants
     set picture_claimed_at = case when picture_attempts >= 3 then picture_claimed_at else null end,
         picture_status = case when picture_attempts >= 3 then 'failed' else picture_status end,
         picture_error = case when picture_attempts >= 3 then v_message else picture_error end
   where id = p_variant_id and picture_status = 'making'
  returning * into v_variant;
  if found and v_variant.picture_status = 'failed' then
    insert into public.run_events (run_id, text)
    values (public.run_of_variant(p_variant_id), 'The picture for variant ' || v_variant.label || ' failed: ' || v_message);
  end if;
end
$$;

-- An ad's open ask ends without a picture, and says why.
create function public.picture_not_made(p_variant_id uuid, p_message text)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_label text;
  v_message text := left(coalesce(nullif(btrim(p_message), ''), 'Higgsfield did not make a picture'), 500);
begin
  if p_variant_id is null then
    return;
  end if;
  update public.ad_variants
     set picture_status = 'failed', picture_claimed_at = null, picture_error = v_message
   where id = p_variant_id and picture_status = 'making'
  returning label into v_label;
  if found then
    insert into public.run_events (run_id, text)
    values (public.run_of_variant(p_variant_id), 'The picture for variant ' || v_label || ' failed: ' || v_message);
  end if;
end
$$;

-- About to send an ad's picture to Higgsfield, at the price it quoted. It is
-- recorded first, so a send whose answer is lost is known about. Refused when
-- the month's credits would pass the team's limit (the ad says so), when the
-- ask was stopped meanwhile, or when Higgsfield already has this ad's picture.
-- It reads the month's spending, kept in the private schema, so it runs as its
-- owner; only the service role may call it.
create function public.picture_higgsfield_begin(p_variant_id uuid, p_credits numeric, p_quality text, p_path text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_variant public.ad_variants;
  v_settings public.team_settings;
  v_spent numeric;
  v_message text;
  v_id uuid;
begin
  if p_credits is null or p_credits < 0 or p_credits > 1000 then
    raise exception 'Higgsfield''s price for the picture is needed first';
  end if;
  if p_quality is null or p_quality not in ('low', 'medium', 'high') then
    raise exception 'Higgsfield draws pictures at low, medium or high quality';
  end if;
  if p_path !~ ('^pictures/' || p_variant_id::text || '/[0-9a-f-]{36}\.(png|jpg|webp)$') then
    raise exception 'The picture is not where this variant''s pictures go';
  end if;
  -- One at a time, so two sends never both fit under the limit.
  select * into v_settings from public.team_settings where id = 1 for update;
  select * into v_variant from public.ad_variants where id = p_variant_id for update;
  if not found then
    return jsonb_build_object('begun', false, 'error', 'The ad no longer exists.');
  end if;
  if v_variant.picture_status <> 'making' then
    return jsonb_build_object('begun', false, 'error', 'The picture was stopped before it was sent.');
  end if;
  if public.picture_in_flight(p_variant_id) then
    return jsonb_build_object('begun', false, 'error', 'Higgsfield already has this ad''s picture.');
  end if;
  v_spent := private.videos_spent();
  if v_spent + p_credits > v_settings.videos_cap then
    v_message := format('Not made: this picture (%s credits) would take this month''s Higgsfield spending past its limit of %s credits (%s used). Raise the limit in Settings, or switch pictures to Cloudflare.',
                        trim_scale(p_credits), v_settings.videos_cap, trim_scale(v_spent));
    perform public.picture_not_made(p_variant_id, v_message);
    return jsonb_build_object('begun', false, 'error', v_message);
  end if;
  insert into public.higgsfield_pictures (variant_id, path, quality, credits)
  values (p_variant_id, p_path, p_quality, p_credits)
  returning id into v_id;
  return jsonb_build_object('begun', true, 'id', v_id);
end
$$;

-- Higgsfield took it: its job, and its price when the answer said one.
create function public.picture_higgsfield_started(p_id uuid, p_job_id text, p_credits numeric default null)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if coalesce(btrim(p_job_id), '') = '' then
    raise exception 'Higgsfield''s job is needed';
  end if;
  update public.higgsfield_pictures
     set status = 'making', job_id = left(btrim(p_job_id), 200), checked_at = now(),
         credits = case when p_credits is not null and p_credits >= 0 then p_credits else credits end
   where id = p_id and status = 'sending';
  if not found then
    raise exception 'No picture is waiting for its job';
  end if;
end
$$;

-- Higgsfield was not reached at all: nothing was sent and nothing spent, so the
-- ad is taken again at the next run, three tries at most.
create function public.picture_higgsfield_release(p_id uuid, p_error text)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_variant uuid;
begin
  update public.higgsfield_pictures
     set status = 'released', error = left(coalesce(nullif(btrim(p_error), ''), 'Higgsfield was not reached'), 500), finished_at = now()
   where id = p_id and status = 'sending'
  returning variant_id into v_variant;
  if not found then
    raise exception 'No picture is waiting to be sent';
  end if;
  if v_variant is not null then
    perform public.picture_release(v_variant, p_error);
  end if;
end
$$;

-- Refused, or the job failed: nothing was made, and the ad says why.
create function public.picture_higgsfield_fail(p_id uuid, p_error text)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_variant uuid;
  v_message text := left(coalesce(nullif(btrim(p_error), ''), 'Higgsfield did not make the picture.'), 500);
begin
  update public.higgsfield_pictures
     set status = 'failed', error = v_message, finished_at = now()
   where id = p_id and status in ('sending', 'making')
  returning variant_id into v_variant;
  if not found then
    raise exception 'No picture is being made with that id';
  end if;
  perform public.picture_not_made(v_variant, v_message);
end
$$;

-- The answer was lost after sending: it may have been made, and spent, so it
-- is never sent again by itself. A person checks Higgsfield's history.
create function public.picture_higgsfield_unknown(p_id uuid, p_error text)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_variant uuid;
  v_message text := left(coalesce(nullif(btrim(p_error), ''), 'Higgsfield may have made this picture: check its history before asking again.'), 500);
begin
  update public.higgsfield_pictures
     set status = 'unknown', error = v_message, finished_at = now()
   where id = p_id and status in ('sending', 'making')
  returning variant_id into v_variant;
  if not found then
    raise exception 'No picture is being made with that id';
  end if;
  perform public.picture_not_made(v_variant, v_message);
end
$$;

-- The jobs to check, each at most every 20 seconds. A send with no answer for
-- ten minutes, or a job not done in thirty, is left to a person (unknown).
create function public.picture_take_making(p_limit integer default 10)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_lost record;
  v_out jsonb;
begin
  for v_lost in
    update public.higgsfield_pictures
       set status = 'unknown', finished_at = now(),
           error = case when status = 'sending'
                        then 'Higgsfield may have made this picture: n8n lost its answer. Check Higgsfield''s history before asking again.'
                        else 'Higgsfield has not finished this picture in thirty minutes. Check its history before asking again.' end
     where (status = 'sending' and asked_at < now() - interval '10 minutes')
        or (status = 'making' and asked_at < now() - interval '30 minutes')
    returning variant_id, error
  loop
    perform public.picture_not_made(v_lost.variant_id, v_lost.error);
  end loop;

  with due as (
    select h.id
      from public.higgsfield_pictures h
     where h.status = 'making' and h.job_id is not null
       and (h.checked_at is null or h.checked_at < now() - interval '20 seconds')
     order by h.asked_at
     limit greatest(p_limit, 0)
       for update skip locked
  ), taken as (
    update public.higgsfield_pictures h
       set checked_at = now()
      from due
     where h.id = due.id
    returning h.id, h.variant_id, h.job_id, h.path
  )
  select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'variant_id', t.variant_id, 'job_id', t.job_id, 'path', t.path)), '[]'::jsonb)
    into v_out
    from taken t;
  return v_out;
end
$$;

-- The picture is in ad-pictures at p_path (its extension what arrived), and is
-- recorded as any picture is (picture_finish): the ad shows it if its ask is
-- still open, and keeps it to choose from either way. The same answer twice is
-- kept once. Returns a file for n8n to remove, as picture_finish does.
create function public.picture_higgsfield_finish(p_id uuid, p_path text)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_row public.higgsfield_pictures;
begin
  select * into v_row from public.higgsfield_pictures where id = p_id for update;
  if not found then
    raise exception 'No picture was sent with that id';
  end if;
  if v_row.status = 'ready' then
    return jsonb_build_object('remove_picture', null);
  end if;
  if v_row.status <> 'making' then
    raise exception 'That picture is not being made';
  end if;
  if p_path is null or regexp_replace(p_path, '\.(png|jpg|webp)$', '') <> regexp_replace(v_row.path, '\.(png|jpg|webp)$', '') then
    raise exception 'The picture is not where it was meant to go';
  end if;
  update public.higgsfield_pictures set status = 'ready', path = p_path, error = null, finished_at = now() where id = p_id;
  if v_row.variant_id is null then
    return jsonb_build_object('remove_picture', p_path);
  end if;
  return public.picture_finish(v_row.variant_id, p_path, false);
end
$$;

-- ---------------------------------------------------------------- access

revoke all on function private.higgsfield_month() from public, anon, authenticated;
revoke all on function private.pictures_spent() from public, anon, authenticated;

revoke all on function public.set_pictures_quality(text) from public, anon;
grant execute on function public.set_pictures_quality(text) to authenticated;

revoke all on function public.picture_in_flight(uuid) from public, anon, authenticated;
revoke all on function public.picture_not_made(uuid, text) from public, anon, authenticated;
revoke all on function public.picture_release(uuid, text) from public, anon, authenticated;
revoke all on function public.picture_higgsfield_begin(uuid, numeric, text, text) from public, anon, authenticated;
revoke all on function public.picture_higgsfield_started(uuid, text, numeric) from public, anon, authenticated;
revoke all on function public.picture_higgsfield_release(uuid, text) from public, anon, authenticated;
revoke all on function public.picture_higgsfield_fail(uuid, text) from public, anon, authenticated;
revoke all on function public.picture_higgsfield_unknown(uuid, text) from public, anon, authenticated;
revoke all on function public.picture_take_making(integer) from public, anon, authenticated;
revoke all on function public.picture_higgsfield_finish(uuid, text) from public, anon, authenticated;
grant execute on function public.picture_in_flight(uuid) to service_role;
grant execute on function public.picture_not_made(uuid, text) to service_role;
grant execute on function public.picture_release(uuid, text) to service_role;
grant execute on function public.picture_higgsfield_begin(uuid, numeric, text, text) to service_role;
grant execute on function public.picture_higgsfield_started(uuid, text, numeric) to service_role;
grant execute on function public.picture_higgsfield_release(uuid, text) to service_role;
grant execute on function public.picture_higgsfield_fail(uuid, text) to service_role;
grant execute on function public.picture_higgsfield_unknown(uuid, text) to service_role;
grant execute on function public.picture_take_making(integer) to service_role;
grant execute on function public.picture_higgsfield_finish(uuid, text) to service_role;
