// The queues n8n works through, end to end with nothing mocked but the
// platforms and the image model: a teammate approves a variant and schedules
// it, or asks for a picture (as the dashboard does), then each step of
// "QGR · Publisher", "QGR · Post results" or "QGR · Pictures" runs in the
// workflow's order, its Code nodes as n8n runs them, against the real
// database functions as the service role.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { toAdSet, toPost } from '../lib/data/map';
import { engagementRate, formatRate } from '../lib/results';
import type { AdSetRow, PostRow } from '../lib/data/map';
import { inN8n } from '../test/n8n';
import { testDatabase } from '../test/supabase';
import type { TestDatabase } from '../test/supabase';

type Json = Record<string, unknown>;
type Items = { json: Json }[];
const here = dirname(fileURLToPath(import.meta.url));

/**
 * A Code node over all its input items, as n8n runs it. `earlier` stands in
 * for the nodes before it that a script reads by name, each item paired with
 * the input item at the same place, as n8n pairs them.
 */
function step(file: string | string[], items: unknown[], swap: Record<string, string> = {}, earlier: Record<string, unknown[]> = {}): Json[] {
  // Several files make one script, as the build joins them: shared helpers first.
  let code = (Array.isArray(file) ? file : [file]).map((f) => readFileSync(join(here, 'code', f), 'utf8')).join('\n');
  for (const [key, value] of Object.entries(swap)) code = code.replaceAll(key, value);
  const all = items.map((json) => ({ json }));
  const $input = { first: () => all[0], all: () => all };
  const $ = (name: string) => {
    const out = (earlier[name] ?? []).map((json) => ({ json }));
    return { all: () => out, first: () => out[0], itemMatching: (i: number) => out[i] };
  };
  return (inN8n(code, $input, $) as Items).map((i) => i.json);
}

const PLACE_NAME = { facebook: 'Facebook', instagram: 'Instagram', linkedin: 'LinkedIn' } as const;
/** The Cloudflare prompt starts with the words every image model is asked to draw, as the build joins them. */
const WRITE_PROMPT = ['pictures-prompt.js', 'pictures-write-prompt.js'];
/** The LinkedIn steps' scripts each start with the shared reasons, as the build joins them. */
const LINKEDIN = ['shared-linkedin-refusal.js'];

let t: TestDatabase;
let member = '';
const EXCERPT = 'Plain words about EB-5 for families planning a move to the United States.';
const copy = {
  meta: { text: 'Plan your EB-5 path with people who show their working.', headline: 'EB-5, mapped out' },
  linkedin: { text: 'Families on H-1B visas: plan EB-5 early, with independent diligence.', headline: 'Plan early' },
};

async function approvedVariant(): Promise<{ runId: string; variantId: string }> {
  const runId = await t.asUser(member, () => t.value<string>(`select public.create_run('custom', 'text', 'Publisher check', array['meta','linkedin'], 'consultations', p_excerpt => $1)`, [EXCERPT]));
  const strategy = { title: 'S', positioning: 'P', audiences: ['A'], angles: ['1', '2', '3'].map((name) => ({ name, why: 'w', hook: 'h', based_on_hook: null })), channels: [], guardrails: [] };
  const variants = ['A', 'B', 'C'].map((label) => ({ label, angle: 'a', creative_text: 'Plan with care', creative_style: 'arcs', image_prompt: '', copy, warnings: [] }));
  await t.asService(async () => {
    await t.db.query(`select public.agent_begin($1, 'strategist')`, [runId]);
    await t.db.query(`select public.agent_finish_strategist($1, $2::jsonb)`, [runId, JSON.stringify(strategy)]);
    await t.db.query(`select public.agent_begin($1, 'content')`, [runId]);
    await t.db.query(`select public.agent_finish_content($1, $2::jsonb)`, [runId, JSON.stringify({ title: 'Publisher check', variants })]);
  });
  const variantId = await t.value<string>(`select v.id from public.ad_variants v join public.ad_sets s on s.id = v.ad_set_id where s.run_id = $1 and v.label = 'A'`, [runId]);
  await t.asUser(member, () => t.db.query(`select public.approve_variant($1)`, [variantId]));
  return { runId, variantId };
}

/** One run of "QGR · Publisher": take what is due, post each through its place's stand-in, record it. */
async function publish(): Promise<{ posted: Json[]; removed: string[] }> {
  const due = await t.asService(() => t.value<unknown[]>(`select public.publisher_take_due(p_limit => 10)`));
  // The HTTP node hands the rows on as items; "One item per place" takes them either way.
  const items = step('shared-items.js', [{ data: due }]);
  const posted: Json[] = [];
  const removed: string[] = [];
  for (const item of items) {
    const place = item.place as keyof typeof PLACE_NAME;
    const [result] = step('publisher-stand-in.js', [item], { __PLACE_NAME__: PLACE_NAME[place] });
    posted.push(result!);
    const finished = await t.asService(() =>
      t.value<{ remove_media: string | null }>(`select public.publisher_finish(p_post_id => $1, p_place => $2, p_remote_id => $3, p_remote_url => $4, p_stand_in => $5)`, [
        result!.post_id,
        result!.place,
        result!.remote_id,
        result!.remote_url,
        result!.stand_in,
      ]),
    );
    if (finished.remove_media) removed.push(finished.remove_media);
  }
  return { posted, removed };
}

beforeAll(async () => {
  t = await testDatabase();
  member = await t.addUser('alex@qgr.example', 'owner');
}, 60_000);

describe('the publisher’s Code nodes', () => {
  it('turns the database’s rows into one item each, however n8n handed them on', () => {
    const rows = [{ post_id: 'p1', place: 'facebook' }, { post_id: 'p1', place: 'linkedin' }];
    expect(step('shared-items.js', [{ data: rows }])).toEqual(rows);
    expect(step('shared-items.js', rows)).toEqual(rows);
    expect(step('shared-items.js', [{ data: [] }])).toEqual([]);
    expect(step('shared-items.js', [{}])).toEqual([]);
  });

  it('answers as a platform will, and says it posted nothing', () => {
    expect(step('publisher-stand-in.js', [{ post_id: 'p1', place: 'instagram', text: 'words', media_path: 'posts/x.jpg' }], { __PLACE_NAME__: 'Instagram' })).toEqual([
      { ok: true, post_id: 'p1', place: 'instagram', remote_id: null, remote_url: null, stand_in: true },
    ]);
  });
});

describe('a post, from the dashboard to the stand-ins', () => {
  it('goes out once, is recorded as a stand-in, and frees its file', async () => {
    const { runId, variantId } = await approvedVariant();
    const media = `posts/${member}/${crypto.randomUUID()}.jpg`;
    await t.asUser(member, () => t.db.query(`insert into storage.objects (bucket_id, name) values ('post-media', $1)`, [media]));
    const postId = await t.asUser(member, () =>
      t.value<string>(`select public.schedule_post($1, $2::jsonb)`, [
        variantId,
        JSON.stringify([
          { place: 'facebook', media_path: media, media_kind: 'image' },
          { place: 'instagram', media_path: media, media_kind: 'image' },
          { place: 'linkedin', media_path: media, media_kind: 'image' },
        ]),
      ]),
    );

    const first = await publish();
    expect(first.posted.map((p) => p.place)).toEqual(['facebook', 'instagram', 'linkedin']);
    // The file goes once no place needs it: after the last one.
    expect(first.removed).toEqual([media]);
    // The next minute finds nothing.
    expect((await publish()).posted).toEqual([]);

    const row = await t.asUser(member, () =>
      t.value<PostRow>(
        `select json_build_object('id', p.id, 'variant_id', p.variant_id, 'scheduled_for', p.scheduled_for, 'created_at', p.created_at, 'thumbnail', p.thumbnail,
          'post_targets', (select json_agg(json_build_object('place', x.place, 'text', x.text, 'media_kind', x.media_kind, 'status', x.status, 'posted_at', x.posted_at, 'remote_url', x.remote_url, 'stand_in', x.stand_in, 'error', x.error)) from public.post_targets x where x.post_id = p.id),
          'ad_variants', (select json_build_object('label', v.label, 'angle', v.angle, 'ad_set_id', v.ad_set_id, 'ad_sets', (select json_build_object('title', s.title) from public.ad_sets s where s.id = v.ad_set_id)) from public.ad_variants v where v.id = p.variant_id)
        ) from public.posts p where p.id = $1`,
        [postId],
      ),
    );
    const post = toPost(row)!;
    expect(post.targets.map((x) => [x.place, x.status, x.standIn, x.text])).toEqual([
      ['facebook', 'posted', true, copy.meta.text],
      ['instagram', 'posted', true, copy.meta.text],
      ['linkedin', 'posted', true, copy.linkedin.text],
    ]);
    const events = (await t.db.query<{ text: string }>(`select text from public.run_events where run_id = $1 order by id`, [runId])).rows.map((e) => e.text);
    expect(events.slice(-4)).toEqual([
      'Variant A sent to Facebook, Instagram, LinkedIn',
      'Variant A went through the Facebook stand-in: nothing was posted',
      'Variant A went through the Instagram stand-in: nothing was posted',
      'Variant A went through the LinkedIn stand-in: nothing was posted',
    ]);
  });

  it('leaves a scheduled post alone until its time', async () => {
    const { variantId } = await approvedVariant();
    const postId = await t.asUser(member, () => t.value<string>(`select public.schedule_post($1, '[{"place":"linkedin"}]'::jsonb, '2099-01-01 09:00')`, [variantId]).catch(() => null));
    // Beyond 90 days is refused; a time an hour ahead waits.
    expect(postId).toBeNull();
    const soon = new Date(Date.now() + 3_600_000);
    const local = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .format(soon)
      .replace(',', '');
    await t.asUser(member, () => t.db.query(`select public.schedule_post($1, '[{"place":"linkedin"}]'::jsonb, $2)`, [variantId, local]));
    expect((await publish()).posted).toEqual([]);
  });
});

describe('posting for real', () => {
  const STORAGE = 'https://tcinsdexwvzpznqlcpww.supabase.co/storage/v1';
  const signed = (path: string) => ({ statusCode: 200, body: { signedURL: `/object/sign/post-media/${path}?token=t` } });
  const item = (fields: Json = {}): Json => ({ post_id: 'p1', place: 'facebook', text: 'Plan your EB-5 path.', media_path: 'posts/u/f.jpg', media_kind: 'image', live: true, page: { id: '1234567890', name: 'Quantum Global' }, ...fields });
  /** "With its link", after the file was signed (or not), for the places going out for real. */
  const ready = (items: Json[], answers: Json[]) => step('publisher-ready.js', answers, { __STORAGE__: STORAGE }, { 'Post for real?': items });

  it('goes out on Facebook for real, and is recorded with its link', async () => {
    const { variantId } = await approvedVariant();
    await t.asUser(member, async () => {
      await t.db.query(`select public.update_publishing_settings('1234567890', 'Quantum Global', '', '', '', '')`);
      await t.db.query(`select public.set_post_for_real('facebook', true)`);
    });
    const media = `posts/${member}/${crypto.randomUUID()}.jpg`;
    await t.asUser(member, () => t.db.query(`insert into storage.objects (bucket_id, name) values ('post-media', $1)`, [media]));
    const postId = await t.asUser(member, () => t.value<string>(`select public.schedule_post($1, $2::jsonb)`, [variantId, JSON.stringify([{ place: 'facebook', media_path: media, media_kind: 'image' }])]));

    const due = await t.asService(() => t.value<unknown[]>(`select public.publisher_take_due(p_limit => 10)`));
    const items = step('shared-items.js', [{ data: due }]).filter((d) => d.post_id === postId);
    expect(items).toEqual([expect.objectContaining({ place: 'facebook', live: true, media_path: media })]);

    const [ok] = ready(items, [signed(media)]);
    expect(ok).toEqual({ ok: true, post_id: postId, place: 'facebook', text: copy.meta.text, media_kind: 'image', media_url: `${STORAGE}/object/sign/post-media/${media}?token=t`, page: { id: '1234567890', name: 'Quantum Global' } });
    const [plan] = step('publisher-facebook-plan.js', [ok]);
    expect(plan).toEqual({
      post_id: postId,
      place: 'facebook',
      page_id: '1234567890',
      kind: 'image',
      url: 'https://graph.facebook.com/v25.0/1234567890/photos',
      body: { url: ok!.media_url, message: copy.meta.text, published: true },
    });
    const [answer] = step('publisher-facebook-answer.js', [{ statusCode: 200, body: { id: '555', post_id: '1234567890_555' } }], {}, { 'Plan the Facebook post': [plan] });
    expect(answer).toEqual({ post_id: postId, place: 'facebook', ok: true, remote_id: '1234567890_555', remote_url: 'https://www.facebook.com/1234567890_555', stand_in: false });

    const finished = await t.asService(() =>
      t.value<{ remove_media: string | null }>(`select public.publisher_finish($1, $2, $3, $4, $5)`, [answer!.post_id, answer!.place, answer!.remote_id, answer!.remote_url, answer!.stand_in]),
    );
    expect(finished.remove_media).toBe(media);
    expect(await t.value<{ status: string; stand_in: boolean; remote_url: string }>(`select to_jsonb(x) from (select status, stand_in, remote_url from public.post_targets where post_id = $1) x`, [postId])).toEqual({
      status: 'posted',
      stand_in: false,
      remote_url: 'https://www.facebook.com/1234567890_555',
    });
    // Posted for real, it is read for results.
    const toRead = await t.asService(() => t.value<{ post_id: string }[]>(`select public.results_take_due(p_limit => 50)`));
    expect(toRead.some((r) => r.post_id === postId)).toBe(true);
    await t.asUser(member, () => t.db.query(`select public.set_post_for_real('facebook', false)`));
  });

  it('stops a place that cannot go out before anything is sent', () => {
    expect(ready([item({ page: { id: null, name: null } })], [{}])[0]).toEqual({ ok: false, post_id: 'p1', place: 'facebook', error: 'No Facebook Page is set in Settings, Where posts go.', unknown: false });
    expect(ready([item({ place: 'instagram', page: { id: null } })], [{}])[0]!.error).toBe('No Instagram account is set in Settings, Where posts go.');
    expect(ready([item()], [{ statusCode: 400, body: { error: 'not_found' } }])[0]).toMatchObject({ ok: false, error: 'The file could not be made ready for Facebook (400). Nothing went out: try again.' });
    expect(ready([item({ place: 'instagram', media_path: null, media_kind: null })], [{}])[0]!.error).toBe('Instagram needs a picture or a video, and this post has none.');
    // Words alone go to Facebook and LinkedIn; a link Storage gives whole is kept as it is.
    expect(ready([item({ media_path: null, media_kind: null })], [{}])[0]).toMatchObject({ ok: true, media_url: null });
    expect(ready([item()], [{ statusCode: 200, body: { signedURL: 'https://cdn.example/f.jpg?t=1' } }])[0]).toMatchObject({ media_url: 'https://cdn.example/f.jpg?t=1' });
  });

  it('posts a video or words alone to Facebook, and reads every answer it can give', () => {
    const [video] = step('publisher-facebook-plan.js', [{ ...item({ media_kind: 'video' }), media_url: 'https://s/v.mp4' }]);
    expect(video).toMatchObject({ kind: 'video', url: 'https://graph-video.facebook.com/v25.0/1234567890/videos', body: { file_url: 'https://s/v.mp4', description: 'Plan your EB-5 path.', published: true } });
    const [text] = step('publisher-facebook-plan.js', [{ ...item(), media_url: null }]);
    expect(text).toMatchObject({ kind: 'text', url: 'https://graph.facebook.com/v25.0/1234567890/feed', body: { message: 'Plan your EB-5 path.', published: true } });

    const read = (res: Json, plan: Json = text!) => step('publisher-facebook-answer.js', [res], {}, { 'Plan the Facebook post': [plan] })[0]!;
    expect(read({ statusCode: 200, body: { id: '777' } }, video)).toMatchObject({ ok: true, remote_id: '777', remote_url: 'https://www.facebook.com/1234567890/videos/777' });
    expect(read({ statusCode: 200, body: { id: '1234567890_888' } })).toMatchObject({ ok: true, remote_id: '1234567890_888', remote_url: 'https://www.facebook.com/1234567890_888' });
    // Never asked: the step had no credential and handed its input on.
    expect(read(text!)).toMatchObject({ ok: false, unknown: false, error: expect.stringMatching(/attach the “Facebook Graph API” credential/) });
    expect(read({ error: { message: 'getaddrinfo ENOTFOUND graph.facebook.com' } })).toMatchObject({ ok: false, unknown: false });
    // Sent, and the answer lost: it may have gone out.
    expect(read({ error: { message: 'timeout of 120000ms exceeded' } })).toMatchObject({ ok: false, unknown: true, error: expect.stringMatching(/Check the Page/) });
    expect(read({ statusCode: 500, body: { error: { message: 'An unknown error has occurred.', code: 1 } } })).toMatchObject({ ok: false, unknown: true });
    expect(read({ statusCode: 200, body: {} })).toMatchObject({ ok: false, unknown: true });
    // Refused: nothing went out, and why.
    expect(read({ statusCode: 400, body: { error: { message: 'Error validating access token', code: 190 } } }).error).toMatch(/token has expired or was revoked/);
    expect(read({ statusCode: 403, body: { error: { message: '(#200) Requires pages_manage_posts', code: 200 } } }).error).toMatch(/needs pages_manage_posts/);
    expect(read({ statusCode: 400, body: { error: { message: '(#506) Duplicate status message', code: 506 } } }).error).toBe('Facebook refused it as a duplicate of a recent post.');
    expect(read({ statusCode: 400, body: { error: { message: 'Invalid parameter', code: 100, error_user_msg: 'The picture is too small.' } } })).toMatchObject({ ok: false, unknown: false, error: 'Facebook refused it (400, code 100): The picture is too small.' });
  });

  it('prepares an Instagram post, waits for it, and publishes it', () => {
    const [picture] = step('publisher-instagram-plan.js', [{ ...item({ place: 'instagram', page: { id: '17841400000000000' } }), media_url: 'https://s/p.jpg' }]);
    expect(picture).toEqual({ post_id: 'p1', place: 'instagram', account: '17841400000000000', kind: 'image', url: 'https://graph.facebook.com/v25.0/17841400000000000/media', body: { image_url: 'https://s/p.jpg', caption: 'Plan your EB-5 path.' }, wait: 10 });
    const [reel] = step('publisher-instagram-plan.js', [{ ...item({ place: 'instagram', media_kind: 'video', page: { id: '17841400000000000' } }), media_url: 'https://s/v.mp4' }]);
    expect(reel).toMatchObject({ kind: 'video', wait: 60, body: { media_type: 'REELS', video_url: 'https://s/v.mp4', caption: 'Plan your EB-5 path.', share_to_feed: true } });

    const container = (res: Json) => step('publisher-instagram-container.js', [res], {}, { 'Plan the Instagram post': [picture] })[0]!;
    const box = container({ statusCode: 200, body: { id: '9001' } });
    expect(box).toEqual({
      ok: true,
      post_id: 'p1',
      place: 'instagram',
      kind: 'image',
      wait: 10,
      tries: 0,
      creation_id: '9001',
      status_url: 'https://graph.facebook.com/v25.0/9001?fields=status_code,status',
      publish_url: 'https://graph.facebook.com/v25.0/17841400000000000/media_publish',
    });
    expect(container(picture!).error).toMatch(/attach the “Facebook Graph API” credential/);
    expect(container({ statusCode: 400, body: { error: { message: 'Insufficient permission', code: 10 } } }).error).toMatch(/instagram_content_publish/);
    expect(container({ error: { message: 'timeout' } })).toMatchObject({ ok: false, unknown: false });

    // Checked after the wait ("Give Instagram time" hands on what it was given).
    const check = (res: Json, waited: Json = box) => step('publisher-instagram-ready.js', [res], {}, { 'Give Instagram time': [waited] })[0]!;
    const readyNow = (status: Json) => check({ statusCode: 200, body: status });
    const published = readyNow({ status_code: 'FINISHED' });
    expect(published).toEqual({ post_id: 'p1', place: 'instagram', ok: true, creation_id: '9001', publish_url: box.publish_url });
    expect(readyNow({ status_code: 'ERROR', status: 'Error: Media upload has failed with error code 2207026' })).toMatchObject({ ok: false, unknown: false, error: expect.stringMatching(/could not use the picture \(Error: Media upload has failed/) });
    expect(readyNow({ status_code: 'EXPIRED' })).toMatchObject({ ok: false, unknown: false });
    expect(readyNow({ status_code: 'PUBLISHED' })).toMatchObject({ ok: false, unknown: true });
    expect(check({ statusCode: 400, body: { error: { message: 'Invalid OAuth access token', code: 190 } } })).toMatchObject({ ok: false, unknown: false, error: expect.stringMatching(/would not say whether the picture was ready \(400, code 190\): Invalid OAuth/) });
    // Still preparing, or no answer: a minute more and ask again, five times at most, as Meta asks.
    let waited: Json = box;
    for (const tries of [1, 2, 3, 4]) {
      const res = tries === 2 ? { error: { message: 'socket hang up' } } : { statusCode: 200, body: { status_code: 'IN_PROGRESS' } };
      waited = check(res, waited);
      expect(waited).toEqual({ ...box, ok: false, again: true, tries, wait: 60 });
    }
    expect(check({ statusCode: 200, body: { status_code: 'IN_PROGRESS' } }, waited)).toEqual({
      post_id: 'p1',
      place: 'instagram',
      ok: false,
      unknown: false,
      error: 'Instagram was still preparing the picture after five minutes. Nothing went out: try again later.',
    });
    expect(check({ statusCode: 200, body: { status_code: 'FINISHED' } }, waited)).toMatchObject({ ok: true, creation_id: '9001' });

    const answer = (pub: Json, link: Json = {}) => step('publisher-instagram-answer.js', [link], {}, { 'Publish, wait or stop?': [published], 'Instagram: publish': [pub] })[0]!;
    expect(answer({ statusCode: 200, body: { id: '17900000000000001' } }, { statusCode: 200, body: { permalink: 'https://www.instagram.com/p/AbC123/' } })).toEqual({
      post_id: 'p1',
      place: 'instagram',
      ok: true,
      remote_id: '17900000000000001',
      remote_url: 'https://www.instagram.com/p/AbC123/',
      stand_in: false,
    });
    // Published, with no link given: recorded all the same.
    expect(answer({ statusCode: 200, body: { id: '17900000000000002' } }, { statusCode: 400, body: {} })).toMatchObject({ ok: true, remote_url: null });
    expect(answer({ error: { message: 'socket hang up' } })).toMatchObject({ ok: false, unknown: true });
    expect(answer({ statusCode: 502, body: {} })).toMatchObject({ ok: false, unknown: true });
    expect(answer({ statusCode: 400, body: { error: { message: 'Media ID is not available', code: 9007, error_subcode: 2207027 } } })).toMatchObject({ ok: false, unknown: false, error: expect.stringMatching(/not finished preparing it/) });
    expect(answer({ statusCode: 400, body: { error: { message: 'limit', code: 9, error_subcode: 2207042 } } }).error).toMatch(/100 posts a day/);
  });

  it('uploads to LinkedIn and posts as the Page, its words as written', () => {
    const [plan] = step('publisher-linkedin-plan.js', [{ ...item({ place: 'linkedin', text: 'EB-5 (2026): #invest_now, ask [us] @QGR', page: { id: '98765' } }), media_url: 'https://s/p.jpg' }]);
    expect(plan).toEqual({
      ok: true,
      post_id: 'p1',
      place: 'linkedin',
      owner: 'urn:li:organization:98765',
      kind: 'image',
      version: '202609',
      media_url: 'https://s/p.jpg',
      post: {
        author: 'urn:li:organization:98765',
        commentary: 'EB-5 \\(2026\\): \\#invest\\_now, ask \\[us\\] \\@QGR',
        visibility: 'PUBLIC',
        distribution: { feedDistribution: 'MAIN_FEED', targetEntities: [], thirdPartyDistributionChannels: [] },
        lifecycleState: 'PUBLISHED',
        isReshareDisabledByAuthor: false,
      },
    });
    expect(step('publisher-linkedin-plan.js', [{ ...item({ place: 'linkedin', page: { id: '98765' } }), media_url: null }])[0]).toMatchObject({ kind: 'none' });

    const start = { statusCode: 200, body: { value: { uploadUrl: 'https://www.linkedin.com/dms-uploads/abc', image: 'urn:li:image:C4E10AQ' } } };
    const picture = (startRes: Json, put: Json) => step([...LINKEDIN, 'publisher-linkedin-picture.js'], [put], {}, { 'Plan the LinkedIn post': [plan], 'LinkedIn: start the picture': [startRes] })[0]!;
    expect(picture(start, { statusCode: 201, body: '' })).toEqual({ ok: true, post_id: 'p1', place: 'linkedin', version: '202609', post: { ...(plan!.post as Json), content: { media: { id: 'urn:li:image:C4E10AQ' } } } });
    expect(picture(plan!, {}).error).toMatch(/attach the “LinkedIn Community Management” credential/);
    expect(picture({ statusCode: 403, body: { message: 'Not enough permissions to access: images.initializeUpload', status: 403 } }, {}).error).toMatch(/needs LinkedIn’s approval for the Community Management API/);
    expect(picture(start, { statusCode: 500 })).toMatchObject({ ok: false, unknown: false, error: 'The picture could not be sent to LinkedIn (500). Nothing went out: try again.' });

    const answer = (res: Json) => step([...LINKEDIN, 'publisher-linkedin-answer.js'], [res], {}, { 'Ready to post?': [picture(start, { statusCode: 201, body: '' })] })[0]!;
    expect(answer({ statusCode: 201, headers: { 'x-restli-id': 'urn:li:share:7123' }, body: '' })).toEqual({
      post_id: 'p1',
      place: 'linkedin',
      ok: true,
      remote_id: 'urn:li:share:7123',
      remote_url: 'https://www.linkedin.com/feed/update/urn:li:share:7123',
      stand_in: false,
    });
    expect(answer({ statusCode: 201, headers: {}, body: '' })).toMatchObject({ ok: false, unknown: true });
    expect(answer({ statusCode: 401, body: { message: 'Invalid access token' } }).error).toMatch(/reconnect the “LinkedIn Community Management” credential/);
    expect(answer({ statusCode: 422, body: { message: 'ERROR :: /commentary :: is too long' } })).toMatchObject({ ok: false, unknown: false, error: 'LinkedIn would not post it (422): ERROR :: /commentary :: is too long' });
    expect(answer({ statusCode: 426, body: { message: 'Requested version 202509 is not active' } }).error).toMatch(/move VERSION on in “Plan the LinkedIn post” \(QGR · Publisher\) and “Plan the read” \(QGR · Post results\)/);
    expect(answer({ statusCode: 504, body: {} })).toMatchObject({ ok: false, unknown: true });
    expect(answer({ error: { message: 'read ECONNRESET' } })).toMatchObject({ ok: false, unknown: true });
  });

  it('sends a video to LinkedIn in the parts it asks for, in order', () => {
    const [plan] = step('publisher-linkedin-plan.js', [{ ...item({ place: 'linkedin', media_kind: 'video', page: { id: '98765' } }), media_url: 'https://s/v.mp4' }]);
    // Its size, from Storage's answer to a request for the first byte.
    const size = (res: Json) => step([...LINKEDIN, 'publisher-linkedin-size.js'], [res], {}, { 'Plan the LinkedIn post': [plan] })[0]!;
    expect(size({ statusCode: 206, headers: { 'content-range': 'bytes 0-0/6000001' }, data: 'x' })).toEqual({ ok: true, post_id: 'p1', place: 'linkedin', size: 6000001 });
    // Storage that does not read parts would send the whole file for every part: stop first.
    expect(size({ statusCode: 200, headers: {}, data: '…' })).toMatchObject({ ok: false, unknown: false, error: 'The video could not be read from Storage in parts (200). Nothing went out: try again.' });
    expect(size({ error: { message: 'getaddrinfo ENOTFOUND' } })).toMatchObject({ ok: false, error: expect.stringMatching(/in parts \(getaddrinfo ENOTFOUND\)/) });

    const start = {
      statusCode: 200,
      body: {
        value: {
          video: 'urn:li:video:C5F10AQ',
          uploadToken: 'tok',
          uploadInstructions: [
            { uploadUrl: 'https://up/1', firstByte: 0, lastByte: 4194303 },
            { uploadUrl: 'https://up/2', firstByte: 4194304, lastByte: 6000000 },
          ],
        },
      },
    };
    const parts = step([...LINKEDIN, 'publisher-linkedin-parts.js'], [start], {}, { 'Plan the LinkedIn post': [plan] });
    expect(parts).toEqual([
      { ok: true, post_id: 'p1', place: 'linkedin', part: 0, parts: 2, media_url: 'https://s/v.mp4', range: 'bytes=0-4194303', upload_url: 'https://up/1', video: 'urn:li:video:C5F10AQ', upload_token: 'tok' },
      { ok: true, post_id: 'p1', place: 'linkedin', part: 1, parts: 2, media_url: 'https://s/v.mp4', range: 'bytes=4194304-6000000', upload_url: 'https://up/2', video: 'urn:li:video:C5F10AQ', upload_token: 'tok' },
    ]);
    expect(step([...LINKEDIN, 'publisher-linkedin-parts.js'], [{ statusCode: 403, body: { message: 'denied' } }], {}, { 'Plan the LinkedIn post': [plan] })).toEqual([
      expect.objectContaining({ ok: false, unknown: false, error: expect.stringMatching(/would not let the app take the video/) }),
    ]);

    // The parts come back in any order; their ETags are listed in the parts' order.
    const gather = (answers: Json[]) => step([...LINKEDIN, 'publisher-linkedin-gather.js'], answers, {}, { 'One item per part': [parts[1], parts[0]] });
    expect(gather([{ statusCode: 200, headers: { etag: '"/ama/two"' } }, { statusCode: 200, headers: { etag: '/ama/one' } }])).toEqual([
      { ok: true, post_id: 'p1', place: 'linkedin', video: 'urn:li:video:C5F10AQ', upload_token: 'tok', etags: ['/ama/one', '/ama/two'] },
    ]);
    expect(gather([{ statusCode: 200, headers: { etag: '"/ama/two"' } }, { statusCode: 500, headers: {} }])).toEqual([
      expect.objectContaining({ ok: false, unknown: false, error: 'Part 1 of 2 could not be sent to LinkedIn (500). Nothing went out: try again.' }),
    ]);

    const [done] = gather([{ statusCode: 200, headers: { etag: '"/ama/two"' } }, { statusCode: 200, headers: { etag: '/ama/one' } }]);
    const video = (res: Json) => step([...LINKEDIN, 'publisher-linkedin-video.js'], [res], {}, { 'Plan the LinkedIn post': [plan], 'Gather the parts': [done] })[0]!;
    const post = { ...(plan!.post as Json), content: { media: { id: 'urn:li:video:C5F10AQ' } } };
    const sent = video({ statusCode: 200, body: '' });
    expect(sent).toEqual({ ok: true, post_id: 'p1', place: 'linkedin', version: '202609', video: 'urn:li:video:C5F10AQ', post, tries: 0, wait: 20 });
    expect(video({ statusCode: 400, body: { message: 'Upload incomplete' } })).toMatchObject({ ok: false, unknown: false, error: 'LinkedIn would not finish the video (400): Upload incomplete' });

    // The post names the video only once LinkedIn has processed it.
    const check = (res: Json, waited: Json = sent) => step([...LINKEDIN, 'publisher-linkedin-ready.js'], [res], {}, { 'Give LinkedIn time': [waited] })[0]!;
    expect(check({ statusCode: 200, body: { status: 'AVAILABLE', id: 'urn:li:video:C5F10AQ' } })).toEqual({ ok: true, post_id: 'p1', place: 'linkedin', version: '202609', post });
    expect(check({ statusCode: 200, body: { status: 'PROCESSING_FAILED', processingFailureReason: 'Video is too short' } })).toMatchObject({ ok: false, unknown: false, error: 'LinkedIn could not process the video (Video is too short). Nothing went out.' });
    expect(check({ statusCode: 403, body: { message: 'Not enough permissions to access: videos.GET' } }).error).toMatch(/would not let the app say whether the video is ready/);
    let waited: Json = sent;
    for (const tries of [1, 2, 3, 4]) {
      waited = check(tries === 3 ? { statusCode: 503, body: {} } : { statusCode: 200, body: { status: 'PROCESSING' } }, waited);
      expect(waited).toEqual({ ...sent, ok: false, again: true, tries, wait: 60 });
    }
    expect(check({ statusCode: 200, body: { status: 'PROCESSING' } }, waited)).toEqual({
      ok: false,
      post_id: 'p1',
      place: 'linkedin',
      unknown: false,
      error: 'LinkedIn was still processing the video after five minutes. Nothing went out: try again later.',
    });
  });
});

describe('results, from the platforms back to the dashboard', () => {
  /** The dashboard's view of a post, read as a teammate. */
  const dashboardPost = (postId: string) =>
    t.asUser(member, () =>
      t.value<PostRow>(
        `select json_build_object('id', p.id, 'variant_id', p.variant_id, 'scheduled_for', p.scheduled_for, 'created_at', p.created_at, 'thumbnail', p.thumbnail,
          'post_targets', (select json_agg(to_jsonb(x)) from public.post_targets x where x.post_id = p.id),
          'ad_variants', (select json_build_object('label', v.label, 'angle', v.angle, 'ad_set_id', v.ad_set_id, 'ad_sets', null) from public.ad_variants v where v.id = p.variant_id)
        ) from public.posts p where p.id = $1`,
        [postId],
      ),
    ).then((row) => toPost(row)!);

  it('reads a real post, records what the platform gave, and shows it with its rate', async () => {
    const { variantId } = await approvedVariant();
    await t.asUser(member, () => t.db.query(`select public.update_publishing_settings('', '', '', '', '98765', 'Quantum Global Residency')`));
    const postId = await t.asUser(member, () => t.value<string>(`select public.schedule_post($1, '[{"place":"linkedin"}]'::jsonb)`, [variantId]));
    await t.asService(() => t.value(`select public.publisher_take_due()`));
    // As the real LinkedIn step will record it, once the keys are in.
    await t.asService(() => t.db.query(`select public.publisher_finish($1, 'linkedin', 'urn:li:share:7123', 'https://www.linkedin.com/feed/update/urn:li:share:7123', false)`, [postId]));

    const due = await t.asService(() => t.value<unknown[]>(`select public.results_take_due(p_limit => 50)`));
    const items = step('shared-items.js', [{ data: due }]).filter((i) => i.post_id === postId);
    expect(items).toEqual([expect.objectContaining({ place: 'linkedin', remote_id: 'urn:li:share:7123' })]);

    expect((await dashboardPost(postId)).targets[0]!.results).toBeUndefined();

    // "Plan the read", LinkedIn's answer (as its docs show it), "Read the numbers".
    const [plan] = step('results-plan.js', items);
    expect(plan).toEqual({
      post_id: postId,
      place: 'linkedin',
      kind: 'linkedin',
      version: '202609',
      url: 'https://api.linkedin.com/rest/organizationalEntityShareStatistics?q=organizationalEntity&organizationalEntity=urn%3Ali%3Aorganization%3A98765&shares=List(urn%3Ali%3Ashare%3A7123)',
    });
    const statistics = { uniqueImpressionsCount: 940, shareCount: 3, engagement: 0.0819, clickCount: 29, likeCount: 38, impressionCount: 1320, commentCount: 7 };
    const [read] = step([...LINKEDIN, 'results-read.js'], [{ statusCode: 200, body: { elements: [{ totalShareStatistics: statistics, share: 'urn:li:share:7123', organizationalEntity: 'urn:li:organization:98765' }] } }], {}, { 'Plan the read': [plan] });
    const numbers = { reach: 940, views: 1320, reactions: 38, comments: 7, shares: 3, clicks: 29 };
    expect(read).toEqual({ post_id: postId, place: 'linkedin', ok: true, results: numbers });
    await t.asService(() => t.db.query(`select public.results_record($1, $2, $3::jsonb)`, [read!.post_id, read!.place, JSON.stringify(read!.results)]));
    const target = (await dashboardPost(postId)).targets[0]!;
    expect(target.results).toMatchObject(numbers);
    expect(formatRate(engagementRate(target.results!)!)).toBe('8.2%');
    expect(target.url).toBe('https://www.linkedin.com/feed/update/urn:li:share:7123');
  });
});

describe('reading the numbers', () => {
  const due = (fields: Json): Json => ({ post_id: 'p1', place: 'facebook', remote_id: '1234567890_555', media_kind: 'image', posted_at: '2026-10-08T13:00:12+00:00', page: { id: '1234567890' }, ...fields });
  const read = (item: Json, res: Json) => {
    const [plan] = step('results-plan.js', [item]);
    return step([...LINKEDIN, 'results-read.js'], [res], {}, { 'Plan the read': [plan] })[0]!;
  };
  const lifetime = (name: string, value: unknown) => ({ name, period: 'lifetime', values: [{ value }] });

  it('asks each platform for a post’s numbers in one request', () => {
    expect(step('results-plan.js', [due({})])[0]).toMatchObject({
      kind: 'facebook-post',
      url: 'https://graph.facebook.com/v25.0/1234567890_555?fields=shares,comments.limit(0).summary(true),reactions.limit(0).summary(true),insights.metric(post_media_view,post_total_media_view_unique,post_clicks)',
    });
    expect(step('results-plan.js', [due({ remote_id: '777', media_kind: 'video' })])[0]).toMatchObject({ kind: 'facebook-video', url: 'https://graph.facebook.com/v25.0/777/video_insights' });
    expect(step('results-plan.js', [due({ place: 'instagram', remote_id: '17900000000000001' })])[0]).toMatchObject({
      kind: 'instagram',
      url: 'https://graph.facebook.com/v25.0/17900000000000001/insights?metric=reach,views,likes,comments,shares',
    });
    expect(step('results-plan.js', [due({ place: 'linkedin', remote_id: 'urn:li:ugcPost:7124', page: { id: '98765' } })])[0]!.url).toBe(
      'https://api.linkedin.com/rest/organizationalEntityShareStatistics?q=organizationalEntity&organizationalEntity=urn%3Ali%3Aorganization%3A98765&ugcPosts=List(urn%3Ali%3AugcPost%3A7124)',
    );
  });

  it('reads every number by its name, and leaves out what a platform does not give', () => {
    const post = read(due({}), {
      statusCode: 200,
      body: {
        id: '1234567890_555',
        comments: { data: [], summary: { order: 'ranked', total_count: 7, can_comment: true } },
        reactions: { data: [], summary: { total_count: 38, viewer_reaction: 'NONE' } },
        shares: { count: 3 },
        insights: { data: [lifetime('post_clicks', 29), lifetime('post_media_view', 1320), lifetime('post_total_media_view_unique', 940)] },
      },
    });
    expect(post).toEqual({ post_id: 'p1', place: 'facebook', ok: true, results: { reach: 940, views: 1320, reactions: 38, comments: 7, shares: 3, clicks: 29 } });
    // Nobody shared it: Facebook leaves shares out. A metric it no longer gives is null.
    expect(read(due({}), { statusCode: 200, body: { comments: { summary: { total_count: 0 } }, reactions: { summary: { total_count: 2 } }, insights: { data: [lifetime('post_media_view', 40)] } } }).results).toEqual({
      reach: null,
      views: 40,
      reactions: 2,
      comments: 0,
      shares: 0,
      clicks: null,
    });
    const video = read(due({ remote_id: '777', media_kind: 'video' }), {
      statusCode: 200,
      body: {
        data: [
          lifetime('total_video_views', 1500),
          lifetime('total_video_views_unique', 1100),
          lifetime('total_video_reactions_by_type_total', { like: 30, love: 5 }),
          lifetime('total_video_stories_by_action_type', { share: 4, like: 30, comment: 6 }),
          lifetime('total_video_avg_time_watched', 8200),
        ],
      },
    });
    expect(video.results).toEqual({ reach: 1100, views: 1500, reactions: 35, comments: 6, shares: 4, clicks: null });
    // Newer answers give the value as a total.
    const instagram = read(due({ place: 'instagram', remote_id: '1790' }), {
      statusCode: 200,
      body: { data: [lifetime('reach', 800), { name: 'views', period: 'lifetime', total_value: { value: 1200 } }, lifetime('likes', 51), lifetime('comments', 4), lifetime('shares', 2)] },
    });
    expect(instagram.results).toEqual({ reach: 800, views: 1200, reactions: 51, comments: 4, shares: 2, clicks: null });
  });

  it('says why a platform gave no numbers, so the ones before are kept', () => {
    const facebook = due({});
    expect(read(facebook, facebook).error).toBe('Facebook was not asked: attach the “Facebook Graph API” credential to “Meta: its numbers” in n8n.');
    expect(read(due({ place: 'linkedin', remote_id: 'urn:li:share:1', page: { id: '9' } }), {}).error).toMatch(/“LinkedIn Community Management” credential to “LinkedIn: its numbers”/);
    expect(read(facebook, { error: { message: 'getaddrinfo EAI_AGAIN graph.facebook.com' } }).error).toMatch(/could not be asked for the numbers \(getaddrinfo EAI_AGAIN/);
    expect(read(facebook, { statusCode: 400, body: { error: { message: 'Invalid OAuth access token.', code: 190 } } }).error).toMatch(/token has expired or was revoked/);
    expect(read(due({ place: 'instagram' }), { statusCode: 403, body: { error: { message: '(#10) Application does not have permission', code: 10 } } }).error).toMatch(/needs instagram_manage_insights/);
    expect(read(facebook, { statusCode: 400, body: { error: { message: '(#100) The value must be a valid insights metric', code: 100 } } }).error).toBe(
      'Facebook no longer gives one of the numbers asked for ((#100) The value must be a valid insights metric): the metrics in “Plan the read” need updating.',
    );
    const linkedin = due({ place: 'linkedin', remote_id: 'urn:li:share:1', page: { id: '9' } });
    expect(read(linkedin, { statusCode: 403, body: { message: 'Not enough permissions to access: organizationalEntityShareStatistics.FINDER-organizationalEntity' } }).error).toMatch(/would not let the app give the numbers/);
    expect(read(linkedin, { statusCode: 200, body: { elements: [] } })).toEqual({ post_id: 'p1', place: 'linkedin', ok: false, error: 'LinkedIn gave no numbers for this post. They are read again in six hours.' });
  });
});

describe('a picture, from the studio to the image model and back', () => {
  /** A custom run's three ads, each with a picture prompt, as the Content Agent writes them. */
  async function adSet(): Promise<{ setId: string; variantId: string }> {
    const runId = await t.asUser(member, () => t.value<string>(`select public.create_run('custom', 'text', 'Pictures check', array['meta','linkedin'], 'consultations', p_excerpt => $1)`, [EXCERPT]));
    const strategy = { title: 'S', positioning: 'P', audiences: ['A'], angles: ['1', '2', '3'].map((name) => ({ name, why: 'w', hook: 'h', based_on_hook: null })), channels: [], guardrails: [] };
    const variants = ['A', 'B', 'C'].map((label) => ({ label, angle: 'a', creative_text: 'Plan with care', creative_style: 'arcs', image_prompt: 'A calm skyline at dusk, indigo and gold. No words, no people, no flags.', copy, warnings: [] }));
    await t.asService(async () => {
      await t.db.query(`select public.agent_begin($1, 'strategist')`, [runId]);
      await t.db.query(`select public.agent_finish_strategist($1, $2::jsonb)`, [runId, JSON.stringify(strategy)]);
      await t.db.query(`select public.agent_begin($1, 'content')`, [runId]);
      await t.db.query(`select public.agent_finish_content($1, $2::jsonb)`, [runId, JSON.stringify({ title: 'Pictures check', variants })]);
    });
    const row = await t.value<{ set_id: string; variant_id: string }>(
      `select json_build_object('set_id', s.id, 'variant_id', v.id) from public.ad_variants v join public.ad_sets s on s.id = v.ad_set_id where s.run_id = $1 and v.label = 'A'`,
      [runId],
    );
    return { setId: row.set_id, variantId: row.variant_id };
  }

  /** The studio's view of variant A, read as a teammate, with Storage's signed link stood in for. */
  const studio = (setId: string) =>
    t.asUser(member, () =>
      t.value<AdSetRow>(
        `select json_build_object('id', s.id, 'run_id', s.run_id, 'strategy_id', s.strategy_id, 'title', s.title, 'created_at', s.created_at, 'runs', null,
          'ad_variants', (select json_agg(json_build_object('id', v.id, 'label', v.label, 'angle', v.angle, 'creative_text', v.creative_text, 'creative_style', v.creative_style,
            'image_prompt', v.image_prompt, 'picture_path', v.picture_path, 'picture_status', v.picture_status, 'picture_error', v.picture_error,
            'picture_requested_at', v.picture_requested_at, 'copy', v.copy, 'warnings', v.warnings, 'approved_at', v.approved_at, 'video_edit', v.video_edit,
            'variant_pictures', coalesce((select json_agg(json_build_object('id', p.id, 'path', p.path, 'prompt', p.prompt, 'created_at', p.created_at, 'removed_at', p.removed_at)) from public.variant_pictures p where p.variant_id = v.id), '[]'::json))) from public.ad_variants v where v.ad_set_id = s.id)
        ) from public.ad_sets s where s.id = $1`,
        [setId],
      ),
    ).then((row) => toAdSet(row, (path) => `https://storage.example/signed/${path}`).variants.find((v) => v.label === 'A')!);

  /** One run of "QGR · Pictures": take the asks, hand each to the image model's step, record what it answered. */
  async function makePictures(answer: (ask: Json) => Json): Promise<{ removed: (string | null)[] }> {
    const due = await t.asService(() => t.value<unknown[]>(`select public.picture_take_due(p_limit => 5)`));
    const removed: (string | null)[] = [];
    for (const made of step('shared-items.js', [{ data: due }]).map(answer)) {
      if (made.ok === true) {
        const finished = await t.asService(() =>
          t.value<{ remove_picture: string | null }>(`select public.picture_finish(p_variant_id => $1, p_path => $2, p_stand_in => $3)`, [made.variant_id, made.path, made.stand_in === true]),
        );
        removed.push(finished.remove_picture);
      } else {
        await t.asService(() => t.db.query(`select public.picture_fail($1, $2)`, [made.variant_id, made.error]));
      }
    }
    return { removed };
  }
  const standIn = (ask: Json) => step('pictures-stand-in.js', [ask])[0]!;

  it('answers as the image model will, and says it made nothing', () => {
    expect(step('pictures-stand-in.js', [{ variant_id: 'v1', label: 'A', prompt: 'A skyline', style: 'arcs', path: 'pictures/v1/p.png' }])).toEqual([
      { ok: true, variant_id: 'v1', path: null, stand_in: true },
    ]);
  });

  it('ends at the stand-in with the design drawn, and shows a real picture once one is made', async () => {
    const { setId, variantId } = await adSet();
    await t.asUser(member, () => t.db.query(`select public.request_picture($1)`, [variantId]));
    expect((await studio(setId)).picture).toMatchObject({ status: 'making' });

    expect(await makePictures(standIn)).toEqual({ removed: [null] });
    const drawn = await studio(setId);
    expect(drawn).not.toHaveProperty('imageUrl');
    expect(drawn.picture).toEqual({ status: 'none', note: expect.stringMatching(/pictures are set to the stand-in/) });
    // The next minute finds nothing.
    expect(await makePictures(standIn)).toEqual({ removed: [] });

    // The real steps' answer, in the shape the stand-in documents: uploaded to the path it was given.
    await t.asUser(member, () => t.db.query(`select public.request_picture($1)`, [variantId]));
    let path = '';
    const made = await makePictures((ask) => {
      path = String(ask.path);
      return { ok: true, variant_id: ask.variant_id, path, stand_in: false };
    }).catch((err: unknown) => err);
    expect(String(made)).toMatch(/has not finished uploading/);
    await t.asService(() => t.db.query(`insert into storage.objects (bucket_id, name) values ('ad-pictures', $1)`, [path]));
    // The claim was taken; it is retried once ten minutes have passed.
    await t.db.query(`update public.ad_variants set picture_claimed_at = now() - interval '11 minutes' where id = $1`, [variantId]);
    expect(await makePictures((ask) => ({ ok: true, variant_id: ask.variant_id, path, stand_in: false }))).toEqual({ removed: [null] });
    const pictured = await studio(setId);
    expect(pictured.imageUrl).toBe(`https://storage.example/signed/${path}`);
    expect(pictured).not.toHaveProperty('picture');
    expect(pictured.picturePrompt).toBe('A calm skyline at dusk, indigo and gold. No words, no people, no flags.');

    // The model refuses the next one: the picture shown stays, and the studio says why.
    await t.asUser(member, () => t.db.query(`select public.request_picture($1)`, [variantId]));
    await makePictures((ask) => ({ ok: false, variant_id: ask.variant_id, error: 'The image model refused the prompt (400).' }));
    expect(await studio(setId)).toMatchObject({ imageUrl: `https://storage.example/signed/${path}`, picture: { status: 'failed', note: 'The image model refused the prompt (400).' } });
  });

  // The first bytes of real files, in base64, as Cloudflare answers them.
  const JPEG = '/9j/4AAQSkZJRgABAQAAAQABAAD/2Q==';
  const PNG = 'iVBORw0KGgoAAAAAAAAAAA==';
  const WEBP = 'UklGRh4AAABXRUJQVlA4IAAAAAAAAAAAAAA=';
  const GIF = 'R0lGODlhAAAAAAAAAAAAAA==';
  const ACCOUNT = '0123456789abcdef0123456789abcdef';
  /** "Real pictures?": Cloudflare, with the account it runs on. */
  const real = (ask: Json) => ask.model === 'cloudflare' && /^[0-9a-f]{32}$/.test(String(ask.account ?? ''));
  /** Cloudflare's answer to each written prompt, read as "Read the picture" reads it. */
  const readPictures = (asks: Json[], answer: (ask: Json) => Json) => {
    const written = step(WRITE_PROMPT, asks);
    return step('pictures-read-image.js', written.map(answer), {}, { 'Write the prompt': written });
  };

  it('makes a real picture on Cloudflare from a person’s prompt and the brand’s look, and keeps it to choose again', async () => {
    const { setId, variantId } = await adSet();
    await t.asUser(member, async () => {
      await t.db.query(`select public.update_brand_memory('{}', '{}'::jsonb, 'Warm evening light, deep indigo and gold accents')`);
      await t.db.query(`select public.set_pictures_model('cloudflare', $1)`, [ACCOUNT]);
      await t.db.query(`select public.ask_for_picture($1, 'A quiet harbour at dawn, boats at rest')`, [variantId]);
    });

    const due = await t.asService(() => t.value<unknown[]>(`select public.picture_take_due(p_limit => 5)`));
    const asks = step('shared-items.js', [{ data: due }]).filter((a) => a.variant_id === variantId);
    expect(asks.every(real)).toBe(true);
    const [written] = step(WRITE_PROMPT, asks);
    expect(written).toMatchObject({ variant_id: variantId, url: `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/ai/run/@cf/black-forest-labs/flux-1-schnell` });
    expect((written!.body as { prompt: string }).prompt).toBe(
      'A quiet harbour at dawn, boats at rest. A real photograph, as a documentary or lifestyle photographer would take it: natural light, real skin, hands and textures, candid and unposed, honest emotion. Where there are people, they interact with each other (embracing, playing, laughing, talking) rather than pose for the camera. Not an illustration, a 3D render or a stock-photo pose. Picture style: Warm evening light, deep indigo and gold accents. The people are Indian: Indian families, parents, children and professionals, as most of QGR\'s clients are. No readable text, letters, numbers, logos or watermarks anywhere, on signs, books or documents either. Everyone shown is a made-up person: never a real, famous or recognisable one. A U.S. flag or quiet props such as passports, a folder or a gavel may appear, with no writing on them; never a green card or visa held up as approved, never money.',
    );

    // Cloudflare answers a JPEG: the path takes its extension, and it is uploaded there.
    const [made] = step('pictures-read-image.js', [{ statusCode: 200, body: { success: true, result: { image: JPEG } } }], {}, { 'Write the prompt': [written] });
    expect(made).toMatchObject({ ok: true, variant_id: variantId, mime: 'image/jpeg', image: JPEG });
    expect(made!.path).toMatch(new RegExp(`^pictures/${variantId}/[0-9a-f-]{36}\\.jpg$`));
    expect(made!.file).toBe(String(made!.path).split('/').pop());
    await t.asService(() => t.db.query(`insert into storage.objects (bucket_id, name) values ('ad-pictures', $1)`, [made!.path]));
    const [uploaded] = step('pictures-uploaded.js', [{ statusCode: 200, body: { Key: `ad-pictures/${String(made!.path)}` } }], {}, { 'Read the picture': [made] });
    expect(uploaded).toEqual({ ok: true, variant_id: variantId, path: made!.path, stand_in: false });

    const finished = await t.asService(() => t.value<{ remove_picture: string | null }>(`select public.picture_finish($1, $2, false)`, [variantId, made!.path]));
    expect(finished).toEqual({ remove_picture: null });
    const shown = await studio(setId);
    expect(shown).toMatchObject({ imageUrl: `https://storage.example/signed/${String(made!.path)}`, picturePrompt: 'A quiet harbour at dawn, boats at rest' });
    expect(shown.pictures).toEqual([expect.objectContaining({ shown: true, prompt: 'A quiet harbour at dawn, boats at rest' })]);

    await t.asUser(member, async () => {
      await t.db.query(`select public.set_pictures_model('stand-in')`);
      await t.db.query(`select public.update_brand_memory('{}', '{}'::jsonb, null)`);
    });
  });

  it('keeps every prompt to what FLUX takes, never shortening the style or the rules', () => {
    const style = 'Soft daylight. '.repeat(40).trim();
    const [long] = step(WRITE_PROMPT, [{ variant_id: 'v', path: 'p', account: ACCOUNT, prompt: 'A wide harbour scene with boats and gulls '.repeat(80), look: style }]);
    const prompt = (long!.body as { prompt: string }).prompt;
    expect(prompt.length).toBeLessThanOrEqual(2048);
    expect(prompt).toContain(`Picture style: ${style}`);
    expect(prompt.endsWith('held up as approved, never money.')).toBe(true);
    expect(prompt).toContain(' A real photograph, ');
    expect(prompt.startsWith('A wide harbour scene')).toBe(true);
    // A picture style longer than FLUX takes is shortened after the scene, never the rules.
    const [styled] = step(WRITE_PROMPT, [{ variant_id: 'v', path: 'p', account: ACCOUNT, prompt: 'A family at the kitchen table', look: 'Golden hour warmth. '.repeat(200) }]);
    const both = (styled!.body as { prompt: string }).prompt;
    expect(both.length).toBeLessThanOrEqual(2048);
    expect(both.startsWith('A family at the kitchen table. A real photograph')).toBe(true);
    expect(both.endsWith('held up as approved, never money.')).toBe(true);
    // Without a picture style, the scene and the rules.
    const [plain] = step(WRITE_PROMPT, [{ variant_id: 'v', path: 'p', account: ACCOUNT, prompt: '  A desk   lamp at night ', look: null }]);
    expect((plain!.body as { prompt: string }).prompt).toBe('A desk lamp at night. A real photograph, as a documentary or lifestyle photographer would take it: natural light, real skin, hands and textures, candid and unposed, honest emotion. Where there are people, they interact with each other (embracing, playing, laughing, talking) rather than pose for the camera. Not an illustration, a 3D render or a stock-photo pose. The people are Indian: Indian families, parents, children and professionals, as most of QGR\'s clients are. No readable text, letters, numbers, logos or watermarks anywhere, on signs, books or documents either. Everyone shown is a made-up person: never a real, famous or recognisable one. A U.S. flag or quiet props such as passports, a folder or a gavel may appear, with no writing on them; never a green card or visa held up as approved, never money.');
  });

  it('reads what Cloudflare answers into a picture of the right kind, or a reason a person can act on', () => {
    const asks = [{ variant_id: 'v1', label: 'A', path: 'pictures/v1/p1.png', account: ACCOUNT, prompt: 'A harbour', look: null }];
    const answer = (res: Json) => readPictures(asks, () => res)[0]!;
    expect(answer({ statusCode: 200, body: { success: true, result: { image: PNG } } })).toMatchObject({ ok: true, path: 'pictures/v1/p1.png', mime: 'image/png', file: 'p1.png' });
    expect(answer({ statusCode: 200, body: { success: true, result: { image: `data:image/webp;base64,${WEBP}` } } })).toMatchObject({ ok: true, path: 'pictures/v1/p1.webp', mime: 'image/webp', image: WEBP });
    expect(answer({ statusCode: 200, body: { success: true, result: { image: GIF } } })).toEqual({ ok: false, variant_id: 'v1', error: 'Cloudflare answered with something that is not a JPEG, PNG or WebP picture.' });
    expect(answer({ statusCode: 200, body: { success: true, result: {} } })).toMatchObject({ ok: false, error: 'Cloudflare answered without a picture.' });
    expect(answer({ statusCode: 200, body: { success: true, result: { image: 'A'.repeat(14_000_001) } } })).toMatchObject({ ok: false, error: 'The picture is over 10 MB, more than Storage keeps.' });
    expect(answer({ statusCode: 429, body: { success: false, errors: [{ code: 4006, message: 'you have used up your daily free allocation of 10,000 neurons' }] } }).error).toMatch(/free pictures for today are used up.*00:00 UTC/);
    expect(answer({ statusCode: 401, body: { success: false, errors: [{ code: 10000, message: 'Authentication error' }] } }).error).toMatch(/refused the API token.*Cloudflare Workers AI/);
    expect(answer({ statusCode: 404, body: { success: false, errors: [{ code: 7003, message: 'Could not route to /accounts/x/ai/run' }] } }).error).toMatch(/no account with that ID.*Settings, Agents/);
    expect(answer({ statusCode: 500, body: { success: false, errors: [{ code: 3030, message: 'Internal error' }] } }).error).toBe('Cloudflare could not make the picture (500): Internal error');
    expect(answer({ error: { message: 'getaddrinfo ENOTFOUND api.cloudflare.com' } }).error).toBe('Cloudflare could not be asked: getaddrinfo ENOTFOUND api.cloudflare.com');
    // A step that never ran hands its input on: it has no credential yet.
    expect(readPictures(asks, (written) => written)[0]!.error).toMatch(/attach the "Cloudflare Workers AI" credential/);
  });

  it('says why a picture that was made could not be stored', () => {
    const made = [{ ok: true, variant_id: 'v1', path: 'pictures/v1/p1.jpg', mime: 'image/jpeg', file: 'p1.jpg', image: JPEG }];
    expect(step('pictures-uploaded.js', [{ statusCode: 400, body: { statusCode: '409', error: 'Duplicate', message: 'The resource already exists' } }], {}, { 'Read the picture': made })).toEqual([
      { ok: false, variant_id: 'v1', error: 'The picture was made but could not be stored (400): The resource already exists' },
    ]);
    expect(step('pictures-uploaded.js', [{}], {}, { 'Read the picture': made })[0]).toMatchObject({ ok: false, error: 'The picture was made but could not be stored (no answer): no answer' });
  });
});
