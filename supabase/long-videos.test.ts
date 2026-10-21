import { beforeAll, describe, expect, it } from 'vitest';
import { testDatabase } from '../test/supabase';
import type { TestDatabase } from '../test/supabase';

// Long videos: the transcript kept, the moments asked for, found by line,
// and recorded on the runs cut from them; and who may do any of it.

let t: TestDatabase;
let member = '';
let outsider = '';

const FILE = { name: 'webinar.mp4', size: 2_400_000_000, duration: 3600, width: 1920, height: 1080 };
/** One line every ten seconds for the hour. */
const TRANSCRIPT = Array.from({ length: 360 }, (_, i) => ({ start: i * 10, end: i * 10 + 9.5, text: `Line ${i} of the webinar.` }));

const create = (user: string, transcript: unknown = TRANSCRIPT, file: unknown = FILE) =>
  t.asUser(user, () => t.value<string>(`select public.create_long_video('EB-5 webinar', $1::jsonb, $2::jsonb, 'Lead with families')`, [JSON.stringify(file), JSON.stringify(transcript)]));
const takeDue = () => t.asService(() => t.value<{ long_video_id: string; title: string; duration: number; transcript: unknown[]; guidance: string; brand: unknown }[]>(`select public.moments_take_due(2)`));
const finish = (id: string, moments: unknown, usage: unknown = { model: 'claude-haiku-5-5', input_tokens: 40000, output_tokens: 2000 }) =>
  t.asService(() => t.db.query(`select public.moments_finish($1, $2::jsonb, $3::jsonb)`, [id, JSON.stringify(moments), JSON.stringify(usage)]));
const row = (id: string) => t.value<{ status: string; moments: { first: number; last: number; start: number; end: number; title: string; source: string; run_ids: string[] }[]; error: string | null }>(`select to_jsonb(v) from public.long_videos v where id = $1`, [id]);

beforeAll(async () => {
  t = await testDatabase();
  member = await t.addUser('member@qgr.example', 'owner');
  outsider = await t.addUser('stranger@elsewhere.example');
}, 60_000);

describe('long videos', () => {
  it('keeps a teammate’s transcript, and nobody else’s', async () => {
    const id = await create(member);
    expect(await t.asUser(member, () => t.value<number>(`select count(*)::int from public.long_videos where id = $1`, [id]))).toBe(1);
    expect(await t.asUser(outsider, () => t.value<number>(`select count(*)::int from public.long_videos`))).toBe(0);
    await expect(create(outsider)).rejects.toThrow(/Only the QGR team/);
    // A transcript has to be one the browser could have made.
    await expect(create(member, [])).rejects.toThrow(/no transcript/);
    await expect(create(member, [{ start: 10, end: 5, text: 'Backwards' }])).rejects.toThrow(/outside the video/);
    await expect(create(member, [{ start: 4000, end: 4005, text: 'Past the end' }])).rejects.toThrow(/outside the video/);
    await expect(create(member, TRANSCRIPT, { ...FILE, duration: 5 * 3600 })).rejects.toThrow(/three hours/);
    // Signed-in people cannot write the table, or call what only n8n calls.
    await expect(t.asUser(member, () => t.db.query(`update public.long_videos set status = 'done' where id = $1`, [id]))).rejects.toThrow();
    await expect(t.asUser(member, () => t.db.query(`select public.moments_take_due(2)`))).rejects.toThrow();
  });

  it('hands each waiting video to one claim, with the brand, and takes the moments by line', async () => {
    const id = await create(member);
    const due = await takeDue();
    const mine = due.find((d) => d.long_video_id === id)!;
    expect(mine).toMatchObject({ title: 'EB-5 webinar', duration: 3600, guidance: 'Lead with families' });
    expect(mine.transcript).toHaveLength(360);
    expect(mine.brand).toMatchObject({ company: expect.any(String) });
    // Claimed: the next look does not hand it out again.
    expect((await takeDue()).some((d) => d.long_video_id === id)).toBe(false);

    await finish(id, [
      { first: 30, last: 34, title: 'Why debt is repaid first', why: 'Plain and self-contained.', hook: 'Debt gets repaid first.', warnings: [] },
      { first: 100, last: 105, title: 'Families decide together', why: 'A family moment.', hook: 'Plan it together.', warnings: [] },
    ]);
    const done = await row(id);
    expect(done.status).toBe('done');
    // Times come from the transcript, never from the model.
    expect(done.moments.map((m) => [m.first, m.last, m.start, m.end, m.source])).toEqual([
      [30, 34, 300, 349.5, 'agent'],
      [100, 105, 1000, 1059.5, 'agent'],
    ]);
    expect(await t.value<number>(`select input_tokens from public.long_video_usage where long_video_id = $1`, [id])).toBe(40000);
    await expect(finish(id, [{ first: 350, last: 400, title: 'Past the end' }])).rejects.toThrow(/inside the transcript/);
  });

  it('records the runs cut from a moment, and keeps them when the moments are asked for again', async () => {
    const id = await create(member);
    await takeDue();
    await finish(id, [{ first: 10, last: 14, title: 'An opening worth a clip', why: 'w', hook: 'h' }]);
    const runId = await t.asUser(member, () => t.value<string>(`select public.create_run('custom', 'text', 'From the webinar', array['meta'], 'consultations', p_excerpt => $1)`, ['What the clip says, long enough to be a run of its own.']));
    await t.asUser(member, () => t.db.query(`select public.record_moment_run($1, 10, 14, 'An opening worth a clip', $2)`, [id, runId]));
    // A stretch no moment has is added as the team's own.
    await t.asUser(member, () => t.db.query(`select public.record_moment_run($1, 200, 203, 'Our pick', $2)`, [id, runId]));
    let saved = await row(id);
    expect(saved.moments.map((m) => [m.first, m.source, m.run_ids])).toEqual([
      [10, 'agent', [runId]],
      [200, 'team', [runId]],
    ]);

    await t.asUser(member, () => t.db.query(`select public.ask_moments_again($1)`, [id]));
    expect((await row(id)).status).toBe('queued');
    await takeDue();
    await finish(id, [
      { first: 10, last: 14, title: 'Same lines again', why: 'w', hook: 'h' },
      { first: 50, last: 52, title: 'Something new', why: 'w', hook: 'h' },
    ]);
    saved = await row(id);
    // What ads were made from stays; the same lines are not added twice.
    expect(saved.moments.map((m) => [m.first, m.title])).toEqual([
      [50, 'Something new'],
      [10, 'An opening worth a clip'],
      [200, 'Our pick'],
    ]);
  });

  it('says why, and keeps the cost, when the moments cannot be found', async () => {
    const id = await create(member);
    await takeDue();
    await t.asService(() => t.db.query(`select public.moments_fail($1, 'Claude declined', $2::jsonb)`, [id, JSON.stringify({ model: 'claude-haiku-5-5', input_tokens: 100 })]));
    expect(await row(id)).toMatchObject({ status: 'failed', error: 'Claude declined' });
    expect(await t.value<number>(`select count(*)::int from public.long_video_usage where long_video_id = $1`, [id])).toBe(1);
  });

  it('takes a new name, a description and a direction, from the team only', async () => {
    const id = await create(member);
    const update = (user: string, title: string, description: string, guidance: string) =>
      t.asUser(user, () => t.db.query(`select public.update_long_video($1, $2, $3, $4)`, [id, title, description, guidance]));
    await update(member, '  Gold Card   explained ', 'A 10-minute talk on the Gold Card and EB-5.', '');
    expect(await t.value(`select jsonb_build_object('title', title, 'description', description, 'guidance', guidance) from public.long_videos where id = $1`, [id])).toEqual({
      title: 'Gold Card explained',
      description: 'A 10-minute talk on the Gold Card and EB-5.',
      guidance: null,
    });
    await expect(update(member, ' ', '', '')).rejects.toThrow(/Name the video/);
    await expect(update(member, 'Fine', 'x'.repeat(2001), '')).rejects.toThrow(/description/);
    await expect(update(outsider, 'Mine now', '', '')).rejects.toThrow(/Only the QGR team/);
    // The Moments agent reads the description.
    const due = (await takeDue()).find((d) => d.long_video_id === id) as unknown as { description: string };
    expect(due.description).toBe('A 10-minute talk on the Gold Card and EB-5.');
  });

  it('saves a moment’s title, description and hook, and keeps it when the moments are asked for again', async () => {
    const id = await create(member);
    await takeDue();
    await finish(id, [
      { first: 10, last: 14, title: 'The agent’s title', why: 'w', hook: 'h' },
      { first: 40, last: 42, title: 'Another', why: 'w', hook: 'h' },
    ]);
    const save = (was: [number, number] | null, at: [number, number], title: string, why = '', hook = '', warnings: unknown = []) =>
      t.asUser(member, () =>
        t.db.query(`select public.save_moment($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)`, [id, was?.[0] ?? null, was?.[1] ?? null, at[0], at[1], title, why, hook, JSON.stringify(warnings)]),
      );
    await save([10, 14], [10, 15], 'Our title', 'Why we like it', 'A hook that guarantees', ['Hook says "guarantee"']);
    // A moment of the team's own is kept as soon as it is added.
    await save(null, [100, 103], 'Our own');
    let saved = await row(id);
    expect(saved.moments.map((m) => [m.first, m.last, m.title, m.source])).toEqual([
      [10, 15, 'Our title', 'team'],
      [40, 42, 'Another', 'agent'],
      [100, 103, 'Our own', 'team'],
    ]);
    expect(saved.moments[0]).toMatchObject({ why: 'Why we like it', hook: 'A hook that guarantees', warnings: ['Hook says "guarantee"'], start: 100, end: 159.5 });

    await expect(save(null, [40, 42], 'Same lines')).rejects.toThrow(/already in the list/);
    await expect(save(null, [100, 130], 'Too long')).rejects.toThrow(/two and a half minutes/);
    await expect(save([7, 8], [7, 8], 'Gone')).rejects.toThrow(/gone/);
    await expect(save(null, [200, 201], '')).rejects.toThrow(/title/);
    await expect(t.asUser(outsider, () => t.db.query(`select public.save_moment($1, null, null, 1, 2, 'x', '', '', '[]')`, [id]))).rejects.toThrow(/Only the QGR team/);

    // Moved after ads were made from it, a moment stays as it was and the new lines are another.
    const runId = await t.asUser(member, () => t.value<string>(`select public.create_run('custom', 'text', 'From the webinar', array['meta'], 'consultations', p_excerpt => $1)`, ['What the clip says, long enough to be a run of its own.']));
    await t.asUser(member, () => t.db.query(`select public.record_moment_run($1, 100, 103, 'Our own', $2)`, [id, runId]));
    await save([100, 103], [100, 104], 'Our own, longer');
    saved = await row(id);
    expect(saved.moments.slice(2).map((m) => [m.last, m.title, m.run_ids])).toEqual([
      [103, 'Our own', [runId]],
      [104, 'Our own, longer', []],
    ]);
    // Renamed in place, it keeps its runs.
    await save([100, 103], [100, 103], 'Renamed');
    expect((await row(id)).moments[2]).toMatchObject({ title: 'Renamed', run_ids: [runId] });

    // Taken out: only one no ads were made from.
    await t.asUser(member, () => t.db.query(`select public.remove_moment($1, 40, 42)`, [id]));
    await expect(t.asUser(member, () => t.db.query(`select public.remove_moment($1, 100, 103)`, [id]))).rejects.toThrow(/stays with its runs/);
    expect((await row(id)).moments.map((m) => m.first)).toEqual([10, 100, 100]);

    // Asked for again, the team's saved moments stay.
    await t.asUser(member, () => t.db.query(`select public.ask_moments_again($1)`, [id]));
    await takeDue();
    await finish(id, [{ first: 10, last: 15, title: 'Agent again', why: 'w', hook: 'h' }, { first: 60, last: 62, title: 'Fresh', why: 'w', hook: 'h' }]);
    expect((await row(id)).moments.map((m) => [m.first, m.title])).toEqual([
      [60, 'Fresh'],
      [10, 'Our title'],
      [100, 'Renamed'],
      [100, 'Our own, longer'],
    ]);
  });

  it('holds forty moments even when a moment ads were made from is moved', async () => {
    const id = await create(member);
    const runId = await t.asUser(member, () => t.value<string>(`select public.create_run('custom', 'text', 'From the webinar', array['meta'], 'consultations', p_excerpt => $1)`, ['What the clip says, long enough to be a run of its own.']));
    for (let i = 0; i < 40; i++) {
      await t.asUser(member, () => t.db.query(`select public.save_moment($1, null, null, $2, $3, 'M', '', '', '[]'::jsonb)`, [id, i * 4, i * 4 + 1]));
    }
    await t.asUser(member, () => t.db.query(`select public.record_moment_run($1, 0, 1, 'M', $2)`, [id, runId]));
    await expect(t.asUser(member, () => t.db.query(`select public.save_moment($1, 0, 1, 0, 2, 'M', '', '', '[]'::jsonb)`, [id]))).rejects.toThrow(/up to 40 moments/);
  });
});
