// Whole runs, end to end, with nothing mocked but Claude:
//
//   the form's input → parseNewRun → readPage (a local site) → create_run, as a
//   signed-in teammate → each agent's real n8n code, step by step in the
//   workflow's order, against the real database functions, as the service role
//   → the rows the dashboard reads → the dashboard's own mapping.
//
// Claude is replaced by an answer built from the request it was sent, and that
// answer is checked against the JSON schema the request carries, so a schema
// and the code that reads Claude's answer cannot drift apart unnoticed.

import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { inN8n } from '../test/n8n';
import { toAdSet, toCompetitor, toCreateRunArgs, toRun, toStrategy } from '../lib/data/map';
import type { AdSetRow, CompetitorRow, RunRow, StrategyRow } from '../lib/data/map';
import type { FetchPolicy } from '../lib/page/fetch';
import { readPage } from '../lib/page/read';
import { parseNewRun } from '../lib/run-input';
import type { PageRead } from '../lib/types';
import { testDatabase } from '../test/supabase';
import type { TestDatabase } from '../test/supabase';

type Json = Record<string, unknown>;
const here = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------- n8n, played step by step

/** A Code node: the script runs as n8n runs it, with $input and $('Node name'). */
function step(file: string, input: Json, nodes: Record<string, Json> = {}, swap: Record<string, string> = {}): Json {
  let code = readFileSync(join(here, 'code', file), 'utf8');
  for (const [key, value] of Object.entries(swap)) code = code.replaceAll(key, value);
  const $input = { first: () => ({ json: input }), all: () => [{ json: input }] };
  const $ = (name: string) => {
    const json = nodes[name];
    if (!json) throw new Error(`Node "${name}" has not run`);
    return { first: () => ({ json }) };
  };
  const items = inN8n(code, $input, $) as { json: Json }[];
  expect(items, file).toHaveLength(1);
  return items[0]!.json;
}

/** A Code node fed many items, as an HTTP node hands on an array answer: one item each. */
function stepAll(file: string, inputs: Json[], nodes: Record<string, Json> = {}): Json {
  const code = readFileSync(join(here, 'code', file), 'utf8');
  const all = inputs.map((json) => ({ json }));
  const $input = { first: () => all[0], all: () => all };
  const $ = (name: string) => {
    const json = nodes[name];
    if (!json) throw new Error(`Node "${name}" has not run`);
    return { first: () => ({ json }) };
  };
  const items = inN8n(code, $input, $) as { json: Json }[];
  expect(items, file).toHaveLength(1);
  return items[0]!.json;
}

// ---------------------------------------------------------------- Claude, played from the request

/** Checks a value against the subset of JSON Schema the agents' requests use. */
function conforms(value: unknown, schema: Json, path = '$'): string[] {
  if (Array.isArray(schema.anyOf)) {
    return (schema.anyOf as Json[]).some((s) => conforms(value, s, path).length === 0) ? [] : [`${path}: matches no option`];
  }
  const errors: string[] = [];
  if (schema.enum && !(schema.enum as unknown[]).includes(value)) errors.push(`${path}: ${JSON.stringify(value)} is not one of ${JSON.stringify(schema.enum)}`);
  switch (schema.type) {
    case 'object': {
      if (typeof value !== 'object' || value === null || Array.isArray(value)) return [`${path}: not an object`];
      const props = (schema.properties ?? {}) as Record<string, Json>;
      for (const key of (schema.required ?? []) as string[]) if (!(key in value)) errors.push(`${path}.${key}: missing`);
      for (const [key, v] of Object.entries(value)) {
        if (!props[key]) {
          if (schema.additionalProperties === false) errors.push(`${path}.${key}: not allowed`);
          continue;
        }
        errors.push(...conforms(v, props[key], `${path}.${key}`));
      }
      return errors;
    }
    case 'array':
      if (!Array.isArray(value)) return [`${path}: not an array`];
      return value.flatMap((v, i) => conforms(v, schema.items as Json, `${path}[${i}]`));
    case 'string':
      return typeof value === 'string' ? errors : [`${path}: not a string`];
    case 'integer':
      return Number.isInteger(value) ? errors : [`${path}: not an integer`];
    case 'null':
      return value === null ? errors : [`${path}: not null`];
    default:
      return errors;
  }
}

/** What the Messages API returns: the answer as JSON text, after a thinking block, with usage. */
function claude(body: Json, answer: (material: Json, schema: Json) => Json): Json {
  const schema = (body.output_config as { format: { schema: Json } }).format.schema;
  const material = JSON.parse(String((body.messages as { content: string }[])[0]!.content).split('\n').slice(1).join('\n')) as Json;
  const reply = answer(material, schema);
  expect(conforms(reply, schema), 'the answer fits the schema the request sent').toEqual([]);
  return {
    model: 'claude-haiku-5-5',
    stop_reason: 'end_turn',
    content: [{ type: 'thinking', thinking: '' }, { type: 'text', text: JSON.stringify(reply) }],
    usage: { input_tokens: 4000, output_tokens: 1200, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
  };
}

const trackerAnswer = (material: Json): Json => {
  const ads = material.ads as { id: string }[];
  const ids = ads.map((a) => a.id);
  return {
    competitor_name: 'Horizon Visa Partners',
    summary: 'Age-out urgency runs their longest ads.',
    website_summary: (material.website_text as string) ? 'An EB-5 advisor for families.' : '',
    insights: ['Their four longest-running ads lead with age-out urgency.', 'Video outlasts images.', 'Every ad ends on a free call.'],
    hooks: [
      { text: "Your kids shouldn't age out while you wait.", ad_ids: ids.slice(0, 2) },
      { text: "The H-1B lottery isn't a plan. This is.", ad_ids: ids.slice(2, 4) },
      { text: 'What $800K actually buys: a timeline, not a promise.', ad_ids: ids.slice(4, 5) },
    ],
    ad_angles: ids.map((id, i) => ({ ad_id: id, angle: i < 4 ? 'Timeline & urgency' : 'Cost & pricing' })),
  };
};

const strategistAnswer = (material: Json, schema: Json): Json => {
  const report = material.competitor_report as { winning_hooks: { text: string }[] } | undefined;
  const platforms = (((schema.properties as Json).channels as Json).items as { properties: { platform: { enum: string[] } } }).properties.platform.enum;
  return {
    title: 'Plan, not panic',
    summary: 'Calm, plain EB-5 planning for families.',
    positioning: 'The EB-5 advisor that shows its working.',
    audiences: ['Indian families on H-1B visas'],
    angles: [
      { name: 'Clarity over hype', why: 'Their urgency ads keep running; nobody explains the steps.', hook: 'Your EB-5 path, mapped out.', based_on_hook: report ? report.winning_hooks[0]!.text : null },
      { name: 'Family first', why: 'Families decide together.', hook: 'Move together. Plan early.', based_on_hook: null },
      { name: 'Diligence you can check', why: 'A gap no one covers.', hook: 'Ask for the file.', based_on_hook: null },
    ],
    channels: platforms.map((platform, i) => ({ platform, share: i === 0 ? 60 : 40 / Math.max(platforms.length - 1, 1), role: 'Reach', format: 'Video' })).map((c) => ({ ...c, share: Math.round(c.share) })),
    guardrails: ['Never name a competitor'],
  };
};

const contentAnswer = (_material: Json, schema: Json): Json => {
  const copySchema = (((schema.properties as Json).variants as Json).items as { properties: { copy: { properties: Record<string, { required: string[]; properties: Record<string, { enum?: string[] }> }> } } }).properties.copy;
  const copy = Object.fromEntries(
    Object.entries(copySchema.properties).map(([platform, s]) => [
      platform,
      Object.fromEntries(s.required.map((field) => [field, s.properties[field]?.enum?.[0] ?? `${platform} ${field}`])),
    ]),
  );
  return {
    variants: ['A', 'B', 'C'].map((label, i) => ({
      label,
      creative_text: ['Mapped out.', 'Move together.', 'Ask for the file.'][i],
      creative_style: ['arcs', 'split', 'spotlight'][i],
      image_prompt: '',
      copy,
    })),
  };
};

// ---------------------------------------------------------------- the database, as n8n reaches it

let t: TestDatabase;
let teammate = '';

/** A Supabase RPC as n8n's HTTP Request node makes it: named arguments, as the service role. */
async function rpc(fn: string, args: Json): Promise<Json> {
  const names = Object.keys(args);
  const sql = `select public.${fn}(${names.map((n, i) => `${n} => $${i + 1}`).join(', ')}) as result`;
  const params = names.map((n) => (args[n] !== null && typeof args[n] === 'object' ? JSON.stringify(args[n]) : args[n]));
  return t.asService(async () => ({ result: (await t.db.query<{ result: unknown }>(sql, params)).rows[0]?.result }));
}

async function begin(runId: string, stage: string): Promise<Json> {
  return (await rpc('agent_begin', { p_run_id: runId, p_stage: stage })).result as Json;
}

/** The failure tail every agent shares: why it failed, then agent_fail. */
async function fail(item: Json, beginJson: Json, stage: string) {
  const why = step('shared-fail-reason.js', item, { 'Begin: load the run': beginJson }, { __STAGE__: stage });
  await rpc('agent_fail', why);
  return why;
}

/** The tracker, in the workflow's order: sample ads, or with the team's ads on Apify, what Apify answered (`apify`). */
async function runTracker(runId: string, apify: (url: string) => Json[] = () => []) {
  const beginJson = await begin(runId, 'tracker');
  const plan = step('tracker-plan.js', beginJson);
  const library = plan.library as { url: string } | null;
  // "Real ads?": Apify reads the library page the plan names; otherwise the sample ads.
  const raw = plan.adsSource === 'apify' ? stepAll('tracker-apify-ads.js', apify(library!.url), { 'Plan the scan': plan }) : step('tracker-placeholder-ads.js', plan);
  const prepared = step('tracker-prepare-ads.js', raw);
  const { body } = step('tracker-build-request.js', prepared) as { body: Json };
  const answer = step('tracker-read-answer.js', claude(body, trackerAnswer), { 'Prepare the ads': prepared });
  expect(answer.ok, String(answer.p_error)).toBe(true);
  await rpc('agent_finish_tracker', { p_run_id: answer.p_run_id, p_report: answer.p_report, p_usage: answer.p_usage });
  return { plan, body };
}

async function runStrategist(runId: string, reply: (body: Json) => Json = (body) => claude(body, strategistAnswer)) {
  const beginJson = await begin(runId, 'strategist');
  const plan = step('strategist-plan.js', beginJson);
  const { body } = step('strategist-build-request.js', plan) as { body: Json };
  const answer = step('strategist-read-answer.js', reply(body), { 'Gather the material': plan });
  if (!answer.ok) return { failed: await fail(answer, beginJson, 'strategist'), body };
  await rpc('agent_finish_strategist', { p_run_id: answer.p_run_id, p_strategy: answer.p_strategy, p_usage: answer.p_usage });
  return { failed: null, body };
}

async function runContent(runId: string) {
  const beginJson = await begin(runId, 'content');
  const { body } = step('content-build-request.js', beginJson) as { body: Json };
  const answer = step('content-read-answer.js', claude(body, contentAnswer), { 'Begin: load the run': beginJson });
  expect(answer.ok, String(answer.p_error)).toBe(true);
  await rpc('agent_finish_content', { p_run_id: answer.p_run_id, p_ad_set: answer.p_ad_set, p_usage: answer.p_usage });
  return { body };
}

/** What the app does when the form is sent: validate, read the link, create the run as the teammate. */
async function startRun(form: Json, page: PageRead | null = null): Promise<string> {
  const parsed = parseNewRun(form);
  if (!parsed.ok) throw new Error(parsed.error);
  const args = toCreateRunArgs(parsed.value, page);
  const names = Object.keys(args) as (keyof typeof args)[];
  const sql = `select public.create_run(${names.map((n, i) => `${n} => $${i + 1}`).join(', ')}) as id`;
  const params = names.map((n) => (n === 'p_page' || n === 'p_media' ? JSON.stringify(args[n]) : args[n]));
  return t.asUser(teammate, async () => (await t.db.query<{ id: string }>(sql, params)).rows[0]!.id);
}

// ---------------------------------------------------------------- what the dashboard reads

/** The run as live.ts selects it, assembled the way PostgREST embeds it. */
async function dashboardRun(runId: string): Promise<RunRow> {
  return t.asUser(teammate, () =>
    t.value<RunRow>(
      `select json_build_object(
        'id', r.id, 'title', r.title, 'kind', r.kind, 'input', r.input, 'url', r.url, 'competitor_name', r.competitor_name,
        'files', r.files, 'excerpt', r.excerpt, 'platforms', r.platforms, 'goal', r.goal, 'summary', r.summary,
        'competitor_id', r.competitor_id, 'created_at', r.created_at, 'approved_at', r.approved_at,
        'page_ok', r.page -> 'ok', 'page_url', r.page ->> 'url', 'page_title', r.page ->> 'title', 'page_words', r.page -> 'words', 'page_error', r.page ->> 'error',
        'run_stages', (select json_agg(json_build_object('stage', s.stage, 'status', s.status, 'summary', s.summary, 'error', s.error, 'finished_at', s.finished_at, 'waiting_since', s.waiting_since)) from public.run_stages s where s.run_id = r.id),
        'strategies', (select json_build_object('id', st.id, 'strategy_angles', coalesce((select json_agg(json_build_object('id', a.id)) from public.strategy_angles a where a.strategy_id = st.id), '[]')) from public.strategies st where st.run_id = r.id),
        'ad_sets', (select json_build_object('id', ad.id, 'ad_variants', coalesce((select json_agg(json_build_object('id', v.id)) from public.ad_variants v where v.ad_set_id = ad.id), '[]')) from public.ad_sets ad where ad.run_id = r.id),
        'competitor_reports', (select json_build_object('id', cr.id, 'hooks', coalesce((select json_agg(json_build_object('id', h.id)) from public.hooks h where h.report_id = cr.id), '[]')) from public.competitor_reports cr where cr.run_id = r.id),
        'run_events', (select json_agg(json_build_object('at', e.at, 'text', e.text) order by e.id) from public.run_events e where e.run_id = r.id)
      ) from public.runs r where r.id = $1`,
      [runId],
    ),
  );
}

async function dashboardCompetitor(competitorId: string): Promise<CompetitorRow> {
  return t.asUser(teammate, () =>
    t.value<CompetitorRow>(
      `select json_build_object('id', c.id, 'name', c.name, 'domain', c.domain, 'competitor_reports', coalesce((
        select json_agg(json_build_object(
          'id', cr.id, 'data_source', cr.data_source, 'active_ads', cr.active_ads, 'platforms', cr.platforms, 'insights', cr.insights, 'angles', cr.angles, 'created_at', cr.created_at,
          'hooks', coalesce((select json_agg(json_build_object('id', h.id, 'rank', h.rank, 'text', h.text, 'platform', h.platform, 'format', h.format, 'days_running', h.days_running, 'variations', h.variations)) from public.hooks h where h.report_id = cr.id), '[]'),
          'competitor_ads', coalesce((select json_agg(json_build_object('id', a.id, 'platform', a.platform, 'format', a.format, 'text', a.text, 'days_running', a.days_running, 'ad_url', a.ad_url)) from public.competitor_ads a where a.report_id = cr.id), '[]')
        )) from public.competitor_reports cr where cr.competitor_id = c.id), '[]')) from public.competitors c where c.id = $1`,
      [competitorId],
    ),
  );
}

async function dashboardStrategy(runId: string): Promise<StrategyRow> {
  return t.asUser(teammate, () =>
    t.value<StrategyRow>(
      `select json_build_object('id', s.id, 'run_id', s.run_id, 'competitor_id', s.competitor_id, 'title', s.title, 'source_label', s.source_label, 'goal', s.goal,
        'positioning', s.positioning, 'audiences', s.audiences, 'channels', s.channels, 'guardrails', s.guardrails, 'created_at', s.created_at, 'approved_at', s.approved_at,
        'strategy_angles', (select json_agg(json_build_object('id', a.id, 'position', a.position, 'name', a.name, 'why', a.why, 'hook', a.hook, 'based_on_hook', a.based_on_hook)) from public.strategy_angles a where a.strategy_id = s.id),
        'ad_sets', coalesce((select json_agg(json_build_object('id', ad.id)) from public.ad_sets ad where ad.strategy_id = s.id), '[]')
      ) from public.strategies s where s.run_id = $1`,
      [runId],
    ),
  );
}

async function dashboardAdSet(runId: string): Promise<AdSetRow> {
  return t.asUser(teammate, () =>
    t.value<AdSetRow>(
      `select json_build_object('id', ad.id, 'run_id', ad.run_id, 'strategy_id', ad.strategy_id, 'title', ad.title, 'created_at', ad.created_at,
        'ad_variants', (select json_agg(json_build_object('id', v.id, 'label', v.label, 'angle', v.angle, 'creative_text', v.creative_text, 'creative_style', v.creative_style,
          'image_url', v.image_url, 'copy', v.copy, 'warnings', v.warnings, 'approved_at', v.approved_at)) from public.ad_variants v where v.ad_set_id = ad.id)
      ) from public.ad_sets ad where ad.run_id = $1`,
      [runId],
    ),
  );
}

// ---------------------------------------------------------------- a website to read

let site: Server;
let siteUrl = '';
const local: FetchPolicy = { allowAddress: (a) => a === '127.0.0.1', allowPort: () => true };

beforeAll(async () => {
  t = await testDatabase();
  teammate = await t.addUser('alex@qgr.example', 'owner');
  const home = readFileSync(join(here, '..', 'lib', 'page', 'fixtures', 'competitor-home.html'));
  const post = readFileSync(join(here, '..', 'lib', 'page', 'fixtures', 'blog-post.html'));
  site = createServer((req, res) => {
    if (req.url === '/') return res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(home);
    if (req.url === '/journal/eb5-h1b') return res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(post);
    res.writeHead(403).end('Access denied');
  });
  await new Promise<void>((resolve) => site.listen(0, '127.0.0.1', resolve));
  siteUrl = `http://127.0.0.1:${(site.address() as AddressInfo).port}`;
}, 60_000);

afterAll(() => new Promise<void>((resolve) => site.close(() => resolve())));

const events = async (runId: string) => (await dashboardRun(runId)).run_events?.map((e) => e.text) ?? [];

describe('a competitor run, from their website to three ads', () => {
  it('runs every agent and leaves the dashboard a report, a strategy and ads to review', async () => {
    const page = await readPage(`${siteUrl}/`, { policy: local });
    expect(page.ok).toBe(true);
    const runId = await startRun({ source: { kind: 'competitor', input: 'website', url: 'horizonvisa.example' }, platforms: ['meta', 'linkedin', 'x'], goal: 'consultations' }, page);

    const tracker = await runTracker(runId);
    // The tracker read the page the app stored, not the web.
    expect(tracker.plan.websiteText).toContain('Your family’s path to a U.S. Green Card');
    expect(tracker.plan.competitorHint).toBe('Horizon Visa Partners');
    await runStrategist(runId);
    await runContent(runId);

    const run = toRun(await dashboardRun(runId));
    expect(run.status).toBe('review');
    expect(run.stages).toMatchObject({ tracker: { status: 'done' }, strategist: { status: 'done' }, content: { status: 'done' } });
    expect(run.counts).toEqual({ hooks: 3, angles: 3, variants: 3 });
    expect(run.page).toMatchObject({ ok: true, title: 'Horizon Visa Partners | EB-5 Investor Visa Advisors' });
    expect(run.activity.map((e) => e.text)).toEqual([
      'Run started',
      expect.stringMatching(/^Read Horizon Visa Partners \| EB-5 Investor Visa Advisors: \d+ words$/),
      'Competitor Tracker started',
      'Used sample ads: Apify is not connected yet',
      'Scanned 10 active ads and found 3 winning hooks.',
      'Ad Strategist started',
      'Built a strategy with 3 angles.',
      'Content Agent started',
      'Wrote 3 ad variants for Meta, LinkedIn, X.',
      'Ready for review',
    ]);

    const competitor = toCompetitor(await dashboardCompetitor(run.output.competitorId!));
    expect(competitor).toMatchObject({ name: 'Horizon Visa Partners', dataSource: 'placeholder', activeAds: 10 });
    expect(competitor!.hooks.map((h) => [h.text, h.daysRunning, h.variations])).toEqual([
      ["Your kids shouldn't age out while you wait.", 63, 2],
      ["The H-1B lottery isn't a plan. This is.", 41, 2],
      ['What $800K actually buys: a timeline, not a promise.', 34, 1],
    ]);
    expect(competitor!.angles).toEqual([{ label: 'Timeline & urgency', ads: 4 }, { label: 'Cost & pricing', ads: 6 }].sort((a, b) => b.ads - a.ads));

    const strategy = toStrategy(await dashboardStrategy(runId));
    expect(strategy.angles[0]?.basedOn).toEqual({ competitorId: run.output.competitorId, hook: "Your kids shouldn't age out while you wait." });
    expect(strategy.channels.reduce((sum, c) => sum + c.share, 0)).toBe(100);
    expect(strategy.guardrails[0]).toBe('Never promise an outcome, a timeline or a return');

    const adSet = toAdSet(await dashboardAdSet(runId));
    expect(adSet.variants.map((v) => [v.label, v.angle])).toEqual([['A', 'Clarity over hype'], ['B', 'Family first'], ['C', 'Diligence you can check']]);
    expect(Object.keys(adSet.variants[0]!.copy)).toEqual(['meta', 'linkedin', 'x']);
    expect(await t.value<number>('select count(*)::int from public.agent_usage where run_id = $1', [runId])).toBe(3);
  });

  it('reads their real ads through Apify once the team switches, and links each to the library', async () => {
    const page = await readPage(`${siteUrl}/`, { policy: local });
    const runId = await startRun({ source: { kind: 'competitor', input: 'website', url: 'horizonvisa.example' }, platforms: ['meta'], goal: 'consultations' }, page);
    await t.asUser(teammate, () => t.db.query(`select public.set_ads_source('apify')`));
    try {
      const day = 86_400;
      const now = Math.round(Date.now() / 1000);
      // Apify's answer, as the Facebook Ads Library Scraper gives it: theirs, and one from another firm that matched the search.
      const answer = (url: string): Json[] => {
        expect(url).toBe('https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=ALL&media_type=all&search_type=keyword_unordered&q=Horizon%20Visa%20Partners');
        return [
          ...[90, 63, 41, 20, 7].map((days, i) => ({
            adArchiveID: String(5550001 + i),
            pageName: 'Horizon Visa Partners',
            isActive: true,
            startDate: now - days * day,
            snapshot: { body: { text: `Their ad number ${i + 1}. Plan ahead with them.` }, title: 'Free consultation', ctaText: 'Book now', linkUrl: 'https://horizonvisa.example/', displayFormat: i % 2 ? 'IMAGE' : 'VIDEO' },
          })),
          { adArchiveID: '5559999', pageName: 'Atlas Residency', isActive: true, startDate: now - 30 * day, snapshot: { body: { text: 'Not theirs.' }, linkUrl: 'https://atlas.example/' } },
        ];
      };
      await runTracker(runId, answer);
    } finally {
      await t.asUser(teammate, () => t.db.query(`select public.set_ads_source('sample')`));
    }

    const run = toRun(await dashboardRun(runId));
    expect(run.stages.tracker).toMatchObject({ status: 'done', summary: 'Scanned 5 active ads and found 3 winning hooks.' });
    expect(run.activity.map((e) => e.text)).not.toContain('Used sample ads: Apify is not connected yet');
    const competitor = toCompetitor(await dashboardCompetitor(run.output.competitorId!));
    expect(competitor).toMatchObject({ name: 'Horizon Visa Partners', dataSource: 'apify', activeAds: 5 });
    expect(competitor!.hooks[0]).toMatchObject({ daysRunning: 90, variations: 2 });
    expect(competitor!.examples.map((a) => [a.daysRunning, a.url])).toEqual([
      [90, 'https://www.facebook.com/ads/library/?id=5550001'],
      [63, 'https://www.facebook.com/ads/library/?id=5550002'],
      [41, 'https://www.facebook.com/ads/library/?id=5550003'],
      [20, 'https://www.facebook.com/ads/library/?id=5550004'],
    ]);
  });

  it('stops a scan Apify cannot read, and says why', async () => {
    const runId = await startRun({ source: { kind: 'competitor', input: 'ad_link', url: 'https://www.linkedin.com/ad-library/search?companyIds=1' }, platforms: ['linkedin'], goal: 'consultations' });
    await t.asUser(teammate, () => t.db.query(`select public.set_ads_source('apify')`));
    try {
      const beginJson = await begin(runId, 'tracker');
      expect(beginJson.ads_source).toBe('apify');
      // "Plan the scan" throws; its error output goes to "Why it failed".
      let message = '';
      try {
        step('tracker-plan.js', beginJson);
      } catch (err) {
        message = (err as Error).message;
      }
      await fail({ error: message }, beginJson, 'tracker');
    } finally {
      await t.asUser(teammate, () => t.db.query(`select public.set_ads_source('sample')`));
    }
    const run = toRun(await dashboardRun(runId));
    expect(run.stages.tracker).toMatchObject({ status: 'failed', error: expect.stringMatching(/^Apify reads Meta's Ad Library, and this link is to another one/) });
  });

  it('works from the ads alone when their website turns the reader away', async () => {
    const page = await readPage(`${siteUrl}/blocked`, { policy: local });
    expect(page).toMatchObject({ ok: false, error: 'The site turned the reader away (403).' });
    const runId = await startRun({ source: { kind: 'competitor', input: 'website', url: 'atlas.example' }, platforms: ['meta'], goal: 'webinar' }, page);
    const tracker = await runTracker(runId);
    expect(tracker.plan.websiteText).toBe('');
    expect((JSON.parse(String((tracker.body.messages as { content: string }[])[0]!.content).split('\n').slice(1).join('\n')) as Json).website_text).toBe('');
    // The activity names the site that was read: here the local stand-in for atlas.example.
    expect(await events(runId)).toContain('Could not read 127.0.0.1: The site turned the reader away (403).');
  });
});

describe('custom runs, which skip the tracker', () => {
  it('turns a blog post the app read into a strategy and ads', async () => {
    const page = await readPage(`${siteUrl}/journal/eb5-h1b`, { policy: local });
    const runId = await startRun({ source: { kind: 'custom', type: 'blog', url: 'journal.example/eb5-h1b' }, platforms: ['meta', 'x'], goal: 'guide' }, page);
    const { body } = await runStrategist(runId);
    const material = JSON.parse(String((body.messages as { content: string }[])[0]!.content).split('\n').slice(1).join('\n')) as { source: Json };
    expect(material.source.text).toMatch(/^If you are on an H-1B visa, EB-5 concurrent filing/);
    expect(material.source.title).toBe('EB-5 for H-1B holders: what changes in 2026');
    await runContent(runId);
    const run = toRun(await dashboardRun(runId));
    expect(run.status).toBe('review');
    expect(run.stages.tracker.status).toBe('skipped');
    expect(Object.keys(toAdSet(await dashboardAdSet(runId)).variants[0]!.copy)).toEqual(['meta', 'x']);
  });

  it('turns pasted text into ads', async () => {
    const runId = await startRun({ source: { kind: 'custom', type: 'text', excerpt: 'Concurrent filing lets H-1B families apply for a green card while they stay and work in the U.S.' }, platforms: ['linkedin'], goal: 'consultations' });
    await runStrategist(runId);
    await runContent(runId);
    expect(toRun(await dashboardRun(runId)).status).toBe('review');
  });

  it('turns the team’s uploaded clip into ads that use it', async () => {
    const path = `uploads/${teammate}/9d7f3c2a-5b1e-4f6a-8c9d-0e1f2a3b4c5d.mp4`;
    await t.asUser(teammate, () => t.db.query(`insert into storage.objects (bucket_id, name) values ('run-media', $1)`, [path]));
    const args = { p_kind: 'custom', p_input: 'video', p_title: 'Founder clip', p_platforms: ['meta', 'x'], p_goal: 'consultations', p_excerpt: 'Our founder explains concurrent filing for families on H-1B visas, step by step.', p_media_path: path, p_media: JSON.stringify({ duration: 42.6, width: 1920, height: 1080, size: 12_400_000, mime: 'video/mp4' }) };
    const runId = await t.asUser(teammate, () => t.value<string>(`select public.create_run(p_kind => $1, p_input => $2, p_title => $3, p_platforms => $4, p_goal => $5, p_excerpt => $6, p_media_path => $7, p_media => $8::jsonb)`, Object.values(args)));
    const strategist = await runStrategist(runId);
    expect(JSON.stringify(strategist.body)).toContain('An uploaded video clip of 0:43');
    const content = await runContent(runId);
    expect(String(content.body.system)).toContain('image_prompt: an empty string');
    const run = toRun(await dashboardRun(runId));
    expect(run.status).toBe('review');
    expect(run.activity.map((e) => e.text)).toContain('Clip uploaded: 0:43');
  });
});

describe('when an agent fails', () => {
  it('records why, keeps the usage, and lets the agent run again', async () => {
    const runId = await startRun({ source: { kind: 'custom', type: 'text', excerpt: 'A plain note about EB-5 timelines being estimates, for families planning ahead.' }, platforms: ['meta'], goal: 'consultations' });
    const refused = await runStrategist(runId, () => ({ model: 'claude-haiku-5-5', stop_reason: 'refusal', stop_details: { category: 'cyber' }, content: [], usage: { input_tokens: 900, output_tokens: 0 } }));
    expect(refused.failed).toMatchObject({ p_stage: 'strategist', p_error: 'Claude declined to write this strategy (cyber).' });
    let run = toRun(await dashboardRun(runId));
    expect(run.status).toBe('failed');
    expect(run.stages.strategist).toEqual({ status: 'failed', error: 'Claude declined to write this strategy (cyber).' });
    expect(await t.value<number>(`select input_tokens from public.agent_usage where run_id = $1`, [runId])).toBe(900);

    // The content agent cannot start before the strategy exists.
    await expect(begin(runId, 'content')).rejects.toThrow(/has not finished/);

    await runStrategist(runId);
    await runContent(runId);
    run = toRun(await dashboardRun(runId));
    expect(run.status).toBe('review');
    expect(run.activity.map((e) => e.text)).toContain('Stopped: the Ad Strategist failed');
  });

  it('will not start an agent twice at once', async () => {
    const runId = await startRun({ source: { kind: 'custom', type: 'text', excerpt: 'Another plain note about EB-5, long enough to be a source for a strategy.' }, platforms: ['meta'], goal: 'consultations' });
    await begin(runId, 'strategist');
    await expect(begin(runId, 'strategist')).rejects.toThrow(/is running, not waiting to start/);
  });
});

describe('the switches and the schedule, down to the ads', () => {
  /** What the pipeline asks the database before each agent after the first. */
  const next = (runId: string, stage: string) => rpc('pipeline_next', { p_run_id: runId, p_stage: stage }).then((r) => r.result as boolean);
  const settings = (s: { strategist: boolean; content: boolean; every?: string }) =>
    t.asUser(teammate, () => t.db.query(`select public.update_agent_settings($1, $2, $3, 1, 0, 'UTC')`, [s.strategist, s.content, s.every ?? 'off']));

  it('scans a tracked competitor on schedule, waits for the go-ahead, then writes the ads', async () => {
    // A website run the team started by hand: the competitor and the page the app read.
    const page = await readPage(`${siteUrl}/`, { policy: local });
    const first = await startRun({ source: { kind: 'competitor', input: 'website', url: 'horizonvisa.example' }, platforms: ['meta', 'linkedin'], goal: 'webinar' }, page);
    await runTracker(first);
    await t.db.query(`update public.competitors set tracked = (domain = 'horizonvisa.example')`);

    // The strategist waits after a scan; the content agent goes on by itself.
    await settings({ strategist: false, content: true, every: 'day' });
    await t.db.query(`update public.team_settings set scan_changed_at = now() - interval '2 days', last_scan_at = null`);

    // "QGR · Scheduled scans": the hourly clock asks what is due and hands each run to the pipeline.
    const due = (await rpc('start_due_scans', { p_max: 10 })).result as { run_id: string; competitor: string }[];
    expect(due.map((d) => d.competitor)).toEqual(['Horizon Visa Partners']);
    const scan = due[0]!.run_id;

    const tracker = await runTracker(scan);
    // The scan worked from the website as the app last read it: n8n fetched nothing.
    expect(tracker.plan.websiteText).toContain('Your family’s path to a U.S. Green Card');
    expect(await next(scan, 'strategist')).toBe(false);
    let run = toRun(await dashboardRun(scan));
    expect(run.status).toBe('waiting');
    expect(run.stages.strategist.status).toBe('waiting');
    await expect(begin(scan, 'strategist')).rejects.toThrow(/waits for a person/);

    // A teammate gives the go-ahead on the run's page; the app hands it to the pipeline at the strategist.
    expect(await t.asUser(teammate, () => t.value<string>(`select public.continue_run($1)`, [scan]))).toBe('strategist');
    await runStrategist(scan);
    expect(await next(scan, 'content')).toBe(true);
    await runContent(scan);

    run = toRun(await dashboardRun(scan));
    expect(run.status).toBe('review');
    expect(run.title).toBe('Horizon Visa Partners · scheduled scan');
    expect(run.platforms).toEqual(['meta', 'linkedin']);
    expect(run.activity.map((e) => e.text)).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^Scheduled scan, with their website as the app last read it \(/),
        'The Ad Strategist waits for you: it does not start by itself after a scan',
        'Go-ahead given for the Ad Strategist',
        'Ready for review',
      ]),
    );
    expect(Object.keys(toAdSet(await dashboardAdSet(scan)).variants[0]!.copy)).toEqual(['meta', 'linkedin']);
    await settings({ strategist: true, content: true });
  });

  it('holds the ads of a custom run for a go-ahead when the content agent is switched off', async () => {
    await settings({ strategist: true, content: false });
    const runId = await startRun({ source: { kind: 'custom', type: 'text', excerpt: 'Concurrent filing lets H-1B families apply for a green card while they stay and work in the U.S.' }, platforms: ['meta'], goal: 'consultations' });
    // A person started this run: its first agent, the strategist, starts at once.
    await runStrategist(runId);
    expect(await next(runId, 'content')).toBe(false);
    expect(toRun(await dashboardRun(runId)).stages.content.status).toBe('waiting');
    expect(await t.asUser(teammate, () => t.value<string>(`select public.continue_run($1)`, [runId]))).toBe('content');
    await runContent(runId);
    expect(toRun(await dashboardRun(runId)).status).toBe('review');
    await settings({ strategist: true, content: true });
  });

  it('carries a clip’s transcript with the run, and the strategist works from the notes', async () => {
    const path = `uploads/${teammate}/7a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d.mp4`;
    await t.asUser(teammate, () => t.db.query(`insert into storage.objects (bucket_id, name) values ('run-media', $1)`, [path]));
    const transcript = [
      { start: 0.4, end: 2.9, text: 'EB-5 is an investment, and it carries risk.' },
      { start: 3.1, end: 6.2, text: 'Families on H-1B visas can plan it early.' },
    ];
    const runId = await startRun({
      source: { kind: 'custom', type: 'video', clip: { path, name: 'founder.mp4', duration: 6.5, width: 1080, height: 1920, size: 2_400_000, transcript }, notes: transcript.map((l) => l.text).join(' ') },
      platforms: ['meta'],
      goal: 'consultations',
    });
    const { body } = await runStrategist(runId);
    expect(JSON.stringify(body)).toContain('Families on H-1B visas can plan it early.');
    await runContent(runId);
    const run = toRun(await dashboardRun(runId));
    expect(run.status).toBe('review');
    const media = await t.value<{ transcript: unknown[] }>('select media from public.runs where id = $1', [runId]);
    expect(media.transcript).toEqual(transcript);
  });
});
