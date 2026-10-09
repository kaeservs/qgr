// Runs each n8n Code-node script the way n8n does: as a function body with
// $input (the node's input items) and $('Node name') (another node's output).
// This file plays n8n's part so the agents' logic is tested before it ships.
import { readFileSync } from 'node:fs';
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
  model: 'claude-opus-5-5',
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

function assertRequest(body: Json, effort: string) {
  expect(body.model).toBe('claude-opus-5-5');
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

  it('asks Opus 5.5 for a strict JSON report, with no temperature', () => {
    const { body } = run('tracker-build-request.js', prepared) as { body: Json };
    assertRequest(body, 'medium');
    const material = JSON.parse(String((body.messages as { content: string }[])[0]!.content).split('\n').slice(1).join('\n'));
    expect(material.ads).toHaveLength(10);
    expect(material.website_text).toBe('Horizon Visa Partners\n\nEB-5 advisors.\n\nEB-5 & you\nFamilies first.');
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
    expect((report.ads as unknown[]).length).toBe(4);
    expect(out.p_usage).toMatchObject({ model: 'claude-opus-5-5', input_tokens: 5000, output_tokens: 1500 });
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
    const answer = {
      variants: [
        { label: 'C', creative_text: 'Ask for the file.', creative_style: 'spotlight', image_prompt: 'p', copy: copy('Clean copy.') },
        { label: 'A', creative_text: 'Mapped out. Risk-free.', creative_style: 'arcs', image_prompt: 'p', copy: copy('Your green card, guaranteed in 6 months.') },
        { label: 'B', creative_text: 'Move together.', creative_style: 'split', image_prompt: 'p', copy: copy('x'.repeat(290)) },
      ],
    };
    const out = run('content-read-answer.js', reply(answer), { 'Begin: load the run': ctx });
    expect(out.ok).toBe(true);
    const variants = (out.p_ad_set as { variants: { label: string; angle: string; warnings: string[] }[] }).variants;
    expect(variants.map((v) => [v.label, v.angle])).toEqual([['A', 'Clarity over hype'], ['B', 'Family first'], ['C', 'Diligence']]);
    expect(variants[0]!.warnings).toEqual(expect.arrayContaining(['meta text says "guarantee"', 'meta text promises a timeline', 'x text says "guarantee"', 'image text says "risk-free"']));
    expect(variants[1]!.warnings).toContain('x text is 290 characters; X allows 280');
    expect(variants[2]!.warnings).toEqual([]);

    // The studio re-checks every edit with lib/guardrails.ts: it must flag exactly what the agent flagged.
    for (const v of answer.variants) {
      const agent = variants.find((x) => x.label === v.label)!.warnings;
      expect(guardrailWarnings(v.creative_text, v.copy as Partial<Record<Platform, PlatformCopy>>, ['meta', 'x'])).toEqual(agent);
    }
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
