-- Pictures by prompt. A person edits a variant's picture prompt in the studio
-- and asks for a picture from it; every picture made for a variant is kept to
-- choose from again (variant_pictures), so trying another prompt never loses
-- a better picture. The image model is the team's choice in Settings: the
-- stand-in, as until now, or Cloudflare Workers AI's FLUX.1 schnell on its
-- free daily allowance, whose account is named here and whose token is an n8n
-- credential. Nothing is dropped or erased: past the eight pictures a variant
-- keeps, the oldest it does not show is marked, and its file handed back for
-- n8n to remove.

-- ---------------------------------------------------------------- what was made

create table public.variant_pictures (
  id uuid primary key default gen_random_uuid(),
  variant_id uuid not null references public.ad_variants (id) on delete cascade,
  path text not null unique check (path ~ '^pictures/[0-9a-f-]{36}/[0-9a-f-]{36}\.(png|jpg|webp)$'),
  -- The scene the image model was asked for; n8n adds the brand's picture style.
  prompt text check (prompt is null or char_length(prompt) <= 2000),
  created_at timestamptz not null default now(),
  -- Past the eight a variant keeps: its file was handed back to be removed.
  removed_at timestamptz
);
create index variant_pictures_variant on public.variant_pictures (variant_id, created_at desc);

alter table public.variant_pictures enable row level security;
create policy "Team members read the pictures made for ads" on public.variant_pictures
  for select to authenticated using ((select private.is_team_member()));
revoke all on public.variant_pictures from anon, authenticated;
grant select on public.variant_pictures to authenticated;

-- The pictures variants show now are the first ones kept.
insert into public.variant_pictures (variant_id, path, prompt, created_at)
select v.id, v.picture_path, left(nullif(btrim(v.image_prompt), ''), 2000), v.updated_at
  from public.ad_variants v
 where v.picture_path is not null
on conflict (path) do nothing;

-- A file kept to choose from stays: a teammate removes only one that no
-- variant shows and nothing keeps.
alter policy "Team members remove ad pictures no variant shows" on storage.objects
  using (
    bucket_id = 'ad-pictures'
    and (select private.is_team_member())
    and not exists (select 1 from public.ad_variants v where v.picture_path = objects.name)
    and not exists (select 1 from public.variant_pictures p where p.path = objects.name and p.removed_at is null)
  );

-- ---------------------------------------------------------------- the image model

alter table public.team_settings
  add column pictures_model text not null default 'stand-in' check (pictures_model in ('stand-in', 'cloudflare')),
  add column cloudflare_account text check (cloudflare_account ~ '^[0-9a-f]{32}$');

-- Which image model makes the pictures, and the Cloudflare account it runs on.
-- Switching back to the stand-in keeps the account for next time.
create function public.set_pictures_model(p_model text, p_account text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := private.require_team_member();
  v_account text := lower(nullif(btrim(coalesce(p_account, '')), ''));
begin
  if p_model is null or p_model not in ('stand-in', 'cloudflare') then
    raise exception 'Pictures are made by the stand-in or by Cloudflare Workers AI';
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

-- ---------------------------------------------------------------- the team's asks

-- A person's prompt for a variant's picture, and an ask for a picture from it.
-- The prompt is the scene; the brand's picture style and the rules (no words,
-- no identifiable people, no flags) go with it when the image model is asked.
-- Up to 1,200 characters, so all of it fits the model's 2,048 with the style.
create function public.ask_for_picture(p_variant_id uuid, p_prompt text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_prompt text := btrim(coalesce(p_prompt, ''));
  v_variant public.ad_variants;
  v_run uuid;
begin
  perform private.require_team_member();
  if length(v_prompt) not between 1 and 1200 then
    raise exception 'Describe the picture in up to 1,200 characters';
  end if;
  select * into v_variant from public.ad_variants where id = p_variant_id for update;
  if not found then
    raise exception 'Variant % not found', p_variant_id;
  end if;
  v_run := public.run_of_variant(p_variant_id);
  if exists (select 1 from public.runs r where r.id = v_run and r.media_path is not null) then
    raise exception 'Variant % is made from the clip: the clip is its picture', v_variant.label;
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
     set image_prompt = v_prompt, picture_status = 'making', picture_requested_at = now(),
         picture_claimed_at = null, picture_error = null, picture_attempts = 0
   where id = p_variant_id;
  insert into public.run_events (run_id, text)
  values (v_run, 'A picture asked for variant ' || v_variant.label
                 || case when v_prompt is distinct from btrim(v_variant.image_prompt) then ', from a new prompt' else '' end);
end
$$;

-- A person shows one of a variant's earlier pictures again. Like a new
-- picture it takes the approval back; one still being made is stopped, and
-- joins the others when it arrives.
create function public.use_picture(p_variant_id uuid, p_picture_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_variant public.ad_variants;
  v_path text;
begin
  perform private.require_team_member();
  select * into v_variant from public.ad_variants where id = p_variant_id for update;
  if not found then
    raise exception 'Variant % not found', p_variant_id;
  end if;
  select p.path into v_path
    from public.variant_pictures p
   where p.id = p_picture_id and p.variant_id = p_variant_id and p.removed_at is null;
  if v_path is null then
    raise exception 'That picture is not one of variant %''s', v_variant.label;
  end if;
  if not exists (select 1 from storage.objects o where o.bucket_id = 'ad-pictures' and o.name = v_path) then
    raise exception 'That picture''s file is missing. Make another one';
  end if;
  if v_variant.picture_path = v_path and v_variant.picture_status <> 'making' then
    return;
  end if;
  -- Waiting to post: its picture, like its words, may not change.
  if exists (
    select 1 from public.posts p join public.post_targets t on t.post_id = p.id
     where p.variant_id = p_variant_id and t.status in ('scheduled', 'posting')) then
    raise exception 'Variant % is waiting to post. Cancel the post before changing it', v_variant.label;
  end if;
  update public.ad_variants
     set picture_path = v_path, picture_status = 'none', picture_error = null, picture_requested_at = null,
         picture_claimed_at = null, picture_attempts = 0,
         approved_at = case when v_variant.picture_path = v_path then approved_at end,
         approved_by = case when v_variant.picture_path = v_path then approved_by end,
         updated_at = now()
   where id = p_variant_id;
  if v_variant.picture_path is distinct from v_path then
    perform public.unapproved(v_variant, public.run_of_variant(p_variant_id), 'shows an earlier picture');
  end if;
end
$$;

-- A person stops a picture being made. The variant keeps what it shows; a
-- picture that arrives afterwards joins the earlier ones.
create function public.stop_picture(p_variant_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_label text;
begin
  perform private.require_team_member();
  update public.ad_variants
     set picture_status = 'none', picture_error = null, picture_requested_at = null,
         picture_claimed_at = null, picture_attempts = 0
   where id = p_variant_id and picture_status = 'making'
  returning label into v_label;
  if not found then
    raise exception 'No picture is being made for this variant';
  end if;
  insert into public.run_events (run_id, text)
  values (public.run_of_variant(p_variant_id), 'The picture for variant ' || v_label || ' was stopped');
end
$$;

-- As before: back to the drawn design, stopping any picture being made. The
-- picture stays with the variant's earlier ones to choose again, so no file is
-- handed back any more.
create or replace function public.remove_picture(p_variant_id uuid)
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
  return null;
end
$$;

-- ---------------------------------------------------------------- n8n

-- Eight pictures a variant are kept to choose from. Past that, the oldest one
-- it does not show is marked, and its file is handed back for n8n to remove.
create function public.prune_pictures(p_variant_id uuid)
returns text
language plpgsql
set search_path = ''
as $$
declare
  v_id uuid;
  v_path text;
begin
  if (select count(*) from public.variant_pictures where variant_id = p_variant_id and removed_at is null) <= 8 then
    return null;
  end if;
  select p.id, p.path into v_id, v_path
    from public.variant_pictures p
    join public.ad_variants v on v.id = p.variant_id
   where p.variant_id = p_variant_id and p.removed_at is null
     and p.path is distinct from v.picture_path
   order by p.created_at, p.id
   limit 1;
  update public.variant_pictures set removed_at = now() where id = v_id;
  return v_path;
end
$$;

-- As before, and each ask carries what the image model needs: the brand's
-- picture style (look), the team's image model and its Cloudflare account.
-- The path ends .png; n8n gives it the extension of what the model returns.
create or replace function public.picture_take_due(p_limit integer default 5)
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
           'look', (select b.picture_style from public.brand_profile b where b.id = 1),
           'model', coalesce(s.pictures_model, 'stand-in'),
           'account', s.cloudflare_account,
           'path', 'pictures/' || c.id::text || '/' || gen_random_uuid()::text || '.png'
         )), '[]'::jsonb)
    into v_out
    from claimed c
    left join public.team_settings s on s.id = 1;
  return v_out;
end
$$;

-- The picture is in Storage at p_path, and is kept with the variant's earlier
-- ones. When it answers the ask still open, the variant shows it and its
-- approval is taken back; scheduled meanwhile, what was approved goes out and
-- the picture waits with the others; stopped, it only joins them. The same
-- answer twice is kept once. Returns a file past the eight kept, for n8n to
-- remove, or a picture for a variant that no longer exists. A stand-in made
-- nothing: the open ask ends and says so.
create or replace function public.picture_finish(p_variant_id uuid, p_path text default null, p_stand_in boolean default false)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_was public.ad_variants;
  v_run uuid;
begin
  if p_path is null and not coalesce(p_stand_in, false) then
    raise exception 'No picture to record';
  end if;
  if p_path !~ ('^pictures/' || p_variant_id::text || '/[0-9a-f-]{36}\.(png|jpg|webp)$') then
    raise exception 'The picture is not where this variant''s pictures go';
  end if;

  select * into v_was from public.ad_variants where id = p_variant_id for update;
  if not found then
    return jsonb_build_object('remove_picture', p_path);
  end if;
  v_run := public.run_of_variant(p_variant_id);

  if p_path is null then
    if v_was.picture_status = 'making' then
      update public.ad_variants
         set picture_status = 'none', picture_claimed_at = null, picture_requested_at = null,
             picture_error = 'No picture was made: pictures are set to the stand-in. Choose an image model in Settings, Agents.'
       where id = p_variant_id;
      insert into public.run_events (run_id, text)
      values (v_run, 'No picture made for variant ' || v_was.label || ': pictures are set to the stand-in');
    end if;
    return jsonb_build_object('remove_picture', null);
  end if;

  if not exists (select 1 from storage.objects where bucket_id = 'ad-pictures' and name = p_path) then
    raise exception 'The picture has not finished uploading';
  end if;
  if exists (select 1 from public.variant_pictures where path = p_path) then
    return jsonb_build_object('remove_picture', null);
  end if;
  insert into public.variant_pictures (variant_id, path, prompt)
  values (p_variant_id, p_path, left(nullif(btrim(v_was.image_prompt), ''), 2000));

  if v_was.picture_status = 'making' then
    if exists (
      select 1 from public.posts p join public.post_targets t on t.post_id = p.id
       where p.variant_id = p_variant_id and t.status in ('scheduled', 'posting')) then
      update public.ad_variants
         set picture_status = 'none', picture_claimed_at = null, picture_requested_at = null,
             picture_error = 'The variant was scheduled while this picture was being made, so it waits with the earlier pictures. Choose it once the post has gone out.'
       where id = p_variant_id;
    else
      update public.ad_variants
         set picture_path = p_path, picture_status = 'none', picture_error = null,
             picture_requested_at = null, picture_claimed_at = null, picture_attempts = 0,
             approved_at = null, approved_by = null, updated_at = now()
       where id = p_variant_id;
      perform public.unapproved(v_was, v_run, 'has a new picture');
    end if;
  end if;
  return jsonb_build_object('remove_picture', public.prune_pictures(p_variant_id));
end
$$;

-- ---------------------------------------------------------------- access

revoke execute on function public.prune_pictures(uuid) from public, anon, authenticated;
grant execute on function public.prune_pictures(uuid) to service_role;

revoke execute on function
  public.set_pictures_model(text, text),
  public.ask_for_picture(uuid, text),
  public.use_picture(uuid, uuid),
  public.stop_picture(uuid)
from public, anon;
grant execute on function
  public.set_pictures_model(text, text),
  public.ask_for_picture(uuid, text),
  public.use_picture(uuid, uuid),
  public.stop_picture(uuid)
to authenticated, service_role;
