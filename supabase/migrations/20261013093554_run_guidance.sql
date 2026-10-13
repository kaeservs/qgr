-- The team's direction for a run: what they want the agents to make of it
-- ("this clip is for families; focus on hooks about due diligence"). Optional
-- plain text, given to every agent on the run; the brand's rules still win.
alter table public.runs
  add column guidance text check (guidance is null or char_length(guidance) between 1 and 2000);

-- Sets a run's direction before any agent has started on it: the app calls it
-- right after create_run, before it hands the run to n8n. A separate function,
-- so create_run keeps its signature and every caller of it stays as it is.
create function public.set_run_guidance(p_run_id uuid, p_guidance text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := private.require_team_member();
  v_guidance text := nullif(btrim(p_guidance), '');
begin
  if char_length(v_guidance) > 2000 then
    raise exception 'Keep the direction for the agents under 2,000 characters';
  end if;
  if not exists (select 1 from public.runs where id = p_run_id) then
    raise exception 'Run % not found', p_run_id;
  end if;
  if exists (select 1 from public.run_stages where run_id = p_run_id and status not in ('queued', 'skipped')) then
    raise exception 'The agents have started on this run, so its direction is set';
  end if;
  update public.runs set guidance = v_guidance where id = p_run_id;
end
$$;

revoke execute on function public.set_run_guidance(uuid, text) from public, anon;
grant execute on function public.set_run_guidance(uuid, text) to authenticated, service_role;
