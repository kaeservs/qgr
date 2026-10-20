-- Two things learnt from Higgsfield's MCP while building AI video:
--
-- * Its server sometimes answers 502 (twice in ten calls on 2026-10-20). When
--   n8n could not even connect, the ask never reached Higgsfield and nothing
--   was spent, so it goes back to wait for the next minute (video_release),
--   three tries at most. Any other trouble after sending stays 'unknown'.
-- * A video follows the brand's picture style, as the ads' pictures do: n8n
--   gets it with each ask (look).

alter table public.ai_videos
  add column tries smallint not null default 0;

create or replace function public.video_take_due(p_limit integer default 3)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_out jsonb;
begin
  update public.ai_videos
     set status = 'unknown', finished_at = now(),
         error = 'n8n stopped while sending it. Check Higgsfield''s history before asking again.'
   where status = 'asked' and claimed_at < now() - interval '10 minutes';

  with due as (
    select v.id
      from public.ai_videos v
     where v.status = 'asked' and v.claimed_at is null
     order by v.asked_at
     limit greatest(p_limit, 0)
       for update skip locked
  ), claimed as (
    update public.ai_videos v
       set claimed_at = now(), tries = v.tries + 1
      from due
     where v.id = due.id
    returning v.*
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', c.id,
           'prompt', c.prompt,
           'model', c.model,
           'seconds', c.seconds,
           'aspect', c.aspect,
           'quality', c.quality,
           'sound', c.sound,
           'picture_path', c.picture_path,
           'look', (select nullif(btrim(b.picture_style), '') from public.brand_profile b where b.id = 1),
           'live', coalesce(s.videos_live, false),
           'path', 'videos/' || c.id::text || '.mp4'
         ) order by c.asked_at), '[]'::jsonb)
    into v_out
    from claimed c
    left join public.team_settings s on s.id = 1;
  return v_out;
end
$$;

-- n8n could not reach Higgsfield, so nothing was sent: the ask waits for the
-- next minute, and fails on the third try.
create function public.video_release(p_id uuid, p_error text)
returns void
language plpgsql
set search_path = ''
as $$
begin
  update public.ai_videos
     set claimed_at = case when tries >= 3 then claimed_at else null end,
         status = case when tries >= 3 then 'failed' else status end,
         finished_at = case when tries >= 3 then now() else finished_at end,
         error = case when tries >= 3
                      then left('Higgsfield could not be reached three times: nothing was spent. Ask again later. (' || coalesce(nullif(btrim(p_error), ''), 'no answer') || ')', 500)
                      else error end
   where id = p_id and status = 'asked';
end
$$;
revoke all on function public.video_release(uuid, text) from public, anon, authenticated;
grant execute on function public.video_release(uuid, text) to service_role;
