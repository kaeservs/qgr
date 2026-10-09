-- A picture that arrives after its ask was stopped in the studio, or after
-- another picture already answered it, is handed back for n8n to remove
-- instead of failing the run, so Storage keeps no file that no variant shows.
-- Never the picture the variant shows: n8n sending the same answer twice
-- changes nothing. A stand-in answering an ask nobody waits for changes
-- nothing either.
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
  if not found or v_was.picture_status <> 'making' then
    return jsonb_build_object('remove_picture', case when p_path is distinct from v_was.picture_path then p_path end);
  end if;
  v_run := public.run_of_variant(p_variant_id);

  if p_path is null then
    update public.ad_variants
       set picture_status = 'none', picture_claimed_at = null, picture_requested_at = null,
           picture_error = 'No picture was made: the image model is not connected yet, so the design is drawn.'
     where id = p_variant_id;
    insert into public.run_events (run_id, text)
    values (v_run, 'No picture made for variant ' || v_was.label || ': the image model is not connected yet');
    return jsonb_build_object('remove_picture', null);
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

revoke execute on function public.picture_finish(uuid, text, boolean) from public, anon, authenticated;
grant execute on function public.picture_finish(uuid, text, boolean) to service_role;
