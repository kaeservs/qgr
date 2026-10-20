// "QGR · Pictures" on Higgsfield, played step by step: each ad's picture is
// priced without making anything, recorded against the month's limit, sent
// once, its job read until done, the file it made fetched, typed by what it is
// and stored, and recorded as any picture is. Higgsfield's answers are
// fixtures in the shapes its MCP gave on 2026-10-20: prices, and the first real
// picture's send, job and file, against every migration.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { inN8n } from '../test/n8n';
import { testDatabase } from '../test/supabase';
import type { TestDatabase } from '../test/supabase';

type Json = Record<string, unknown>;
type Item = { json: Json; binary?: Record<string, { mimeType?: string }> };

const here = dirname(fileURLToPath(import.meta.url));
/** The helpers each script has in front of it, exactly as build-workflows.mjs joins them. */
const HELPERS: Record<string, string[]> = {
  'pictures-higgsfield-request.js': ['pictures-prompt.js'],
  'pictures-price-request.js': ['pictures-prompt.js'],
  'pictures-higgsfield-send.js': [],
  'pictures-higgsfield-file.js': [],
  'video-uploaded.js': [],
};
const script = (file: string, swap: Record<string, string> = {}) => {
  let src = [...(HELPERS[file] ?? ['video-mcp.js']), file].map((f) => readFileSync(join(here, 'code', f), 'utf8')).join('\n');
  for (const [k, v] of Object.entries(swap)) src = src.replaceAll(k, v);
  return src;
};

function run(file: string, items: (Json | Item)[], nodes: Record<string, Json[]> = {}, swap: Record<string, string> = {}): Item[] {
  const all = items.map((i) => ('json' in i && typeof i.json === 'object' ? (i as Item) : { json: i as Json }));
  const $input = { all: () => all, first: () => all[0] };
  const $ = (name: string) => {
    const list = nodes[name];
    if (!list) throw new Error(`Node "${name}" has not run`);
    return { itemMatching: (i: number) => ({ json: list[i] }), first: () => ({ json: list[0] }), all: () => list.map((json) => ({ json })) };
  };
  return inN8n(script(file, swap), $input, $) as Item[];
}
const runJson = (...args: Parameters<typeof run>) => run(...args).map((i) => i.json);

const VARIANT = '0d3b9e6a-1c2f-4b8e-9a7d-5e4f3c2b1a09';
const ask = (over: Json = {}): Json => ({
  variant_id: VARIANT,
  label: 'A',
  prompt: 'A calm skyline at dusk, indigo and gold.',
  style: 'arcs',
  look: 'Warm natural light, indigo and gold accents',
  model: 'higgsfield',
  account: null,
  quality: 'low',
  path: `pictures/${VARIANT}/b263a35f-fb56-49bf-a032-59be7540d321.png`,
  ...over,
});
const answer = (structuredContent: Json, text = '') => ({ structuredContent, content: [{ type: 'text', text }] });

describe('the request and its price', () => {
  it('asks GPT Image 2.5 for a square picture at the team’s quality, priced first with get_cost', () => {
    const [written] = runJson('pictures-higgsfield-request.js', [ask({ quality: 'medium' })]);
    expect(written!.params).toEqual({
      model: 'gpt_image_2_5',
      prompt: 'A calm skyline at dusk, indigo and gold. Picture style: Warm natural light, indigo and gold accents. No text, letters, numbers, logos or watermarks anywhere. No real or identifiable people. No flags.',
      aspect_ratio: '1:1',
      resolution: '1k',
      quality: 'medium',
    });
    const quote = JSON.parse(written!.quote_input as string);
    expect(quote).toEqual({ params: { ...(written!.params as Json), get_cost: true }, get_cost: true });
    // A quality Higgsfield is not asked for falls back to the cheapest.
    expect(runJson('pictures-higgsfield-request.js', [ask({ quality: 'ultra' })])[0]!.quality).toBe('low');
  });

  it('prices one picture for Settings and the studio, making nothing', () => {
    const [price] = runJson('pictures-price-request.js', [{ body: { quality: 'high' } }]);
    const quote = JSON.parse(price!.quote_input as string);
    expect(quote.get_cost).toBe(true);
    expect(quote.params).toMatchObject({ model: 'gpt_image_2_5', aspect_ratio: '1:1', resolution: '1k', quality: 'high', get_cost: true });
  });

  it('reads the price: the higher of Higgsfield’s two figures, or why there is none', () => {
    const written = runJson('pictures-higgsfield-request.js', [ask(), ask({ label: 'B' }), ask({ label: 'C' }), ask({ label: 'D' })]);
    const read = runJson(
      'pictures-higgsfield-price.js',
      [
        answer({ cost: { credits: 0.25, credits_exact: 0.25 } }, 'Cost preflight for gpt_image_2_5: 0.25 credits (0.25 exact). No job submitted.'),
        answer({ cost: { credits: 1, credits_exact: 0.5 } }, 'Cost preflight for gpt_image_2: 1 credit (0.5 exact). No job submitted.'),
        { error: { message: 'Not enough credits' } },
        written[3]!,
      ],
      { 'Write the Higgsfield request': written },
    );
    expect(read).toEqual([
      { kind: 'priced', variant_id: VARIANT, credits: 0.25, quality: 'low', path: ask().path },
      { kind: 'priced', variant_id: VARIANT, credits: 1, quality: 'low', path: ask().path },
      { kind: 'refused', variant_id: VARIANT, error: 'Higgsfield would not price the picture: Not enough credits' },
      // The step handed on what it was given: Higgsfield was not reached, nothing was sent.
      { kind: 'retry', variant_id: VARIANT, error: 'Higgsfield could not be reached for its price' },
    ]);
    expect(runJson('pictures-higgsfield-price.js', [answer({ job_id: 'job-9' })], { 'Write the Higgsfield request': written })[0]).toMatchObject({ kind: 'refused', error: expect.stringContaining('check its history') });
    // One of Higgsfield's presets offered in place of the prompt (seen for videos only): never taken.
    const offer = answer({ notice: { type: 'preset_recommendation', data: { preset: { id: 'preset-1', name: 'GOLDEN HOUR' }, retry_literal_with: { declined_preset_id: 'preset-1' } } } });
    expect(runJson('pictures-higgsfield-price.js', [offer], { 'Write the Higgsfield request': written })[0]).toEqual({
      kind: 'refused',
      variant_id: VARIANT,
      error: 'Higgsfield offered its preset "GOLDEN HOUR" in place of the prompt as written: nothing was made. Change the picture\'s prompt a little and ask again.',
    });
  });
});

describe('sent once, and its job read', () => {
  it('sends the params it was priced with, without get_cost', () => {
    const written = runJson('pictures-higgsfield-request.js', [ask()]);
    const [sent] = runJson('pictures-higgsfield-send.js', [{ begun: true, id: 'sent-1' }], { 'Write the Higgsfield request': written });
    expect(sent).toEqual({ id: 'sent-1', variant_id: VARIANT, generate_input: JSON.stringify({ params: written[0]!.params }) });
    expect(JSON.parse(sent!.generate_input as string).params.get_cost).toBeUndefined();
  });

  it('reads the start as AI video does: started, refused, try again or unknown', () => {
    const sent = [{ id: 'sent-1', generate_input: '{}' }, { id: 'sent-2', generate_input: '{}' }, { id: 'sent-3', generate_input: '{}' }, { id: 'sent-4', generate_input: '{}' }];
    const read = runJson(
      'video-read-start.js',
      [answer({ job_id: 'job-1', cost: { credits: 0.25 } }), { error: { message: 'Content policy: rejected' } }, sent[2]!, { error: { message: 'Request timed out' } }],
      { 'Write the picture request': sent },
      { "$('Write the request')": "$('Write the picture request')" },
    );
    expect(read.map((r) => r.kind)).toEqual(['started', 'refused', 'retry', 'unknown']);
    expect(read[0]).toEqual({ kind: 'started', id: 'sent-1', job_id: 'job-1', credits: 0.25 });
  });

  it('reads a job: the picture’s own link when done, why when it failed, else waiting', () => {
    const jobs = [1, 2, 3, 4, 5].map((n) => ({ id: `sent-${n}`, job_id: `job-${n}`, path: `pictures/${VARIANT}/b263a35f-fb56-49bf-a032-59be7540d32${n}.png` }));
    const read = runJson(
      'pictures-higgsfield-job.js',
      [
        answer({ status: 'completed', results: [{ thumbnail: 'https://cdn.higgsfield.ai/job-1/preview', url: 'https://cdn.higgsfield.ai/job-1/image.webp' }] }),
        answer({ status: 'nsfw' }),
        answer({ status: 'in_progress' }),
        { error: { message: 'Job not found' } },
        jobs[4]!,
      ],
      { 'One item per job': jobs },
    );
    expect(read).toEqual([
      { kind: 'done', id: 'sent-1', path: jobs[0]!.path, url: 'https://cdn.higgsfield.ai/job-1/image.webp' },
      { kind: 'failed', id: 'sent-2', error: expect.stringContaining('safety check') },
      { kind: 'waiting', id: 'sent-3' },
      { kind: 'unknown', id: 'sent-4', error: expect.stringContaining('no longer knows') },
      { kind: 'waiting', id: 'sent-5' },
    ]);
  });

  it('types the file by what it is, else by its link, and refuses anything but a picture', () => {
    const base = `pictures/${VARIANT}/b263a35f-fb56-49bf-a032-59be7540d321`;
    const done = [
      { id: 'a', path: `${base}.png`, url: 'https://cdn.higgsfield.ai/a/image' },
      { id: 'b', path: `${base}.png`, url: 'https://cdn.higgsfield.ai/b/image.webp?sig=1' },
      { id: 'c', path: `${base}.png`, url: 'https://cdn.higgsfield.ai/c/page' },
      { id: 'd', path: `${base}.png`, url: 'https://cdn.higgsfield.ai/d/image.jpg' },
    ];
    const out = run(
      'pictures-higgsfield-file.js',
      [
        { json: {}, binary: { data: { mimeType: 'image/jpeg' } } },
        { json: {}, binary: { data: { mimeType: 'application/octet-stream' } } },
        { json: {}, binary: { data: { mimeType: 'text/html; charset=utf-8' } } },
        { json: { error: { message: 'timeout' } } },
      ],
      { "Read the picture's job": done },
    );
    expect(out.map((o) => o.json)).toEqual([
      { kind: 'picture', id: 'a', path: `${base}.jpg`, mime: 'image/jpeg' },
      { kind: 'picture', id: 'b', path: `${base}.webp`, mime: 'image/webp' },
      { kind: 'failed', id: 'c', error: 'Higgsfield answered with something that is not a PNG, JPEG or WebP picture (text/html).' },
      // Not fetched: asked again at the next check.
      { kind: 'retry', id: 'd' },
    ]);
    // The file goes on with it, to be uploaded.
    expect(out[0]!.binary).toEqual({ data: { mimeType: 'image/jpeg' } });
  });
});

describe('Higgsfield’s real answers, from the first picture made (2026-10-20)', () => {
  // Trimmed only of the prompt Higgsfield echoes back; every key and its place as it came.
  const JOB = 'b2b3238f-e60a-4ead-931a-8e591062ea81';
  const CDN = 'https://d8j0ntlcm91z4.cloudfront.net/user_3KvMOcHKA9JTv89W2IDT4vG0Bc5';
  const params = { prompt: 'Abstract scene: a gentle gold arc of light.', aspect_ratio: '1:1', resolution: '1k', quality: 'low' };
  const submitted = {
    structuredContent: { results: [{ id: JOB, type: 'image', status: 'pending', model: 'gpt_image_2_5', params }] },
    content: [
      { type: 'text', text: `Submitted 1 job. If a widget is visible, it polls automatically — do not call job_status or show_generations as a follow-up poll. In text-only clients, use job_status with sync:true to poll for completion.\n- ${JOB}  "Abstract scene: a gentle gold arc of light."` },
      { type: 'text', text: 'If the user requests a combined display of multiple generations, … then call show_generation_by_ids with jobs: [{"index":0,"job_id":"<first actual job ID>"},{"index":1,"job_id":"<second actual job ID>"}, ...].' },
    ],
  };
  const generation = (status: string, results?: Json) => ({
    structuredContent: { generation: { id: JOB, type: 'image', status, model: 'gpt_image_2_5', params: { ...params, width: 1024, height: 1024, model: 'flare' }, ...(results ? { results } : {}), createdAt: 1792519972.160914, liked: false }, ...(results ? {} : { poll_after_seconds: 2 }) },
    content: [{ type: 'text', text: `Job ${JOB} — ${status}` }],
  });
  const raw = `${CDN}/hf_20261020_181252_${JOB}.png`;

  it('reads the job from what Higgsfield answered to the send, not the ids in its advice', () => {
    const sent = [{ id: 'sent-1', generate_input: '{}' }];
    const [read] = runJson('video-read-start.js', [submitted], { 'Write the picture request': sent }, { "$('Write the request')": "$('Write the picture request')" });
    expect(read).toEqual({ kind: 'started', id: 'sent-1', job_id: JOB, credits: null });
  });

  it('waits while queued, then takes the full picture, not its small preview', () => {
    const jobs = [{ id: 'sent-1', job_id: JOB, path: `pictures/${VARIANT}/c5049290-2ed7-49b9-9e4c-9e47f8210b57.png` }];
    const read = (out: Json) => runJson('pictures-higgsfield-job.js', [out], { 'One item per job': jobs })[0];
    expect(read(generation('queued'))).toEqual({ kind: 'waiting', id: 'sent-1' });
    expect(read(generation('completed', { rawUrl: raw, minUrl: `${CDN}/hf_20261020_181252_${JOB}_min.webp` }))).toEqual({ kind: 'done', id: 'sent-1', path: jobs[0]!.path, url: raw });
  });

  it('stores the PNG it fetched as a PNG', () => {
    const done = [{ id: 'sent-1', path: `pictures/${VARIANT}/c5049290-2ed7-49b9-9e4c-9e47f8210b57.png`, url: raw }];
    const [file] = run('pictures-higgsfield-file.js', [{ json: {}, binary: { data: { mimeType: 'image/png' } } }], { "Read the picture's job": done });
    expect(file!.json).toEqual({ kind: 'picture', id: 'sent-1', path: done[0]!.path, mime: 'image/png' });
  });
});

describe('a picture end to end, against the database', () => {
  let t: TestDatabase;
  let member = '';

  beforeAll(async () => {
    t = await testDatabase();
    member = await t.addUser('member@qgr.example', 'owner');
  }, 60_000);

  it('is priced, recorded, sent once, made, stored and shown on its ad', async () => {
    const strategy = {
      title: 'End to end',
      positioning: 'Plain advice',
      audiences: ['Families'],
      angles: ['One', 'Two', 'Three'].map((name) => ({ name, why: 'w', hook: 'h', based_on_hook: null })),
      channels: [{ platform: 'meta', share: 100, role: 'r', format: 'f' }],
      guardrails: ['g'],
    };
    const copy = { meta: { text: 'Plan your EB-5 path with people who show their working.', headline: 'EB-5, mapped out' } };
    await t.asUser(member, () => t.db.query(`select public.set_pictures_model('higgsfield')`));
    await t.asUser(member, () => t.db.query(`select public.set_pictures_auto(true)`));
    const runId = await t.asUser(member, () => t.value<string>(`select public.create_run('custom', 'text', 'End to end', array['meta'], 'consultations', p_excerpt => $1)`, ['Plain words about EB-5 for families planning a move to the United States.']));
    const variants = ['A', 'B', 'C'].map((label, i) => ({ label, angle: strategy.angles[i]!.name, creative_text: 'Plan with care', creative_style: 'arcs', image_prompt: 'A calm skyline at dusk, indigo and gold', copy, warnings: [] }));
    await t.asService(async () => {
      await t.db.query(`select public.agent_begin($1, 'strategist')`, [runId]);
      await t.db.query(`select public.agent_finish_strategist($1, $2::jsonb)`, [runId, JSON.stringify(strategy)]);
      await t.db.query(`select public.agent_begin($1, 'content')`, [runId]);
      await t.db.query(`select public.agent_finish_content($1, $2::jsonb)`, [runId, JSON.stringify({ title: 'End to end', variants })]);
    });

    // Every new ad asked for its picture as it was written: three, on Higgsfield.
    const asks = await t.asService(() => t.value<Json[]>(`select public.picture_take_due()`));
    expect(asks.map((a) => a.model)).toEqual(['higgsfield', 'higgsfield', 'higgsfield']);
    const written = runJson('pictures-higgsfield-request.js', asks);
    const priced = runJson('pictures-higgsfield-price.js', written.map(() => answer({ cost: { credits: 0.25, credits_exact: 0.25 } })), { 'Write the Higgsfield request': written });

    const begun: Json[] = [];
    for (const p of priced) begun.push(await t.asService(() => t.value<Json>(`select public.picture_higgsfield_begin($1, $2, $3, $4)`, [p.variant_id, p.credits, p.quality, p.path])));
    expect(begun.every((b) => b.begun === true)).toBe(true);
    const sent = runJson('pictures-higgsfield-send.js', begun, { 'Write the Higgsfield request': written });
    const started = runJson('video-read-start.js', sent.map((_, i) => answer({ job_id: `job-${i}` })), { 'Write the picture request': sent }, { "$('Write the request')": "$('Write the picture request')" });
    for (const s of started) await t.asService(() => t.db.query(`select public.picture_higgsfield_started($1, $2)`, [s.id, s.job_id]));
    expect(await t.asUser(member, () => t.value<Json>(`select public.video_budget()`))).toMatchObject({ spent: 0.75, pictures: 0.75 });

    await t.db.query(`update public.higgsfield_pictures set checked_at = now() - interval '1 minute'`);
    const jobs = await t.asService(() => t.value<Json[]>(`select public.picture_take_making()`));
    expect(jobs).toHaveLength(3);
    const read = runJson('pictures-higgsfield-job.js', jobs.map((j) => answer({ status: 'completed', images: [{ url: `https://cdn.higgsfield.ai/${String(j.job_id)}/out.png` }] })), { 'One item per job': jobs });
    const files = run('pictures-higgsfield-file.js', read.map(() => ({ json: {}, binary: { data: { mimeType: 'image/png' } } })), { "Read the picture's job": read });
    for (const f of files) await t.asService(() => t.db.query(`insert into storage.objects (bucket_id, name) values ('ad-pictures', $1)`, [f.json.path]));
    const stored = runJson('video-uploaded.js', files.map(() => ({ statusCode: 200 })), { 'Read the file': files.map((f) => f.json) }, { "$('Read the job')": "$('Read the file')" });
    for (const s of stored) {
      expect(s.kind).toBe('stored');
      expect(await t.asService(() => t.value<Json>(`select public.picture_higgsfield_finish($1, $2)`, [s.id, s.path]))).toEqual({ remove_picture: null });
    }

    const shown = await t.db.query<{ picture_path: string; picture_status: string }>(
      `select v.picture_path, v.picture_status from public.ad_variants v join public.ad_sets s on s.id = v.ad_set_id where s.run_id = $1 order by v.label`,
      [runId],
    );
    expect(shown.rows.map((r) => r.picture_status)).toEqual(['none', 'none', 'none']);
    expect(shown.rows.map((r) => r.picture_path).sort()).toEqual(stored.map((s) => s.path).sort());
    // Nothing is sent twice.
    expect(await t.asService(() => t.value<Json[]>(`select public.picture_take_due()`))).toEqual([]);
  });
});
