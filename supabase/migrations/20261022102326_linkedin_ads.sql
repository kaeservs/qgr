-- Competitors' LinkedIn ads, read from LinkedIn's Ad Library (the LinkedIn Ads
-- Scraper on Apify). LinkedIn publishes what Meta does not: an ad's
-- impressions, as a range ("10k-20k", "<1k", "1M+"), kept as LinkedIn wrote
-- it; the app reads its lower end for the rating (lib/competitor-signal.ts).
-- Null is "not shown". A LinkedIn ad that stopped in the last 30 days is kept
-- with active false, so a report counts ads, not only active ones.

alter table public.competitor_ads
  add column impressions text check (impressions is null or char_length(impressions) between 1 and 20);

create or replace function public.agent_finish_tracker(p_run_id uuid, p_report jsonb, p_usage jsonb default null)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_name text := nullif(btrim(p_report #>> '{competitor,name}'), '');
  v_domain text := nullif(lower(btrim(p_report #>> '{competitor,domain}')), '');
  v_run public.runs;
  v_competitor uuid;
  v_report uuid;
  v_hooks integer;
  v_ads integer;
begin
  perform public.assert_stage_running(p_run_id, 'tracker');
  select * into v_run from public.runs where id = p_run_id;
  if v_name is null then
    raise exception 'The report names no competitor';
  end if;
  if jsonb_typeof(p_report -> 'hooks') is distinct from 'array' or jsonb_array_length(p_report -> 'hooks') = 0 then
    raise exception 'The report has no hooks';
  end if;
  if jsonb_typeof(p_report -> 'insights') is distinct from 'array' then
    raise exception 'The report has no insights';
  end if;
  if exists (
    select 1 from jsonb_array_elements(coalesce(p_report -> 'ads', '[]'::jsonb)) a
     where a ->> 'screenshot_path' is not null
       and not (a ->> 'screenshot_path' = any (coalesce(v_run.files, '{}')))
  ) then
    raise exception 'An ad names a screenshot that is not this run''s';
  end if;

  if v_domain is not null then
    insert into public.competitors (name, domain) values (v_name, v_domain)
    on conflict (domain) do update set name = excluded.name
    returning id into v_competitor;
  else
    select id into v_competitor from public.competitors where domain is null and lower(name) = lower(v_name);
    if v_competitor is null then
      insert into public.competitors (name) values (v_name) returning id into v_competitor;
    end if;
  end if;

  insert into public.competitor_reports
    (run_id, competitor_id, data_source, active_ads, platforms, summary, website_summary, insights, angles)
  values (
    p_run_id,
    v_competitor,
    p_report ->> 'data_source',
    (p_report ->> 'active_ads')::integer,
    array(select jsonb_array_elements_text(coalesce(p_report -> 'platforms', '[]'::jsonb))),
    p_report ->> 'summary',
    p_report ->> 'website_summary',
    array(select jsonb_array_elements_text(p_report -> 'insights')),
    coalesce(p_report -> 'angles', '[]'::jsonb)
  )
  returning id into v_report;

  insert into public.hooks (report_id, rank, text, platform, format, days_running, variations, days_known)
  select v_report, t.ord::smallint, t.h ->> 'text', t.h ->> 'platform', t.h ->> 'format',
         (t.h ->> 'days_running')::integer, (t.h ->> 'variations')::integer,
         coalesce((t.h ->> 'days_known')::boolean, true)
    from jsonb_array_elements(p_report -> 'hooks') with ordinality as t(h, ord);

  insert into public.competitor_ads
    (report_id, platform, format, text, days_running, ad_url, media_url,
     headline, cta, page_name, angle, screenshot_path, position, days_known,
     kind, versions, placements, active, reactions, comments, shares, views, impressions)
  select v_report, t.a ->> 'platform', t.a ->> 'format', t.a ->> 'text', (t.a ->> 'days_running')::integer,
         t.a ->> 'ad_url', t.a ->> 'media_url',
         nullif(btrim(t.a ->> 'headline'), ''), nullif(btrim(t.a ->> 'cta'), ''), nullif(btrim(t.a ->> 'page_name'), ''),
         nullif(btrim(t.a ->> 'angle'), ''), t.a ->> 'screenshot_path', (t.ord - 1)::smallint,
         coalesce((t.a ->> 'days_known')::boolean, true),
         coalesce(t.a ->> 'kind', 'ad'),
         (t.a ->> 'versions')::integer,
         array(select jsonb_array_elements_text(coalesce(t.a -> 'placements', '[]'::jsonb))),
         (t.a ->> 'active')::boolean,
         (t.a ->> 'reactions')::integer, (t.a ->> 'comments')::integer, (t.a ->> 'shares')::integer,
         (t.a ->> 'views')::bigint,
         nullif(btrim(t.a ->> 'impressions'), '')
    from jsonb_array_elements(coalesce(p_report -> 'ads', '[]'::jsonb)) with ordinality as t(a, ord);

  update public.runs set competitor_id = v_competitor, summary = p_report ->> 'summary' where id = p_run_id;

  if p_report ->> 'data_source' = 'placeholder' then
    insert into public.run_events (run_id, text)
    values (p_run_id, 'Used sample ads: Apify is not connected yet');
  end if;
  -- LinkedIn's library could not be read: the report went on with Meta's ads.
  if nullif(p_report #>> '{sources,linkedin_error}', '') is not null then
    insert into public.run_events (run_id, text)
    values (p_run_id, left('LinkedIn''s Ad Library could not be read, so this report has Meta''s ads only: ' || (p_report #>> '{sources,linkedin_error}'), 500));
  end if;

  v_hooks := jsonb_array_length(p_report -> 'hooks');
  v_ads := (p_report ->> 'active_ads')::integer;
  perform public.finish_stage(
    p_run_id, 'tracker',
    case when p_report ->> 'data_source' = 'upload'
      then format('Read %s item%s from %s screenshot%s and found %s hook%s.',
                  v_ads, case when v_ads = 1 then '' else 's' end,
                  coalesce(cardinality(v_run.files), 0), case when cardinality(v_run.files) = 1 then '' else 's' end,
                  v_hooks, case when v_hooks = 1 then '' else 's' end)
      when (p_report #>> '{sources,linkedin}') is not null and (p_report #>> '{sources,meta}') is not null
      then format('Scanned %s Meta and %s LinkedIn ads and found %s winning hook%s.',
                  p_report #>> '{sources,meta}', p_report #>> '{sources,linkedin}', v_hooks,
                  case when v_hooks = 1 then '' else 's' end)
      when (p_report #>> '{sources,linkedin}') is not null
      then format('Scanned %s LinkedIn ads and found %s winning hook%s.', p_report #>> '{sources,linkedin}', v_hooks,
                  case when v_hooks = 1 then '' else 's' end)
      else format('Scanned %s active ads and found %s winning hook%s.', v_ads, v_hooks,
                  case when v_hooks = 1 then '' else 's' end)
    end);
  perform public.record_usage(p_run_id, 'tracker', p_usage);
  return v_report;
end
$$;
