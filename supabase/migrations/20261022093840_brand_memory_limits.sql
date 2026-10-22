-- Brand memory takes far more (the team asked for no limit, 2026-10-22):
-- what you offer and who it is for, format notes and pasted posts up to
-- 10,000 characters, a picture style up to 4,000, notes up to 2,000, up to 40
-- topics, 30 guardrails and 12 voice words. Every agent call sends it, so it
-- stays bounded; names, the website and the X handle keep theirs.

alter table public.brand_profile drop constraint brand_profile_picture_style_check;
alter table public.brand_profile add constraint brand_profile_picture_style_check
  check (picture_style is null or char_length(picture_style) between 1 and 4000);
alter table public.brand_examples drop constraint brand_examples_note_check;
alter table public.brand_examples add constraint brand_examples_note_check
  check (note is null or char_length(note) between 1 and 2000);
alter table public.brand_examples drop constraint brand_examples_text_check;
alter table public.brand_examples add constraint brand_examples_text_check
  check (char_length(text) between 1 and 10000);

create or replace function public.update_brand_profile(p_company text, p_website text, p_offer text, p_audience text, p_voice text[], p_guardrails text[], p_page_name text, p_x_handle text)
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_handle text := btrim(coalesce(p_x_handle, ''));
begin
  perform private.require_team_member();
  if coalesce(length(btrim(p_company)), 0) not between 1 and 120
     or coalesce(length(btrim(p_website)), 0) not between 1 and 200
     or coalesce(length(btrim(p_offer)), 0) not between 1 and 10000
     or coalesce(length(btrim(p_audience)), 0) not between 1 and 10000
     or coalesce(length(btrim(p_page_name)), 0) not between 1 and 80 then
    raise exception 'Every field needs a value, within its length';
  end if;
  if v_handle !~ '^@?[A-Za-z0-9_]{1,15}$' then
    raise exception 'The X handle should look like @quantumglobal';
  end if;
  if coalesce(cardinality(p_voice), 0) not between 1 and 12
     or exists (select 1 from unnest(p_voice) as v where coalesce(length(btrim(v)), 0) not between 1 and 60) then
    raise exception 'Pick one to twelve words for the voice';
  end if;
  if coalesce(cardinality(p_guardrails), 0) > 30
     or exists (select 1 from unnest(p_guardrails) as g where coalesce(length(btrim(g)), 0) not between 1 and 1000) then
    raise exception 'Up to 30 guardrails, each up to 1,000 characters';
  end if;

  update public.brand_profile
     set company = btrim(p_company),
         website = btrim(p_website),
         offer = btrim(p_offer),
         audience = btrim(p_audience),
         voice = array(select btrim(v) from unnest(p_voice) with ordinality as t(v, n) order by n),
         guardrails = array(select btrim(g) from unnest(coalesce(p_guardrails, '{}')) with ordinality as t(g, n) order by n),
         page_name = btrim(p_page_name),
         x_handle = case when left(v_handle, 1) = '@' then v_handle else '@' || v_handle end,
         updated_at = now()
   where id = 1;
end
$function$;

create or replace function public.update_brand_memory(p_topics text[], p_post_formats jsonb, p_picture_style text)
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_style text := nullif(btrim(coalesce(p_picture_style, '')), '');
  v_formats jsonb;
begin
  perform private.require_team_member();
  if coalesce(cardinality(p_topics), 0) > 40
     or exists (select 1 from unnest(p_topics) as t where coalesce(length(btrim(t)), 0) not between 1 and 300) then
    raise exception 'Up to 40 topics, each up to 300 characters';
  end if;
  if jsonb_typeof(p_post_formats) is distinct from 'object'
     or exists (
       select 1 from jsonb_each(p_post_formats) as e
        where e.key not in ('facebook', 'instagram', 'linkedin', 'x')
           or jsonb_typeof(e.value) <> 'string'
           or length(btrim(e.value #>> '{}')) not between 1 and 10000
     ) then
    raise exception 'Format notes go by platform, each up to 10,000 characters';
  end if;
  if length(v_style) > 4000 then
    raise exception 'Keep the picture style under 4,000 characters';
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
$function$;

create or replace function public.add_brand_example(p_place text, p_text text, p_note text default null::text)
 returns uuid
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_user uuid := private.require_team_member();
  v_id uuid;
begin
  if p_place is null or p_place not in ('facebook', 'instagram', 'linkedin', 'x') then
    raise exception 'A post that works is from Facebook, Instagram, LinkedIn or X';
  end if;
  if coalesce(length(btrim(p_text)), 0) not between 1 and 10000 then
    raise exception 'Paste the post, up to 10,000 characters';
  end if;
  if length(btrim(p_note)) > 2000 then
    raise exception 'Keep the note under 2,000 characters';
  end if;
  if (select count(*) from public.brand_examples where removed_at is null) >= 60 then
    raise exception 'Brand memory keeps up to 60 posts. Remove one first';
  end if;
  insert into public.brand_examples (place, text, note, source, created_by)
  values (p_place, btrim(p_text), nullif(btrim(coalesce(p_note, '')), ''), 'pasted', v_user)
  returning id into v_id;
  return v_id;
end
$function$;

create or replace function public.remember_post(p_post_id uuid, p_place text, p_note text default null::text)
 returns uuid
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_user uuid := private.require_team_member();
  v_text text;
  v_id uuid;
  v_removed timestamptz;
begin
  select t.text into v_text
    from public.post_targets t
   where t.post_id = p_post_id and t.place = p_place and t.status = 'posted';
  if v_text is null then
    raise exception 'Only a post that went out can be kept as one that works';
  end if;
  if length(btrim(p_note)) > 2000 then
    raise exception 'Keep the note under 2,000 characters';
  end if;
  select id, removed_at into v_id, v_removed from public.brand_examples where post_id = p_post_id and place = p_place;
  if v_id is not null and v_removed is null then
    raise exception 'That post is already in brand memory';
  end if;
  if (select count(*) from public.brand_examples where removed_at is null) >= 60 then
    raise exception 'Brand memory keeps up to 60 posts. Remove one first';
  end if;
  if v_id is not null then
    update public.brand_examples
       set removed_at = null,
           note = coalesce(nullif(btrim(coalesce(p_note, '')), ''), note),
           created_by = v_user,
           created_at = now()
     where id = v_id;
    return v_id;
  end if;
  insert into public.brand_examples (place, text, note, source, post_id, created_by)
  values (p_place, v_text, nullif(btrim(coalesce(p_note, '')), ''), 'marked', p_post_id, v_user)
  returning id into v_id;
  return v_id;
end
$function$;
