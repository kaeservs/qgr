import { beforeAll, describe, expect, it } from 'vitest';
import { testDatabase } from '../test/supabase';
import type { TestDatabase } from '../test/supabase';

// Pictures for ads: asked for in the studio or by every new ad, made by n8n in
// turn, shown in place of the drawn design, and held to the same rules as the
// words: a change takes the approval back, and nothing changes while a post
// waits. Against every migration, in Postgres.

let t: TestDatabase;
let member = '';
let outsider = '';

const STRATEGY = {
  title: 'Pictures check',
  positioning: 'Plain advice',
  audiences: ['Families'],
  angles: ['One', 'Two', 'Three'].map((name) => ({ name, why: 'w', hook: 'h', based_on_hook: null })),
  channels: [{ platform: 'meta', share: 100, role: 'r', format: 'f' }],
  guardrails: ['g'],
};
const copy = { meta: { text: 'Plan your EB-5 path with people who show their working.', headline: 'EB-5, mapped out' } };
const uuid = () => crypto.randomUUID();

/** A custom run's three ads; C has no picture prompt, as a clip's ads have none. */
async function adSet(): Promise<{ runId: string; variant: Record<'A' | 'B' | 'C', string> }> {
  const runId = await t.asUser(member, () => t.value<string>(`select public.create_run('custom', 'text', 'Pictures check', array['meta'], 'consultations', p_excerpt => $1)`, ['Plain words about EB-5 for families planning a move to the United States.']));
  const variants = ['A', 'B', 'C'].map((label, i) => ({ label, angle: STRATEGY.angles[i]!.name, creative_text: 'Plan with care', creative_style: 'arcs', image_prompt: label === 'C' ? '' : 'A calm skyline at dusk, indigo and gold, no words', copy, warnings: [] }));
  await t.asService(async () => {
    await t.db.query(`select public.agent_begin($1, 'strategist')`, [runId]);
    await t.db.query(`select public.agent_finish_strategist($1, $2::jsonb)`, [runId, JSON.stringify(STRATEGY)]);
    await t.db.query(`select public.agent_begin($1, 'content')`, [runId]);
    await t.db.query(`select public.agent_finish_content($1, $2::jsonb)`, [runId, JSON.stringify({ title: 'Pictures check', variants })]);
  });
  const { rows } = await t.db.query<{ label: 'A' | 'B' | 'C'; id: string }>(`select v.label, v.id from public.ad_variants v join public.ad_sets s on s.id = v.ad_set_id where s.run_id = $1`, [runId]);
  return { runId, variant: Object.fromEntries(rows.map((r) => [r.label, r.id])) as Record<'A' | 'B' | 'C', string> };
}

const ask = (variantId: string, user = member) => t.asUser(user, () => t.db.query(`select public.request_picture($1)`, [variantId]));
const takeDue = () => t.asService(() => t.value<{ variant_id: string; label: string; prompt: string; style: string; path: string }[]>(`select public.picture_take_due()`));
const upload = (path: string) => t.asService(() => t.db.query(`insert into storage.objects (bucket_id, name) values ('ad-pictures', $1)`, [path]));
const finish = (variantId: string, path: string | null, standIn = false) =>
  t.asService(() => t.value<{ remove_picture: string | null }>(`select public.picture_finish($1, $2, $3)`, [variantId, path, standIn]));
const picture = (variantId: string) =>
  t.value<{ picture_path: string | null; picture_status: string; picture_error: string | null; approved: boolean }>(
    `select to_jsonb(x) from (select picture_path, picture_status, picture_error, approved_at is not null as approved from public.ad_variants where id = $1) x`,
    [variantId],
  );
const events = (runId: string) => t.db.query<{ text: string }>(`select text from public.run_events where run_id = $1 order by id`, [runId]).then((r) => r.rows.map((e) => e.text));
/** Everything asked so far, made by the stand-in, so one test's asks never reach another's. */
const settle = async () => {
  for (const due of await takeDue()) await finish(due.variant_id, null, true);
};

beforeAll(async () => {
  t = await testDatabase();
  member = await t.addUser('member@qgr.example', 'owner');
  outsider = await t.addUser('stranger@elsewhere.example');
}, 60_000);

describe('a picture for an ad', () => {
  it('is made once, shows in place of the design, and takes the approval back', async () => {
    const { runId, variant } = await adSet();
    await t.asUser(member, () => t.db.query(`select public.approve_variant($1)`, [variant.A]));
    await ask(variant.A);
    expect(await picture(variant.A)).toMatchObject({ picture_status: 'making', approved: true });

    const [due, ...rest] = await takeDue();
    expect(rest).toEqual([]);
    expect(due).toMatchObject({ variant_id: variant.A, label: 'A', prompt: 'A calm skyline at dusk, indigo and gold, no words', style: 'arcs' });
    expect(due!.path).toMatch(new RegExp(`^pictures/${variant.A}/[0-9a-f-]{36}\\.png$`));
    // Claimed: the next minute does not make it again.
    expect(await takeDue()).toEqual([]);

    await expect(finish(variant.A, due!.path)).rejects.toThrow(/has not finished uploading/);
    await upload(due!.path);
    await expect(finish(variant.A, `pictures/${variant.B}/${uuid()}.png`)).rejects.toThrow(/not where this variant's pictures go/);
    expect(await finish(variant.A, due!.path)).toEqual({ remove_picture: null });
    expect(await picture(variant.A)).toEqual({ picture_path: due!.path, picture_status: 'none', picture_error: null, approved: false });
    expect(await events(runId)).toEqual(expect.arrayContaining(['A picture asked for variant A', 'Variant A has a new picture: it needs approving again']));

    // Another one: the file shown before is handed back to be removed.
    await ask(variant.A);
    const [again] = await takeDue();
    await upload(again!.path);
    expect(await finish(variant.A, again!.path)).toEqual({ remove_picture: due!.path });
  });

  it('says so when the stand-in makes nothing, and the design is drawn', async () => {
    const { runId, variant } = await adSet();
    await ask(variant.B);
    await takeDue();
    await expect(finish(variant.B, null)).rejects.toThrow(/No picture to record/);
    expect(await finish(variant.B, null, true)).toEqual({ remove_picture: null });
    expect(await picture(variant.B)).toMatchObject({ picture_path: null, picture_status: 'none', picture_error: expect.stringMatching(/image model is not connected yet/) });
    expect(await events(runId)).toContain('No picture made for variant B: the image model is not connected yet');
    // Answered already: a second answer changes nothing.
    expect(await finish(variant.B, null, true)).toEqual({ remove_picture: null });
    expect(await picture(variant.B)).toMatchObject({ picture_status: 'none' });
  });

  it('hands back a picture nobody waits for any more, never the one shown', async () => {
    const { variant } = await adSet();
    await ask(variant.A);
    const [first] = await takeDue();
    await upload(first!.path);
    // Stopped in the studio while the model was drawing: what it made goes.
    await t.asUser(member, () => t.db.query(`select public.remove_picture($1)`, [variant.A]));
    expect(await finish(variant.A, first!.path)).toEqual({ remove_picture: first!.path });
    expect(await picture(variant.A)).toMatchObject({ picture_path: null, picture_status: 'none' });

    await ask(variant.A);
    const [second] = await takeDue();
    await upload(second!.path);
    expect(await finish(variant.A, second!.path)).toEqual({ remove_picture: null });
    // The same answer sent again leaves the picture where it is.
    expect(await finish(variant.A, second!.path)).toEqual({ remove_picture: null });
    expect(await picture(variant.A)).toMatchObject({ picture_path: second!.path });
    // Another variant's folder is never handed back.
    await expect(finish(variant.A, `pictures/${variant.B}/${uuid()}.png`)).rejects.toThrow(/not where this variant's pictures go/);
  });

  it('records a failure, and gives up on a step that keeps losing its claim', async () => {
    const { runId, variant } = await adSet();
    await ask(variant.A);
    await takeDue();
    await t.asService(() => t.db.query(`select public.picture_fail($1, 'The image model refused the prompt (400).')`, [variant.A]));
    expect(await picture(variant.A)).toMatchObject({ picture_status: 'failed', picture_error: 'The image model refused the prompt (400).' });
    expect(await events(runId)).toContain('The picture for variant A failed: The image model refused the prompt (400).');

    await ask(variant.B);
    for (let i = 0; i < 3; i++) {
      expect((await takeDue()).map((d) => d.variant_id)).toEqual([variant.B]);
      await t.db.query(`update public.ad_variants set picture_claimed_at = now() - interval '11 minutes' where id = $1`, [variant.B]);
    }
    expect(await takeDue()).toEqual([]);
    expect(await picture(variant.B)).toMatchObject({ picture_status: 'failed', picture_error: 'The picture could not be made after three tries.' });
  });

  it('refuses an ad with no picture prompt, a second ask, and a variant waiting to post', async () => {
    const { variant } = await adSet();
    await expect(ask(variant.C)).rejects.toThrow(/has no picture prompt/);
    await ask(variant.A);
    await expect(ask(variant.A)).rejects.toThrow(/already being made/);
    await settle();

    await t.asUser(member, () => t.db.query(`select public.approve_variant($1)`, [variant.B]));
    // Two hours from now, as a wall time in the team's zone.
    const local = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(Date.now() + 7_200_000)).replace(',', '');
    const scheduled = await t.asUser(member, () => t.value<string>(`select public.schedule_post($1, '[{"place":"facebook"}]'::jsonb, $2)`, [variant.B, local]));
    await expect(ask(variant.B)).rejects.toThrow(/waiting to post/);
    await t.asUser(member, () => t.db.query(`select public.cancel_post($1)`, [scheduled]));

    // Scheduled while its picture was being made: the picture is not used.
    await ask(variant.B);
    const [due] = await takeDue();
    const again = await t.asUser(member, () => t.value<string>(`select public.schedule_post($1, '[{"place":"facebook"}]'::jsonb, $2)`, [variant.B, local]));
    await upload(due!.path);
    expect(await finish(variant.B, due!.path)).toEqual({ remove_picture: due!.path });
    expect(await picture(variant.B)).toMatchObject({ picture_path: null, picture_status: 'failed', approved: true });
    await t.asUser(member, () => t.db.query(`select public.cancel_post($1)`, [again]));
  });

  it('takes a picture away, back to the design, and lets the file go', async () => {
    const { variant } = await adSet();
    await ask(variant.A);
    const [due] = await takeDue();
    await upload(due!.path);
    await finish(variant.A, due!.path);
    await t.asUser(member, () => t.db.query(`select public.approve_variant($1)`, [variant.A]));

    const removeFile = () => t.asUser(member, () => t.value<number>(`with gone as (delete from storage.objects where bucket_id = 'ad-pictures' and name = $1 returning 1) select count(*)::int from gone`, [due!.path]));
    // Shown by a variant: it stays.
    expect(await removeFile()).toBe(0);
    expect(await t.asUser(member, () => t.value<string>(`select public.remove_picture($1)`, [variant.A]))).toBe(due!.path);
    expect(await picture(variant.A)).toEqual({ picture_path: null, picture_status: 'none', picture_error: null, approved: false });
    expect(await removeFile()).toBe(1);
    await expect(t.asUser(member, () => t.db.query(`select public.remove_picture($1)`, [variant.A]))).rejects.toThrow(/has no picture/);
  });

  it('keeps everything to the team, and the making to n8n', async () => {
    const { variant } = await adSet();
    await expect(ask(variant.A, outsider)).rejects.toThrow(/Only the QGR team/);
    await t.asUser(outsider, async () => {
      await expect(t.db.query(`select public.remove_picture($1)`, [variant.A])).rejects.toThrow(/Only the QGR team/);
      await expect(t.db.query(`select public.set_pictures_auto(true)`)).rejects.toThrow(/Only the QGR team/);
      expect(await t.value<number>(`select count(*)::int from storage.objects where bucket_id = 'ad-pictures'`)).toBe(0);
    });
    await t.asUser(member, async () => {
      await expect(t.db.query('select public.picture_take_due()')).rejects.toThrow(/permission denied/);
      await expect(t.db.query(`select public.picture_finish($1, null, true)`, [variant.A])).rejects.toThrow(/permission denied/);
      await expect(t.db.query(`select public.picture_fail($1, 'x')`, [variant.A])).rejects.toThrow(/permission denied/);
      await expect(t.db.query(`insert into storage.objects (bucket_id, name) values ('ad-pictures', $1)`, [`pictures/${variant.A}/${uuid()}.png`])).rejects.toThrow(/row-level security/);
    });
  });

  it('asks for one for every new ad with a prompt when the team turns it on', async () => {
    await t.asUser(member, () => t.db.query(`select public.set_pictures_auto(true)`));
    const on = await adSet();
    expect((await picture(on.variant.A)).picture_status).toBe('making');
    expect((await picture(on.variant.B)).picture_status).toBe('making');
    // A clip's ads have no prompt: the clip is their picture.
    expect((await picture(on.variant.C)).picture_status).toBe('none');
    await settle();

    await t.asUser(member, () => t.db.query(`select public.set_pictures_auto(false)`));
    const off = await adSet();
    expect((await picture(off.variant.A)).picture_status).toBe('none');
  });
});
