-- A picture ad's words can take a font and a colour of their own (the
-- client's feedback, 2026-10-22): lib/creative/design.ts is the app's rule,
-- and save_variant_design checks both again. Same arguments, so its grants
-- are kept.

create or replace function public.save_variant_design(p_variant_id uuid, p_design jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := private.require_team_member();
  v_variant public.ad_variants;
  v_run uuid;
  v_text jsonb;
begin
  select * into v_variant from public.ad_variants where id = p_variant_id for update;
  if not found then
    raise exception 'Variant % not found', p_variant_id;
  end if;
  select s.run_id into v_run from public.ad_sets s where s.id = v_variant.ad_set_id;

  if p_design is not null then
    if jsonb_typeof(p_design) <> 'object' or pg_column_size(p_design) >= 16384 then
      raise exception 'The design is not readable';
    end if;
    if jsonb_typeof(p_design -> 'logo') is distinct from 'boolean' then
      raise exception 'Say whether the logo shows';
    end if;
    if jsonb_typeof(p_design -> 'texts') is distinct from 'array' or jsonb_array_length(p_design -> 'texts') > 6 then
      raise exception 'Up to 6 texts on a picture';
    end if;
    for v_text in select value from jsonb_array_elements(p_design -> 'texts') loop
      if jsonb_typeof(v_text -> 'text') is distinct from 'string' or length(btrim(v_text ->> 'text')) not between 1 and 120 then
        raise exception 'Each text on the picture is 1 to 120 characters';
      end if;
    end loop;
    if p_design ? 'spots' and jsonb_typeof(p_design -> 'spots') <> 'object' then
      raise exception 'The layout is not readable';
    end if;
    if p_design ? 'font' and coalesce(p_design ->> 'font', '') <> all (array['lexend', 'oswald', 'montserrat', 'playfair']) then
      raise exception 'Pick one of the fonts offered';
    end if;
    if p_design ? 'color' and coalesce(p_design ->> 'color', '') !~ '^#[0-9a-f]{6}$' then
      raise exception 'Pick a colour for the words';
    end if;
  end if;

  if v_variant.design is not distinct from p_design then
    return;
  end if;
  if exists (
    select 1 from public.posts p join public.post_targets t on t.post_id = p.id
     where p.variant_id = p_variant_id and t.status in ('scheduled', 'posting')
  ) then
    raise exception 'Variant % is waiting to post. Cancel the post before changing it', v_variant.label;
  end if;

  update public.ad_variants
     set design = p_design, approved_at = null, approved_by = null, updated_at = now(), updated_by = v_user
   where id = p_variant_id;
  perform public.unapproved(v_variant, v_run, case when p_design is null then 'design put back' else 'design changed' end);
end
$$;
