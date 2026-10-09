// The publisher, end to end with nothing mocked but the platforms: a teammate
// approves a variant and schedules it (as the dashboard does), then each step
// of "QGR · Publisher" runs in the workflow's order, its Code nodes as n8n
// runs them, against the real database functions as the service role.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { toPost } from '../lib/data/map';
import { engagementRate, formatRate } from '../lib/results';
import type { PostRow } from '../lib/data/map';
import { inN8n } from '../test/n8n';
import { testDatabase } from '../test/supabase';
import type { TestDatabase } from '../test/supabase';

type Json = Record<string, unknown>;
type Items = { json: Json }[];
const here = dirname(fileURLToPath(import.meta.url));

/** A Code node over all its input items, as n8n runs it. */
function step(file: string, items: unknown[], swap: Record<string, string> = {}): Json[] {
  let code = readFileSync(join(here, 'code', file), 'utf8');
  for (const [key, value] of Object.entries(swap)) code = code.replaceAll(key, value);
  const all = items.map((json) => ({ json }));
  const $input = { first: () => all[0], all: () => all };
  return (inN8n(code, $input, () => null) as Items).map((i) => i.json);
}

const PLACE_NAME = { facebook: 'Facebook', instagram: 'Instagram', linkedin: 'LinkedIn' } as const;

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
    const postId = await t.asUser(member, () => t.value<string>(`select public.schedule_post($1, '[{"place":"linkedin"}]'::jsonb)`, [variantId]));
    await t.asService(() => t.value(`select public.publisher_take_due()`));
    // As the real LinkedIn step will record it, once the keys are in.
    await t.asService(() => t.db.query(`select public.publisher_finish($1, 'linkedin', 'urn:li:share:7123', 'https://www.linkedin.com/feed/update/urn:li:share:7123', false)`, [postId]));

    const due = await t.asService(() => t.value<unknown[]>(`select public.results_take_due(p_limit => 50)`));
    const items = step('shared-items.js', [{ data: due }]).filter((i) => i.post_id === postId);
    expect(items).toEqual([expect.objectContaining({ place: 'linkedin', remote_id: 'urn:li:share:7123' })]);

    // The stand-in reads nothing, and nothing is recorded.
    const [standIn] = step('results-stand-in.js', items, { __PLACE_NAME__: 'LinkedIn' });
    expect(standIn).toEqual({ ok: true, post_id: postId, place: 'linkedin', results: null, stand_in: true });
    expect((await dashboardPost(postId)).targets[0]!.results).toBeUndefined();

    // The real step's answer, in the shape the stand-in documents.
    const numbers = { reach: 940, views: 1320, reactions: 38, comments: 7, shares: 3, clicks: 29 };
    await t.asService(() => t.db.query(`select public.results_record($1, 'linkedin', $2::jsonb)`, [postId, JSON.stringify(numbers)]));
    const target = (await dashboardPost(postId)).targets[0]!;
    expect(target.results).toMatchObject(numbers);
    expect(formatRate(engagementRate(target.results!)!)).toBe('8.2%');
    expect(target.url).toBe('https://www.linkedin.com/feed/update/urn:li:share:7123');
  });
});
