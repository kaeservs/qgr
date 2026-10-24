-- How content is made, as Do's and Don'ts (the client's ask, 2026-10-24): each
-- list of rules (words, pictures, videos) keeps what the AI does, and gains a
-- list of hard no's it never does, whatever the run's direction or material
-- says. copy_rules, picture_rules and video_rules are the Do's; the new
-- columns are the Don'ts. The seeded rules are split into the two where the
-- team has not changed them (each list is compared with its seed); a list the
-- team changed is left as they wrote it, with no Don'ts.

alter table public.brand_profile
  add column copy_donts text[] not null default '{}',
  add column picture_donts text[] not null default '{}',
  add column video_donts text[] not null default '{}';

alter table public.brand_profile add constraint brand_profile_copy_donts_check check (cardinality(copy_donts) <= 30);
alter table public.brand_profile add constraint brand_profile_picture_donts_check check (cardinality(picture_donts) <= 30);
alter table public.brand_profile add constraint brand_profile_video_donts_check check (cardinality(video_donts) <= 30);

update public.brand_profile set
  copy_rules = array[
    'Write for the family seeing the ad: an Indian family thinking about a future in the U.S. They understand it at first glance, from the picture and its words alone.',
    'The words on the picture say plainly what the ad is about (EB-5, a U.S. Green Card, studying, working or living in the U.S.) in everyday words.',
    'Positive marketing: every hook, headline, image line and post leads with what the family gains: the future, the opportunity, Quantum Global''s guidance and support.',
    'Where a competitor''s hook is built on a pain, answer the hope behind it.',
    'Say what Quantum Global reviews and explains for the family.',
    'Call the company Quantum Global (or Quantum Global Residency).',
    'Write U.S., with the dots.'
  ],
  copy_donts = array[
    'Open on a problem, a worry or what the reader lacks ("shouldn''t", "doesn''t depend on", "tired of", "uncertainty").',
    '"X, not Y" or "without..." contrasts that imply other advisors pressure, rush or fail people ("not pressure", "rather than a sales pitch").',
    'Knock other advisors or programs.',
    'Say that EB-5 is an investment with risk.',
    'Say or imply that Quantum Global turns projects down or filters them out ("before it reaches you").',
    'Call the company QGR.',
    'Write US without the dots.',
    'Clever wordplay or jargon on the picture.'
  ]
where id = 1 and cardinality(copy_rules) = 8 and copy_rules[1] = 'Write for the family seeing the ad: an Indian family thinking about a future in the U.S. They should understand it at first glance, from the picture and its words alone.' and copy_rules[7] = 'Call the company Quantum Global (or Quantum Global Residency), never QGR.';

update public.brand_profile set
  picture_rules = array[
    'A real photograph, as a documentary or lifestyle photographer would take it: natural light, real skin, hands and textures, candid and unposed, honest emotion.',
    'The people are Indian: Indian families, parents, children, students and professionals, as most of Quantum Global''s clients are.',
    'People interact with each other (embracing, playing, laughing, talking) in a moment the family lives or hopes for.',
    'It reads as a life in the U.S. at a glance: a U.S. landmark or city skyline softly behind, a U.S. campus, or a home or street that looks American.',
    'A U.S. flag or quiet props such as passports, a folder or a gavel may appear.',
    'Quantum Global''s indigo (#1C1B9D) and gold (#EFB74A) only as small natural touches: clothing, a cushion, evening light.'
  ],
  picture_donts = array[
    'An illustration, a 3D render or a stock-photo pose.',
    'People posing or looking at the camera.',
    'Writing on a flag, a passport, a folder or any prop.',
    'The brand''s colours as a tint over the picture.'
  ]
where id = 1 and cardinality(picture_rules) = 6 and picture_rules[1] like 'A real photograph, as a documentary or lifestyle photographer would take it:%Not an illustration, a 3D render or a stock-photo pose.';

update public.brand_profile set
  video_rules = array[
    'One continuous shot: the scene and how the camera moves.',
    'People seen from behind, in profile with the face not shown, at a distance or as hands.',
    'It reads as a life in the U.S. at a glance.'
  ],
  video_donts = array[
    'A face anyone could recognise.',
    'Flags.'
  ]
where id = 1 and video_rules = array['One continuous shot: the scene and how the camera moves.', 'No identifiable people: seen from behind, in profile with the face not shown, at a distance or as hands.', 'No flags.', 'It reads as a life in the U.S. at a glance.'];

-- Every list at once, Do's and Don'ts: a new name, since the arguments grew
-- (update_content_rules stays for a page opened before, and leaves the
-- Don'ts as they are).
create or replace function public.save_content_rules(
  p_copy_do text[], p_copy_dont text[],
  p_picture_do text[], p_picture_dont text[],
  p_video_do text[], p_video_dont text[],
  p_flag_phrases text[])
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $function$
begin
  perform private.require_team_member();
  if greatest(coalesce(cardinality(p_copy_do), 0), coalesce(cardinality(p_copy_dont), 0), coalesce(cardinality(p_picture_do), 0),
              coalesce(cardinality(p_picture_dont), 0), coalesce(cardinality(p_video_do), 0), coalesce(cardinality(p_video_dont), 0)) > 30
     or exists (select 1 from unnest(coalesce(p_copy_do, '{}') || coalesce(p_copy_dont, '{}') || coalesce(p_picture_do, '{}')
                                     || coalesce(p_picture_dont, '{}') || coalesce(p_video_do, '{}') || coalesce(p_video_dont, '{}')) as r
                 where coalesce(length(btrim(r)), 0) not between 1 and 1000) then
    raise exception 'Up to 30 rules in each list, each up to 1,000 characters';
  end if;
  if coalesce(cardinality(p_flag_phrases), 0) > 80
     or exists (select 1 from unnest(coalesce(p_flag_phrases, '{}')) as f where coalesce(length(btrim(f)), 0) not between 2 and 60) then
    raise exception 'Up to 80 phrases to flag, each 2 to 60 characters';
  end if;

  update public.brand_profile
     set copy_rules = array(select btrim(r) from unnest(coalesce(p_copy_do, '{}')) with ordinality as t(r, n) order by n),
         copy_donts = array(select btrim(r) from unnest(coalesce(p_copy_dont, '{}')) with ordinality as t(r, n) order by n),
         picture_rules = array(select btrim(r) from unnest(coalesce(p_picture_do, '{}')) with ordinality as t(r, n) order by n),
         picture_donts = array(select btrim(r) from unnest(coalesce(p_picture_dont, '{}')) with ordinality as t(r, n) order by n),
         video_rules = array(select btrim(r) from unnest(coalesce(p_video_do, '{}')) with ordinality as t(r, n) order by n),
         video_donts = array(select btrim(r) from unnest(coalesce(p_video_dont, '{}')) with ordinality as t(r, n) order by n),
         flag_phrases = array(select distinct on (lower(btrim(f))) btrim(f) from unnest(coalesce(p_flag_phrases, '{}')) as f),
         updated_at = now()
   where id = 1;
end
$function$;

revoke all on function public.save_content_rules(text[], text[], text[], text[], text[], text[], text[]) from public, anon;
grant execute on function public.save_content_rules(text[], text[], text[], text[], text[], text[], text[]) to authenticated;

-- As before, and each ask carries the team's picture Don'ts beside its Do's.
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
       and not exists (
         select 1 from public.ad_sets s join public.run_references r on r.run_id = s.run_id
          where s.id = v.ad_set_id and r.status = 'waiting')
     order by v.picture_requested_at nulls first
     limit greatest(p_limit, 0)
       for update skip locked
  ), claimed as (
    update public.ad_variants v
       set picture_claimed_at = now(), picture_attempts = v.picture_attempts + 1
      from due
     where v.id = due.id
    returning v.id, v.label, v.image_prompt, v.creative_style, v.ad_set_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'variant_id', c.id,
           'label', c.label,
           'prompt', c.image_prompt,
           'style', c.creative_style,
           'look', (select b.picture_style from public.brand_profile b where b.id = 1),
           'rules', (select to_jsonb(b.picture_rules) from public.brand_profile b where b.id = 1),
           'donts', (select to_jsonb(b.picture_donts) from public.brand_profile b where b.id = 1),
           'model', case when refs.ids is not null then 'higgsfield' else coalesce(s.pictures_model, 'stand-in') end,
           'account', s.cloudflare_account,
           'quality', coalesce(s.pictures_quality, 'low'),
           'path', 'pictures/' || c.id::text || '/' || gen_random_uuid()::text || '.png',
           'references', coalesce(refs.ids, '[]'::jsonb)
         )), '[]'::jsonb)
    into v_out
    from claimed c
    left join lateral (
      select jsonb_agg(r.media_id order by r.position) as ids
        from public.ad_sets a join public.run_references r on r.run_id = a.run_id
       where a.id = c.ad_set_id and r.status = 'ready'
    ) refs on true
    left join public.team_settings s on s.id = 1;
  return v_out;
end
$$;
