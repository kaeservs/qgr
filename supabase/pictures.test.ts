import { beforeAll, describe, expect, it } from 'vitest';
import { testDatabase } from '../test/supabase';
import type { TestDatabase } from '../test/supabase';

// Pictures for ads: asked for in the studio (from the prompt as it is, or a
// person's own) or by every new ad, made by n8n in turn on the team's image
// model, shown in place of the drawn design and kept to choose from again, and
// held to the same rules as the words: a change takes the approval back, and
// nothing changes while a post waits. Against every migration, in Postgres.

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
type Ask = { variant_id: string; label: string; prompt: string; style: string; look: string | null; model: string; account: string | null; path: string };
const takeDue = () => t.asService(() => t.value<Ask[]>(`select public.picture_take_due()`));
const upload = (path: string) => t.asService(() => t.db.query(`insert into storage.objects (bucket_id, name) values ('ad-pictures', $1)`, [path]));
const finish = (variantId: string, path: string | null, standIn = false) =>
  t.asService(() => t.value<{ remove_picture: string | null }>(`select public.picture_finish($1, $2, $3)`, [variantId, path, standIn]));
const picture = (variantId: string) =>
  t.value<{ picture_path: string | null; picture_status: string; picture_error: string | null; approved: boolean }>(
    `select to_jsonb(x) from (select picture_path, picture_status, picture_error, approved_at is not null as approved from public.ad_variants where id = $1) x`,
    [variantId],
  );
/** A person's own prompt for a variant's picture. */
const askWith = (variantId: string, prompt: string, user = member) => t.asUser(user, () => t.db.query(`select public.ask_for_picture($1, $2)`, [variantId, prompt]));
/** The pictures kept for a variant to choose from, newest first. */
const kept = (variantId: string) =>
  t.db.query<{ id: string; path: string; prompt: string | null }>(`select id, path, prompt from public.variant_pictures where variant_id = $1 and removed_at is null order by created_at desc, id desc`, [variantId]).then((r) => r.rows);
const usePicture = (variantId: string, pictureId: string) => t.asUser(member, () => t.db.query(`select public.use_picture($1, $2)`, [variantId, pictureId]));
/** Asks with a prompt, and n8n makes the picture: its path. */
async function make(variantId: string, prompt: string): Promise<string> {
  await askWith(variantId, prompt);
  const [due] = await takeDue();
  await upload(due!.path);
  await finish(variantId, due!.path);
  return due!.path;
}
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

    // Another one: the picture shown before is kept to choose again, not handed back.
    await ask(variant.A);
    const [again] = await takeDue();
    await upload(again!.path);
    expect(await finish(variant.A, again!.path)).toEqual({ remove_picture: null });
    expect(await kept(variant.A)).toEqual([
      expect.objectContaining({ path: again!.path, prompt: 'A calm skyline at dusk, indigo and gold, no words' }),
      expect.objectContaining({ path: due!.path }),
    ]);
  });

  it('says so when the stand-in makes nothing, and the design is drawn', async () => {
    const { runId, variant } = await adSet();
    await ask(variant.B);
    await takeDue();
    await expect(finish(variant.B, null)).rejects.toThrow(/No picture to record/);
    expect(await finish(variant.B, null, true)).toEqual({ remove_picture: null });
    expect(await picture(variant.B)).toMatchObject({ picture_path: null, picture_status: 'none', picture_error: expect.stringMatching(/set to the stand-in. Choose an image model in Settings/) });
    expect(await events(runId)).toContain('No picture made for variant B: pictures are set to the stand-in');
    expect(await kept(variant.B)).toEqual([]);
    // Answered already: a second answer changes nothing.
    expect(await finish(variant.B, null, true)).toEqual({ remove_picture: null });
    expect(await picture(variant.B)).toMatchObject({ picture_status: 'none' });
  });

  it('keeps a picture nobody waits for any more with the others, without showing it', async () => {
    const { runId, variant } = await adSet();
    await ask(variant.A);
    const [first] = await takeDue();
    await upload(first!.path);
    // Stopped in the studio while the model was drawing: what it made joins the earlier pictures.
    await t.asUser(member, () => t.db.query(`select public.stop_picture($1)`, [variant.A]));
    expect(await events(runId)).toContain('The picture for variant A was stopped');
    await expect(t.asUser(member, () => t.db.query(`select public.stop_picture($1)`, [variant.A]))).rejects.toThrow(/No picture is being made/);
    expect(await finish(variant.A, first!.path)).toEqual({ remove_picture: null });
    expect(await picture(variant.A)).toMatchObject({ picture_path: null, picture_status: 'none' });
    expect((await kept(variant.A)).map((p) => p.path)).toEqual([first!.path]);

    await ask(variant.A);
    const [second] = await takeDue();
    await upload(second!.path);
    expect(await finish(variant.A, second!.path)).toEqual({ remove_picture: null });
    // The same answer sent again leaves the picture where it is, and is kept once.
    expect(await finish(variant.A, second!.path)).toEqual({ remove_picture: null });
    expect(await picture(variant.A)).toMatchObject({ picture_path: second!.path });
    expect((await kept(variant.A)).map((p) => p.path)).toEqual([second!.path, first!.path]);

    // Stopping keeps what the variant shows.
    await ask(variant.A);
    await t.asUser(member, () => t.db.query(`select public.stop_picture($1)`, [variant.A]));
    expect(await picture(variant.A)).toMatchObject({ picture_path: second!.path, picture_status: 'none' });

    // Another variant's folder is never taken; a variant that no longer exists hands its picture back.
    await expect(finish(variant.A, `pictures/${variant.B}/${uuid()}.png`)).rejects.toThrow(/not where this variant's pictures go/);
    const orphan = `pictures/${variant.C}/${uuid()}.png`;
    await t.db.query('delete from public.ad_variants where id = $1', [variant.C]);
    expect(await finish(variant.C, orphan)).toEqual({ remove_picture: orphan });
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

    // Scheduled while its picture was being made: what was approved goes out, and the picture waits with the others.
    await ask(variant.B);
    const [due] = await takeDue();
    const again = await t.asUser(member, () => t.value<string>(`select public.schedule_post($1, '[{"place":"facebook"}]'::jsonb, $2)`, [variant.B, local]));
    await upload(due!.path);
    expect(await finish(variant.B, due!.path)).toEqual({ remove_picture: null });
    expect(await picture(variant.B)).toMatchObject({ picture_path: null, picture_status: 'none', picture_error: expect.stringMatching(/waits with the earlier pictures/), approved: true });
    expect((await kept(variant.B)).map((p) => p.path)).toEqual([due!.path]);
    // And it cannot be chosen, nor another asked for, until the post is cancelled or has gone out.
    await expect(usePicture(variant.B, (await kept(variant.B))[0]!.id)).rejects.toThrow(/waiting to post/);
    await expect(askWith(variant.B, 'A harbour at dawn')).rejects.toThrow(/waiting to post/);
    await t.asUser(member, () => t.db.query(`select public.cancel_post($1)`, [again]));
  });

  it('takes a picture away, back to the design, and keeps the file to choose again', async () => {
    const { variant } = await adSet();
    await ask(variant.A);
    const [due] = await takeDue();
    await upload(due!.path);
    await finish(variant.A, due!.path);
    await t.asUser(member, () => t.db.query(`select public.approve_variant($1)`, [variant.A]));

    const removeFile = () => t.asUser(member, () => t.value<number>(`with gone as (delete from storage.objects where bucket_id = 'ad-pictures' and name = $1 returning 1) select count(*)::int from gone`, [due!.path]));
    // Shown by a variant: it stays.
    expect(await removeFile()).toBe(0);
    expect(await t.asUser(member, () => t.value<string | null>(`select public.remove_picture($1)`, [variant.A]))).toBeNull();
    expect(await picture(variant.A)).toEqual({ picture_path: null, picture_status: 'none', picture_error: null, approved: false });
    // Kept to choose again: it stays too.
    expect(await removeFile()).toBe(0);
    expect((await kept(variant.A)).map((p) => p.path)).toEqual([due!.path]);
    await expect(t.asUser(member, () => t.db.query(`select public.remove_picture($1)`, [variant.A]))).rejects.toThrow(/has no picture/);
  });

  it('makes a picture from a person’s own prompt, with the brand’s look, on the team’s model', async () => {
    const { runId, variant } = await adSet();
    await t.asUser(member, () => t.db.query(`select public.update_brand_memory('{}', '{}'::jsonb, 'Warm evening light, deep indigo and gold.')`));
    await expect(askWith(variant.A, '   ')).rejects.toThrow(/up to 1,200 characters/);
    await expect(askWith(variant.A, 'x'.repeat(1201))).rejects.toThrow(/up to 1,200 characters/);
    await askWith(variant.A, '  A quiet harbour at dawn, no people  ');
    expect(await t.value<string>('select image_prompt from public.ad_variants where id = $1', [variant.A])).toBe('A quiet harbour at dawn, no people');
    expect(await events(runId)).toContain('A picture asked for variant A, from a new prompt');

    const [due] = await takeDue();
    expect(due).toMatchObject({ variant_id: variant.A, prompt: 'A quiet harbour at dawn, no people', look: 'Warm evening light, deep indigo and gold.', model: 'stand-in', account: null });
    await upload(due!.path);
    await finish(variant.A, due!.path);
    expect(await kept(variant.A)).toEqual([expect.objectContaining({ path: due!.path, prompt: 'A quiet harbour at dawn, no people' })]);

    // Cloudflare Workers AI needs the account it runs on; switching back keeps it for next time.
    const setModel = (model: string, account?: string) => t.asUser(member, () => t.db.query(`select public.set_pictures_model($1${account === undefined ? '' : ', $2'})`, account === undefined ? [model] : [model, account]));
    await expect(setModel('cloudflare')).rejects.toThrow(/needs your Cloudflare account ID/);
    await expect(setModel('cloudflare', 'not-an-account')).rejects.toThrow(/32 characters/);
    await expect(setModel('midjourney')).rejects.toThrow(/stand-in, Cloudflare Workers AI or Higgsfield/);
    await setModel('cloudflare', ' 0123456789ABCDEF0123456789abcdef ');
    await askWith(variant.B, 'Keys on a kitchen table');
    expect(await takeDue()).toEqual([expect.objectContaining({ variant_id: variant.B, model: 'cloudflare', account: '0123456789abcdef0123456789abcdef' })]);
    await setModel('stand-in');
    expect(await t.value<{ pictures_model: string; cloudflare_account: string }>(`select to_jsonb(x) from (select pictures_model, cloudflare_account from public.team_settings) x`)).toEqual({ pictures_model: 'stand-in', cloudflare_account: '0123456789abcdef0123456789abcdef' });
    await setModel('cloudflare');
    await setModel('stand-in');
    await t.asUser(member, () => t.db.query(`select public.update_brand_memory('{}', '{}'::jsonb, null)`));
    await settle();

    // A clip's ads use the clip: no picture is asked for them.
    const clip = `uploads/${member}/${uuid()}.mp4`;
    await t.asUser(member, () => t.db.query(`insert into storage.objects (bucket_id, name) values ('run-media', $1)`, [clip]));
    const clipRun = await t.asUser(member, () =>
      t.value<string>(`select public.create_run('custom', 'video', 'Clip run', array['meta'], 'consultations', p_excerpt => $1, p_media_path => $2, p_media => '{"duration": 42.5, "width": 1920, "height": 1080}'::jsonb)`, ['Plain words about EB-5 for families planning a move to the United States.', clip]),
    );
    const clipVariants = [0, 1, 2].map((i) => ({ label: 'ABC'[i], angle: STRATEGY.angles[i]!.name, creative_text: 'Plan with care', creative_style: 'arcs', image_prompt: '', copy, warnings: [] }));
    await t.asService(async () => {
      await t.db.query(`select public.agent_begin($1, 'strategist')`, [clipRun]);
      await t.db.query(`select public.agent_finish_strategist($1, $2::jsonb)`, [clipRun, JSON.stringify(STRATEGY)]);
      await t.db.query(`select public.agent_begin($1, 'content')`, [clipRun]);
      await t.db.query(`select public.agent_finish_content($1, $2::jsonb)`, [clipRun, JSON.stringify({ title: 'Clip run', variants: clipVariants })]);
    });
    const clipVariant = await t.value<string>(`select v.id from public.ad_variants v join public.ad_sets s on s.id = v.ad_set_id where s.run_id = $1 and v.label = 'A'`, [clipRun]);
    await expect(askWith(clipVariant, 'A harbour at dawn')).rejects.toThrow(/made from the clip/);
  });

  it('keeps the pictures made for a variant to choose again, eight at most', async () => {
    const { runId, variant } = await adSet();
    const paths: string[] = [];
    for (let i = 1; i <= 8; i++) paths.push(await make(variant.A, `Picture ${i}`));
    const pictures = await kept(variant.A);
    expect(pictures.map((p) => p.prompt)).toEqual(['Picture 8', 'Picture 7', 'Picture 6', 'Picture 5', 'Picture 4', 'Picture 3', 'Picture 2', 'Picture 1']);
    const idOf = (path: string) => pictures.find((p) => p.path === path)!.id;

    // The first one again: shown, and the approval taken back.
    await t.asUser(member, () => t.db.query(`select public.approve_variant($1)`, [variant.A]));
    await usePicture(variant.A, idOf(paths[0]!));
    expect(await picture(variant.A)).toMatchObject({ picture_path: paths[0], approved: false });
    expect(await events(runId)).toContain('Variant A shows an earlier picture: it needs approving again');
    // Chosen again: nothing changes.
    await t.asUser(member, () => t.db.query(`select public.approve_variant($1)`, [variant.A]));
    await usePicture(variant.A, idOf(paths[0]!));
    expect(await picture(variant.A)).toMatchObject({ picture_path: paths[0], approved: true });

    // Choosing while one is being made stops it; when it arrives it joins the others, and the ninth makes
    // room by marking the oldest one the variant does not show.
    await askWith(variant.A, 'Picture 9');
    const [late] = await takeDue();
    await usePicture(variant.A, idOf(paths[0]!));
    expect(await picture(variant.A)).toMatchObject({ picture_path: paths[0], picture_status: 'none', approved: true });
    await upload(late!.path);
    expect(await finish(variant.A, late!.path)).toEqual({ remove_picture: paths[1] });
    expect(await picture(variant.A)).toMatchObject({ picture_path: paths[0] });
    const now = await kept(variant.A);
    expect(now).toHaveLength(8);
    expect(now.map((p) => p.path)).not.toContain(paths[1]);
    expect(now.map((p) => p.path)).toContain(paths[0]);
    await expect(usePicture(variant.A, idOf(paths[1]!))).rejects.toThrow(/not one of variant A's/);

    // Another variant's picture, and a file that is gone, are refused.
    const other = await make(variant.B, 'Another');
    await expect(usePicture(variant.A, (await kept(variant.B)).find((p) => p.path === other)!.id)).rejects.toThrow(/not one of variant A's/);
    await t.db.query(`delete from storage.objects where bucket_id = 'ad-pictures' and name = $1`, [paths[2]]);
    await expect(usePicture(variant.A, idOf(paths[2]!))).rejects.toThrow(/file is missing/);
  });

  it('keeps everything to the team, and the making to n8n', async () => {
    const { variant } = await adSet();
    await expect(ask(variant.A, outsider)).rejects.toThrow(/Only the QGR team/);
    const shown = await make(variant.B, 'A harbour at dawn');
    const [made] = await kept(variant.B);
    await expect(askWith(variant.A, 'A harbour at dawn', outsider)).rejects.toThrow(/Only the QGR team/);
    await t.asUser(outsider, async () => {
      await expect(t.db.query(`select public.remove_picture($1)`, [variant.A])).rejects.toThrow(/Only the QGR team/);
      await expect(t.db.query(`select public.stop_picture($1)`, [variant.A])).rejects.toThrow(/Only the QGR team/);
      await expect(t.db.query(`select public.use_picture($1, $2)`, [variant.B, made!.id])).rejects.toThrow(/Only the QGR team/);
      await expect(t.db.query(`select public.set_pictures_auto(true)`)).rejects.toThrow(/Only the QGR team/);
      await expect(t.db.query(`select public.set_pictures_model('stand-in')`)).rejects.toThrow(/Only the QGR team/);
      expect(await t.value<number>(`select count(*)::int from storage.objects where bucket_id = 'ad-pictures'`)).toBe(0);
      expect(await t.value<number>('select count(*)::int from public.variant_pictures')).toBe(0);
    });
    await t.asUser(member, async () => {
      expect(await t.value<string>('select path from public.variant_pictures where id = $1', [made!.id])).toBe(shown);
      await expect(t.db.query('select public.picture_take_due()')).rejects.toThrow(/permission denied/);
      await expect(t.db.query(`select public.picture_finish($1, null, true)`, [variant.A])).rejects.toThrow(/permission denied/);
      await expect(t.db.query(`select public.picture_fail($1, 'x')`, [variant.A])).rejects.toThrow(/permission denied/);
      await expect(t.db.query(`select public.prune_pictures($1)`, [variant.A])).rejects.toThrow(/permission denied/);
      await expect(t.db.query(`insert into public.variant_pictures (variant_id, path) values ($1, $2)`, [variant.A, `pictures/${variant.A}/${uuid()}.png`])).rejects.toThrow(/permission denied/);
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
