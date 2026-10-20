import { beforeAll, describe, expect, it } from 'vitest';
import { testDatabase } from '../test/supabase';
import type { TestDatabase } from '../test/supabase';

// AI video: asked for on the page, sent to Higgsfield by n8n once, checked
// until it is done, and copied into the library. Every video spends the
// team's credits, so nothing is sent until AI video is switched on, a month's
// asks keep to the team's limit, and an ask whose fate is unknown is never
// sent again by itself. Against every migration, in Postgres.

let t: TestDatabase;
let member = '';
let outsider = '';

const PROMPT = 'A slow drone shot over a quiet American suburb at golden hour, warm light.';
const uuid = () => crypto.randomUUID();

type Due = { id: string; prompt: string; model: string; seconds: number; aspect: string; quality: string; sound: boolean; picture_path: string | null; look: string | null; live: boolean; path: string };
type Video = { status: string; credits: string; job_id: string | null; path: string | null; error: string | null; removed: boolean };

const ask = (opts: { model?: string; seconds?: number; quality?: string; credits?: number | null; picture?: string | null } = {}, user = member) =>
  t.asUser(user, () =>
    t.value<string>(`select public.ask_for_video($1, $2, $3, '9:16', $4, false, $5, $6)`, [
      PROMPT,
      opts.model ?? 'seedance_2_0_mini',
      opts.seconds ?? 4,
      opts.quality ?? '480p',
      opts.credits === undefined ? 2 : opts.credits,
      opts.picture ?? null,
    ]),
  );
const takeDue = () => t.asService(() => t.value<Due[]>(`select public.video_take_due()`));
const takeMaking = () => t.asService(() => t.value<{ id: string; job_id: string; path: string }[]>(`select public.video_take_making()`));
const service = (sql: string, params: unknown[]) => t.asService(() => t.db.query(sql, params));
const video = (id: string) =>
  t.value<Video>(`select to_jsonb(x) from (select status, credits::text, job_id, path, error, removed_at is not null as removed from public.ai_videos where id = $1) x`, [id]);
const budget = () => t.asUser(member, () => t.value<{ live: boolean; cap: number; spent: number; pictures: number }>(`select public.video_budget()`));
const settings = (live: boolean, cap: number) => t.asUser(member, () => t.db.query(`select public.set_video_settings($1, $2)`, [live, cap]));
/** Everything asked so far, settled, so one test's asks never reach another's. */
const settle = async () => {
  for (const due of await takeDue()) await service(`select public.video_fail($1, 'settled')`, [due.id]);
  await t.db.query(`update public.ai_videos set status = 'failed' where status in ('asked', 'making')`);
};

beforeAll(async () => {
  t = await testDatabase();
  member = await t.addUser('member@qgr.example', 'owner');
  outsider = await t.addUser('stranger@elsewhere.example');
}, 60_000);

describe('while AI video is not switched on', () => {
  it('the stand-in makes nothing and costs nothing', async () => {
    expect(await budget()).toEqual({ live: false, cap: 100, spent: 0, pictures: 0 });
    // No price is needed: nothing will be spent.
    const id = await ask({ credits: null });
    expect(await video(id)).toMatchObject({ status: 'asked', credits: '0.00' });

    const [due, ...rest] = await takeDue();
    expect(rest).toEqual([]);
    expect(due).toEqual({ id, prompt: PROMPT, model: 'seedance_2_0_mini', seconds: 4, aspect: '9:16', quality: '480p', sound: false, picture_path: null, look: expect.toBeOneOf([null, expect.any(String)]), live: false, path: `videos/${id}.mp4`, references: [] });
    // Claimed: the next run does not take it again.
    expect(await takeDue()).toEqual([]);

    await service(`select public.video_finish($1, null, true)`, [id]);
    expect(await video(id)).toMatchObject({ status: 'stand_in', credits: '0.00', error: 'Nothing was made: AI video is not switched on in Settings.' });
  });
});

describe('switched on', () => {
  it('needs Higgsfield’s price, and keeps the month within the limit', async () => {
    await settings(true, 20);
    await expect(ask({ credits: null })).rejects.toThrow(/price for this video is needed first/);
    await expect(ask({ credits: 0 })).rejects.toThrow(/price for this video is needed first/);
    const first = await ask({ credits: 10 });
    expect(await budget()).toEqual({ live: true, cap: 20, spent: 10, pictures: 0 });
    await expect(ask({ credits: 10.5 })).rejects.toThrow(/past its limit of 20 credits \(10 used\)/);
    const second = await ask({ credits: 10 });
    expect(await budget()).toMatchObject({ spent: 20 });

    // A failed ask gives its credits back to the month.
    const taken = await takeDue();
    expect(taken.map((d) => d.id).sort()).toEqual([first, second].sort());
    expect(taken.every((d) => d.live)).toBe(true);
    await service(`select public.video_fail($1, 'Higgsfield refused the prompt.')`, [second]);
    expect(await video(second)).toMatchObject({ status: 'failed', error: 'Higgsfield refused the prompt.' });
    expect(await budget()).toMatchObject({ spent: 10 });
    await service(`select public.video_fail($1, 'settled')`, [first]);
    await settings(true, 100);
  });

  it('is sent once, checked until done, and kept in the library', async () => {
    const id = await ask({ credits: 2 });
    const [due] = await takeDue();
    expect(due!.id).toBe(id);
    await expect(service(`select public.video_started($1, '  ', null)`, [id])).rejects.toThrow(/No job to record/);
    // Higgsfield's own price, when it says one, replaces the quote.
    await service(`select public.video_started($1, 'job-123', 2.5)`, [id]);
    expect(await video(id)).toMatchObject({ status: 'making', job_id: 'job-123', credits: '2.50' });
    await expect(service(`select public.video_started($1, 'job-456', null)`, [id])).rejects.toThrow(/not waiting to be sent/);

    const [job] = await takeMaking();
    expect(job).toEqual({ id, job_id: 'job-123', path: `videos/${id}.mp4` });
    // Asked about at most every 45 seconds.
    expect(await takeMaking()).toEqual([]);
    await t.db.query(`update public.ai_videos set checked_at = now() - interval '1 minute' where id = $1`, [id]);
    expect((await takeMaking()).map((j) => j.id)).toEqual([id]);

    await expect(service(`select public.video_finish($1, $2)`, [id, `videos/${uuid()}.mp4`])).rejects.toThrow(/not where this video goes/);
    await expect(service(`select public.video_finish($1, $2)`, [id, `videos/${id}.mp4`])).rejects.toThrow(/has not finished uploading/);
    await service(`insert into storage.objects (bucket_id, name) values ('ai-videos', $1)`, [`videos/${id}.mp4`]);
    await service(`select public.video_finish($1, $2)`, [id, `videos/${id}.mp4`]);
    expect(await video(id)).toMatchObject({ status: 'ready', path: `videos/${id}.mp4`, error: null });

    // Out of the library, but the month still counts what it cost.
    const before = (await budget()).spent;
    await t.asUser(member, () => t.db.query(`select public.remove_ai_video($1)`, [id]));
    expect(await video(id)).toMatchObject({ status: 'ready', removed: true });
    expect((await budget()).spent).toBe(before);
  });

  it('never sends again an ask whose fate is unknown', async () => {
    const lost = await ask({ credits: 2 });
    await takeDue();
    await service(`select public.video_unknown($1, 'The answer was lost: check Higgsfield.')`, [lost]);
    expect(await video(lost)).toMatchObject({ status: 'unknown', error: 'The answer was lost: check Higgsfield.' });

    // n8n stopped while sending: after ten minutes it is unknown, not sent again.
    const stuck = await ask({ credits: 2 });
    await takeDue();
    await t.db.query(`update public.ai_videos set claimed_at = now() - interval '11 minutes' where id = $1`, [stuck]);
    expect(await takeDue()).toEqual([]);
    expect(await video(stuck)).toMatchObject({ status: 'unknown', error: expect.stringMatching(/Check Higgsfield's history before asking again/) });
    // An unknown ask still counts against the month: it may have been charged.
    expect((await budget()).spent).toBeGreaterThanOrEqual(4);
  });

  it('waits again when Higgsfield could not be reached, three tries at most', async () => {
    const id = await ask({ credits: 2 });
    for (let attempt = 1; attempt <= 2; attempt++) {
      expect((await takeDue()).map((d) => d.id)).toEqual([id]);
      await service(`select public.video_release($1, 'Could not connect to your MCP server')`, [id]);
      expect(await video(id)).toMatchObject({ status: 'asked', error: null });
    }
    expect((await takeDue()).map((d) => d.id)).toEqual([id]);
    await service(`select public.video_release($1, 'Could not connect to your MCP server')`, [id]);
    expect(await video(id)).toMatchObject({ status: 'failed', error: 'Higgsfield could not be reached three times: nothing was spent. Ask again later. (Could not connect to your MCP server)' });
    // Its credits go back to the month.
    expect(await takeDue()).toEqual([]);
  });

  it('follows the brand’s picture style', async () => {
    await t.db.query(`update public.brand_profile set picture_style = 'Warm natural light, indigo and gold accents.' where id = 1`);
    const id = await ask({ credits: 2 });
    expect((await takeDue()).find((d) => d.id === id)?.look).toBe('Warm natural light, indigo and gold accents.');
    await settle();
  });

  it('stops an ask not yet sent, and leaves one being made to finish', async () => {
    const waiting = await ask({ credits: 2 });
    await t.asUser(member, () => t.db.query(`select public.remove_ai_video($1)`, [waiting]));
    expect(await video(waiting)).toMatchObject({ status: 'failed', removed: true, error: 'Stopped before it was sent to Higgsfield.' });
    expect(await takeDue()).toEqual([]);

    const sent = await ask({ credits: 2 });
    await takeDue();
    await expect(t.asUser(member, () => t.db.query(`select public.remove_ai_video($1)`, [sent]))).rejects.toThrow(/being made/);
    await settle();
  });

  it('holds each model to what Higgsfield makes, and a first picture to the bucket', async () => {
    await expect(ask({ model: 'seedance_2_0_mini', quality: '1080p' })).rejects.toThrow(/ai_videos_model_settings/);
    await expect(ask({ model: 'kling3_0', quality: 'std', seconds: 20 })).rejects.toThrow(/ai_videos_model_settings/);
    expect(await ask({ model: 'kling3_0', quality: 'std', seconds: 3 })).toMatch(/^[0-9a-f-]{36}$/);

    const picture = `refs/${member}/${uuid()}.jpg`;
    await expect(ask({ picture })).rejects.toThrow(/has not finished uploading/);
    await t.asUser(member, () => t.db.query(`insert into storage.objects (bucket_id, name, owner) values ('video-refs', $1, $2)`, [picture, member]));
    const withPicture = await ask({ picture });
    expect((await takeDue()).find((d) => d.id === withPicture)?.picture_path).toBe(picture);
    // Seedance 2.5 starts from the prompt alone.
    await expect(ask({ model: 'seedance_2_5', quality: '720p', seconds: 5, picture })).rejects.toThrow(/ai_videos_model_settings/);
    await settle();
  });

  it('lets four wait at once at most', async () => {
    for (let i = 0; i < 4; i++) await ask({ credits: 1 });
    await expect(ask({ credits: 1 })).rejects.toThrow(/Four videos are being made already/);
    await settle();
  });
});

describe('who can do what', () => {
  it('keeps everything to the team, and n8n’s steps to n8n', async () => {
    await expect(ask({}, outsider)).rejects.toThrow();
    await expect(t.asUser(outsider, () => t.db.query(`select public.video_budget()`))).rejects.toThrow();
    await expect(t.asUser(outsider, () => t.db.query(`select public.set_video_settings(true, 1000)`))).rejects.toThrow();
    expect((await t.asUser(outsider, () => t.db.query(`select id from public.ai_videos`))).rows).toEqual([]);
    expect((await t.asUser(member, () => t.db.query(`select id from public.ai_videos`))).rows.length).toBeGreaterThan(0);
    await expect(t.asUser(member, () => t.db.query(`select public.video_take_due()`))).rejects.toThrow(/permission denied/);
    await expect(t.asUser(member, () => t.db.query(`select public.video_finish($1, null, true)`, [uuid()]))).rejects.toThrow(/permission denied/);
    await expect(t.asUser(member, () => t.db.query(`update public.ai_videos set credits = 0`))).rejects.toThrow(/permission denied/);
    await expect(t.asUser(member, () => t.db.query(`select public.set_video_settings(true, -1)`))).rejects.toThrow(/between 0 and 100,000/);
  });
});
