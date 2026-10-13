-- Posting for real, a place at a time. Each place's switch says whether its
-- posts go out on the platform (n8n's real steps, with the credential the team
-- attached there) or through the stand-in, as until now. Off by default: a
-- place goes live only when someone turns it on in Settings, with its Page
-- set, and a Page taken away turns its place off again. publisher_take_due
-- hands the choice to n8n with each place, so a switch takes effect at the
-- next post. Nothing is dropped or replaced but in place.

alter table public.team_settings
  add column facebook_live boolean not null default false,
  add column instagram_live boolean not null default false,
  add column linkedin_live boolean not null default false;

-- Whether a place's posts go out for real. On needs the place's Page (or
-- Instagram account) set under Where posts go.
create function public.set_post_for_real(p_place text, p_on boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := private.require_team_member();
  v_settings public.team_settings;
begin
  if p_place is null or p_place not in ('facebook', 'instagram', 'linkedin') then
    raise exception 'Posts go to Facebook, Instagram or LinkedIn';
  end if;
  if p_on is null then
    raise exception 'Say whether % posts go out for real', public.place_name(p_place);
  end if;
  select * into v_settings from public.team_settings where id = 1 for update;
  if p_on and (case p_place
                 when 'facebook' then v_settings.facebook_page_id
                 when 'instagram' then v_settings.instagram_account_id
                 else v_settings.linkedin_org_id
               end) is null then
    raise exception '%', case p_place
      when 'facebook' then 'Set the Facebook Page under Where posts go first'
      when 'instagram' then 'Set the Instagram account under Where posts go first'
      else 'Set the LinkedIn Page under Where posts go first'
    end;
  end if;
  update public.team_settings
     set facebook_live = case when p_place = 'facebook' then p_on else facebook_live end,
         instagram_live = case when p_place = 'instagram' then p_on else instagram_live end,
         linkedin_live = case when p_place = 'linkedin' then p_on else linkedin_live end,
         updated_at = now(), updated_by = v_user
   where id = 1;
end
$$;

-- As before; a place whose Page is taken away stops posting for real.
create or replace function public.update_publishing_settings(
  p_facebook_page_id text,
  p_facebook_page_name text,
  p_instagram_account_id text,
  p_instagram_username text,
  p_linkedin_org_id text,
  p_linkedin_page_name text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := private.require_team_member();
begin
  update public.team_settings
     set facebook_page_id = nullif(btrim(p_facebook_page_id), ''),
         facebook_page_name = nullif(btrim(p_facebook_page_name), ''),
         instagram_account_id = nullif(btrim(p_instagram_account_id), ''),
         instagram_username = nullif(ltrim(btrim(p_instagram_username), '@'), ''),
         linkedin_org_id = nullif(btrim(p_linkedin_org_id), ''),
         linkedin_page_name = nullif(btrim(p_linkedin_page_name), ''),
         facebook_live = facebook_live and nullif(btrim(p_facebook_page_id), '') is not null,
         instagram_live = instagram_live and nullif(btrim(p_instagram_account_id), '') is not null,
         linkedin_live = linkedin_live and nullif(btrim(p_linkedin_org_id), '') is not null,
         updated_at = now(),
         updated_by = v_user
   where id = 1;
end
$$;

-- As before, and each place says whether it goes out for real (live) or
-- through its stand-in.
create or replace function public.publisher_take_due(p_limit integer default 10)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_out jsonb;
begin
  with lost as (
    update public.post_targets t
       set status = 'unknown', updated_at = now(),
           error = 'The publisher stopped while sending this. Check the Page before trying again.'
     where t.status = 'posting' and t.claimed_at < now() - interval '15 minutes'
    returning t.post_id, t.place
  )
  insert into public.run_events (run_id, text)
  select public.run_of_variant(p.variant_id), 'Not sure the ' || public.place_name(l.place) || ' post went out: check the Page'
    from lost l join public.posts p on p.id = l.post_id;

  with due as (
    select t.post_id, t.place
      from public.post_targets t
      join public.posts p on p.id = t.post_id
     where t.status = 'scheduled' and p.scheduled_for <= now()
     order by p.scheduled_for
     limit greatest(p_limit, 0)
       for update of t skip locked
  ), claimed as (
    update public.post_targets t
       set status = 'posting', claimed_at = now(), attempts = t.attempts + 1, updated_at = now()
      from due
     where t.post_id = due.post_id and t.place = due.place
    returning t.post_id, t.place, t.text, t.media_path, t.media_kind
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'post_id', c.post_id,
           'place', c.place,
           'text', c.text,
           'media_path', c.media_path,
           'media_kind', c.media_kind,
           'live', case c.place when 'facebook' then s.facebook_live when 'instagram' then s.instagram_live else s.linkedin_live end,
           'page', case c.place
             when 'facebook' then jsonb_build_object('id', s.facebook_page_id, 'name', s.facebook_page_name)
             when 'instagram' then jsonb_build_object('id', s.instagram_account_id, 'name', s.instagram_username)
             else jsonb_build_object('id', s.linkedin_org_id, 'name', s.linkedin_page_name)
           end
         ) order by c.post_id, c.place), '[]'::jsonb)
    into v_out
    from claimed c
    cross join public.team_settings s
   where s.id = 1;
  return v_out;
end
$$;

revoke execute on function public.set_post_for_real(text, boolean) from public, anon;
grant execute on function public.set_post_for_real(text, boolean) to authenticated, service_role;
