import { beforeAll, describe, expect, it } from 'vitest';
import { testDatabase } from '../test/supabase';
import type { TestDatabase } from '../test/supabase';

// Pictures by Higgsfield: each ad's picture is priced, recorded, sent once and
// its job checked until the picture is in ad-pictures, where it is kept as any
// picture is. Every picture spends the team's credits, so the month's pictures
// and videos keep to one limit together, and a send whose answer was lost is
// never sent again by itself. Against every migration, in Postgres.

let t: TestDatabase;
let member = '';
let outsider = '';

const STRATEGY = {
  title: 'Higgsfield pictures',
  positioning: 'Plain advice',
  audiences: ['Families'],
  angles: ['One', 'Two', 'Three'].map((name) => ({ name, why: 'w', hook: 'h', based_on_hook: null })),
  channels: [{ platform: 'meta', share: 100, role: 'r', format: 'f' }],
  guardrails: ['g'],
};
const copy = { meta: { text: 'Plan your EB-5 path with people who show their working.', headline: 'EB-5, mapped out' } };
const uuid = () => crypto.randomUUID();

/** A custom run's three ads, each with a picture prompt. */
async function adSet(): Promise<{ runId: string; variant: Record<'A' | 'B' | 'C', string> }> {
  const runId = await t.asUser(member, () => t.value<string>(`select public.create_run('custom', 'text', 'Higgsfield pictures', array['meta'], 'consultations', p_excerpt => $1)`, ['Plain words about EB-5 for families planning a move to the United States.']));
  const variants = ['A', 'B', 'C'].map((label, i) => ({ label, angle: STRATEGY.angles[i]!.name, creative_text: 'Plan with care', creative_style: 'arcs', image_prompt: 'A calm skyline at dusk, indigo and gold, no words', copy, warnings: [] }));
  await t.asService(async () => {
    await t.db.query(`select public.agent_begin($1, 'strategist')`, [runId]);
    await t.db.query(`select public.agent_finish_strategist($1, $2::jsonb)`, [runId, JSON.stringify(STRATEGY)]);
    await t.db.query(`select public.agent_begin($1, 'content')`, [runId]);
    await t.db.query(`select public.agent_finish_content($1, $2::jsonb)`, [runId, JSON.stringify({ title: 'Higgsfield pictures', variants })]);
  });
  const { rows } = await t.db.query<{ label: 'A' | 'B' | 'C'; id: string }>(`select v.label, v.id from public.ad_variants v join public.ad_sets s on s.id = v.ad_set_id where s.run_id = $1`, [runId]);
  return { runId, variant: Object.fromEntries(rows.map((r) => [r.label, r.id])) as Record<'A' | 'B' | 'C', string> };
}

type Ask = { variant_id: string; label: string; prompt: string; model: string; quality: string; path: string };
type Begun = { begun: boolean; id?: string; error?: string };
type Job = { id: string; variant_id: string; job_id: string; path: string };

const request = (variantId: string) => t.asUser(member, () => t.db.query(`select public.request_picture($1)`, [variantId]));
const takeDue = () => t.asService(() => t.value<Ask[]>(`select public.picture_take_due()`));
const begin = (ask: Ask, credits = 0.25, quality = 'low') =>
  t.asService(() => t.value<Begun>(`select public.picture_higgsfield_begin($1, $2, $3, $4)`, [ask.variant_id, credits, quality, ask.path]));
const service = (sql: string, params: unknown[]) => t.asService(() => t.db.query(sql, params));
const takeMaking = () => t.asService(() => t.value<Job[]>(`select public.picture_take_making()`));
const upload = (path: string) => service(`insert into storage.objects (bucket_id, name) values ('ad-pictures', $1)`, [path]);
const finish = (id: string, path: string) => t.asService(() => t.value<{ remove_picture: string | null }>(`select public.picture_higgsfield_finish($1, $2)`, [id, path]));
const picture = (variantId: string) =>
  t.value<{ picture_path: string | null; picture_status: string; picture_error: string | null }>(
    `select to_jsonb(x) from (select picture_path, picture_status, picture_error from public.ad_variants where id = $1) x`,
    [variantId],
  );
const sent = (id: string) =>
  t.value<{ status: string; credits: string; job_id: string | null; error: string | null }>(
    `select to_jsonb(x) from (select status, credits::text, job_id, error from public.higgsfield_pictures where id = $1) x`,
    [id],
  );
const budget = () => t.asUser(member, () => t.value<{ live: boolean; cap: number; spent: number; pictures: number }>(`select public.video_budget()`));
const setCap = (cap: number) => t.asUser(member, () => t.db.query(`select public.set_video_settings(false, $1)`, [cap]));
/** Everything asked or sent so far, settled, so one test's never reaches another's. */
const settle = async () => {
  await t.db.query(`update public.higgsfield_pictures set status = 'failed' where status in ('sending', 'making')`);
  await t.db.query(`update public.ad_variants set picture_status = 'none', picture_claimed_at = null where picture_status = 'making'`);
  await t.db.query(`update public.higgsfield_pictures set asked_at = asked_at - interval '400 days'`);
};

beforeAll(async () => {
  t = await testDatabase();
  member = await t.addUser('member@qgr.example', 'owner');
  outsider = await t.addUser('stranger@elsewhere.example');
}, 60_000);

describe('choosing Higgsfield', () => {
  it('is a third image model, with a quality the team picks', async () => {
    await t.asUser(member, () => t.db.query(`select public.set_pictures_model('higgsfield')`));
    await t.asUser(member, () => t.db.query(`select public.set_pictures_quality('medium')`));
    expect(await t.value(`select to_jsonb(x) from (select pictures_model, pictures_quality from public.team_settings) x`)).toEqual({ pictures_model: 'higgsfield', pictures_quality: 'medium' });
    await expect(t.asUser(member, () => t.db.query(`select public.set_pictures_quality('ultra')`))).rejects.toThrow(/low, medium or high/);
    await expect(t.asUser(outsider, () => t.db.query(`select public.set_pictures_quality('low')`))).rejects.toThrow();

    const { variant } = await adSet();
    await request(variant.A);
    const [ask, ...rest] = await takeDue();
    expect(rest).toEqual([]);
    expect(ask).toMatchObject({ variant_id: variant.A, model: 'higgsfield', quality: 'medium' });
    await t.asUser(member, () => t.db.query(`select public.set_pictures_quality('low')`));
    await settle();
  });

  it('cannot be called by the team for n8n’s steps, and reads as the team’s own', async () => {
    const { variant } = await adSet();
    await expect(t.asUser(member, () => t.db.query(`select public.picture_take_making()`))).rejects.toThrow(/permission denied/);
    await expect(t.asUser(member, () => t.db.query(`select public.picture_higgsfield_begin($1, 0.25, 'low', $2)`, [variant.A, `pictures/${variant.A}/${uuid()}.png`]))).rejects.toThrow(/permission denied/);
    await request(variant.A);
    const [ask] = await takeDue();
    await begin(ask!);
    expect(await t.asUser(member, () => t.value<number>(`select count(*)::int from public.higgsfield_pictures`))).toBeGreaterThan(0);
    expect(await t.asUser(outsider, () => t.value<number>(`select count(*)::int from public.higgsfield_pictures`))).toBe(0);
    await settle();
  });
});

describe('a picture sent once', () => {
  it('is recorded before it goes, checked until made, and shown on its ad', async () => {
    const { variant } = await adSet();
    await request(variant.A);
    const [ask] = await takeDue();
    const begun = await begin(ask!);
    expect(begun).toEqual({ begun: true, id: expect.any(String) });
    const id = begun.id!;
    expect(await sent(id)).toMatchObject({ status: 'sending', credits: '0.25' });
    // Being sent: the ad is never taken again, whatever its claim says.
    await t.db.query(`update public.ad_variants set picture_claimed_at = now() - interval '11 minutes' where id = $1`, [variant.A]);
    expect(await takeDue()).toEqual([]);
    expect(await begin(ask!)).toEqual({ begun: false, error: 'Higgsfield already has this ad\'s picture.' });

    await service(`select public.picture_higgsfield_started($1, 'job-1', 0.5)`, [id]);
    expect(await sent(id)).toMatchObject({ status: 'making', job_id: 'job-1', credits: '0.50' });
    // Just started: checked from the next run on, then every 20 seconds at most.
    expect(await takeMaking()).toEqual([]);
    await t.db.query(`update public.higgsfield_pictures set checked_at = now() - interval '21 seconds' where id = $1`, [id]);
    expect(await takeMaking()).toEqual([{ id, variant_id: variant.A, job_id: 'job-1', path: ask!.path }]);
    expect(await takeMaking()).toEqual([]);

    // It arrived as a WebP: the path takes that extension, nothing else.
    await expect(finish(id, `pictures/${variant.A}/${uuid()}.webp`)).rejects.toThrow(/not where it was meant to go/);
    const path = ask!.path.replace(/\.png$/, '.webp');
    await expect(finish(id, path)).rejects.toThrow(/finished uploading/);
    await upload(path);
    expect(await finish(id, path)).toEqual({ remove_picture: null });
    expect(await picture(variant.A)).toMatchObject({ picture_path: path, picture_status: 'none', picture_error: null });
    expect(await sent(id)).toMatchObject({ status: 'ready' });
    // The same answer twice is kept once.
    expect(await finish(id, path)).toEqual({ remove_picture: null });
    expect(await t.value<number>(`select count(*)::int from public.variant_pictures where variant_id = $1`, [variant.A])).toBe(1);
    await settle();
  });

  it('stopped before it was sent, sends nothing', async () => {
    const { variant } = await adSet();
    await request(variant.B);
    const [ask] = await takeDue();
    await t.asUser(member, () => t.db.query(`select public.stop_picture($1)`, [variant.B]));
    expect(await begin(ask!)).toEqual({ begun: false, error: 'The picture was stopped before it was sent.' });
    expect(await t.value<number>(`select count(*)::int from public.higgsfield_pictures where variant_id = $1`, [variant.B])).toBe(0);
  });

  it('refused or failed: the ad says why, and nothing counts', async () => {
    const { variant } = await adSet();
    await request(variant.A);
    await request(variant.B);
    const [a, b] = await takeDue();
    const first = (await begin(a!)).id!;
    const second = (await begin(b!)).id!;
    expect((await budget()).pictures).toBe(0.5);

    await service(`select public.picture_higgsfield_fail($1, 'Higgsfield refused it: content policy')`, [first]);
    expect(await picture(a!.variant_id)).toMatchObject({ picture_status: 'failed', picture_error: 'Higgsfield refused it: content policy' });
    await service(`select public.picture_higgsfield_started($1, 'job-2')`, [second]);
    await service(`select public.picture_higgsfield_fail($1, 'Higgsfield could not make it (failed).')`, [second]);
    expect(await picture(b!.variant_id)).toMatchObject({ picture_status: 'failed' });
    expect((await budget()).pictures).toBe(0);
    await settle();
  });
});

describe('when Higgsfield is not reached', () => {
  it('nothing was sent: the ad is taken again, three tries at most', async () => {
    const { variant } = await adSet();
    await request(variant.C);
    for (let i = 1; i <= 3; i++) {
      const [ask] = await takeDue();
      expect(ask?.variant_id).toBe(variant.C);
      const id = (await begin(ask!)).id!;
      await service(`select public.picture_higgsfield_release($1, 'Could not connect to Higgsfield')`, [id]);
      expect(await sent(id)).toMatchObject({ status: 'released' });
    }
    expect(await picture(variant.C)).toMatchObject({ picture_status: 'failed', picture_error: expect.stringContaining('after three tries: nothing was spent') });
    expect((await budget()).pictures).toBe(0);
    expect(await takeDue()).toEqual([]);
  });

  it('nor its price: the same, with no send recorded', async () => {
    const { variant } = await adSet();
    await request(variant.A);
    const [ask] = await takeDue();
    await service(`select public.picture_release($1, 'Higgsfield could not be reached just now')`, [ask!.variant_id]);
    expect(await picture(variant.A)).toMatchObject({ picture_status: 'making' });
    expect((await takeDue()).map((a) => a.variant_id)).toEqual([variant.A]);
    await settle();
  });
});

describe('an answer lost after sending', () => {
  it('may have been made: it counts, and is never sent again by itself', async () => {
    const { variant } = await adSet();
    await request(variant.A);
    const [ask] = await takeDue();
    const id = (await begin(ask!)).id!;
    await service(`select public.picture_higgsfield_unknown($1, 'Higgsfield may have started it (timeout). Check its history before asking again.')`, [id]);
    expect(await picture(variant.A)).toMatchObject({ picture_status: 'failed', picture_error: expect.stringContaining('Check its history') });
    expect((await budget()).pictures).toBe(0.25);
    expect(await takeDue()).toEqual([]);
    await settle();
  });

  it('or never came back: a send ten minutes old, or a job thirty, is left to a person', async () => {
    const { variant } = await adSet();
    await request(variant.A);
    await request(variant.B);
    const [a, b] = await takeDue();
    const sending = (await begin(a!)).id!;
    const making = (await begin(b!)).id!;
    await service(`select public.picture_higgsfield_started($1, 'job-3')`, [making]);
    await t.db.query(`update public.higgsfield_pictures set asked_at = now() - interval '11 minutes' where id = $1`, [sending]);
    await t.db.query(`update public.higgsfield_pictures set asked_at = now() - interval '31 minutes', checked_at = null where id = $1`, [making]);
    expect(await takeMaking()).toEqual([]);
    expect(await sent(sending)).toMatchObject({ status: 'unknown', error: expect.stringContaining('n8n lost its answer') });
    expect(await sent(making)).toMatchObject({ status: 'unknown', error: expect.stringContaining('thirty minutes') });
    expect(await picture(a!.variant_id)).toMatchObject({ picture_status: 'failed' });
    expect(await picture(b!.variant_id)).toMatchObject({ picture_status: 'failed' });
    await settle();
  });
});

describe('one monthly limit for videos and pictures', () => {
  it('a picture past the limit is not sent, and the ad says so', async () => {
    await setCap(1);
    const { variant } = await adSet();
    for (const v of [variant.A, variant.B, variant.C]) await request(v);
    const asks = await takeDue();
    const begun = [];
    for (const ask of asks) begun.push(await begin(ask, 0.4));
    expect(begun.map((b) => b.begun)).toEqual([true, true, false]);
    expect(begun[2]!.error).toBe('Not made: this picture (0.4 credits) would take this month\'s Higgsfield spending past its limit of 1 credits (0.8 used). Raise the limit in Settings, or switch pictures to Cloudflare.');
    expect(await picture(asks[2]!.variant_id)).toMatchObject({ picture_status: 'failed', picture_error: begun[2]!.error });
    expect(await budget()).toMatchObject({ cap: 1, spent: 0.8, pictures: 0.8 });

    // A video counts against the same limit.
    await t.asUser(member, () => t.db.query(`select public.set_video_settings(true, 1)`));
    await expect(
      t.asUser(member, () => t.db.query(`select public.ask_for_video($1, 'seedance_2_0_mini', 4, '9:16', '480p', false, 2, null)`, ['A slow drone shot over a quiet suburb at golden hour, warm light.'])),
    ).rejects.toThrow(/past its limit of 1 credits \(0\.8 used\)/);
    await t.asUser(member, () => t.db.query(`select public.set_video_settings(false, 100)`));
    await settle();
  });

  it('counts only this month, in the team’s time zone', async () => {
    const { variant } = await adSet();
    await request(variant.A);
    const [ask] = await takeDue();
    const id = (await begin(ask!)).id!;
    await service(`select public.picture_higgsfield_started($1, 'job-4')`, [id]);
    expect((await budget()).pictures).toBe(0.25);
    await t.db.query(`update public.higgsfield_pictures set asked_at = now() - interval '40 days' where id = $1`, [id]);
    expect((await budget()).pictures).toBe(0);
    await settle();
  });
});
