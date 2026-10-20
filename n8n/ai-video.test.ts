// "QGR · AI video" played step by step: a price is asked for without making
// anything, an ask is sent to Higgsfield once in its own words for the model,
// Higgsfield's answers (fixtures in the shapes its MCP gave on 2026-10-20, and
// the shapes its tool descriptions promise) are read into started, refused,
// retry or unknown, and a finished job is stored and recorded, against every
// migration.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { inN8n } from '../test/n8n';
import { testDatabase } from '../test/supabase';
import type { TestDatabase } from '../test/supabase';

type Json = Record<string, unknown>;
type Items = { json: Json }[];

const here = dirname(fileURLToPath(import.meta.url));
/** The helpers each script has in front of it, exactly as build-workflows.mjs joins them. */
const HELPERS: Record<string, string[]> = {
  'video-quote-request.js': ['video-params.js'],
  'video-build-request.js': ['video-params.js'],
  'video-stand-in.js': [],
  'video-picture-link.js': [],
  'video-uploaded.js': [],
};
const script = (file: string) => [...(HELPERS[file] ?? ['video-mcp.js']), file].map((f) => readFileSync(join(here, 'code', f), 'utf8')).join('\n');

function runAll(file: string, items: Json[], nodes: Record<string, Json[]> = {}): Json[] {
  const $input = { all: () => items.map((json) => ({ json })), first: () => ({ json: items[0] }) };
  const $ = (name: string) => {
    const list = nodes[name];
    if (!list) throw new Error(`Node "${name}" has not run`);
    return { itemMatching: (i: number) => ({ json: list[i] }), first: () => ({ json: list[0] }), all: () => list.map((json) => ({ json })) };
  };
  return (inN8n(script(file), $input, $) as Items).map((i) => i.json);
}

const PROMPT = 'A slow drone shot over a quiet American suburb at golden hour, warm light.';
const ask = (over: Json = {}): Json => ({ id: 'video-1', prompt: PROMPT, model: 'seedance_2_0_mini', seconds: 4, aspect: '9:16', quality: '480p', sound: false, picture_path: null, look: null, live: true, path: 'videos/video-1.mp4', ...over });
/** Higgsfield's answer as the MCP step hands it on. */
const answer = (structuredContent: Json, text = '') => ({ structuredContent, content: [{ type: 'text', text }] });
const refusal = (message: string) => ({ error: { message } });

describe('a price, without making anything', () => {
  it('asks get_cost beside the params and inside them, in each model’s own words', () => {
    const [mini] = runAll('video-quote-request.js', [{ body: { model: 'seedance_2_0_mini', seconds: 4, aspect: '9:16', quality: '480p', sound: false } }]);
    const sent = JSON.parse(mini!.quote_input as string);
    expect(sent.get_cost).toBe(true);
    expect(sent.params).toMatchObject({ model: 'seedance_2_0_mini', aspect_ratio: '9:16', duration: 4, resolution: '480p', generate_audio: false, get_cost: true });
    // The prompt does not change the price: a short stand-in until the team has one.
    expect(sent.params.prompt).toMatch(/^A quiet street at golden hour/);

    const [kling] = runAll('video-quote-request.js', [{ body: { model: 'kling3_0', seconds: 5, aspect: '1:1', quality: 'pro', sound: true, prompt: PROMPT } }]);
    expect(JSON.parse(kling!.quote_input as string).params).toMatchObject({ model: 'kling3_0', mode: 'pro', sound: 'on', duration: 5, get_cost: true });
    const [best] = runAll('video-quote-request.js', [{ body: { model: 'seedance_2_5', seconds: 10, aspect: '16:9', quality: '1080p', sound: false } }]);
    expect(JSON.parse(best!.quote_input as string).params).toMatchObject({ model: 'seedance_2_5', mode: 't2v', resolution: '1080p', generate_audio: false });
    expect(() => runAll('video-quote-request.js', [{ body: { model: 'sora', seconds: 5 } }])).toThrow(/not asked for sora videos/);
  });

  it('reads the price, and says plainly when there is none', () => {
    const asked = { quote_input: '{}' };
    expect(runAll('video-read-quote.js', [answer({ cost: { credits: 2, credits_exact: 2 } }, 'Cost preflight for seedance_2_0_mini: 2 credits (2 exact). No job submitted.')])).toEqual([{ ok: true, credits: 2 }]);
    expect(runAll('video-read-quote.js', [answer({ cost: { credits: 7.5, credits_exact: 7.5 } })])).toEqual([{ ok: true, credits: 7.5 }]);
    expect(runAll('video-read-quote.js', [refusal('Input validation error: duration too long')])).toEqual([{ ok: false, error: 'Higgsfield would not price it: Input validation error: duration too long' }]);
    expect(runAll('video-read-quote.js', [asked])).toEqual([{ ok: false, error: 'Higgsfield could not be reached just now: try again in a minute.' }]);
    expect(runAll('video-read-quote.js', [answer({ job_id: 'j-1' })])).toEqual([{ ok: false, error: 'Higgsfield started a video when asked only its price: check its history.' }]);
    expect(runAll('video-read-quote.js', [answer({}, 'Something else')])).toEqual([{ ok: false, error: 'Higgsfield gave no price: Something else' }]);
  });

  it('answers the page with the price and the plan’s credits left', () => {
    const price = { ok: true, credits: 2 };
    expect(runAll('video-answer.js', [answer({ credits: 280, subscription_plan_type: 'starter' }, 'Credits: 280 | Plan: starter')], { 'Read the price': [price] })).toEqual([{ ok: true, credits: 2, balance: 280 }]);
    // Higgsfield not reached for the balance: the price still goes back.
    expect(runAll('video-answer.js', [price], { 'Read the price': [price] })).toEqual([{ ok: true, credits: 2, balance: null }]);
  });
});

describe('an ask, sent once', () => {
  it('is written in Higgsfield’s words, with the brand’s style and the rules, never with get_cost', () => {
    const [request] = runAll('video-build-request.js', [ask({ look: 'Warm natural light, indigo and gold accents.' })]);
    expect(request!.id).toBe('video-1');
    const sent = JSON.parse(request!.generate_input as string);
    expect(Object.keys(sent)).toEqual(['params']);
    expect(sent.params).toEqual({
      model: 'seedance_2_0_mini',
      prompt: `${PROMPT} Style: Warm natural light, indigo and gold accents. No words, captions or logos in the picture (the ad's words go over it later). No real or identifiable people. No flags.`,
      aspect_ratio: '9:16',
      duration: 4,
      resolution: '480p',
      generate_audio: false,
    });
    // A first picture goes as Higgsfield's media id, the start frame.
    const [withPicture] = runAll('video-build-request.js', [ask({ model: 'kling3_0', quality: 'std', seconds: 5, media_id: 'media-9' })]);
    expect(JSON.parse(withPicture!.generate_input as string).params).toMatchObject({ model: 'kling3_0', mode: 'std', sound: 'off', medias: [{ role: 'start_image', value: 'media-9' }] });
    // A long prompt keeps the rules, within 2,000 characters.
    const [long] = runAll('video-build-request.js', [ask({ prompt: 'Wide slow shot. '.repeat(200) })]);
    const params = JSON.parse(long!.generate_input as string).params;
    expect(params.prompt.length).toBeLessThanOrEqual(2000);
    expect(params.prompt).toMatch(/No flags\.$/);
  });

  it('reads Higgsfield’s answer into started, refused, retry or unknown', () => {
    const written = [{ id: 'video-1', generate_input: '{}' }];
    const read = (out: Json) => runAll('video-read-start.js', [out], { 'Write the request': written })[0];
    expect(read(answer({ job_id: 'f3b1c2d4-5e6f', cost: { credits: 2 } }))).toEqual({ kind: 'started', id: 'video-1', job_id: 'f3b1c2d4-5e6f', credits: 2 });
    expect(read(answer({ jobs: [{ id: 'job-77', status: 'queued' }] }))).toEqual({ kind: 'started', id: 'video-1', job_id: 'job-77', credits: null });
    expect(read(answer({}, 'Video generation started. Job ID: 9f8e7d6c-aa'))).toMatchObject({ kind: 'started', job_id: '9f8e7d6c-aa' });
    expect(read(refusal('Input validation error: Invalid arguments for tool generate_video: params: Invalid input'))).toMatchObject({ kind: 'refused', error: expect.stringMatching(/^Higgsfield refused it: Input validation error/) });
    expect(read(refusal('Not enough credits to run this generation'))).toMatchObject({ kind: 'refused' });
    // An answer lost after sending: it may have been made, so it is never sent again by itself.
    expect(read(refusal('Request timed out'))).toEqual({ kind: 'unknown', id: 'video-1', error: 'Higgsfield may have started it (Request timed out). Check its history before asking again.' });
    // n8n never reached Higgsfield: the step handed on what it was given.
    expect(read(written[0]!)).toEqual({ kind: 'retry', id: 'video-1', error: 'Could not connect to Higgsfield' });
    expect(read(answer({}, 'Done.'))).toMatchObject({ kind: 'unknown', error: expect.stringMatching(/without a job/) });
  });

  it('brings a first picture over to Higgsfield first', () => {
    const asked = ask({ model: 'kling3_0', quality: 'std', seconds: 5, picture_path: 'refs/u/p.jpg' });
    const [link] = runAll('video-picture-link.js', [{ statusCode: 200, body: { signedURL: '/object/sign/video-refs/refs/u/p.jpg?token=t' } }], { 'A first picture?': [asked] });
    expect(link).toMatchObject({ id: 'video-1', url: 'https://tcinsdexwvzpznqlcpww.supabase.co/storage/v1/object/sign/video-refs/refs/u/p.jpg?token=t' });
    expect(runAll('video-picture-link.js', [{ statusCode: 400, body: { message: 'Object not found' } }], { 'A first picture?': [asked] })).toEqual([
      { kind: 'refused', id: 'video-1', error: 'The first picture could not be read from Storage (400): Object not found' },
    ]);

    const media = (out: Json) => runAll('video-read-media.js', [out], { 'Picture link': [link!] })[0];
    const taken = media(answer({ media_id: 'media-9', status: 'confirmed' }));
    expect(taken).toMatchObject({ kind: 'go', id: 'video-1', media_id: 'media-9', model: 'kling3_0' });
    expect(taken).not.toHaveProperty('url');
    expect(media(refusal('Unsupported media type'))).toEqual({ kind: 'refused', id: 'video-1', error: 'Higgsfield could not take the first picture: Unsupported media type' });
    expect(media(link!)).toMatchObject({ kind: 'retry', id: 'video-1' });
  });

  it('the stand-in makes nothing', () => {
    expect(runAll('video-stand-in.js', [ask({ live: false })])).toEqual([{ kind: 'stand_in', id: 'video-1' }]);
  });
});

describe('a job, until its video is stored', () => {
  const jobs = [{ id: 'video-1', job_id: 'job-77', path: 'videos/video-1.mp4' }];
  const read = (out: Json) => runAll('video-read-job.js', [out], { 'One item per job': jobs })[0];

  it('waits, and finds the video’s link when it is done', () => {
    expect(read(answer({ id: 'job-77', status: 'in_progress', poll_after_seconds: 20 }))).toEqual({ kind: 'waiting', id: 'video-1' });
    expect(read(answer({ status: 'queued' }))).toEqual({ kind: 'waiting', id: 'video-1' });
    expect(
      read(answer({ id: 'job-77', status: 'completed', results: [{ type: 'preview', url: 'https://cdn.higgsfield.ai/job-77/thumb.jpg' }, { type: 'video', url: 'https://cdn.higgsfield.ai/job-77/video.mp4?sig=1' }] })),
    ).toEqual({ kind: 'done', id: 'video-1', path: 'videos/video-1.mp4', url: 'https://cdn.higgsfield.ai/job-77/video.mp4?sig=1' });
    expect(read(answer({ status: 'completed', result: { raw: { url: 'https://cdn.higgsfield.ai/r/abc' } } }))).toMatchObject({ kind: 'done', url: 'https://cdn.higgsfield.ai/r/abc' });
    expect(read(answer({ status: 'completed' }))).toMatchObject({ kind: 'unknown', error: expect.stringMatching(/gave no link/) });
    // Not reached, or a passing error: asked again next time.
    expect(read(jobs[0]!)).toEqual({ kind: 'waiting', id: 'video-1' });
    expect(read(refusal('Streamable HTTP error: 502'))).toEqual({ kind: 'waiting', id: 'video-1' });
  });

  it('says why a job failed, as plainly as Higgsfield does', () => {
    expect(read(answer({ status: 'failed', error: 'Generation failed: model overloaded' }))).toEqual({ kind: 'failed', id: 'video-1', error: 'Higgsfield could not make it (failed): Generation failed: model overloaded' });
    expect(read(answer({ status: 'nsfw' }))).toMatchObject({ kind: 'failed', error: expect.stringMatching(/safety check stopped it/) });
    expect(read(answer({ status: 'ip_detected' }))).toMatchObject({ kind: 'failed', error: expect.stringMatching(/may show protected material/) });
    expect(read(refusal('Job not found'))).toEqual({ kind: 'unknown', id: 'video-1', error: 'Higgsfield no longer knows this job: Job not found' });
  });

  it('records a stored video, and tries again when the upload did not go', () => {
    const done = [{ kind: 'done', id: 'video-1', path: 'videos/video-1.mp4', url: 'https://cdn.higgsfield.ai/job-77/video.mp4' }];
    expect(runAll('video-uploaded.js', [{ statusCode: 200, body: { Key: 'ai-videos/videos/video-1.mp4' } }], { 'Read the job': done })).toEqual([{ kind: 'stored', id: 'video-1', path: 'videos/video-1.mp4' }]);
    expect(runAll('video-uploaded.js', [{ statusCode: 413, body: { message: 'Payload too large' } }], { 'Read the job': done })).toEqual([{ kind: 'not_stored', id: 'video-1', error: 'Made, but not stored yet (413)' }]);
  });
});

describe('through the database', () => {
  let t: TestDatabase;
  let member = '';
  const rpc = (sql: string, params: unknown[]) => t.asService(() => t.db.query(sql, params));

  beforeAll(async () => {
    t = await testDatabase();
    member = await t.addUser('member@qgr.example', 'owner');
    await t.asUser(member, () => t.db.query(`select public.set_video_settings(true, 100)`));
  }, 60_000);

  it('takes an ask, sends it, checks the job and keeps the video', async () => {
    const id = await t.asUser(member, () => t.value<string>(`select public.ask_for_video($1, 'seedance_2_0_mini', 4, '9:16', '480p', false, 2)`, [PROMPT]));
    const due = await t.asService(() => t.value<Json[]>(`select public.video_take_due()`));
    const [request] = runAll('video-build-request.js', due);
    expect(JSON.parse(request!.generate_input as string).params).toMatchObject({ model: 'seedance_2_0_mini', duration: 4, resolution: '480p' });

    // Higgsfield took it ("Record: started", as the workflow's body names it).
    const [started] = runAll('video-read-start.js', [answer({ job_id: 'job-77', cost: { credits: 2 } })], { 'Write the request': [request!] });
    await rpc(`select public.video_started($1, $2, $3)`, [started!.id, started!.job_id, started!.credits]);

    const jobs = await t.asService(() => t.value<Json[]>(`select public.video_take_making()`));
    expect(jobs).toEqual([{ id, job_id: 'job-77', path: `videos/${id}.mp4` }]);
    const [done] = runAll('video-read-job.js', [answer({ status: 'completed', results: [{ url: 'https://cdn.higgsfield.ai/job-77/video.mp4' }] })], { 'One item per job': jobs });
    await rpc(`insert into storage.objects (bucket_id, name) values ('ai-videos', $1)`, [done!.path]);
    const [stored] = runAll('video-uploaded.js', [{ statusCode: 200 }], { 'Read the job': [done!] });
    await rpc(`select public.video_finish($1, $2)`, [stored!.id, stored!.path]);
    expect(await t.value(`select status from public.ai_videos where id = $1`, [id])).toBe('ready');
  });

  it('sends again next minute when Higgsfield was not reached', async () => {
    const id = await t.asUser(member, () => t.value<string>(`select public.ask_for_video($1, 'kling3_0', 3, '1:1', 'std', false, 1.5)`, [PROMPT]));
    const due = await t.asService(() => t.value<Json[]>(`select public.video_take_due()`));
    const [request] = runAll('video-build-request.js', due);
    const [retry] = runAll('video-read-start.js', [request!], { 'Write the request': [request!] });
    expect(retry).toMatchObject({ kind: 'retry', id });
    await rpc(`select public.video_release($1, $2)`, [retry!.id, retry!.error]);
    expect((await t.asService(() => t.value<Json[]>(`select public.video_take_due()`))).map((d) => d.id)).toEqual([id]);
  });
});
