// "QGR · Moments" played step by step: the database hands over a long video,
// the request reads its transcript by line, Claude's answer (a fixture) is read
// and checked, and the moments are recorded, against every migration.
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
const script = (file: string) => readFileSync(join(here, 'code', file), 'utf8');

/** Runs a script over several items, with `nodes` standing in for upstream nodes' items. */
function runAll(file: string, items: Json[], nodes: Record<string, Json[]> = {}): Json[] {
  const $input = { all: () => items.map((json) => ({ json })), first: () => ({ json: items[0] }) };
  const $ = (name: string) => {
    const list = nodes[name];
    if (!list) throw new Error(`Node "${name}" has not run`);
    return { itemMatching: (i: number) => ({ json: list[i] }), first: () => ({ json: list[0] }), all: () => list.map((json) => ({ json })) };
  };
  return (inN8n(script(file), $input, $) as Items).map((i) => i.json);
}

const reply = (answer: unknown, extra: Json = {}): Json => ({
  model: 'claude-haiku-5-5',
  stop_reason: 'end_turn',
  content: [{ type: 'text', text: JSON.stringify(answer) }],
  usage: { input_tokens: 42000, output_tokens: 1800 },
  ...extra,
});

/** A line every ten seconds for half an hour. */
const TRANSCRIPT = Array.from({ length: 180 }, (_, i) => ({ start: i * 10, end: i * 10 + 9.5, text: `Line ${i}: what the speaker says.` }));
const video = (extra: Json = {}): Json => ({
  long_video_id: 'v-1',
  title: 'EB-5 webinar',
  duration: 1800,
  transcript: TRANSCRIPT,
  guidance: null,
  brand: { company: 'Quantum Global Residency', offer: 'EB-5 guidance', audience: 'Indian families', voice: ['Calm', 'Expert'], guardrails: ['Never promise an outcome, a timeline or a return'], topics: ['EB-5 basics'] },
  ...extra,
});

describe('the Moments request', () => {
  it('asks Haiku for moments by line, with the transcript numbered and timed', () => {
    const [out] = runAll('moments-build-request.js', [video()]);
    const body = out!.body as Json;
    expect(out!.long_video_id).toBe('v-1');
    expect(body).toMatchObject({ model: 'claude-haiku-5-5', max_tokens: 8000, output_config: { effort: 'medium' } });
    expect(body).not.toHaveProperty('temperature');
    const text = String((body.messages as { content: string }[])[0]!.content);
    expect(text).toContain('0 [0:00] Line 0: what the speaker says.');
    expect(text).toContain('179 [29:50] Line 179');
    expect(JSON.parse(text.split('\n')[1]!)).toEqual({ video: { title: 'EB-5 webinar', length: '30:00', lines: 180 }, brand: { company: 'Quantum Global Residency', offer: 'EB-5 guidance', audience: 'Indian families', topics: ['EB-5 basics'] } });
    expect(String(body.system)).toContain('Never promise an outcome, a timeline or a return');
    expect(String(body.system)).not.toContain('direction');
  });

  it('follows the team’s direction when they gave one, and says the hour', () => {
    const [out] = runAll('moments-build-request.js', [video({ guidance: 'Find the moments about families.', duration: 3725 })]);
    const body = out!.body as Json;
    expect(String(body.system)).toContain("direction is the QGR team's brief");
    expect(JSON.parse(String((body.messages as { content: string }[])[0]!.content).split('\n')[1]!)).toMatchObject({ video: { length: '1:02:05' }, direction: 'Find the moments about families.' });
  });
});

describe('reading the moments', () => {
  const read = (answer: Json) => runAll('moments-read-answer.js', [answer], { 'One item per video': [video()] })[0]!;

  it('keeps the moments inside the transcript, long enough, short enough and clear of the stronger ones', () => {
    const out = read(
      reply({
        moments: [
          { first: 10, last: 14, title: 'Why debt is repaid first', why: 'A plain answer.', hook: 'Debt gets repaid first.' },
          // Overlaps the first: dropped.
          { first: 13, last: 16, title: 'Overlap', why: 'w', hook: 'h' },
          // One line, under eight seconds? 9.5 s: kept.
          { first: 40, last: 40, title: 'A strong line', why: 'w', hook: 'Get your green card in 6 months, guaranteed.' },
          // Over two and a half minutes: dropped.
          { first: 60, last: 80, title: 'Too long', why: 'w', hook: 'h' },
          // Past the end, or backwards: dropped.
          { first: 170, last: 200, title: 'Past the end', why: 'w', hook: 'h' },
          { first: 90, last: 85, title: 'Backwards', why: 'w', hook: 'h' },
        ],
      }),
    );
    expect(out).toMatchObject({ ok: true, p_id: 'v-1', p_usage: { model: 'claude-haiku-5-5', input_tokens: 42000, output_tokens: 1800 } });
    expect((out.p_moments as Json[]).map((m) => [m.first, m.last, m.title, m.warnings])).toEqual([
      [10, 14, 'Why debt is repaid first', []],
      // Flagged, never rewritten.
      [40, 40, 'A strong line', ['Hook says "guarantee"', 'Hook promises a timeline']],
    ]);
  });

  it('fails, with the cost kept, when there is nothing usable', () => {
    expect(read(reply({ moments: [{ first: 60, last: 90, title: 'Too long', why: 'w', hook: 'h' }] }))).toMatchObject({ ok: false, p_error: expect.stringMatching(/no moment that stands on its own/), p_usage: { input_tokens: 42000 } });
    expect(read(reply({}, { stop_reason: 'refusal' }))).toMatchObject({ ok: false, p_error: 'Claude declined to pick moments from this video.' });
    expect(read({ error: { message: 'Overloaded' } })).toMatchObject({ ok: false, p_error: expect.stringMatching(/Overloaded/) });
  });
});

describe('a long video through "QGR · Moments"', () => {
  let t: TestDatabase;
  let member = '';
  beforeAll(async () => {
    t = await testDatabase();
    member = await t.addUser('member@qgr.example', 'owner');
  }, 60_000);

  it('goes from the transcript the browser heard to moments on the page', async () => {
    const id = await t.asUser(member, () =>
      t.value<string>(`select public.create_long_video('Webinar', $1::jsonb, $2::jsonb)`, [JSON.stringify({ name: 'webinar.mp4', size: 900_000_000, duration: 1800, width: 1920, height: 1080 }), JSON.stringify(TRANSCRIPT)]),
    );
    const due = await t.asService(() => t.value<Json[]>(`select public.moments_take_due(2)`));
    const items = runAll('shared-items.js', [{ data: due }]);
    expect(items.map((i) => i.long_video_id)).toEqual([id]);
    const [request] = runAll('moments-build-request.js', items);
    expect(request!.long_video_id).toBe(id);
    const [answer] = runAll('moments-read-answer.js', [reply({ moments: [{ first: 20, last: 25, title: 'The family question', why: 'w', hook: 'Plan it together.' }] })], { 'One item per video': items });
    expect(answer!.ok).toBe(true);
    await t.asService(() => t.db.query(`select public.moments_finish($1, $2::jsonb, $3::jsonb)`, [answer!.p_id, JSON.stringify(answer!.p_moments), JSON.stringify(answer!.p_usage)]));
    const saved = await t.asUser(member, () => t.value<{ status: string; moments: Json[] }>(`select jsonb_build_object('status', status, 'moments', moments) from public.long_videos where id = $1`, [id]));
    expect(saved.status).toBe('done');
    expect(saved.moments).toEqual([expect.objectContaining({ first: 20, last: 25, start: 200, end: 259.5, title: 'The family question', source: 'agent', run_ids: [] })]);
  });
});
