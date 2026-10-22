-- Deleting a run or a post (the team's ask, 2026-10-22). Both are a mark,
-- as brand examples and AI videos are: the row stays, so the leads tied to a
-- run's variants, the month's Higgsfield spending and a post's history keep
-- what they rest on, and the dashboard leaves it out. Anything still waiting
-- to go out is cancelled first; something going out right now, or an agent at
-- work, refuses it.

alter table public.runs add column removed_at timestamptz;
alter table public.posts add column removed_at timestamptz;

-- Whether a run's agents are at work: one is running, or the pipeline is
-- between agents (a stage queued, not held for a person, none failed) and it
-- moved in the last half hour. A run stuck longer than that can be deleted.
create function private.run_at_work(p_run_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (select 1 from public.run_stages where run_id = p_run_id and status = 'running')
      or (
        exists (select 1 from public.run_stages where run_id = p_run_id and status = 'queued' and waiting_since is null)
        and not exists (select 1 from public.run_stages where run_id = p_run_id and status = 'failed')
        and (
          select greatest(r.created_at, max(s.finished_at))
            from public.runs r left join public.run_stages s on s.run_id = r.id
           where r.id = p_run_id
           group by r.created_at
        ) > now() - interval '30 minutes'
      )
$$;
revoke all on function private.run_at_work(uuid) from public, anon, authenticated;

-- Sets a post aside: its places still waiting are cancelled, and it leaves the
-- dashboard. Refused while a place is going out. Returns the files no open
-- post needs any more, for the app to remove from Storage. A place already
-- posted stays on its platform: only the dashboard forgets it.
create function public.remove_post(p_post_id uuid)
returns text[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_variant uuid;
  v_paths text[];
begin
  perform private.require_team_member();
  select variant_id into v_variant from public.posts where id = p_post_id and removed_at is null for update;
  if v_variant is null then
    raise exception 'Post % not found', p_post_id;
  end if;
  perform 1 from public.post_targets where post_id = p_post_id for update;
  if exists (select 1 from public.post_targets where post_id = p_post_id and status = 'posting') then
    raise exception 'This post is going out right now: wait for it to finish, then delete it';
  end if;
  with stopped as (
    update public.post_targets
       set status = 'cancelled', updated_at = now()
     where post_id = p_post_id and status in ('scheduled', 'failed', 'unknown')
    returning media_path
  )
  select array_agg(distinct media_path) filter (where media_path is not null) into v_paths from stopped;
  update public.posts set removed_at = now() where id = p_post_id;
  insert into public.run_events (run_id, text) values (public.run_of_variant(v_variant), 'A post was deleted');
  return coalesce(array(
    select p from unnest(v_paths) as p
     where not exists (
       select 1 from public.post_targets t
        where t.media_path = p and t.status in ('scheduled', 'posting', 'failed', 'unknown'))
  ), '{}');
end
$$;
revoke all on function public.remove_post(uuid) from public, anon;
grant execute on function public.remove_post(uuid) to authenticated;

-- Sets a run aside with its posts: every place still waiting is cancelled,
-- pictures and AI videos not yet sent are stopped (nothing is spent on a run
-- that is gone), and the run leaves the dashboard. Refused while its agents
-- are at work or one of its posts is going out. Returns the files no open post
-- needs any more.
create function public.remove_run(p_run_id uuid)
returns text[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_paths text[];
begin
  perform private.require_team_member();
  perform 1 from public.runs where id = p_run_id and removed_at is null for update;
  if not found then
    raise exception 'Run % not found', p_run_id;
  end if;
  if private.run_at_work(p_run_id) then
    raise exception 'An agent is working on this run: wait for it to finish, then delete it';
  end if;
  perform 1 from public.post_targets t
    join public.posts p on p.id = t.post_id
    join public.ad_variants v on v.id = p.variant_id
    join public.ad_sets s on s.id = v.ad_set_id
   where s.run_id = p_run_id
     for update of t;
  if exists (
    select 1 from public.post_targets t
      join public.posts p on p.id = t.post_id
      join public.ad_variants v on v.id = p.variant_id
      join public.ad_sets s on s.id = v.ad_set_id
     where s.run_id = p_run_id and t.status = 'posting'
  ) then
    raise exception 'A post from this run is going out right now: wait for it to finish, then delete the run';
  end if;

  with stopped as (
    update public.post_targets t
       set status = 'cancelled', updated_at = now()
      from public.posts p, public.ad_variants v, public.ad_sets s
     where t.post_id = p.id and p.variant_id = v.id and v.ad_set_id = s.id
       and s.run_id = p_run_id and t.status in ('scheduled', 'failed', 'unknown')
    returning t.media_path
  )
  select array_agg(distinct media_path) filter (where media_path is not null) into v_paths from stopped;

  update public.posts p
     set removed_at = now()
    from public.ad_variants v, public.ad_sets s
   where p.variant_id = v.id and v.ad_set_id = s.id and s.run_id = p_run_id and p.removed_at is null;

  -- Pictures and videos nobody has sent yet are stopped; one already sent finishes.
  update public.ad_variants v
     set picture_status = 'none', picture_error = null, picture_requested_at = null,
         picture_claimed_at = null, picture_attempts = 0
    from public.ad_sets s
   where v.ad_set_id = s.id and s.run_id = p_run_id
     and v.picture_status = 'making' and v.picture_claimed_at is null;
  update public.ai_videos a
     set status = 'failed', finished_at = now(), error = 'Not sent: its run was deleted.'
    from public.ad_variants v, public.ad_sets s
   where a.variant_id = v.id and v.ad_set_id = s.id and s.run_id = p_run_id
     and a.status = 'asked' and a.claimed_at is null;

  update public.runs set removed_at = now() where id = p_run_id;
  insert into public.run_events (run_id, text) values (p_run_id, 'The run was deleted');
  return coalesce(array(
    select p from unnest(v_paths) as p
     where not exists (
       select 1 from public.post_targets t
        where t.media_path = p and t.status in ('scheduled', 'posting', 'failed', 'unknown'))
  ), '{}');
end
$$;
revoke all on function public.remove_run(uuid) from public, anon;
grant execute on function public.remove_run(uuid) to authenticated;
