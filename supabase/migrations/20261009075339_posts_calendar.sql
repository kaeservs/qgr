-- Moving a post on the calendar: a post that has not started going out can be
-- given another time in the team's zone, or sent now instead.

-- Returns the new time. Every place of the post must still be waiting: a post
-- partly sent, or one that failed, is not moved (Try again sends a failed
-- place). The places are locked first, so the publisher cannot be claiming
-- them while their time changes.
create function public.reschedule_post(p_post_id uuid, p_local_time text default null)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_post public.posts;
  v_tz text;
  v_when timestamptz;
  v_label text;
begin
  perform private.require_team_member();
  select * into v_post from public.posts where id = p_post_id for update;
  if not found then
    raise exception 'That post no longer exists';
  end if;
  perform 1 from public.post_targets where post_id = p_post_id for update;
  if exists (select 1 from public.post_targets where post_id = p_post_id and status <> 'scheduled') then
    raise exception 'Only a post that has not started going out can be moved';
  end if;

  select time_zone into v_tz from public.team_settings where id = 1;
  if p_local_time is null then
    v_when := now();
  else
    if p_local_time !~ '^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$' then
      raise exception 'The time is not readable';
    end if;
    v_when := p_local_time::timestamp at time zone v_tz;
    if v_when < now() - interval '1 minute' then
      raise exception 'Pick a time that has not passed';
    end if;
    if v_when > now() + interval '90 days' then
      raise exception 'Schedule up to 90 days ahead';
    end if;
  end if;

  update public.posts set scheduled_for = v_when where id = p_post_id;
  select label into v_label from public.ad_variants where id = v_post.variant_id;
  insert into public.run_events (run_id, text) values (
    public.run_of_variant(v_post.variant_id),
    case when p_local_time is null
      then format('Variant %s sent now instead of at its time', v_label)
      else format('Variant %s moved to %s', v_label, to_char(v_when at time zone v_tz, 'Dy FMDD Mon, HH24:MI'))
    end
  );
  return v_when;
end
$$;

revoke execute on function public.reschedule_post(uuid, text) from public, anon;
grant execute on function public.reschedule_post(uuid, text) to authenticated, service_role;
