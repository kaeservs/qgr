import { beforeAll, describe, expect, it } from 'vitest';
import { testDatabase } from '../test/supabase';
import type { TestDatabase } from '../test/supabase';

// What a run's ads are made of, asked after Start run: the drawn design, an AI
// picture for every ad, or an AI video for every ad; and up to four reference
// pictures Higgsfield is given with every picture and video of the run, each
// imported into Higgsfield once. Against every migration, in Postgres.

let t: TestDatabase;
let member = '';
let outsider = '';

const STRATEGY = {
  title: 'References',
  positioning: 'Plain advice',
  audiences: ['Families'],
  angles: ['One', 'Two', 'Three'].map((name) => ({ name, why: 'w', hook: 'h', based_on_hook: null })),
  channels: [{ platform: 'meta', share: 100, role: 'r', format: 'f' }],
  guardrails: ['g'],
};
const copy = { meta: { text: 'Plan your EB-5 path with people who show their working.', headline: 'EB-5, mapped out' } };
const EXCERPT = 'Plain words about EB-5 for families planning a move to the United States.';

const ref = (who: string, ext = 'png') => `refs/${who}/${crypto.randomUUID()}.${ext}`;
const upload = (who: string, path: string) => t.asUser(who, () => t.db.query(`insert into storage.objects (bucket_id, name) values ('run-refs', $1)`, [path]));
const service = <T>(sql: string, params: unknown[] = []) => t.asService(() => t.value<T>(sql, params));
const asMember = <T>(sql: string, params: unknown[] = []) => t.asUser(member, () => t.value<T>(sql, params));
const events = (runId: string) => t.db.query<{ text: string }>(`select text from public.run_events where run_id = $1 order by id`, [runId]).then((r) => r.rows.map((e) => e.text));

async function customRun(): Promise<string> {
  return asMember<string>(`select public.create_run('custom', 'text', 'References', array['meta'], 'consultations', p_excerpt => $1)`, [EXCERPT]);
}

function setMedia(runId: string, kind: string, refs: { path: string; note?: string }[] = [], video: Record<string, unknown> | null = null) {
  return asMember(`select public.set_run_media($1, $2, $3::jsonb, $4::jsonb)`, [runId, kind, JSON.stringify(refs), video ? JSON.stringify(video) : null]);
}

async function strategize(runId: string) {
  await service(`select public.agent_begin($1, 'strategist')`, [runId]);
  await service(`select public.agent_finish_strategist($1, $2::jsonb)`, [runId, JSON.stringify(STRATEGY)]);
}

/** The Content Agent's three ads, as n8n saves them once it has begun; each with a picture prompt and a video prompt. */
async function finishContent(runId: string): Promise<Record<'A' | 'B' | 'C', string>> {
  const variants = ['A', 'B', 'C'].map((label, i) => ({
    label, angle: STRATEGY.angles[i]!.name, creative_text: 'Plan with care', creative_style: 'arcs', copy, warnings: [],
    image_prompt: 'A calm skyline at dusk, indigo and gold, no words',
    video_prompt: `Variant ${label}: a slow push-in on a calm skyline at dusk, warm light on glass.`,
  }));
  await service(`select public.agent_finish_content($1, $2::jsonb)`, [runId, JSON.stringify({ title: 'References', variants })]);
  const { rows } = await t.db.query<{ label: 'A' | 'B' | 'C'; id: string }>(`select v.label, v.id from public.ad_variants v join public.ad_sets s on s.id = v.ad_set_id where s.run_id = $1`, [runId]);
  return Object.fromEntries(rows.map((r) => [r.label, r.id])) as Record<'A' | 'B' | 'C', string>;
}

/** The strategist and the Content Agent, as n8n runs them. */
async function writeAds(runId: string): Promise<Record<'A' | 'B' | 'C', string>> {
  await strategize(runId);
  await service(`select public.agent_begin($1, 'content')`, [runId]);
  return finishContent(runId);
}

const pictureStatus = (variantId: string) => t.value<string>(`select picture_status from public.ad_variants where id = $1`, [variantId]);
const refsOf = (runId: string) =>
  t.db.query<{ id: string; position: number; status: string; media_id: string | null; note: string | null }>(
    `select id, position, status, media_id, note from public.run_references where run_id = $1 order by position`, [runId]).then((r) => r.rows);

beforeAll(async () => {
  t = await testDatabase();
  member = await t.addUser('member@qgr.example', 'owner');
  outsider = await t.addUser('stranger@elsewhere.example');
}, 60_000);

describe('the question after Start run', () => {
  it('keeps what the ads are made of and up to four uploaded references, only before the agents start', async () => {
    const runId = await customRun();
    const office = ref(member);
    const logo = ref(member, 'jpg');
    await upload(member, office);
    await upload(member, logo);

    await expect(setMedia(runId, 'gif')).rejects.toThrow(/design, AI pictures or AI video/);
    await expect(setMedia(runId, 'design', [{ path: office }])).rejects.toThrow(/Reference pictures are for AI pictures or AI video/);
    await expect(setMedia(runId, 'pictures', [{ path: ref(member) }])).rejects.toThrow(/has not finished uploading/);
    await expect(setMedia(runId, 'pictures', Array.from({ length: 5 }, () => ({ path: office })))).rejects.toThrow(/up to four/);
    await expect(setMedia(runId, 'pictures', [{ path: office, note: 'x'.repeat(121) }])).rejects.toThrow(/under 120 characters/);
    await expect(setMedia(runId, 'pictures', [{ path: 'elsewhere/x.png' }])).rejects.toThrow(/could not be read/);
    await expect(setMedia(runId, 'pictures', [], { seconds: 4 })).rejects.toThrow(/Only a video run/);

    await setMedia(runId, 'pictures', [{ path: office, note: '  Our Miami office  ' }, { path: logo }]);
    expect(await refsOf(runId)).toMatchObject([
      { position: 0, status: 'waiting', note: 'Our Miami office', media_id: null },
      { position: 1, status: 'waiting', note: null },
    ]);
    expect(await t.value<string>(`select ai_media from public.runs where id = $1`, [runId])).toBe('pictures');
    expect(await events(runId)).toContain('Every ad gets an AI picture, with 2 reference pictures for Higgsfield');
    await expect(setMedia(runId, 'pictures')).rejects.toThrow(/set already/);

    // Once the agents start, it is set.
    const started = await customRun();
    await service(`select public.agent_begin($1, 'strategist')`, [started]);
    await expect(setMedia(started, 'design')).rejects.toThrow(/agents have started/);

    // A run from a clip makes its ads from the clip.
    const clip = `uploads/${member}/${crypto.randomUUID()}.mp4`;
    await t.asUser(member, () => t.db.query(`insert into storage.objects (bucket_id, name) values ('run-media', $1)`, [clip]));
    const clipRun = await asMember<string>(
      `select public.create_run('custom', 'video', 'Clip run', array['meta'], 'consultations', p_excerpt => $1, p_media_path => $2, p_media => '{"duration": 42.5, "width": 1920, "height": 1080}'::jsonb)`,
      [EXCERPT, clip],
    );
    await expect(setMedia(clipRun, 'pictures')).rejects.toThrow(/run from a clip/);
    await setMedia(clipRun, 'design');

    await t.asUser(outsider, async () => {
      await expect(t.db.query(`select public.set_run_media($1, 'design')`, [runId])).rejects.toThrow(/Only the QGR team/);
      expect(await t.value<number>(`select count(*)::int from public.run_references`)).toBe(0);
    });
  });

  it('lets a member upload references only into their own folder, and take back only those no run uses', async () => {
    await expect(upload(member, ref(outsider))).rejects.toThrow(/row-level security/);
    await expect(upload(outsider, ref(outsider))).rejects.toThrow(/row-level security/);
    const remove = (who: string, path: string) =>
      t.asUser(who, () => t.value<number>(`with gone as (delete from storage.objects where bucket_id = 'run-refs' and name = $1 returning 1) select count(*)::int from gone`, [path]));
    const loose = ref(member);
    const used = ref(member);
    await upload(member, loose);
    await upload(member, used);
    await setMedia(await customRun(), 'pictures', [{ path: used }]);
    expect(await remove(member, used)).toBe(0);
    expect(await remove(member, loose)).toBe(1);
  });
});

describe('pictures', () => {
  it('follows the run that was asked, and the team switch for a run nobody asked', async () => {
    await asMember(`select public.set_pictures_auto(true)`);
    const design = await customRun();
    await setMedia(design, 'design');
    const asked = await customRun();
    const unasked = await customRun();
    expect(await pictureStatus((await writeAds(design)).A)).toBe('none');
    expect(await pictureStatus((await writeAds(unasked)).A)).toBe('making');

    await asMember(`select public.set_pictures_auto(false)`);
    await setMedia(asked, 'pictures');
    expect(await pictureStatus((await writeAds(asked)).B)).toBe('making');
    expect(await pictureStatus((await writeAds(await customRun())).B)).toBe('none');
  });

  it('waits for the references to reach Higgsfield, then draws every ad with them on Higgsfield', async () => {
    const runId = await customRun();
    const office = ref(member);
    const brochure = ref(member, 'webp');
    await upload(member, office);
    await upload(member, brochure);
    await setMedia(runId, 'pictures', [{ path: office, note: 'Our office' }, { path: brochure }]);
    const variant = await writeAds(runId);
    const mine = <T extends { variant_id: string }>(asks: T[]) => asks.filter((a) => Object.values(variant).includes(a.variant_id));

    // The team's model is the stand-in; the references are not in Higgsfield yet.
    expect(await t.value<string>(`select pictures_model from public.team_settings where id = 1`)).toBe('stand-in');
    expect(mine(await service<{ variant_id: string }[]>(`select public.picture_take_due(20)`))).toEqual([]);

    // n8n takes each reference once, signs it and imports it into Higgsfield.
    const due = await service<{ id: string; run_id: string; position: number; path: string }[]>(`select public.reference_take_due(10)`);
    const ours = due.filter((r) => r.run_id === runId);
    expect(ours.map((r) => [r.position, r.path])).toEqual([[0, office], [1, brochure]]);
    expect((await service<{ run_id: string }[]>(`select public.reference_take_due(10)`)).filter((r) => r.run_id === runId)).toEqual([]);
    await service(`select public.reference_ready($1, 'media-office')`, [ours[0]!.id]);
    await service(`select public.reference_failed($1, 'The picture is too small')`, [ours[1]!.id]);
    expect(await events(runId)).toContain('Reference picture 2 could not be given to Higgsfield (The picture is too small): the run goes on without it');

    const asks = mine(await service<{ variant_id: string; model: string; references: string[] }[]>(`select public.picture_take_due(20)`));
    expect(asks).toHaveLength(3);
    expect(asks.every((a) => a.model === 'higgsfield' && JSON.stringify(a.references) === '["media-office"]')).toBe(true);

    // A run without references keeps the team's model and gives none.
    const plain = await customRun();
    await setMedia(plain, 'pictures');
    const plainAds = await writeAds(plain);
    const plainAsk = (await service<{ variant_id: string; model: string; references: string[] }[]>(`select public.picture_take_due(20)`)).find((a) => a.variant_id === plainAds.A);
    expect(plainAsk).toMatchObject({ model: 'stand-in', references: [] });
  });

  it('takes a reference again when Higgsfield was not reached, three tries at most', async () => {
    const runId = await customRun();
    const path = ref(member);
    await upload(member, path);
    await setMedia(runId, 'pictures', [{ path }]);
    const take = async () => (await service<{ id: string; run_id: string }[]>(`select public.reference_take_due(10)`)).filter((r) => r.run_id === runId);
    for (let i = 0; i < 3; i += 1) {
      const [claimed] = await take();
      expect(claimed).toBeDefined();
      await service(`select public.reference_release($1, 'Higgsfield did not answer')`, [claimed!.id]);
    }
    expect(await take()).toEqual([]);
    await t.db.query(`update public.run_references set claimed_at = now() - interval '11 minutes' where run_id = $1`, [runId]);
    await take();
    expect(await refsOf(runId)).toMatchObject([{ status: 'failed' }]);
    expect(await events(runId)).toContain('Reference picture 1 could not be given to Higgsfield after three tries: the run goes on without it');

    await t.asUser(member, async () => {
      await expect(t.db.query(`select public.reference_take_due(1)`)).rejects.toThrow(/permission denied/);
      await expect(t.db.query(`select public.reference_ready($1, 'm')`, [runId])).rejects.toThrow(/permission denied/);
    });
  });
});

describe('a video for every ad', () => {
  const VIDEO = { seconds: 4, quality: '480p', aspect: '1:1', credits: 2 };
  const videosOf = (runId: string) =>
    t.db.query<{ label: string; status: string; prompt: string; credits: string; seconds: number; aspect: string; quality: string; error: string | null }>(
      `select av.label, v.status, v.prompt, v.credits::text, v.seconds, v.aspect, v.quality, v.error
         from public.ai_videos v join public.ad_variants av on av.id = v.variant_id join public.ad_sets s on s.id = av.ad_set_id
        where s.run_id = $1 order by av.label`, [runId]).then((r) => r.rows);

  it('is asked only with AI video on, a price and room in the month’s limit', async () => {
    const runId = await customRun();
    await asMember(`select public.set_video_settings(false, 100)`);
    await expect(setMedia(runId, 'video', [], VIDEO)).rejects.toThrow(/AI video is off/);
    await asMember(`select public.set_video_settings(true, 5)`);
    await expect(setMedia(runId, 'video')).rejects.toThrow(/how long and how sharp/);
    await expect(setMedia(runId, 'video', [], { ...VIDEO, seconds: 3 })).rejects.toThrow(/4 to 15 seconds/);
    await expect(setMedia(runId, 'video', [], { ...VIDEO, credits: null })).rejects.toThrow(/price/);
    await expect(setMedia(runId, 'video', [], VIDEO)).rejects.toThrow(/past its limit of 5 credits/);
    await asMember(`select public.set_video_settings(false, 100)`);
  });

  it('asks Higgsfield for one video per ad as the ads are saved, with the references, and no pictures', async () => {
    await asMember(`select public.set_video_settings(true, 100)`);
    await asMember(`select public.set_pictures_auto(true)`);
    const runId = await customRun();
    const path = ref(member);
    await upload(member, path);
    await setMedia(runId, 'video', [{ path, note: 'The project site' }], VIDEO);
    expect(await events(runId)).toContain('Every ad gets an AI video (4 s, 480p, 1:1; 2 credits each), with one reference picture for Higgsfield');

    // The Content Agent reads the references and that this is a video run.
    await strategize(runId);
    const begun = await service<{ references: unknown; run: { ai_media: string; ai_video: unknown } }>(`select public.agent_begin($1, 'content')`, [runId]);
    expect(begun.references).toEqual([{ number: 1, note: 'The project site' }]);
    expect(begun.run).toMatchObject({ ai_media: 'video', ai_video: { model: 'seedance_2_0_mini', seconds: 4, quality: '480p', aspect: '1:1', credits: 2 } });
    const variant = await finishContent(runId);

    expect(await videosOf(runId)).toEqual(['A', 'B', 'C'].map((label) => ({
      label, status: 'asked', prompt: `Variant ${label}: a slow push-in on a calm skyline at dusk, warm light on glass.`,
      credits: '2.00', seconds: 4, aspect: '1:1', quality: '480p', error: null,
    })));
    expect(await pictureStatus(variant.A)).toBe('none');
    expect(await events(runId)).toEqual(expect.arrayContaining(["Asked Higgsfield for variant A's video", "Asked Higgsfield for variant C's video"]));

    // The videos wait for the reference to reach Higgsfield, then go with it.
    const ids = (await t.db.query<{ id: string }>(`select v.id from public.ai_videos v join public.ad_variants av on av.id = v.variant_id join public.ad_sets s on s.id = av.ad_set_id where s.run_id = $1`, [runId])).rows.map((r) => r.id);
    const ofRun = <T extends { id: string }>(asks: T[]) => asks.filter((a) => ids.includes(a.id));
    expect(ofRun(await service<{ id: string; references: string[] }[]>(`select public.video_take_due(10)`))).toEqual([]);
    const [reference] = (await service<{ id: string; run_id: string }[]>(`select public.reference_take_due(10)`)).filter((r) => r.run_id === runId);
    await service(`select public.reference_ready($1, 'media-site')`, [reference!.id]);
    const sent = ofRun(await service<{ id: string; references: string[]; live: boolean }[]>(`select public.video_take_due(10)`));
    expect(sent).toHaveLength(3);
    expect(sent.every((v) => JSON.stringify(v.references) === '["media-site"]')).toBe(true);
    await asMember(`select public.set_pictures_auto(false)`);
  });

  it('lets an ad’s video be edited once Higgsfield has made it, held to its length', async () => {
    await asMember(`select public.set_video_settings(true, 100)`);
    const runId = await customRun();
    await setMedia(runId, 'video', [], VIDEO);
    const variant = await writeAds(runId);
    const edit = (id: string, end: number) => asMember(`select public.save_video_edit($1, $2::jsonb)`, [id, JSON.stringify({ keep: [{ start: 0, end }] })]);

    await expect(edit(variant.A, 3)).rejects.toThrow(/no clip to edit/);
    await t.db.query(`update public.ai_videos set status = 'ready', path = 'videos/' || id || '.mp4' where variant_id = $1`, [variant.A]);
    await edit(variant.A, 3.5);
    await expect(edit(variant.A, 6)).rejects.toThrow(/outside the clip/);
    expect(await t.value<unknown>(`select video_edit from public.ad_variants where id = $1`, [variant.A])).toEqual({ keep: [{ start: 0, end: 3.5 }] });
    // A picture run's ads have no video to edit.
    const pictures = await customRun();
    await setMedia(pictures, 'pictures');
    await expect(edit((await writeAds(pictures)).A, 3)).rejects.toThrow(/no clip to edit/);
    await asMember(`select public.set_video_settings(false, 100)`);
  });

  it('records a video that would pass the month’s limit as not asked, and says so', async () => {
    await asMember(`select public.set_video_settings(true, 100)`);
    const runId = await customRun();
    await setMedia(runId, 'video', [], VIDEO);
    // Meanwhile the month's spending nearly reached the limit.
    await t.db.query(`update public.team_settings set videos_cap = (select ceil(private.videos_spent()) + 3 from (select 1) x) where id = 1`);
    await writeAds(runId);
    const videos = await videosOf(runId);
    expect(videos.map((v) => v.status)).toEqual(['asked', 'failed', 'failed']);
    expect(videos[1]!.error).toMatch(/past its limit/);
    expect(videos[1]!.credits).toBe('0.00');
    expect(await events(runId)).toContain("The video for variant B was not asked for: the month's Higgsfield limit would be passed");
    await asMember(`select public.set_video_settings(false, 100)`);
  });
});
