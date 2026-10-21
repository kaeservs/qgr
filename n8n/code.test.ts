// Runs each n8n Code-node script the way n8n does: as a function body with
// $input (the node's input items) and $('Node name') (another node's output).
// This file plays n8n's part so the agents' logic is tested before it ships.
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { inN8n } from '../test/n8n';
import { guardrailWarnings } from '../lib/guardrails';
import { engagementRate, formatRate } from '../lib/results';
import type { Platform, PlatformCopy } from '../lib/types';

type Json = Record<string, unknown>;
type Items = { json: Json }[];

const here = dirname(fileURLToPath(import.meta.url));

/** Runs a Code-node script; `nodes` stands in for upstream nodes' outputs. */
function run(file: string, input: Json, nodes: Record<string, Json> = {}, swap: Record<string, string> = {}): Json {
  let code = readFileSync(join(here, 'code', file), 'utf8');
  for (const [key, value] of Object.entries(swap)) code = code.replaceAll(key, value);
  const $input = { first: () => ({ json: input }), all: () => [{ json: input }] };
  const $ = (name: string) => {
    const json = nodes[name];
    if (!json) throw new Error(`Node "${name}" has not run`);
    return { first: () => ({ json }) };
  };
  const items = inN8n(code, $input, $) as Items;
  expect(items).toHaveLength(1);
  return items[0]!.json;
}

/** A Messages API reply whose text block is `answer`, as Claude returns it with structured outputs. */
const reply = (answer: unknown, extra: Json = {}): Json => ({
  model: 'claude-haiku-5-5',
  stop_reason: 'end_turn',
  content: [{ type: 'thinking', thinking: '' }, { type: 'text', text: JSON.stringify(answer) }],
  usage: { input_tokens: 5000, output_tokens: 1500, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
  ...extra,
});

const brand = {
  company: 'Quantum Global Residency',
  website: 'quantumglobalresidency.com',
  offer: 'EB-5 guidance',
  audience: 'Indian families',
  voice: ['Calm', 'Expert'],
  guardrails: ['Never promise an outcome, a timeline or a return', 'Present processing times as estimates'],
  page_name: 'Quantum Global',
  x_handle: '@quantumglobal',
};

/** Every object in a structured-outputs schema must be closed and require all its properties. */
function assertStrictSchema(node: unknown, path = 'schema'): void {
  if (!node || typeof node !== 'object') return;
  const s = node as Json;
  if (s.type === 'object') {
    expect(s.additionalProperties, `${path} additionalProperties`).toBe(false);
    const props = Object.keys((s.properties as Json) ?? {});
    expect([...(s.required as string[])].sort(), `${path} required`).toEqual([...props].sort());
  }
  for (const [key, value] of Object.entries(s)) {
    if (Array.isArray(value)) value.forEach((v, i) => assertStrictSchema(v, `${path}.${key}[${i}]`));
    else if (value && typeof value === 'object') assertStrictSchema(value, `${path}.${key}`);
  }
}

/** The JSON material a request sends the model, after its one-line preface. */
const materialOf = (body: Json) => JSON.parse(String((body.messages as { content: string }[])[0]!.content).split('\n').slice(1).join('\n')) as Json;

function assertRequest(body: Json, effort: string) {
  expect(body.model).toBe('claude-haiku-5-5');
  expect(body).not.toHaveProperty('temperature');
  expect(body).not.toHaveProperty('thinking');
  expect(body.fallbacks).toBe('default');
  const config = body.output_config as { effort: string; format: { type: string; schema: unknown } };
  expect(config.effort).toBe(effort);
  expect(config.format.type).toBe('json_schema');
  assertStrictSchema(config.format.schema);
}

describe('Competitor Tracker', () => {
  // The page as the app stored it when the run started (lib/page/read.ts).
  const page = { ok: true, url: 'https://www.horizonvisa.com/', title: 'Horizon Visa Partners', siteName: 'Horizon Visa', description: 'EB-5 advisors.', type: 'website', text: 'EB-5 & you\nFamilies first.', words: 5, readAt: '2026-10-08T09:00:00Z' };
  const ctx = {
    run: { id: 'run-1', kind: 'competitor', input: 'website', url: 'https://www.horizonvisa.com/', platforms: ['meta', 'linkedin'], goal: 'consultations', title: 'horizonvisa.com', page },
    brand,
  };
  const plan = run('tracker-plan.js', ctx);
  const raw = run('tracker-placeholder-ads.js', plan);
  const prepared = run('tracker-prepare-ads.js', raw);

  it('takes the website’s words from what the app read, never fetching it', () => {
    expect(plan).toMatchObject({ runId: 'run-1', domain: 'horizonvisa.com', competitorHint: 'Horizon Visa', websiteText: 'Horizon Visa Partners\n\nEB-5 advisors.\n\nEB-5 & you\nFamilies first.' });
    expect(plan).not.toHaveProperty('websiteUrl');
    expect(raw.websiteText).toBe(plan.websiteText);
  });

  it('works from the ads alone when the website could not be read', () => {
    const unread = run('tracker-plan.js', { ...ctx, run: { ...ctx.run, page: { ok: false, url: 'https://www.horizonvisa.com/', error: 'The site turned the reader away (403).' } } });
    expect(unread).toMatchObject({ websiteText: '', competitorHint: 'horizonvisa' });
    expect(run('tracker-plan.js', { ...ctx, run: { ...ctx.run, page: null } })).toMatchObject({ websiteText: '' });
  });

  it('marks placeholder ads as samples and computes days running itself', () => {
    expect(raw.dataSource).toBe('placeholder');
    const ads = prepared.ads as { id: string; days_running: number; hook_line: string }[];
    expect(ads).toHaveLength(10);
    expect(ads[0]).toMatchObject({ id: 'a1', days_running: 63, hook_line: "Your kids shouldn't age out while you wait." });
  });

  it('asks Haiku 5.5 for a strict JSON report, with no temperature', () => {
    const { body } = run('tracker-build-request.js', prepared) as { body: Json };
    assertRequest(body, 'medium');
    const material = JSON.parse(String((body.messages as { content: string }[])[0]!.content).split('\n').slice(1).join('\n'));
    expect(material.ads).toHaveLength(10);
    expect(material.website_text).toBe('Horizon Visa Partners\n\nEB-5 advisors.\n\nEB-5 & you\nFamilies first.');
  });

  it('reads the team’s direction when they gave one, and asks exactly as before when not', () => {
    const directed = run('tracker-prepare-ads.js', run('tracker-placeholder-ads.js', run('tracker-plan.js', { ...ctx, run: { ...ctx.run, guidance: 'Watch how they talk about age-out.' } })));
    const { body } = run('tracker-build-request.js', directed) as { body: Json };
    expect(materialOf(body).direction).toBe('Watch how they talk about age-out.');
    expect(String(body.system)).toContain("direction is the QGR team's note on what to look for");
    const plain = (run('tracker-build-request.js', prepared) as { body: Json }).body;
    expect(materialOf(plain)).not.toHaveProperty('direction');
    expect(String(plain.system)).not.toContain('direction');
  });

  it('writes its insights for QGR, from the brand memory', () => {
    const withMemory = run('tracker-prepare-ads.js', run('tracker-placeholder-ads.js', run('tracker-plan.js', { ...ctx, brand: { ...brand, topics: ['EB-5 basics'] } })));
    const { body } = run('tracker-build-request.js', withMemory) as { body: Json };
    expect(materialOf(body).our_brand).toEqual({ company: 'Quantum Global Residency', offer: 'EB-5 guidance', audience: 'Indian families', topics: ['EB-5 basics'] });
    expect(String(body.system)).toContain('our_brand is QGR, who reads this report');
  });

  it('builds hooks and angle counts from the ads, not from the model', () => {
    const answer = {
      competitor_name: 'Horizon Visa Partners',
      summary: 'Age-out urgency runs longest.',
      website_summary: 'Families first.',
      insights: ['One', 'Two', 'Three'],
      hooks: [
        { text: 'The H-1B lottery is not a plan.', ad_ids: ['a3', 'a4'] },
        { text: "Your kids shouldn't age out while you wait.", ad_ids: ['a1', 'a2', 'a99'] },
        { text: 'Claimed twice', ad_ids: ['a1'] },
      ],
      ad_angles: [
        { ad_id: 'a1', angle: 'Family & education' },
        { ad_id: 'a2', angle: 'Family & education' },
        { ad_id: 'a3', angle: 'Timeline & urgency' },
        { ad_id: 'a99', angle: 'Other' },
      ],
    };
    const out = run('tracker-read-answer.js', reply(answer), { 'Prepare the ads': prepared });
    expect(out.ok).toBe(true);
    const report = out.p_report as Json;
    expect(report.competitor).toEqual({ name: 'Horizon Visa Partners', domain: 'horizonvisa.com' });
    expect(report.data_source).toBe('placeholder');
    expect(report.active_ads).toBe(10);
    // Ranked by days running; versions are the ads that share it; unknown ids and reused ads are dropped.
    expect(report.hooks).toEqual([
      { text: "Your kids shouldn't age out while you wait.", platform: 'meta', format: 'video', days_running: 63, variations: 2 },
      { text: 'The H-1B lottery is not a plan.', platform: 'meta', format: 'image', days_running: 41, variations: 2 },
    ]);
    expect(report.angles).toEqual([
      { label: 'Family & education', ads: 2 },
      { label: 'Timeline & urgency', ads: 1 },
    ]);
    // Every ad is kept, longest-running first, with its angle, for a person to choose from.
    const ads = report.ads as Json[];
    expect(ads).toHaveLength(10);
    expect(ads[0]).toMatchObject({ text: "Your kids shouldn't age out while you wait.", days_running: 63, headline: 'Plan your EB-5 timeline', cta: 'Book now', angle: 'Family & education' });
    expect(ads[0]).not.toHaveProperty('days_known');
    expect(ads[9]).toMatchObject({ days_running: 6, angle: null });
    expect(out.p_usage).toMatchObject({ model: 'claude-haiku-5-5', input_tokens: 5000, output_tokens: 1500 });
  });

  it('turns a refusal or unreadable answer into a stated failure, keeping the usage', () => {
    const refused = run('tracker-read-answer.js', { ...reply({}), stop_reason: 'refusal', stop_details: { category: 'general_harms' }, content: [] }, { 'Prepare the ads': prepared });
    expect(refused).toMatchObject({ ok: false, p_error: 'Claude declined to analyse these ads (general_harms).' });
    expect(refused.p_usage).toMatchObject({ input_tokens: 5000 });
    const garbled = run('tracker-read-answer.js', { ...reply({}), content: [{ type: 'text', text: 'not json' }] }, { 'Prepare the ads': prepared });
    expect(garbled).toMatchObject({ ok: false, p_error: 'Claude did not return a readable report.' });
  });

  it('refuses to report when there are no active ads', () => {
    expect(() => run('tracker-prepare-ads.js', { ...raw, ads: [] })).toThrow('No active ads');
  });
});

describe('Competitor Tracker, reading screenshots of their ads', () => {
  const STORAGE = 'https://project.supabase.co/storage/v1';
  const files = ['shots/0b6f7a4e-1f2a-4c3b-9d8e-7f6a5b4c3d01/1c6f7a4e-1f2a-4c3b-9d8e-7f6a5b4c3d01.png', 'shots/0b6f7a4e-1f2a-4c3b-9d8e-7f6a5b4c3d01/2c6f7a4e-1f2a-4c3b-9d8e-7f6a5b4c3d02.jpg'];
  const shotRun = { id: 'run-9', kind: 'competitor', input: 'upload', url: null, competitor_name: 'Horizon Visa', files, platforms: ['meta'], goal: 'consultations', title: 'Horizon · 2 screenshots', page: null };
  const signed = { statusCode: 200, body: files.map((path) => ({ path, signedURL: `/object/sign/competitor-shots/${path}?token=t`, error: null })) };

  it('reads the screenshots whichever ads source the team chose, and only real ones', () => {
    for (const ads_source of ['sample', 'apify']) {
      expect(run('tracker-plan.js', { run: shotRun, brand, ads_source })).toMatchObject({ screenshots: files, library: null, competitorHint: 'Horizon Visa' });
    }
    // Runs from before screenshots named bare files, with nothing to read.
    expect(run('tracker-plan.js', { run: { ...shotRun, files: ['ad1.png'] }, brand })).toMatchObject({ screenshots: [] });
    expect(run('tracker-plan.js', { run: { ...shotRun, input: 'website', url: 'https://h.example/', files: null }, brand })).toMatchObject({ screenshots: [] });
  });

  const plan = run('tracker-plan.js', { run: shotRun, brand });
  const shots = run('tracker-screenshot-ads.js', signed, { 'Plan the scan': plan }, { __STORAGE__: STORAGE });
  const prepared = run('tracker-prepare-ads.js', shots);

  it('hands Claude each screenshot through a link Storage signed, after its number', () => {
    expect(shots).toMatchObject({ dataSource: 'upload', ads: [] });
    expect(prepared).toEqual(shots);
    const { body } = run('tracker-build-request.js', prepared) as { body: Json };
    assertRequest(body, 'medium');
    const content = (body.messages as { content: Json[] }[])[0]!.content;
    expect(content.slice(1)).toEqual([
      { type: 'text', text: 'Screenshot 1:' },
      { type: 'image', source: { type: 'url', url: `${STORAGE}/object/sign/competitor-shots/${files[0]}?token=t` } },
      { type: 'text', text: 'Screenshot 2:' },
      { type: 'image', source: { type: 'url', url: `${STORAGE}/object/sign/competitor-shots/${files[1]}?token=t` } },
    ]);
    const material = JSON.parse(String(content[0]!.text).split('\n').slice(1).join('\n'));
    expect(material).toMatchObject({ screenshots: 2, competitor: { name_hint: 'Horizon Visa' } });
    expect(material).not.toHaveProperty('ads');
    expect(String(body.system)).toContain('First read every piece of their marketing in the screenshots into ads_read');
    expect(String(body.system)).toContain('never claim spend, clicks or reach');
    const schema = (body.output_config as { format: { schema: { required: string[] } } }).format.schema;
    expect(schema.required[0]).toBe('ads_read');
  });

  it('stops with a reason when Storage would not sign them', () => {
    expect(() => run('tracker-screenshot-ads.js', { statusCode: 400, body: { error: 'not found' } }, { 'Plan the scan': plan }, { __STORAGE__: STORAGE })).toThrow('The screenshots could not be read from storage (400)');
    const one = { statusCode: 200, body: [signed.body[0]] };
    expect(() => run('tracker-screenshot-ads.js', one, { 'Plan the scan': plan }, { __STORAGE__: STORAGE })).toThrow('could not be read');
  });

  it('keeps the ads Claude read, with their screenshot, counting days only from a start date shown', () => {
    const read = (id: string, shot: number, text: string, started_on = '') => ({
      id, shot, kind: 'ad', platform: 'meta', format: 'image', page_name: 'Horizon Visa', text, headline: '', cta: 'Learn more', started_on, ended_on: '',
      active: '', versions: '', placements: [], reactions: '', comments: '', shares: '', views: '',
    });
    const started = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const answer = {
      ads_read: [
        read('a1', 1, '  Your kids should not   age out. '),
        read('a2', 2, 'Plan before the bulletin moves.', started),
        read('a3', 3, 'A screenshot that was never sent.'),
        read('a4', 1, ''),
        read('a1', 2, 'The same id again.'),
        read('a5', 2, 'A start date in the future.', '2999-01-01'),
      ],
      competitor_name: 'Horizon Visa Partners LLC',
      summary: 'They lead with children.',
      website_summary: '',
      insights: ['Only two ads: a small sample.'],
      hooks: [{ text: 'Your kids should not age out.', ad_ids: ['a1'] }, { text: 'Plan before the bulletin moves.', ad_ids: ['a2', 'a5'] }],
      ad_angles: [{ ad_id: 'a1', angle: 'Family & education' }, { ad_id: 'a2', angle: 'Timeline & urgency' }],
    };
    const out = run('tracker-read-answer.js', reply(answer), { 'Prepare the ads': prepared });
    expect(out.ok).toBe(true);
    const report = out.p_report as Json;
    // The competitor is who the team named.
    expect(report).toMatchObject({ competitor: { name: 'Horizon Visa', domain: null }, data_source: 'upload', active_ads: 3, platforms: ['meta'] });
    expect(report.hooks).toEqual([
      { text: 'Plan before the bulletin moves.', platform: 'meta', format: 'image', days_running: 20, variations: 2 },
      { text: 'Your kids should not age out.', platform: 'meta', format: 'image', days_running: 0, variations: 1, days_known: false },
    ]);
    const none = { kind: 'ad', versions: null, placements: [], active: null };
    expect(report.ads).toEqual([
      { platform: 'meta', format: 'image', text: 'Plan before the bulletin moves.', days_running: 20, ad_url: null, media_url: null, headline: null, cta: 'Learn more', page_name: 'Horizon Visa', angle: 'Timeline & urgency', ...none, screenshot_path: files[1] },
      { platform: 'meta', format: 'image', text: 'Your kids should not age out.', days_running: 0, ad_url: null, media_url: null, headline: null, cta: 'Learn more', page_name: 'Horizon Visa', angle: 'Family & education', ...none, days_known: false, screenshot_path: files[0] },
      { platform: 'meta', format: 'image', text: 'A start date in the future.', days_running: 0, ad_url: null, media_url: null, headline: null, cta: 'Learn more', page_name: 'Horizon Visa', angle: null, ...none, days_known: false, screenshot_path: files[1] },
    ]);
  });

  it('reads an email or a page as what it is, and the counts a screenshot shows as numbers worked out here', () => {
    const item = (id: string, seen: Json) => ({
      id, shot: 1, kind: 'ad', platform: 'meta', format: 'image', page_name: 'EB5UNITED', text: `Item ${id}.`, headline: '', cta: '', started_on: '', ended_on: '',
      active: '', versions: '', placements: [], reactions: '', comments: '', shares: '', views: '', ...seen,
    });
    const answer = {
      ads_read: [
        item('a1', { kind: 'email', platform: 'meta', format: 'text' }),
        item('a2', { kind: 'page', platform: 'x' }),
        item('a3', { active: 'inactive', versions: '6', placements: ['facebook', 'instagram', 'facebook', 'tiktok'], reactions: '1.2K', comments: '3,456', shares: '2M', views: 'many' }),
        item('a4', { kind: 'post', versions: '0' }),
      ],
      competitor_name: 'EB5UNITED', summary: 'A newsletter and a page.', website_summary: '', insights: ['x'],
      hooks: [{ text: 'Item a1.', ad_ids: ['a1', 'a2', 'a3', 'a4'] }],
      ad_angles: [],
    };
    const ads = (run('tracker-read-answer.js', reply(answer), { 'Prepare the ads': prepared }).p_report as { ads: Json[] }).ads;
    expect(ads.map((a) => [a.kind, a.platform])).toEqual([['email', 'email'], ['page', 'web'], ['ad', 'meta'], ['post', 'meta']]);
    expect(ads[2]).toMatchObject({ active: false, versions: 6, placements: ['facebook', 'instagram'], reactions: 1200, comments: 3456, shares: 2000000 });
    // A stopped ad without the day it ended has no days running: never the days since it started.
    expect(ads[2]).toMatchObject({ days_running: 0, days_known: false });
    // A count the screenshot did not show is left out, never zero.
    expect(ads[2]).not.toHaveProperty('views');
    expect(ads[3]).toMatchObject({ versions: null });
  });

  it('counts a stopped ad from its start to its end, and reads counts written every way', () => {
    const item = (id: string, seen: Json) => ({
      id, shot: 1, kind: 'ad', platform: 'meta', format: 'image', page_name: 'EB5UNITED', text: `Item ${id}.`, headline: '', cta: '', started_on: '', ended_on: '',
      active: '', versions: '', placements: [], reactions: '', comments: '', shares: '', views: '', ...seen,
    });
    const answer = {
      ads_read: [
        item('a1', { started_on: '2026-06-01', ended_on: '2026-06-04', active: 'inactive', reactions: '1,2K', comments: '1.234', shares: '3B' }),
        item('a2', { started_on: '2026-06-01', active: 'inactive', reactions: '12K+', views: '2,5 Mio.' }),
      ],
      competitor_name: 'EB5UNITED', summary: 'Two stopped ads.', website_summary: '', insights: ['x'],
      hooks: [{ text: 'Item a1.', ad_ids: ['a1', 'a2'] }],
      ad_angles: [],
    };
    const ads = (run('tracker-read-answer.js', reply(answer), { 'Prepare the ads': prepared }).p_report as { ads: Json[] }).ads;
    const byText = (t: string) => ads.find((a) => a.text === t)!;
    expect(byText('Item a1.')).toMatchObject({ days_running: 3, active: false, reactions: 1200, comments: 1234, shares: 2000000000 });
    expect(byText('Item a1.')).not.toHaveProperty('days_known');
    expect(byText('Item a2.')).toMatchObject({ days_running: 0, days_known: false, active: false, reactions: 12000, views: 2500000 });
  });

  it('fails with what Claude saw when nothing in the screenshots is marketing it can read', () => {
    const answer = { ads_read: [], competitor_name: '', summary: 'A photo of an office, with no words.', website_summary: '', insights: ['x'], hooks: [], ad_angles: [] };
    expect(run('tracker-read-answer.js', reply(answer), { 'Prepare the ads': prepared })).toMatchObject({
      ok: false,
      p_error: 'Claude found no ad, post, email or web page it could read in the screenshots: A photo of an office, with no words.',
    });
  });
});

describe('Competitor Tracker, reading real ads through Apify', () => {
  const page = { ok: true, url: 'https://www.horizonvisa.com/', title: 'Horizon Visa Partners', siteName: 'Horizon Visa', description: 'EB-5 advisors.', type: 'website', text: 'Families first.', words: 2, readAt: '2026-10-08T09:00:00Z' };
  const website = { id: 'run-1', kind: 'competitor', input: 'website', url: 'https://www.horizonvisa.com/', platforms: ['meta'], goal: 'consultations', title: 'horizonvisa.com', page };
  const apify = (runRow: Json) => run('tracker-plan.js', { run: runRow, brand, ads_source: 'apify' });

  /** Apify's dataset items, one n8n item each, as the HTTP node hands them on. */
  function read(items: Json[], plan: Json): Json {
    const code = readFileSync(join(here, 'code', 'tracker-apify-ads.js'), 'utf8');
    const all = items.map((json) => ({ json }));
    const $input = { first: () => all[0], all: () => all };
    const out = inN8n(code, $input, (name: string) => {
      if (name !== 'Plan the scan') throw new Error(`Node "${name}" has not run`);
      return { first: () => ({ json: plan }) };
    }) as Items;
    expect(out).toHaveLength(1);
    return out[0]!.json;
  }

  const day = 86_400;
  const now = Math.round(Date.now() / 1000);
  // The actor's camelCase items (current versions)...
  const camel = (id: string, pageName: string, body: string, extra: Json = {}): Json => ({
    adArchiveID: id,
    pageName,
    pageID: '1029384756',
    isActive: true,
    startDate: now - 63 * day,
    publisherPlatform: ['FACEBOOK', 'INSTAGRAM'],
    snapshot: {
      body: { text: body },
      title: 'Plan your EB-5 timeline',
      ctaText: 'Book now',
      linkUrl: 'https://l.facebook.com/l.php?u=https%3A%2F%2Fwww.horizonvisa.com%2Ffamilies&h=AT0',
      displayFormat: 'VIDEO',
      videos: [{ videoHdUrl: 'https://video.example/hd.mp4', videoPreviewImageUrl: 'https://scontent.example/preview.jpg' }],
      images: [],
      cards: [],
    },
    ...extra,
  });
  // ...and the snake_case ones Meta's own answer uses, which some versions pass on.
  const snake = (id: string, pageName: string, body: string, extra: Json = {}): Json => ({
    ad_archive_id: id,
    page_name: pageName,
    is_active: true,
    start_date: new Date((now - 12 * day) * 1000).toISOString(),
    publisher_platform: ['FACEBOOK'],
    snapshot: {
      body: { markup: { __html: body.replace('. ', '.<br />') } },
      title: null,
      cta_text: 'Learn more',
      link_url: 'https://horizonvisa.com/guide',
      display_format: 'IMAGE',
      images: [{ original_image_url: 'https://scontent.example/original.jpg', resized_image_url: 'https://scontent.example/small.jpg' }],
      cards: [],
    },
    ...extra,
  });

  it('reads a pasted Meta Ad Library link as it is, and refuses another library', () => {
    const link = 'https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=ALL&view_all_page_id=1029384756';
    expect(apify({ ...website, input: 'ad_link', url: link, page: null })).toMatchObject({ adsSource: 'apify', library: { url: link, keep: null } });
    expect(() => apify({ ...website, input: 'ad_link', url: 'https://www.linkedin.com/ad-library/search?companyIds=1', page: null })).toThrow("Apify reads Meta's Ad Library, and this link is to another one");
  });

  it('looks a website or an upload up by the competitor’s name, kept to their ads', () => {
    const plan = apify(website);
    expect(plan.library).toEqual({
      url: 'https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=ALL&media_type=all&search_type=keyword_unordered&q=Horizon%20Visa',
      query: 'Horizon Visa',
      keep: { name: 'Horizon Visa', domain: 'horizonvisa.com' },
    });
    const upload = apify({ id: 'run-2', kind: 'competitor', input: 'upload', competitor_name: 'Atlas Residency Group', files: ['ad1.png'], platforms: ['meta'], goal: 'consultations', title: 'Atlas' });
    expect(upload.library).toMatchObject({ query: 'Atlas Residency Group', keep: { name: 'Atlas Residency Group', domain: null } });
    // Sample ads, as before, unless the team switched to Apify.
    expect(run('tracker-plan.js', { run: website, brand })).toMatchObject({ adsSource: 'sample', library: null });
    expect(run('tracker-plan.js', { run: website, brand, ads_source: 'sample' })).toMatchObject({ adsSource: 'sample', library: null });
  });

  it('turns either shape of Apify’s items into the ads the tracker reads', () => {
    const plan = apify(website);
    const out = read(
      [
        camel('1111111111', 'Horizon Visa Partners', "Your kids shouldn't age out while you wait. Here's how families plan ahead."),
        snake('2222222222', 'Horizon Visa', 'The H-1B lottery is not a plan. This is.', { collation_count: 4 }),
      ],
      plan,
    );
    expect(out).toMatchObject({ runId: 'run-1', dataSource: 'apify', domain: 'horizonvisa.com', websiteText: plan.websiteText });
    const ads = out.ads as Json[];
    expect(ads[0]).toEqual({
      id: '1111111111',
      platform: 'meta',
      format: 'video',
      startDate: new Date((now - 63 * day) * 1000).toISOString(),
      isActive: true,
      versions: null,
      placements: ['facebook', 'instagram'],
      pageName: 'Horizon Visa Partners',
      text: "Your kids shouldn't age out while you wait. Here's how families plan ahead.",
      headline: 'Plan your EB-5 timeline',
      cta: 'Book now',
      adUrl: 'https://www.facebook.com/ads/library/?id=1111111111',
      mediaUrl: 'https://scontent.example/preview.jpg',
    });
    expect(ads[1]).toMatchObject({ id: '2222222222', versions: 4, placements: ['facebook'], format: 'image', text: 'The H-1B lottery is not a plan. This is.', headline: null, cta: 'Learn more', mediaUrl: 'https://scontent.example/original.jpg' });

    // Days running are worked out from the start date, as for the sample ads.
    const prepared = run('tracker-prepare-ads.js', out);
    expect((prepared.ads as Json[]).map((a) => [a.days_running, a.hook_line, a.versions, a.placements])).toEqual([
      [63, "Your kids shouldn't age out while you wait.", null, ['facebook', 'instagram']],
      [12, 'The H-1B lottery is not a plan.', 4, ['facebook']],
    ]);
    // Claude reads them too, with what Meta says of each.
    const material = materialOf((run('tracker-build-request.js', prepared) as { body: Json }).body);
    expect((material.ads as Json[])[1]).toMatchObject({ versions: 4, placements: ['facebook'] });
    expect(material.ads as Json[]).not.toContainEqual(expect.objectContaining({ id: 'a1', versions: expect.anything() }));
  });

  it('keeps a search to the competitor’s own ads, once each, and skips template words', () => {
    const plan = apify(website);
    const out = read(
      [
        camel('1', 'Horizon Visa Partners', 'Ours, by Page name.'),
        camel('1', 'Horizon Visa Partners', 'The same ad twice.'),
        snake('2', 'EB-5 Daily News', 'Theirs, by the link to their site.'),
        camel('3', 'Atlas Residency', 'Another firm that named them.', { snapshot: { body: { text: 'Another firm that named them.' }, linkUrl: 'https://atlas.example/' } }),
        camel('4', 'Horizon Visa Partners', '{{product.brand}}', { snapshot: { body: { text: '{{product.brand}}' }, displayFormat: 'DCO', cards: [{ body: 'A catalogue card with words.', title: 'Card' }, { body: '{{product.name}}' }] } }),
        camel('5', 'Horizon Visa Partners', '{{product.brand}}', { snapshot: { body: { text: '{{product.brand}}' }, cards: [] } }),
        // Seen in a real scan: real words under a headline that is still a template.
        camel('6', 'Horizon Visa Partners', 'Real words, template headline.', { snapshot: { body: { text: 'Real words, template headline.' }, title: '{{product.name}}' } }),
        // And a template headline over a card with a real one, as EB5AN's ads came.
        camel('7', 'Horizon Visa Partners', '{{product.brand}}', { snapshot: { body: { text: '{{product.brand}}' }, title: '{{product.name}}', displayFormat: 'DCO', cards: [{ body: 'Card words.', title: 'Card headline' }] } }),
        {},
      ],
      plan,
    );
    expect((out.ads as Json[]).map((a) => [a.id, a.text, a.format])).toEqual([
      ['1', 'Ours, by Page name.', 'video'],
      ['2', 'Theirs, by the link to their site.', 'image'],
      ['4', 'A catalogue card with words.', 'carousel'],
      ['6', 'Real words, template headline.', 'text'],
      ['7', 'Card words.', 'carousel'],
    ]);
    expect((out.ads as Json[]).find((a) => a.id === '6')!.headline).toBeNull();
    expect((out.ads as Json[]).find((a) => a.id === '7')!.headline).toBe('Card headline');
  });

  it('says plainly when there is nothing to read', () => {
    const plan = apify(website);
    // An empty answer reaches the step as one empty item.
    expect(() => read([{}], plan)).toThrow(`Meta's Ad Library has no active ads for "Horizon Visa".`);
    expect(() => read([camel('9', 'Atlas Residency', 'Not theirs.', { snapshot: { body: { text: 'Not theirs.' }, linkUrl: 'https://atlas.example/' } })], plan)).toThrow(
      `Meta's Ad Library has ads for "Horizon Visa", but none from Horizon Visa's Page or linking to their website.`,
    );
    const link = apify({ ...website, input: 'ad_link', url: 'https://www.facebook.com/ads/library/?id=123', page: null });
    expect(() => read([{}], link)).toThrow("Meta's Ad Library has no active ads at that link.");
    // A pasted link is the team's choice: every ad it shows is read.
    expect((read([camel('7', 'Anyone at all', 'Read as it is.')], link).ads as Json[]).map((a) => a.id)).toEqual(['7']);
  });
});

describe('Ad Strategist', () => {
  const report = { competitor: 'Horizon', summary: 's', insights: ['i'], angles: [], hooks: [{ rank: 1, text: 'h' }], website_summary: null };
  const competitorCtx = { run: { id: 'run-2', kind: 'competitor', input: 'website', url: 'https://h.com/', title: 'h.com', platforms: ['meta', 'x'], goal: 'consultations' }, brand, report };
  const podcastPage = { ok: true, url: 'https://pod.example/ep-12', title: 'Ep. 12 · The Green Card Hour', siteName: null, description: 'Three questions to ask before you pick a project.', type: 'podcast', text: 'Three questions to ask before you pick a project.', words: 9, readAt: '2026-10-08T09:00:00Z' };
  const customCtx = { run: { id: 'run-3', kind: 'custom', input: 'podcast', url: 'https://pod.example/ep-12', title: 'Ep. 12: From H-1B to EB-5', platforms: ['meta', 'linkedin', 'x'], goal: 'webinar', page: podcastPage }, brand, report: null };

  it('builds from the report on a competitor run, and from the stored page on a custom one', () => {
    const fromReport = run('strategist-plan.js', competitorCtx);
    expect(fromReport).toMatchObject({ sourceText: '', sourceLabel: null, clip: null });
    const fromPodcast = run('strategist-plan.js', customCtx);
    expect(fromPodcast).toMatchObject({ sourceText: 'Three questions to ask before you pick a project.', sourceLabel: 'Podcast · Ep. 12: From H-1B to EB-5', page: { title: 'Ep. 12 · The Green Card Hour' } });

    const { body } = run('strategist-build-request.js', fromPodcast) as { body: Json };
    assertRequest(body, 'high');
    const material = JSON.parse(String((body.messages as { content: string }[])[0]!.content).split('\n').slice(1).join('\n'));
    expect(material.source).toMatchObject({ type: 'podcast', title: 'Ep. 12 · The Green Card Hour', url: 'https://pod.example/ep-12', text: 'Three questions to ask before you pick a project.' });
    expect(material.source.note).toMatch(/No transcript yet/);
    expect(material.goal).toBe('Webinar sign-ups');
    const channelEnum = (body.output_config as Json & { format: { schema: Json } }).format.schema;
    expect(JSON.stringify(channelEnum)).toContain('"enum":["meta","linkedin","x"]');
  });

  it('follows the team’s direction when they gave one, and asks exactly as before when not', () => {
    const directed = run('strategist-build-request.js', run('strategist-plan.js', { ...customCtx, run: { ...customCtx.run, guidance: 'Lead with the family angle.' } })) as { body: Json };
    expect(materialOf(directed.body).direction).toBe('Lead with the family angle.');
    expect(String(directed.body.system)).toContain("direction is the QGR team's brief for this run");
    expect(String(directed.body.system)).toContain('the rule above wins');
    const plain = (run('strategist-build-request.js', run('strategist-plan.js', customCtx)) as { body: Json }).body;
    expect(materialOf(plain)).not.toHaveProperty('direction');
    expect(String(plain.system)).not.toContain('direction');
  });

  it('keeps to the topics and learns from the posts that work, when the brand memory has them', () => {
    const memory = { ...customCtx, brand: { ...brand, topics: ['EB-5 basics'] }, examples: [{ place: 'linkedin', text: 'A post that worked.', note: null, source: 'marked' }] };
    const { body } = run('strategist-build-request.js', run('strategist-plan.js', memory)) as { body: Json };
    expect(body.max_tokens).toBe(24000);
    expect(materialOf(body).posts_that_work).toEqual([{ place: 'linkedin', text: 'A post that worked.' }]);
    expect((materialOf(body).brand as Json).topics).toEqual(['EB-5 basics']);
    expect(String(body.system)).toContain('brand.topics is what QGR usually posts about');
    expect(String(body.system)).toContain('posts_that_work are posts the team kept');
    const plain = (run('strategist-build-request.js', run('strategist-plan.js', customCtx)) as { body: Json }).body;
    expect(String(plain.system)).not.toContain('brand.topics');
    expect(materialOf(plain)).not.toHaveProperty('posts_that_work');
  });

  it('builds from the team’s notes on an uploaded clip', () => {
    const clipCtx = { run: { id: 'run-6', kind: 'custom', input: 'video', url: null, title: 'Founder clip', excerpt: 'Our founder explains concurrent filing for families on H-1B visas.', media_path: 'uploads/u/c.mp4', media: { duration: 42.6 }, platforms: ['meta'], goal: 'consultations' }, brand, report: null };
    const plan = run('strategist-plan.js', clipCtx);
    expect(plan).toMatchObject({ sourceText: clipCtx.run.excerpt, clip: { duration: 42.6 }, sourceLabel: 'Uploaded clip · Founder clip' });
    const { body } = run('strategist-build-request.js', plan) as { body: Json };
    const material = JSON.parse(String((body.messages as { content: string }[])[0]!.content).split('\n').slice(1).join('\n'));
    expect(material.source).toMatchObject({ type: 'video', title: 'Founder clip', text: clipCtx.run.excerpt });
    expect(material.source).not.toHaveProperty('url');
    expect(material.source.note).toBe("An uploaded video clip of 0:43, which the ads will use. There is no transcript: the text is the team's own description of what is said in it.");
  });

  it('says when a clip’s words are its transcript', () => {
    const clipCtx = { run: { id: 'run-7', kind: 'custom', input: 'video', url: null, title: 'Founder clip', excerpt: 'EB-5 is an investment, and it carries risk.', media_path: 'uploads/u/c.mp4', media: { duration: 6.5, transcript: [{ start: 0.4, end: 2.9, text: 'EB-5 is an investment, and it carries risk.' }] }, platforms: ['meta'], goal: 'consultations' }, brand, report: null };
    const plan = run('strategist-plan.js', clipCtx);
    expect(plan).toMatchObject({ clip: { duration: 6.5, transcript: true } });
    const { body } = run('strategist-build-request.js', plan) as { body: Json };
    const material = JSON.parse(String((body.messages as { content: string }[])[0]!.content).split('\n').slice(1).join('\n'));
    expect(material.source.note).toBe('An uploaded video clip of 0:07, which the ads will use. The text is what is said in it: a transcript the team read over before the run started.');
  });

  it('builds on the ads the team chose from the report, and asks exactly as before without them', () => {
    const chosen_ads = [
      { platform: 'meta', format: 'image', text: 'Your kids should not age out.', headline: 'Plan now', cta: 'Learn more', angle: 'Family & education', days_running: null },
      { platform: 'meta', format: 'video', text: 'The H-1B lottery is not a plan.', headline: null, cta: null, angle: null, days_running: 41 },
    ];
    const { body } = run('strategist-build-request.js', run('strategist-plan.js', { ...competitorCtx, chosen_ads })) as { body: Json };
    const material = JSON.parse(String((body.messages as { content: string }[])[0]!.content).split('\n').slice(1).join('\n'));
    expect(material.competitor_report.chosen_ads).toEqual([
      { platform: 'meta', format: 'image', text: 'Your kids should not age out.', headline: 'Plan now', cta: 'Learn more', angle: 'Family & education' },
      { platform: 'meta', format: 'video', text: 'The H-1B lottery is not a plan.', days_running: 41 },
    ]);
    expect(String(body.system)).toContain("competitor_report.chosen_ads are the competitor's ads the QGR team picked");
    const plain = (run('strategist-build-request.js', run('strategist-plan.js', competitorCtx)) as { body: Json }).body;
    const empty = (run('strategist-build-request.js', run('strategist-plan.js', { ...competitorCtx, chosen_ads: null })) as { body: Json }).body;
    expect(empty).toEqual(plain);
    expect(String(plain.system)).not.toContain('chosen_ads');
  });

  describe('how QGR’s own posts did', () => {
    const result = (angle: string, place: string, counts: Json) => ({ angle, creative_text: `Hook for ${angle}`, headline: `Headline ${angle}`, place, posted_at: '2026-09-28T15:00:09+00:00', reach: null, views: null, reactions: null, comments: null, shares: null, clicks: null, ...counts });
    const results = [
      result('Live Q&A', 'facebook', { reach: 1860, views: 2410, reactions: 71, comments: 9, shares: 6, clicks: 48 }),
      result('Costs, plainly', 'instagram', { reach: 3120, reactions: 140, comments: 18, shares: 25 }),
      result('Off the treadmill', 'linkedin', { reach: 1510, reactions: 64, comments: 12, shares: 9, clicks: 57 }),
      // No reach, so per view; and one with neither, which cannot be ranked.
      result('Judge a project', 'facebook', { views: 1000, reactions: 20 }),
      result('Nothing back', 'linkedin', {}),
    ];
    const material = (body: Json) => JSON.parse(String((body.messages as { content: string }[])[0]!.content).split('\n').slice(1).join('\n'));

    it('ranks them by engagement, worked out in code the way the dashboard does', () => {
      const plan = run('strategist-plan.js', { ...competitorCtx, results });
      const { body } = run('strategist-build-request.js', plan) as { body: Json };
      const past = material(body).our_past_posts as { angle: string; platform: string; reached: number; engagement: string }[];
      expect(past.map((x) => x.angle)).toEqual(['Off the treadmill', 'Live Q&A', 'Costs, plainly', 'Judge a project']);
      expect(past[0]).toMatchObject({ platform: 'LinkedIn', reached: 1510, hook: 'Hook for Off the treadmill', headline: 'Headline Off the treadmill', posted: '2026-09-28' });
      // The same number the dashboard shows for each.
      for (const x of past) {
        const r = results.find((y) => y.angle === x.angle)!;
        expect(x.engagement).toBe(formatRate(engagementRate({ ...r, at: '' } as never)!));
      }
      expect(String(body.system)).toMatch(/our_past_posts is how QGR's own recent posts did/);
      expect(String(body.system)).toMatch(/no ad may quote them\.$/);
    });

    it('keeps the best five and the weakest three of many', () => {
      const many = Array.from({ length: 12 }, (_, i) => result(`Angle ${i}`, 'facebook', { reach: 1000, reactions: 10 * (i + 1) }));
      const { body } = run('strategist-build-request.js', run('strategist-plan.js', { ...competitorCtx, results: many })) as { body: Json };
      expect((material(body).our_past_posts as { angle: string }[]).map((x) => x.angle)).toEqual(['Angle 11', 'Angle 10', 'Angle 9', 'Angle 8', 'Angle 7', 'Angle 2', 'Angle 1', 'Angle 0']);
    });

    it('leaves the request exactly as it was when there are none', () => {
      const without = run('strategist-build-request.js', run('strategist-plan.js', competitorCtx)) as { body: Json };
      const empty = run('strategist-build-request.js', run('strategist-plan.js', { ...competitorCtx, results: [result('Nothing back', 'linkedin', {})] })) as { body: Json };
      expect(empty).toEqual(without);
      expect(String(without.body.system)).not.toContain('our_past_posts');
      expect(material(without.body)).not.toHaveProperty('our_past_posts');
    });
  });

  it('keeps one channel per platform with shares adding to 100, and the brand guardrails first', () => {
    const plan = run('strategist-plan.js', competitorCtx);
    const answer = {
      title: 'Q4 push',
      summary: 'Lead with diligence.',
      positioning: 'The advisor that shows its homework.',
      audiences: ['H-1B professionals'],
      angles: [
        { name: 'A', why: 'w', hook: 'h1', based_on_hook: 'h' },
        { name: 'B', why: 'w', hook: 'h2', based_on_hook: null },
        { name: 'C', why: 'w', hook: 'h3', based_on_hook: null },
      ],
      channels: [
        { platform: 'meta', share: 55, role: 'Parents', format: 'Video' },
        { platform: 'meta', share: 10, role: 'dup', format: 'x' },
        { platform: 'x', share: 20, role: 'Talk', format: 'Posts' },
      ],
      guardrails: ['Present processing times as estimates', 'Never name a competitor', 'A third rule'],
    };
    const out = run('strategist-read-answer.js', reply(answer), { 'Gather the material': plan });
    expect(out.ok).toBe(true);
    const s = out.p_strategy as { channels: { platform: string; share: number }[]; guardrails: string[] };
    expect(s.channels.map((c) => [c.platform, c.share])).toEqual([['meta', 73], ['x', 27]]);
    expect(s.guardrails).toEqual(['Never promise an outcome, a timeline or a return', 'Present processing times as estimates', 'Never name a competitor']);
  });

  it('fails clearly when the model returns fewer than three angles', () => {
    const plan = run('strategist-plan.js', competitorCtx);
    const out = run('strategist-read-answer.js', reply({ title: 't', summary: 's', positioning: 'p', audiences: ['a'], angles: [{ name: 'A', why: 'w', hook: 'h', based_on_hook: null }], channels: [], guardrails: [] }), { 'Gather the material': plan });
    expect(out).toMatchObject({ ok: false, p_error: 'Claude did not return three complete angles.' });
  });
});

describe('Content Agent', () => {
  const strategy = {
    title: 'Q4 consultation push',
    positioning: 'p',
    audiences: ['a'],
    channels: [],
    guardrails: ['Never promise an outcome, a timeline or a return'],
    angles: [
      { position: 0, name: 'Clarity over hype', why: 'w', hook: 'h' },
      { position: 1, name: 'Family first', why: 'w', hook: 'h' },
      { position: 2, name: 'Diligence', why: 'w', hook: 'h' },
    ],
  };
  const ctx = { run: { id: 'run-4', platforms: ['meta', 'x'], goal: 'consultations' }, brand, strategy };

  it('asks only for the platforms the run selected', () => {
    const { body } = run('content-build-request.js', ctx) as { body: Json };
    assertRequest(body, 'high');
    const schema = JSON.stringify((body.output_config as { format: { schema: unknown } }).format.schema);
    expect(schema).toContain('"required":["meta","x"]');
    expect(schema).not.toContain('linkedin');
    expect(String(body.system)).toContain('X: post up to 280 characters');
    expect(String(body.system)).not.toContain('LinkedIn:');
  });

  it('names variants after their angles and flags guardrail breaches instead of hiding them', () => {
    const copy = (text: string) => ({ meta: { text, headline: 'H', description: 'D', cta: 'Book now' }, x: { text, headline: 'H' } });
    const posts = (facebook: string, instagram = 'A caption.\n\n#EB5') => ({ facebook, instagram });
    const manyTags = `A caption. ${Array.from({ length: 31 }, (_, i) => `#tag${i}`).join(' ')}`;
    const answer = {
      variants: [
        { label: 'C', creative_text: 'Ask for the file.', creative_style: 'spotlight', image_prompt: 'p', copy: copy('Clean copy.'), posts: posts('  A clean post.  ') },
        { label: 'A', creative_text: 'Mapped out. Risk-free.', creative_style: 'arcs', image_prompt: 'p', copy: copy('Your green card, guaranteed in 6 months.'), posts: posts('Approval assured.') },
        { label: 'B', creative_text: 'Move together.', creative_style: 'split', image_prompt: 'p', copy: copy('x'.repeat(290)), posts: posts('Plan early.', manyTags) },
      ],
    };
    const out = run('content-read-answer.js', reply(answer), { 'Begin: load the run': ctx });
    expect(out.ok).toBe(true);
    const variants = (out.p_ad_set as { variants: { label: string; angle: string; warnings: string[]; posts: Record<string, string> }[] }).variants;
    expect(variants.map((v) => [v.label, v.angle])).toEqual([['A', 'Clarity over hype'], ['B', 'Family first'], ['C', 'Diligence']]);
    expect(variants[0]!.warnings).toEqual(expect.arrayContaining(['meta text says "guarantee"', 'meta text promises a timeline', 'x text says "guarantee"', 'image text says "risk-free"', 'facebook post says "assured"']));
    expect(variants[1]!.warnings).toEqual(expect.arrayContaining(['x text is 290 characters; X allows 280', 'instagram post has 31 hashtags; Instagram allows 30']));
    expect(variants[2]!.warnings).toEqual([]);
    // The posts are kept trimmed, for the places Meta posts to.
    expect(variants[2]!.posts).toEqual({ facebook: 'A clean post.', instagram: 'A caption.\n\n#EB5' });

    // The studio re-checks every edit with lib/guardrails.ts: it must flag exactly what the agent flagged.
    for (const v of answer.variants) {
      const agent = variants.find((x) => x.label === v.label)!;
      expect(guardrailWarnings(v.creative_text, v.copy as Partial<Record<Platform, PlatformCopy>>, ['meta', 'x'], agent.posts)).toEqual(agent.warnings);
    }
  });

  it('fails when a variant’s post for a place is missing, or past what any place takes', () => {
    const copy = { meta: { text: 't', headline: 'H', description: 'D', cta: 'Book now' }, x: { text: 't', headline: 'H' } };
    const variant = (label: string, posts: Record<string, string>) => ({ label, creative_text: 'w', creative_style: 'arcs', image_prompt: 'p', copy, posts });
    const missing = run('content-read-answer.js', reply({ variants: [variant('A', { facebook: 'Post.' }), variant('B', { facebook: 'P', instagram: 'C' }), variant('C', { facebook: 'P', instagram: 'C' })] }), { 'Begin: load the run': ctx });
    expect(missing).toMatchObject({ ok: false, p_error: "Claude did not write variant A's Instagram post." });
    const long = run('content-read-answer.js', reply({ variants: ['A', 'B', 'C'].map((l) => variant(l, { facebook: 'x'.repeat(3001), instagram: 'C' })) }), { 'Begin: load the run': ctx });
    expect(long).toMatchObject({ ok: false, p_error: "Claude wrote variant A's Facebook post past 3,000 characters." });
  });

  it('asks for a post in full for each place the run posts to, and reads the whole chain and the brand memory', () => {
    const report = { competitor: 'Horizon', summary: 'Age-out runs longest.', insights: ['One'], angles: [], hooks: [{ rank: 1, text: 'Your kids shouldn’t age out.', days_running: 63, variations: 2 }], website_summary: null };
    const memoryCtx = {
      ...ctx,
      run: { ...ctx.run, platforms: ['meta', 'linkedin'] },
      brand: { ...brand, topics: ['EB-5 basics'], post_formats: { instagram: 'Hashtags last.', x: 'Not this run.' }, picture_style: 'Warm light.' },
      report,
      examples: [{ place: 'instagram', text: 'Three questions to ask.', note: 'Saved a lot.', source: 'pasted' }],
      results: [
        { place: 'linkedin', text: 'The post that did best.', reach: 1000, views: null, reactions: 50, comments: 5, shares: 5, clicks: 40 },
        { place: 'facebook', text: 'A quieter one.', reach: 1000, views: null, reactions: 5, comments: 0, shares: 0, clicks: 5 },
        { place: 'facebook', text: null, reach: 1000, views: null, reactions: 90, comments: 0, shares: 0, clicks: 0 },
      ],
    };
    const { body } = run('content-build-request.js', memoryCtx) as { body: Json };
    assertRequest(body, 'high');
    expect(body.max_tokens).toBe(32000);
    const schema = JSON.stringify((body.output_config as { format: { schema: unknown } }).format.schema);
    expect(schema).toContain('"posts":{"type":"object","additionalProperties":false,"required":["facebook","instagram","linkedin"]');
    expect(String(body.system)).toContain('instagram: a caption of 40 to 120 words');
    expect(String(body.system)).toContain('Keep to picture_style.');
    expect(String(body.system)).toContain('Brand memory: follow post_formats');
    const material = materialOf(body);
    expect(material.competitor_report).toMatchObject({ competitor: 'Horizon', winning_hooks: [{ text: 'Your kids shouldn’t age out.', days_running: 63, variations: 2 }] });
    expect(material.brand).toMatchObject({ topics: ['EB-5 basics'] });
    expect(material.post_formats).toEqual({ instagram: 'Hashtags last.' });
    expect(material.picture_style).toBe('Warm light.');
    expect(material.posts_that_work).toEqual([{ place: 'instagram', text: 'Three questions to ask.', why_it_worked: 'Saved a lot.' }]);
    // Best engagement first, computed as lib/results.ts does; a measured post with no words is left out.
    expect(material.our_best_posts).toEqual([
      { place: 'linkedin', text: 'The post that did best.', engagement: formatRate(engagementRate({ reach: 1000, views: null, reactions: 50, comments: 5, shares: 5, clicks: 40, at: '' })!).replace(/[^\d.%]/g, '') },
      { place: 'facebook', text: 'A quieter one.', engagement: '1.0%' },
    ]);
  });

  it('reads the source a custom run came from', () => {
    const page = { ok: true, url: 'https://journal.example/post', title: 'A post', text: 'What the source says.', words: 4 };
    const { body } = run('content-build-request.js', { ...ctx, run: { ...ctx.run, kind: 'custom', input: 'blog', title: 'Blog: A post', page } }) as { body: Json };
    expect(materialOf(body).source).toEqual({ type: 'blog', title: 'A post', text: 'What the source says.' });
    const pasted = run('content-build-request.js', { ...ctx, run: { ...ctx.run, kind: 'custom', input: 'text', title: 'Text', excerpt: 'Pasted words.' } }) as { body: Json };
    expect(materialOf(pasted.body).source).toEqual({ type: 'text', title: 'Text', text: 'Pasted words.' });
    // Without memory, nothing of it is asked for.
    expect(String(pasted.body.system)).not.toContain('Brand memory');
    expect(materialOf(pasted.body)).not.toHaveProperty('posts_that_work');
  });

  it('writes over the team’s clip on a clip run, with no image to describe', () => {
    const clipCtx = { ...ctx, run: { ...ctx.run, media_path: 'uploads/u/c.mp4', media: { duration: 42.6 }, excerpt: 'Our founder explains concurrent filing.' } };
    const { body } = run('content-build-request.js', clipCtx) as { body: Json };
    expect(String(body.system)).toContain("the line shown over the team's video clip (0:43)");
    expect(String(body.system)).toContain('image_prompt: an empty string');
    expect(String(body.system)).not.toContain('no real or identifiable people');
    const material = JSON.parse(String((body.messages as { content: string }[])[0]!.content).split('\n').slice(1).join('\n'));
    expect(material.clip).toEqual({ length: '0:43', what_is_said: 'Our founder explains concurrent filing.' });
    // A run without a clip is asked for images, as before.
    const plain = run('content-build-request.js', ctx) as { body: Json };
    expect(String(plain.body.system)).toContain('no real or identifiable people');
  });

  it('follows the team’s direction when they gave one, and asks exactly as before when not', () => {
    const directed = run('content-build-request.js', { ...ctx, run: { ...ctx.run, guidance: 'Short lines. Mention the webinar on the 24th.' } }) as { body: Json };
    expect(materialOf(directed.body).direction).toBe('Short lines. Mention the webinar on the 24th.');
    expect(String(directed.body.system)).toContain("direction is the QGR team's brief for this run");
    const plain = (run('content-build-request.js', ctx) as { body: Json }).body;
    expect(materialOf(plain)).not.toHaveProperty('direction');
    expect(String(plain.system)).not.toContain('direction');
  });

  it('spreads the three variants over the angles the team picked, and asks exactly as before without picks', () => {
    const copy = { meta: { text: 't', headline: 'H', description: 'D', cta: 'Book now' }, x: { text: 't', headline: 'H' } };
    const answer = { variants: ['A', 'B', 'C'].map((label) => ({ label, creative_text: 'w', creative_style: 'arcs', image_prompt: 'p', copy, posts: { facebook: 'P', instagram: 'C' } })) };
    const namesFor = (chosen_angles: number[] | null) => {
      const picked = { ...ctx, chosen_angles };
      const { body } = run('content-build-request.js', picked) as { body: Json };
      const out = run('content-read-answer.js', reply(answer), { 'Begin: load the run': picked });
      const variants = (out.p_ad_set as { variants: { angle: string }[] }).variants;
      return { system: String(body.system), angles: (materialOf(body).strategy as { angles: { name: string }[] }).angles.map((a) => a.name), variants: variants.map((v) => v.angle) };
    };

    const one = namesFor([1]);
    expect(one.system).toContain('Write three variants from the angles the QGR team picked: A, B and C follow the angle "Family first". Variants that share an angle are each a different take on it');
    expect(one.angles).toEqual(['Family first']);
    expect(one.variants).toEqual(['Family first', 'Family first', 'Family first']);

    const two = namesFor([2, 0]);
    expect(two.system).toContain('A and B follow the angle "Clarity over hype", C follows the angle "Diligence".');
    expect(two.angles).toEqual(['Clarity over hype', 'Diligence']);
    expect(two.variants).toEqual(['Clarity over hype', 'Clarity over hype', 'Diligence']);

    // All three picked, or none, is the strategy as it is: the request is exactly as before.
    const plain = (run('content-build-request.js', ctx) as { body: Json }).body;
    for (const chosen of [null, [0, 1, 2]]) {
      expect((run('content-build-request.js', { ...ctx, chosen_angles: chosen }) as { body: Json }).body).toEqual(plain);
      expect(namesFor(chosen).variants).toEqual(['Clarity over hype', 'Family first', 'Diligence']);
    }
    expect(String(plain.system)).toContain("Write three variants: A follows the strategy's first angle, B the second, C the third.");

    expect(() => run('content-build-request.js', { ...ctx, chosen_angles: [7] })).toThrow('The angles picked are not in the strategy.');
  });

  it('writes each ad’s video prompt on a video run, and uses the team’s reference pictures by number', () => {
    const videoCtx = {
      ...ctx,
      run: { ...ctx.run, ai_media: 'video', ai_video: { model: 'seedance_2_0_mini', seconds: 4, quality: '480p', aspect: '1:1', credits: 2 } },
      references: [{ number: 1, note: 'Our Miami office' }, { number: 2, note: null }],
    };
    const { body } = run('content-build-request.js', videoCtx) as { body: Json };
    const schema = JSON.stringify((body.output_config as { format: { schema: unknown } }).format.schema);
    expect(schema).toContain('"video_prompt":{"type":"string"}');
    expect(schema).toContain('"required":["label","creative_text","creative_style","image_prompt","copy","video_prompt","posts"]');
    expect(String(body.system)).toContain('- creative_text: the words shown over the ad\'s video, eight words at most.');
    expect(String(body.system)).toContain('- video_prompt: the ad\'s video, for a video model making 4 seconds at 1:1: one continuous shot');
    expect(String(body.system)).toContain('Write image_prompt and video_prompt to use them where they fit, naming each as reference 1, reference 2 and so on.');
    expect(materialOf(body).references).toEqual([{ number: 1, shows: 'Our Miami office' }, { number: 2 }]);

    // The answer keeps each ad's video prompt.
    const copy = { meta: { text: 't', headline: 'H', description: 'D', cta: 'Book now' }, x: { text: 't', headline: 'H' } };
    const answer = { variants: ['A', 'B', 'C'].map((label) => ({ label, creative_text: 'w', creative_style: 'arcs', image_prompt: 'p', video_prompt: `  ${label}: a slow push-in on the office at dusk.  `, copy, posts: { facebook: 'P', instagram: 'C' } })) };
    const out = run('content-read-answer.js', reply(answer), { 'Begin: load the run': videoCtx });
    expect((out.p_ad_set as { variants: { video_prompt: string }[] }).variants.map((v) => v.video_prompt)).toEqual(['A: a slow push-in on the office at dusk.', 'B: a slow push-in on the office at dusk.', 'C: a slow push-in on the office at dusk.']);
    // A picture run with references is told only about pictures.
    const pictures = (run('content-build-request.js', { ...ctx, run: { ...ctx.run, ai_media: 'pictures' }, references: [{ number: 1, note: null }] }) as { body: Json }).body;
    expect(String(pictures.system)).toContain('which the image model is given with every picture of this run');
    expect(JSON.stringify(pictures.output_config)).not.toContain('video_prompt');

    // Without a video run or references, the request and the answer are exactly as before.
    const plain = (run('content-build-request.js', ctx) as { body: Json }).body;
    expect((run('content-build-request.js', { ...ctx, run: { ...ctx.run, ai_media: 'design', ai_video: null }, references: null }) as { body: Json }).body).toEqual(plain);
    expect(JSON.stringify(plain)).not.toContain('reference');
    const before = run('content-read-answer.js', reply(answer), { 'Begin: load the run': ctx });
    expect((before.p_ad_set as { variants: Json[] }).variants[0]).not.toHaveProperty('video_prompt');
  });

  it('fails when a variant is missing', () => {
    const out = run('content-read-answer.js', reply({ variants: [] }), { 'Begin: load the run': ctx });
    expect(out).toMatchObject({ ok: false, p_error: 'Claude did not write variant A.' });
  });
});

describe('Failure reason', () => {
  const ctx = { run: { id: 'run-5' } };
  const swap = { __STAGE__: 'strategist' };
  it('reads a step that reported ok: false', () => {
    expect(run('shared-fail-reason.js', { ok: false, p_error: 'Claude declined.', p_usage: { input_tokens: 1 } }, { 'Begin: load the run': ctx }, swap)).toEqual({
      p_run_id: 'run-5', p_stage: 'strategist', p_error: 'Claude declined.', p_usage: { input_tokens: 1 },
    });
  });
  it('reads a node error output, string or object', () => {
    expect(run('shared-fail-reason.js', { error: 'timeout' }, { 'Begin: load the run': ctx }, swap).p_error).toBe('timeout');
    expect(run('shared-fail-reason.js', { error: { message: 'Bad request', description: 'temperature is not supported' } }, { 'Begin: load the run': ctx }, swap).p_error).toBe('temperature is not supported');
  });
});

describe('the workflow sources', () => {
  it('are JavaScript that n8n can read', () => {
    const sdk = ['workflow', 'node', 'trigger', 'sticky', 'newCredential', 'ifElse', 'switchCase', 'expr'];
    const files = readdirSync(join(here, 'workflows')).filter((f) => f.endsWith('.sdk.js'));
    expect(files.length).toBeGreaterThanOrEqual(8);
    for (const file of files) {
      const src = readFileSync(join(here, 'workflows', file), 'utf8').replace(/^import .*$/m, '').replace('export default ', 'return ');
      expect(() => new Function(...sdk, src), file).not.toThrow();
    }
  });
});
