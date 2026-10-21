import { beforeAll, describe, expect, it } from 'vitest';
import { testDatabase } from '../test/supabase';
import type { TestDatabase } from '../test/supabase';

// AI videos inside a video edit (a piece of the sequence, or a cutaway over
// it), a long video edited whole, and what the prompt writer spent. An edit
// links an AI video from the library and never copies it, so the library
// keeps a video any edit uses. Against every migration, in Postgres.

let t: TestDatabase;
let member = '';
let outsider = '';

const FILE = { name: 'talk.mp4', size: 900_000_000, duration: 600, width: 1920, height: 1080 };
const TRANSCRIPT = Array.from({ length: 60 }, (_, i) => ({ start: i * 10, end: i * 10 + 9.5, text: `Line ${i} of the talk.` }));
const PROMPT = 'A student walking across a sunny American campus, seen from behind, golden hour.';

const createLong = () =>
  t.asUser(member, () => t.value<string>(`select public.create_long_video('Talk', $1::jsonb, $2::jsonb, null)`, [JSON.stringify(FILE), JSON.stringify(TRANSCRIPT)]));
const askVideo = () => t.asUser(member, () => t.value<string>(`select public.ask_for_video($1, 'seedance_2_0_mini', 5, '16:9', '480p', false, null, null)`, [PROMPT]));
const saveLong = (id: string, edit: unknown, user = member) =>
  t.asUser(user, () => t.db.query(`select public.save_long_video_edit($1, $2::jsonb)`, [id, edit === null ? null : JSON.stringify(edit)]));
const longEdit = (id: string) => t.value<unknown>(`select edit from public.long_videos where id = $1`, [id]);

const media = (path: string, duration = 5) => ({ path, name: 'AI video', width: 854, height: 480, duration });
const piece = (path: string) => ({ id: 'ai1', kind: 'clip', media: media(path), start: 0, end: 5, speed: 1, volume: 1 });
const own = (start: number, end: number, id = 'k0') => ({ id, kind: 'clip', media: null, start, end, speed: 1, volume: 1 });
/** A 7-minute cut of the 10-minute talk, an AI video put in at 3:00. */
const edit = (extra: Record<string, unknown> = {}) => ({
  keep: [{ start: 0, end: 180 }, { start: 300, end: 540 }],
  sequence: [own(0, 180), own(300, 540, 'k1')],
  aspect: 'original',
  ...extra,
});

beforeAll(async () => {
  t = await testDatabase();
  member = await t.addUser('member@qgr.example', 'owner');
  outsider = await t.addUser('stranger@elsewhere.example');
}, 60_000);

describe('a long video edited whole', () => {
  it('keeps a teammate’s edit, held to the video’s length', async () => {
    const id = await createLong();
    await saveLong(id, edit());
    expect(await longEdit(id)).toMatchObject({ keep: [{ start: 0, end: 180 }, { start: 300, end: 540 }] });
    await expect(saveLong(id, { ...edit(), keep: [{ start: 0, end: 700 }] })).rejects.toThrow(/outside the clip/);
    await expect(saveLong(id, edit(), outsider)).rejects.toThrow(/Only the QGR team/);
    // Back to the video as it is.
    await saveLong(id, null);
    expect(await longEdit(id)).toBeNull();
    // Signed-in people cannot write the column themselves.
    await expect(t.asUser(member, () => t.db.query(`update public.long_videos set edit = '{}' where id = $1`, [id]))).rejects.toThrow(/permission denied/);
  });

  it('names only files uploaded here or AI videos in the library', async () => {
    const id = await createLong();
    await expect(saveLong(id, edit({ sequence: [own(0, 180), piece(`media/${member}/${crypto.randomUUID()}.mp4`)] }))).rejects.toThrow(/was not uploaded/);
    await expect(saveLong(id, edit({ sequence: [own(0, 180), piece(`ai:${crypto.randomUUID()}`)] }))).rejects.toThrow(/AI video in the edit/);
  });
});

describe('an AI video in an edit', () => {
  it('goes in while it is being made, as a piece or a cutaway, and stays in the library', async () => {
    const id = await createLong();
    const video = await askVideo();
    const path = `ai:${video}`;
    const cutaway = { id: 'c1', media: media(path), at: 360, start: 0, end: 5 };
    await saveLong(id, edit({ sequence: [own(0, 180), piece(path), own(300, 540, 'k1')], cutaways: [cutaway] }));
    expect(await longEdit(id)).toMatchObject({ cutaways: [{ media: { path } }] });

    // The library cannot take away a video an edit uses.
    await t.db.query(`update public.ai_videos set status = 'ready', path = $2 where id = $1`, [video, `videos/${video}.mp4`]);
    await expect(t.asUser(member, () => t.db.query(`select public.remove_ai_video($1)`, [video]))).rejects.toThrow(/edit uses it/);
    // Out of the edit, it can go.
    await saveLong(id, edit());
    await t.asUser(member, () => t.db.query(`select public.remove_ai_video($1)`, [video]));
    expect(await t.value<boolean>(`select removed_at is not null from public.ai_videos where id = $1`, [video])).toBe(true);
    // And an edit can no longer name it.
    await expect(saveLong(id, edit({ cutaways: [cutaway] }))).rejects.toThrow(/no longer in the library/);
  });

  it('is refused once Higgsfield could not make it', async () => {
    const id = await createLong();
    const video = await askVideo();
    await t.db.query(`update public.ai_videos set status = 'failed', error = 'Refused' where id = $1`, [video]);
    await expect(saveLong(id, edit({ cutaways: [{ id: 'c1', media: media(`ai:${video}`), at: 10, start: 0, end: 5 }] }))).rejects.toThrow(/was not made/);
  });

  it('keeps cutaways to twenty', async () => {
    const id = await createLong();
    const video = await askVideo();
    const cutaways = Array.from({ length: 21 }, (_, i) => ({ id: `c${i}`, media: media(`ai:${video}`), at: i * 10, start: 0, end: 5 }));
    await expect(saveLong(id, edit({ cutaways }))).rejects.toThrow(/Up to 20 videos over the video/);
  });
});

describe('a file an edit uses', () => {
  it('stays in edit-media while a long video’s edit names it', async () => {
    const id = await createLong();
    const file = `media/${member}/${crypto.randomUUID()}.mp4`;
    await t.asUser(member, () => t.db.query(`insert into storage.objects (bucket_id, name) values ('edit-media', $1)`, [file]));
    await saveLong(id, edit({ sequence: [own(0, 180), piece(file)] }));
    const remove = () => t.asUser(member, () => t.value<number>(`with gone as (delete from storage.objects where bucket_id = 'edit-media' and name = $1 returning 1) select count(*)::int from gone`, [file]));
    expect(await remove()).toBe(0);
    await saveLong(id, null);
    expect(await remove()).toBe(1);
  });
});

describe('the prompt writer', () => {
  it('records what each call spent, from n8n alone', async () => {
    const id = await createLong();
    await t.asService(() => t.db.query(`select public.video_prompt_used($1, 'claude-haiku-5-5', $2::jsonb)`, [id, JSON.stringify({ input_tokens: 1200, output_tokens: 90 })]));
    expect(await t.asUser(member, () => t.value<{ input_tokens: number; output_tokens: number }[]>(`select coalesce(jsonb_agg(jsonb_build_object('input_tokens', input_tokens, 'output_tokens', output_tokens)), '[]') from public.video_prompt_usage where long_video_id = $1`, [id]))).toEqual([{ input_tokens: 1200, output_tokens: 90 }]);
    // A call about no long video is kept too.
    await t.asService(() => t.db.query(`select public.video_prompt_used(null, 'claude-haiku-5-5', '{}'::jsonb)`));
    await expect(t.asUser(member, () => t.db.query(`select public.video_prompt_used(null, 'x', '{}'::jsonb)`))).rejects.toThrow(/permission denied/);
    expect(await t.asUser(outsider, () => t.value<number>(`select count(*)::int from public.video_prompt_usage`))).toBe(0);
  });
});
