-- Pictures for ads: an image model's picture for a variant, made from its
-- image_prompt and shown under the variant's words in place of the drawn
-- design. A person asks for one in the studio, or every new ad asks for one
-- when the team turns that on; n8n's "QGR · Pictures" takes the asks in turn,
-- as the publisher takes posts. Until the image model's key is in, its step is
-- a stand-in that makes nothing, and the design is drawn as before.
-- (image_url, which nothing ever filled, gives way to picture_path.)

alter table public.ad_variants
  add column picture_path text check (picture_path ~ '^pictures/[0-9a-f-]{36}/[0-9a-f-]{36}\.(png|jpg|webp)$'),
  -- none: nothing asked for; making: asked for, and waiting for n8n; failed:
  -- the last ask failed. picture_error says why, or that nothing was made.
  add column picture_status text not null default 'none' check (picture_status in ('none', 'making', 'failed')),
  add column picture_error text check (length(picture_error) <= 500),
  add column picture_requested_at timestamptz,
  add column picture_claimed_at timestamptz,
  add column picture_attempts smallint not null default 0;

alter table public.team_settings
  add column pictures_auto boolean not null default false;

-- With the team's switch on, every new ad that has a picture prompt asks for
-- a picture as it is written. A video ad has none: the clip is its picture.
create function private.ask_picture_for_new_ad()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if coalesce(btrim(new.image_prompt), '') <> ''
     and coalesce((select s.pictures_auto from public.team_settings s where s.id = 1), false) then
    new.picture_status := 'making';
    new.picture_requested_at := now();
  end if;
  return new;
end
$$;

create trigger ad_variants_ask_picture
  before insert on public.ad_variants
  for each row execute function private.ask_picture_for_new_ad();

-- A person asks for a picture for a variant, or for another one.
create function public.request_picture(p_variant_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_variant public.ad_variants;
begin
  perform private.require_team_member();
  select * into v_variant from public.ad_variants where id = p_variant_id for update;
  if not found then
    raise exception 'Variant % not found', p_variant_id;
  end if;
  if coalesce(btrim(v_variant.image_prompt), '') = '' then
    raise exception 'Variant % has no picture prompt: its ads are made from the clip', v_variant.label;
  end if;
  if v_variant.picture_status = 'making' and v_variant.picture_requested_at > now() - interval '10 minutes' then
    raise exception 'A picture for variant % is already being made', v_variant.label;
  end if;
  -- Waiting to post: its picture, like its words, may not change.
  if exists (
    select 1 from public.posts p join public.post_targets t on t.post_id = p.id
     where p.variant_id = p_variant_id and t.status in ('scheduled', 'posting')) then
    raise exception 'Variant % is waiting to post. Cancel the post before changing it', v_variant.label;
  end if;
  update public.ad_variants
     set picture_status = 'making', picture_requested_at = now(), picture_claimed_at = null,
         picture_error = null, picture_attempts = 0
   where id = p_variant_id;
  insert into public.run_events (run_id, text)
  values (public.run_of_variant(p_variant_id), 'A picture asked for variant ' || v_variant.label);
end
$$;

-- A person takes a variant's picture away, or stops one being made: the drawn
-- design shows again. Returns the file for the app to remove from Storage.
create function public.remove_picture(p_variant_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_variant public.ad_variants;
begin
  perform private.require_team_member();
  select * into v_variant from public.ad_variants where id = p_variant_id for update;
  if not found then
    raise exception 'Variant % not found', p_variant_id;
  end if;
  if v_variant.picture_path is null and v_variant.picture_status = 'none' then
    raise exception 'Variant % has no picture', v_variant.label;
  end if;
  -- Waiting to post: its picture, like its words, may not change.
  if exists (
    select 1 from public.posts p join public.post_targets t on t.post_id = p.id
     where p.variant_id = p_variant_id and t.status in ('scheduled', 'posting')) then
    raise exception 'Variant % is waiting to post. Cancel the post before changing it', v_variant.label;
  end if;
  update public.ad_variants
     set picture_path = null, picture_status = 'none', picture_error = null, picture_requested_at = null,
         picture_claimed_at = null, picture_attempts = 0,
         approved_at = case when v_variant.picture_path is null then approved_at end,
         approved_by = case when v_variant.picture_path is null then approved_by end,
         updated_at = now()
   where id = p_variant_id;
  if v_variant.picture_path is not null then
    perform public.unapproved(v_variant, public.run_of_variant(p_variant_id), 'is back to the drawn design');
  end if;
  return v_variant.picture_path;
end
$$;

-- Whether every new ad asks for a picture as it is written.
create function public.set_pictures_auto(p_on boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := private.require_team_member();
begin
  if p_on is null then
    raise exception 'Say whether new ads get pictures';
  end if;
  update public.team_settings set pictures_auto = p_on, updated_at = now(), updated_by = v_user where id = 1;
end
$$;

-- Called by n8n's "QGR · Pictures": the variants waiting for a picture,
-- claimed so two runs do not make the same one, with the path to upload it to.
-- A claim older than ten minutes was lost and is taken again; after three
-- tries the ask fails, so a broken step never loops.
create function public.picture_take_due(p_limit integer default 5)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_out jsonb;
begin
  update public.ad_variants
     set picture_status = 'failed', picture_claimed_at = null,
         picture_error = 'The picture could not be made after three tries.'
   where picture_status = 'making' and picture_attempts >= 3
     and picture_claimed_at < now() - interval '10 minutes';

  with due as (
    select v.id
      from public.ad_variants v
     where v.picture_status = 'making'
       and (v.picture_claimed_at is null or v.picture_claimed_at < now() - interval '10 minutes')
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
           'path', 'pictures/' || c.id::text || '/' || gen_random_uuid()::text || '.png'
         )), '[]'::jsonb)
    into v_out
    from claimed c;
  return v_out;
end
$$;

-- The picture is in Storage at p_path: the variant shows it from now on, and
-- an approval is taken back, since the ad has changed. A stand-in made
-- nothing: the ask ends and says so. Returns the file the variant showed
-- before, for n8n to remove.
create function public.picture_finish(p_variant_id uuid, p_path text default null, p_stand_in boolean default false)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_was public.ad_variants;
  v_run uuid;
begin
  select * into v_was from public.ad_variants where id = p_variant_id for update;
  if not found or v_was.picture_status <> 'making' then
    raise exception 'No picture was being made for this variant';
  end if;
  v_run := public.run_of_variant(p_variant_id);

  if p_path is null then
    if not coalesce(p_stand_in, false) then
      raise exception 'No picture to record';
    end if;
    update public.ad_variants
       set picture_status = 'none', picture_claimed_at = null, picture_requested_at = null,
           picture_error = 'No picture was made: the image model is not connected yet, so the design is drawn.'
     where id = p_variant_id;
    insert into public.run_events (run_id, text)
    values (v_run, 'No picture made for variant ' || v_was.label || ': the image model is not connected yet');
    return jsonb_build_object('remove_picture', null);
  end if;

  if p_path !~ ('^pictures/' || p_variant_id::text || '/[0-9a-f-]{36}\.(png|jpg|webp)$') then
    raise exception 'The picture is not where this variant''s pictures go';
  end if;
  if not exists (select 1 from storage.objects where bucket_id = 'ad-pictures' and name = p_path) then
    raise exception 'The picture has not finished uploading';
  end if;
  -- Scheduled while its picture was being made: what was approved goes out,
  -- and this picture is not used.
  if exists (
    select 1 from public.posts p join public.post_targets t on t.post_id = p.id
     where p.variant_id = p_variant_id and t.status in ('scheduled', 'posting')) then
    update public.ad_variants
       set picture_status = 'failed', picture_claimed_at = null,
           picture_error = 'The variant was scheduled while its picture was being made. Ask again once it has posted.'
     where id = p_variant_id;
    return jsonb_build_object('remove_picture', p_path);
  end if;

  update public.ad_variants
     set picture_path = p_path, picture_status = 'none', picture_error = null,
         picture_requested_at = null, picture_claimed_at = null, picture_attempts = 0,
         approved_at = null, approved_by = null, updated_at = now()
   where id = p_variant_id;
  perform public.unapproved(v_was, v_run, 'has a new picture');
  return jsonb_build_object('remove_picture', v_was.picture_path);
end
$$;

-- The image model did not make the picture: the ask fails and says why.
create function public.picture_fail(p_variant_id uuid, p_error text)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_label text;
  v_message text := left(coalesce(nullif(btrim(p_error), ''), 'The image model did not make a picture'), 500);
begin
  update public.ad_variants
     set picture_status = 'failed', picture_claimed_at = null, picture_error = v_message
   where id = p_variant_id and picture_status = 'making'
  returning label into v_label;
  if not found then
    raise exception 'No picture was being made for this variant';
  end if;
  insert into public.run_events (run_id, text)
  values (public.run_of_variant(p_variant_id), 'The picture for variant ' || v_label || ' failed: ' || v_message);
end
$$;

-- ---------------------------------------------------------------- storage

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('ad-pictures', 'ad-pictures', false, 10485760, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;

-- n8n uploads with the service role; the team sees them through links the
-- server signs as each teammate.
create policy "Team members see ad pictures" on storage.objects
  for select to authenticated
  using (bucket_id = 'ad-pictures' and (select private.is_team_member()));

-- A picture no variant shows any more: one taken away in the studio.
create policy "Team members remove ad pictures no variant shows" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'ad-pictures'
    and (select private.is_team_member())
    and not exists (select 1 from public.ad_variants v where v.picture_path = objects.name)
  );

-- ---------------------------------------------------------------- access

revoke execute on function private.ask_picture_for_new_ad() from public, anon, authenticated;

revoke execute on function
  public.picture_take_due(integer),
  public.picture_finish(uuid, text, boolean),
  public.picture_fail(uuid, text)
from public, anon, authenticated;
grant execute on function
  public.picture_take_due(integer),
  public.picture_finish(uuid, text, boolean),
  public.picture_fail(uuid, text)
to service_role;

revoke execute on function
  public.request_picture(uuid),
  public.remove_picture(uuid),
  public.set_pictures_auto(boolean)
from public, anon;
grant execute on function
  public.request_picture(uuid),
  public.remove_picture(uuid),
  public.set_pictures_auto(boolean)
to authenticated, service_role;
