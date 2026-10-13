-- Brand memory and posts written in full, part 1: the columns, and the team's
-- functions that change them. Nothing is dropped or replaced.
--
-- The brand profile gains what the team usually posts about (topics), how it
-- formats a post on each platform (post_formats) and how its pictures look
-- (picture_style). A variant carries its posts: the same idea written in full
-- for each place (a Facebook post, an Instagram caption with its hashtags, a
-- LinkedIn post) beside the short ad copy. save_variant stays for any open
-- page that still calls it; the studio now saves through save_variant_words.

alter table public.brand_profile
  add column topics text[] not null default '{}',
  add column post_formats jsonb not null default '{}'::jsonb check (jsonb_typeof(post_formats) = 'object'),
  add column picture_style text check (picture_style is null or char_length(picture_style) between 1 and 600);

alter table public.ad_variants
  add column posts jsonb not null default '{}'::jsonb check (jsonb_typeof(posts) = 'object');

-- What the team usually posts about, how it formats a post on each platform,
-- and how its pictures look. The voice and the rules stay with update_brand_profile.
create function public.update_brand_memory(p_topics text[], p_post_formats jsonb, p_picture_style text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_style text := nullif(btrim(coalesce(p_picture_style, '')), '');
  v_formats jsonb;
begin
  perform private.require_team_member();
  if coalesce(cardinality(p_topics), 0) > 12
     or exists (select 1 from unnest(p_topics) as t where coalesce(length(btrim(t)), 0) not between 1 and 80) then
    raise exception 'Up to 12 topics, each up to 80 characters';
  end if;
  if jsonb_typeof(p_post_formats) is distinct from 'object'
     or exists (
       select 1 from jsonb_each(p_post_formats) as e
        where e.key not in ('facebook', 'instagram', 'linkedin', 'x')
           or jsonb_typeof(e.value) <> 'string'
           or length(btrim(e.value #>> '{}')) not between 1 and 1000
     ) then
    raise exception 'Format notes go by platform, each up to 1,000 characters';
  end if;
  if length(v_style) > 600 then
    raise exception 'Keep the picture style under 600 characters';
  end if;
  select coalesce(jsonb_object_agg(e.key, btrim(e.value #>> '{}')), '{}'::jsonb) into v_formats
    from jsonb_each(p_post_formats) as e;

  -- Topics are trimmed and kept once each, in the order given.
  update public.brand_profile
     set topics = array(
           select x.t from (
             select btrim(u.t) as t, min(u.n) as n
               from unnest(coalesce(p_topics, '{}')) with ordinality as u(t, n)
              group by btrim(u.t)
           ) as x
           order by x.n),
         post_formats = v_formats,
         picture_style = v_style,
         updated_at = now()
   where id = 1;
end
$$;

-- A person's edit to a variant: the words on its image, its ad copy and its
-- posts, in one go. The same checks as save_variant, and the posts: one per
-- place the run posts to, each up to 3,000 characters. A place left out goes
-- out with the ad copy. Any change takes the approval back; one waiting to
-- post cannot change until its post is cancelled.
create function public.save_variant_words(p_variant_id uuid, p_creative_text text, p_copy jsonb, p_posts jsonb, p_warnings text[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := private.require_team_member();
  v_variant public.ad_variants;
  v_platforms text[];
  v_run uuid;
  v_platform text;
  v_entry jsonb;
  v_posts jsonb;
begin
  select * into v_variant from public.ad_variants where id = p_variant_id for update;
  if not found then
    raise exception 'Variant % not found', p_variant_id;
  end if;
  select r.id, r.platforms into v_run, v_platforms
    from public.ad_sets s
    join public.runs r on r.id = s.run_id
   where s.id = v_variant.ad_set_id;

  if coalesce(length(btrim(p_creative_text)), 0) not between 1 and 120 then
    raise exception 'The image text needs 1 to 120 characters';
  end if;
  if jsonb_typeof(p_copy) is distinct from 'object' then
    raise exception 'The copy must be keyed by platform';
  end if;
  if exists (select 1 from jsonb_object_keys(p_copy) as k where not (k = any (v_platforms))) then
    raise exception 'The copy names a platform this run did not ask for';
  end if;
  foreach v_platform in array v_platforms loop
    v_entry := p_copy -> v_platform;
    if jsonb_typeof(v_entry) is distinct from 'object' then
      raise exception 'The % copy is missing', v_platform;
    end if;
    if exists (
      select 1 from jsonb_each(v_entry) as e
       where e.key not in ('text', 'headline', 'description', 'cta') or jsonb_typeof(e.value) <> 'string'
    ) then
      raise exception 'The % copy has a field it should not', v_platform;
    end if;
    if coalesce(length(btrim(v_entry ->> 'text')), 0) not between 1 and 3000
       or coalesce(length(btrim(v_entry ->> 'headline')), 0) not between 1 and 300
       or coalesce(length(v_entry ->> 'description'), 0) > 300
       or coalesce(length(v_entry ->> 'cta'), 0) > 40 then
      raise exception 'The % copy is empty or too long', v_platform;
    end if;
  end loop;

  if jsonb_typeof(p_posts) is distinct from 'object' then
    raise exception 'The posts must be keyed by place';
  end if;
  if exists (
    select 1 from jsonb_each(p_posts) as e
     where e.key not in ('facebook', 'instagram', 'linkedin')
        or not ((case e.key when 'linkedin' then 'linkedin' else 'meta' end) = any (v_platforms))
  ) then
    raise exception 'A post is for a place this run does not post to';
  end if;
  if exists (
    select 1 from jsonb_each(p_posts) as e
     where jsonb_typeof(e.value) <> 'string' or length(btrim(e.value #>> '{}')) not between 1 and 3000
  ) then
    raise exception 'A post is empty or over 3,000 characters';
  end if;
  select coalesce(jsonb_object_agg(e.key, btrim(e.value #>> '{}')), '{}'::jsonb) into v_posts
    from jsonb_each(p_posts) as e;

  if coalesce(cardinality(p_warnings), 0) > 50
     or exists (select 1 from unnest(p_warnings) as w where coalesce(length(w), 0) not between 1 and 200) then
    raise exception 'The guardrail flags are not valid';
  end if;

  if v_variant.creative_text = btrim(p_creative_text) and v_variant.copy = p_copy and v_variant.posts = v_posts then
    return;
  end if;
  if exists (
    select 1 from public.posts p join public.post_targets t on t.post_id = p.id
     where p.variant_id = p_variant_id and t.status in ('scheduled', 'posting')
  ) then
    raise exception 'Variant % is waiting to post. Cancel the post before changing it', v_variant.label;
  end if;

  update public.ad_variants
     set creative_text = btrim(p_creative_text),
         copy = p_copy,
         posts = v_posts,
         warnings = coalesce(p_warnings, '{}'),
         approved_at = null,
         approved_by = null,
         updated_at = now(),
         updated_by = v_user
   where id = p_variant_id;
  perform public.unapproved(v_variant, v_run, 'edited');
end
$$;

revoke execute on function
  public.update_brand_memory(text[], jsonb, text),
  public.save_variant_words(uuid, text, jsonb, jsonb, text[])
from public, anon;
grant execute on function
  public.update_brand_memory(text[], jsonb, text),
  public.save_variant_words(uuid, text, jsonb, jsonb, text[])
to authenticated, service_role;
