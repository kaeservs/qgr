-- A run from a clip makes every ad from the clip, so it takes neither AI
-- pictures nor AI video (nor references): set_run_media refuses them.

create or replace function public.set_run_media(p_run_id uuid, p_kind text, p_references jsonb default '[]'::jsonb, p_video jsonb default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_settings public.team_settings;
  v_refs jsonb := coalesce(p_references, '[]'::jsonb);
  v_ref jsonb;
  v_path text;
  v_note text;
  v_count integer;
  v_video jsonb;
  v_seconds integer;
  v_credits numeric;
  v_spent numeric;
  v_position integer := 0;
begin
  perform private.require_team_member();
  if p_kind is null or p_kind not in ('design', 'pictures', 'video') then
    raise exception 'Say whether the ads use the design, AI pictures or AI video';
  end if;
  if not exists (select 1 from public.runs where id = p_run_id) then
    raise exception 'Run % not found', p_run_id;
  end if;
  if p_kind <> 'design' and exists (select 1 from public.runs where id = p_run_id and media_path is not null) then
    raise exception 'A run from a clip makes its ads from the clip: AI pictures and AI video are for the other runs';
  end if;
  if exists (select 1 from public.run_stages where run_id = p_run_id and status not in ('queued', 'skipped')) then
    raise exception 'The agents have started on this run, so what its ads are made of is set';
  end if;
  if exists (select 1 from public.run_references where run_id = p_run_id) then
    raise exception 'This run''s reference pictures are set already';
  end if;

  if jsonb_typeof(v_refs) <> 'array' then
    raise exception 'The reference pictures could not be read';
  end if;
  v_count := jsonb_array_length(v_refs);
  if v_count > 4 then
    raise exception 'Add up to four reference pictures';
  end if;
  if v_count > 0 and p_kind = 'design' then
    raise exception 'Reference pictures are for AI pictures or AI video: the design uses none';
  end if;

  select * into v_settings from public.team_settings where id = 1 for update;
  if p_kind = 'video' then
    if not coalesce(v_settings.videos_live, false) then
      raise exception 'AI video is off: switch it on in Settings, AI video, first';
    end if;
    if p_video is null or jsonb_typeof(p_video) <> 'object' then
      raise exception 'Say how long and how sharp the videos are';
    end if;
    v_seconds := (p_video ->> 'seconds')::integer;
    if v_seconds is null or v_seconds not between 4 and 15 then
      raise exception 'A video is 4 to 15 seconds long';
    end if;
    if coalesce(p_video ->> 'quality', '') not in ('480p', '720p') then
      raise exception 'A video is 480p or 720p';
    end if;
    if coalesce(p_video ->> 'aspect', '') not in ('9:16', '1:1', '16:9') then
      raise exception 'A video is 9:16, 1:1 or 16:9';
    end if;
    v_credits := (p_video ->> 'credits')::numeric;
    if v_credits is null or v_credits <= 0 or v_credits > 10000 then
      raise exception 'Higgsfield''s price for these videos is needed first';
    end if;
    v_spent := private.videos_spent();
    if v_spent + 3 * v_credits > v_settings.videos_cap then
      raise exception 'Three videos would take this month''s Higgsfield spending past its limit of % credits (% used). It can be raised in Settings.',
        v_settings.videos_cap, trim_scale(v_spent);
    end if;
    v_video := jsonb_build_object('model', 'seedance_2_0_mini', 'seconds', v_seconds, 'quality', p_video ->> 'quality',
                                  'aspect', p_video ->> 'aspect', 'credits', v_credits);
  elsif p_video is not null then
    raise exception 'Only a video run has video settings';
  end if;

  for v_ref in select r from jsonb_array_elements(v_refs) as t(r) loop
    v_path := v_ref ->> 'path';
    v_note := nullif(btrim(regexp_replace(coalesce(v_ref ->> 'note', ''), '[\u0001-\u001f\u007f]', ' ', 'g')), '');
    if v_path is null or v_path !~ '^refs/[0-9a-f-]{36}/[0-9a-f-]{36}\.(png|jpg|webp)$' then
      raise exception 'A reference picture could not be read';
    end if;
    if not exists (select 1 from storage.objects o where o.bucket_id = 'run-refs' and o.name = v_path) then
      raise exception 'A reference picture has not finished uploading';
    end if;
    if char_length(coalesce(v_note, '')) > 120 then
      raise exception 'Keep what a reference shows under 120 characters';
    end if;
    if exists (select 1 from public.run_references where run_id = p_run_id and path = v_path) then
      raise exception 'The same reference picture is there twice';
    end if;
    insert into public.run_references (run_id, position, path, note) values (p_run_id, v_position, v_path, v_note);
    v_position := v_position + 1;
  end loop;

  update public.runs set ai_media = p_kind, ai_video = v_video where id = p_run_id;
  insert into public.run_events (run_id, text) values (
    p_run_id,
    case p_kind
      when 'design' then 'The ads use the drawn design: no AI pictures'
      when 'pictures' then 'Every ad gets an AI picture'
      else format('Every ad gets an AI video (%s s, %s, %s; %s credits each)', v_seconds, v_video ->> 'quality', v_video ->> 'aspect', trim_scale(v_credits))
    end
    || case when v_count = 1 then ', with one reference picture for Higgsfield'
            when v_count > 1 then format(', with %s reference pictures for Higgsfield', v_count)
            else '' end
  );
end
$$;
