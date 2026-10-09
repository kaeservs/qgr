import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { testDatabase } from '../test/supabase';
import type { TestDatabase } from '../test/supabase';

// Approvals that hold, posts that go out only as approved, the publisher's
// queue, and who may touch any of it: against every migration, in Postgres.

let t: TestDatabase;
let member = '';
let teammate = '';
let outsider = '';

const EXCERPT = 'Plain words about EB-5 for families planning a move to the United States.';
const STRATEGY = {
  title: 'Posting check',
  positioning: 'Plain advice',
  audiences: ['Families'],
  angles: ['One', 'Two', 'Three'].map((name) => ({ name, why: 'w', hook: 'h', based_on_hook: null })),
  channels: [{ platform: 'meta', share: 60, role: 'r', format: 'f' }, { platform: 'linkedin', share: 40, role: 'r', format: 'f' }],
  guardrails: ['g'],
};
const copy = {
  meta: { text: 'Plan your EB-5 path with people who show their working.', headline: 'EB-5, mapped out', cta: 'Learn more' },
  linkedin: { text: 'Families on H-1B visas: plan EB-5 early, with independent diligence.', headline: 'Plan early' },
};
const variants = ['A', 'B', 'C'].map((label, i) => ({ label, angle: STRATEGY.angles[i]!.name, creative_text: 'Plan with care', creative_style: 'arcs', image_prompt: '', copy, warnings: [] }));

const uuid = () => crypto.randomUUID();
const file = (user: string, ext: 'jpg' | 'mp4' = 'jpg') => `posts/${user}/${uuid()}.${ext}`;

/** A custom run taken through both agents, returning it and its variants by label. */
async function adSet(): Promise<{ runId: string; variant: Record<'A' | 'B' | 'C', string> }> {
  const runId = await t.asUser(member, () => t.value<string>(`select public.create_run('custom', 'text', 'Posting check', array['meta','linkedin'], 'consultations', p_excerpt => $1)`, [EXCERPT]));
  await t.asService(async () => {
    await t.db.query(`select public.agent_begin($1, 'strategist')`, [runId]);
    await t.db.query(`select public.agent_finish_strategist($1, $2::jsonb)`, [runId, JSON.stringify(STRATEGY)]);
    await t.db.query(`select public.agent_begin($1, 'content')`, [runId]);
    await t.db.query(`select public.agent_finish_content($1, $2::jsonb)`, [runId, JSON.stringify({ title: 'Posting check', variants })]);
  });
  const { rows } = await t.db.query<{ label: 'A' | 'B' | 'C'; id: string }>(`select v.label, v.id from public.ad_variants v join public.ad_sets s on s.id = v.ad_set_id where s.run_id = $1`, [runId]);
  return { runId, variant: Object.fromEntries(rows.map((r) => [r.label, r.id])) as Record<'A' | 'B' | 'C', string> };
}

const approve = (user: string, variantId: string) => t.asUser(user, () => t.db.query(`select public.approve_variant($1)`, [variantId]));
const upload = (user: string, path: string) => t.asUser(user, () => t.db.query(`insert into storage.objects (bucket_id, name) values ('post-media', $1)`, [path]));
const schedule = (user: string, variantId: string, targets: unknown[], local: string | null = null) =>
  t.asUser(user, () =>
    local === null
      ? t.value<string>(`select public.schedule_post($1, $2::jsonb)`, [variantId, JSON.stringify(targets)])
      : t.value<string>(`select public.schedule_post($1, $2::jsonb, $3)`, [variantId, JSON.stringify(targets), local]),
  );
const takeDue = () => t.asService(() => t.value<{ post_id: string; place: string; text: string; media_path: string | null; page: { id: string | null } }[]>(`select public.publisher_take_due()`));
const status = (postId: string, place: string) => t.value<string>(`select status from public.post_targets where post_id = $1 and place = $2`, [postId, place]);
const events = (runId: string) => t.db.query<{ text: string }>(`select text from public.run_events where run_id = $1 order by id`, [runId]).then((r) => r.rows.map((e) => e.text));

beforeAll(async () => {
  t = await testDatabase();
  member = await t.addUser('member@qgr.example', 'owner');
  teammate = await t.addUser('teammate@qgr.example', 'member');
  outsider = await t.addUser('stranger@elsewhere.example');
}, 60_000);

// Every test starts with nothing due, so one test's posts never reach another's publisher.
beforeEach(async () => {
  await t.db.query(`update public.post_targets set status = 'cancelled' where status in ('scheduled', 'posting')`);
});

describe('approvals hold', () => {
  it('takes the approval back when an approved variant changes, and the run goes back to review', async () => {
    const { runId, variant } = await adSet();
    await approve(member, variant.A);
    expect(await t.value<string | null>('select approved_at::text from public.runs where id = $1', [runId])).not.toBeNull();

    // The same words again: nothing changes.
    await t.asUser(member, () => t.db.query(`select public.save_variant($1, 'Plan with care', $2::jsonb, '{}')`, [variant.A, JSON.stringify(copy)]));
    expect(await t.value<string | null>('select approved_at::text from public.ad_variants where id = $1', [variant.A])).not.toBeNull();

    await t.asUser(teammate, () => t.db.query(`select public.save_variant($1, 'Plan with more care', $2::jsonb, '{}')`, [variant.A, JSON.stringify(copy)]));
    expect(await t.value<string | null>('select approved_at::text from public.ad_variants where id = $1', [variant.A])).toBeNull();
    expect(await t.value<string | null>('select approved_by::text from public.ad_variants where id = $1', [variant.A])).toBeNull();
    expect(await t.value<string | null>('select approved_at::text from public.runs where id = $1', [runId])).toBeNull();
    expect(await events(runId)).toContain('Variant A edited: it needs approving again');
  });

  it('keeps the run approved while another variant still is', async () => {
    const { runId, variant } = await adSet();
    await approve(member, variant.A);
    await approve(member, variant.B);
    await t.asUser(member, () => t.db.query(`select public.save_variant($1, 'Changed words', $2::jsonb, '{}')`, [variant.A, JSON.stringify(copy)]));
    expect(await t.value<string | null>('select approved_at::text from public.runs where id = $1', [runId])).not.toBeNull();
  });

  it('will not change a variant that is waiting to post', async () => {
    const { variant } = await adSet();
    await approve(member, variant.A);
    const postId = await schedule(member, variant.A, [{ place: 'linkedin' }], localIn(2));
    await t.asUser(member, async () => {
      await expect(t.db.query(`select public.save_variant($1, 'Sneaky edit', $2::jsonb, '{}')`, [variant.A, JSON.stringify(copy)])).rejects.toThrow(/waiting to post\. Cancel the post/);
    });
    await t.asUser(member, () => t.db.query(`select public.cancel_post($1)`, [postId]));
    await t.asUser(member, () => t.db.query(`select public.save_variant($1, 'Now it can change', $2::jsonb, '{}')`, [variant.A, JSON.stringify(copy)]));
  });
});

/** Wall time `hours` from now in the team's zone, as the dialog sends it. */
function localIn(hours: number): string {
  const at = new Date(Date.now() + hours * 3_600_000);
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(at);
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}`;
}

describe('scheduling a post', () => {
  it('refuses a variant nobody approved, and places it has no words for', async () => {
    const { variant } = await adSet();
    await t.asUser(member, () => expect(t.db.query(`select public.schedule_post($1, '[{"place":"facebook"}]'::jsonb)`, [variant.B])).rejects.toThrow(/Approve variant B before it is posted/));
    await approve(member, variant.B);
    await t.asUser(member, async () => {
      await expect(t.db.query(`select public.schedule_post($1, '[{"place":"tiktok"}]'::jsonb)`, [variant.B])).rejects.toThrow(/Facebook, Instagram or LinkedIn/);
      await expect(t.db.query(`select public.schedule_post($1, '[{"place":"instagram"}]'::jsonb)`, [variant.B])).rejects.toThrow(/Instagram needs a picture or a video/);
      await expect(t.db.query(`select public.schedule_post($1, '[{"place":"facebook"},{"place":"facebook"}]'::jsonb)`, [variant.B])).rejects.toThrow(/listed twice/);
      await expect(t.db.query(`select public.schedule_post($1, '[]'::jsonb)`, [variant.B])).rejects.toThrow(/Pick where to post/);
    });
  });

  it('takes only files the teammate uploaded, that have finished uploading', async () => {
    const { variant } = await adSet();
    await approve(member, variant.C);
    const mine = file(member);
    await expect(schedule(member, variant.C, [{ place: 'facebook', media_path: mine, media_kind: 'image' }])).rejects.toThrow(/has not finished uploading/);
    const theirs = file(teammate);
    await upload(teammate, theirs);
    await expect(schedule(member, variant.C, [{ place: 'facebook', media_path: theirs, media_kind: 'image' }])).rejects.toThrow(/not one you uploaded/);
    await upload(member, mine);
    await expect(schedule(member, variant.C, [{ place: 'facebook', media_path: mine, media_kind: 'video' }])).rejects.toThrow(/not the kind it says/);
    const postId = await schedule(member, variant.C, [{ place: 'facebook', media_path: mine, media_kind: 'image' }, { place: 'instagram', media_path: mine, media_kind: 'image' }]);
    expect(await t.value<number>('select count(*)::int from public.post_targets where post_id = $1', [postId])).toBe(2);
  });

  it('copies the approved words for each place, and reads the time in the team’s zone', async () => {
    const { runId, variant } = await adSet();
    await approve(member, variant.A);
    const local = localIn(24 * 30);
    const postId = await schedule(member, variant.A, [{ place: 'linkedin' }], local);
    // The wall time is New York's (the team's zone), not UTC's.
    expect(await t.value<string>(`select to_char(scheduled_for at time zone 'America/New_York', 'YYYY-MM-DD HH24:MI') from public.posts where id = $1`, [postId])).toBe(local);
    expect(await t.value<string>(`select to_char(scheduled_for at time zone 'UTC', 'YYYY-MM-DD HH24:MI') from public.posts where id = $1`, [postId])).not.toBe(local);
    expect(await t.value<string>(`select text from public.post_targets where post_id = $1`, [postId])).toBe(copy.linkedin.text);
    expect(await events(runId)).toContain('Variant A scheduled to LinkedIn');
  });

  it('refuses a time that has passed, a time too far ahead, and a second post waiting for the same place', async () => {
    const { variant } = await adSet();
    await approve(member, variant.B);
    await expect(schedule(member, variant.B, [{ place: 'linkedin' }], '2020-01-01 09:00')).rejects.toThrow(/has not passed/);
    await expect(schedule(member, variant.B, [{ place: 'linkedin' }], '2099-01-01 09:00')).rejects.toThrow(/90 days ahead/);
    await expect(schedule(member, variant.B, [{ place: 'linkedin' }], 'next tuesday')).rejects.toThrow(/not readable/);
    await schedule(member, variant.B, [{ place: 'linkedin' }], localIn(3));
    await expect(schedule(teammate, variant.B, [{ place: 'linkedin' }], localIn(5))).rejects.toThrow(/already waiting to post to LinkedIn/);
  });

  it('shows posts to the team only, and lets only the team schedule', async () => {
    const { variant } = await adSet();
    await approve(member, variant.A);
    await schedule(member, variant.A, [{ place: 'facebook' }], localIn(4));
    await t.asUser(outsider, async () => {
      expect(await t.value<number>('select count(*)::int from public.posts')).toBe(0);
      expect(await t.value<number>('select count(*)::int from public.post_targets')).toBe(0);
      expect(await t.value<number>('select count(*)::int from public.team_settings')).toBe(0);
      await expect(t.db.query(`select public.schedule_post($1, '[{"place":"facebook"}]'::jsonb)`, [variant.A])).rejects.toThrow(/Only the QGR team/);
      await expect(t.db.query('select public.publisher_take_due()')).rejects.toThrow(/permission denied/);
    });
    await t.asUser(member, async () => {
      expect(await t.value<number>('select count(*)::int from public.posts')).toBeGreaterThan(0);
      await expect(t.db.query(`insert into public.posts (variant_id, scheduled_for) values ($1, now())`, [variant.A])).rejects.toThrow(/permission denied/);
      await expect(t.db.query('select public.publisher_take_due()')).rejects.toThrow(/permission denied/);
    });
  });
});

describe('the publisher', () => {
  it('takes what is due, once, with the Page to post to, and records it posted', async () => {
    const { runId, variant } = await adSet();
    await t.asUser(member, () => t.db.query(`select public.update_publishing_settings('1234567890', 'Quantum Global', '', '', '98765', 'Quantum Global Residency')`));
    await approve(member, variant.A);
    await approve(member, variant.C);
    const media = file(member);
    await upload(member, media);
    const now = await schedule(member, variant.A, [{ place: 'facebook', media_path: media, media_kind: 'image' }, { place: 'linkedin', media_path: media, media_kind: 'image' }]);
    const later = await schedule(member, variant.C, [{ place: 'instagram', media_path: media, media_kind: 'image' }], localIn(6));

    const due = await takeDue();
    expect(due.map((d) => [d.post_id, d.place])).toEqual([[now, 'facebook'], [now, 'linkedin']]);
    expect(due[0]).toMatchObject({ text: copy.meta.text, media_path: media, page: { id: '1234567890', name: 'Quantum Global' } });
    expect(due[1]).toMatchObject({ text: copy.linkedin.text, page: { id: '98765', name: 'Quantum Global Residency' } });
    expect(await status(later, 'instagram')).toBe('scheduled');
    // A second call while the first is sending gets nothing.
    expect(await takeDue()).toEqual([]);

    const first = await t.asService(() => t.value<{ remove_media: string | null }>(`select public.publisher_finish($1, 'facebook', 'fb_1', 'https://facebook.com/1', false)`, [now]));
    // LinkedIn and the later Instagram post still need the file.
    expect(first.remove_media).toBeNull();
    await t.asService(() => t.db.query(`select public.publisher_finish($1, 'linkedin', null, null, true)`, [now]));
    expect(await status(now, 'facebook')).toBe('posted');
    expect(await t.value<boolean>(`select stand_in from public.post_targets where post_id = $1 and place = 'linkedin'`, [now])).toBe(true);
    expect(await events(runId)).toEqual(expect.arrayContaining(['Variant A sent to Facebook, LinkedIn', 'Variant A posted to Facebook', 'Variant A went through the LinkedIn stand-in: nothing was posted']));

    // Cancelling the later post frees the file: nothing open needs it now.
    const freed = await t.asUser(teammate, () => t.value<string[]>(`select public.cancel_post($1)`, [later]));
    expect(freed).toEqual([media]);
    await expect(t.asUser(member, () => t.db.query(`select public.cancel_post($1)`, [later]))).rejects.toThrow(/Nothing on this post is waiting/);
  });

  it('records a failure, and sends it again only when a person says so', async () => {
    const { runId, variant } = await adSet();
    await approve(member, variant.B);
    const postId = await schedule(member, variant.B, [{ place: 'linkedin' }]);
    expect((await takeDue()).map((d) => d.place)).toEqual(['linkedin']);
    await t.asService(() => t.db.query(`select public.publisher_fail($1, 'linkedin', 'LinkedIn refused the token (401).')`, [postId]));
    expect(await status(postId, 'linkedin')).toBe('failed');
    expect(await takeDue()).toEqual([]);
    expect(await events(runId)).toContain('Posting variant B to LinkedIn failed: LinkedIn refused the token (401).');

    await t.asUser(member, () => t.db.query(`select public.retry_post($1, 'linkedin')`, [postId]));
    expect((await takeDue()).map((d) => d.post_id)).toEqual([postId]);
    expect(await t.value<number>(`select attempts from public.post_targets where post_id = $1`, [postId])).toBe(2);
  });

  it('marks a send that was interrupted as unknown, and never sends it again by itself', async () => {
    const { runId, variant } = await adSet();
    await approve(member, variant.C);
    const postId = await schedule(member, variant.C, [{ place: 'facebook' }]);
    await takeDue();
    await t.db.query(`update public.post_targets set claimed_at = now() - interval '20 minutes' where post_id = $1`, [postId]);
    expect(await takeDue()).toEqual([]);
    expect(await status(postId, 'facebook')).toBe('unknown');
    expect(await events(runId)).toContain('Not sure the Facebook post went out: check the Page');
    // A late answer from the platform still settles it.
    await t.asService(() => t.db.query(`select public.publisher_finish($1, 'facebook', 'fb_9', null, false)`, [postId]));
    expect(await status(postId, 'facebook')).toBe('posted');
  });

  it('refuses to settle a place that is not being sent', async () => {
    const { variant } = await adSet();
    await approve(member, variant.A);
    const postId = await schedule(member, variant.A, [{ place: 'facebook' }], localIn(2));
    await expect(t.asService(() => t.db.query(`select public.publisher_finish($1, 'facebook', 'x', null, false)`, [postId]))).rejects.toThrow(/was not being sent/);
    await expect(t.asService(() => t.db.query(`select public.publisher_fail($1, 'facebook', 'x')`, [postId]))).rejects.toThrow(/was not being sent/);
  });
});

describe('moving a post', () => {
  const when = (postId: string) => t.value<string>(`select to_char(scheduled_for at time zone 'America/New_York', 'YYYY-MM-DD HH24:MI') from public.posts where id = $1`, [postId]);

  it('gives a waiting post another time in the team’s zone, or sends it now', async () => {
    const { runId, variant } = await adSet();
    await approve(member, variant.A);
    const postId = await schedule(member, variant.A, [{ place: 'facebook' }, { place: 'linkedin' }], localIn(5));
    const later = localIn(24 * 7);
    await t.asUser(teammate, () => t.db.query(`select public.reschedule_post($1, $2)`, [postId, later]));
    expect(await when(postId)).toBe(later);
    expect((await events(runId)).at(-1)).toMatch(/^Variant A moved to \w{3} \d{1,2} \w{3}, \d{2}:\d{2}$/);
    expect(await takeDue()).toEqual([]);

    await t.asUser(member, () => t.db.query(`select public.reschedule_post($1)`, [postId]));
    expect((await takeDue()).map((d) => d.place)).toEqual(['facebook', 'linkedin']);
    expect((await events(runId)).at(-1)).toBe('Variant A sent now instead of at its time');
  });

  it('refuses a post that has started going out, and times it cannot take', async () => {
    const { variant } = await adSet();
    await approve(member, variant.B);
    const postId = await schedule(member, variant.B, [{ place: 'linkedin' }], localIn(5));
    await expect(t.asUser(member, () => t.db.query(`select public.reschedule_post($1, '2020-01-01 09:00')`, [postId]))).rejects.toThrow(/has not passed/);
    await expect(t.asUser(member, () => t.db.query(`select public.reschedule_post($1, '2099-01-01 09:00')`, [postId]))).rejects.toThrow(/90 days ahead/);
    await expect(t.asUser(member, () => t.db.query(`select public.reschedule_post($1, 'soon')`, [postId]))).rejects.toThrow(/not readable/);

    await t.asUser(member, () => t.db.query(`select public.reschedule_post($1)`, [postId]));
    await takeDue();
    await expect(t.asUser(member, () => t.db.query(`select public.reschedule_post($1, $2)`, [postId, localIn(8)]))).rejects.toThrow(/not started going out/);
    await t.asUser(outsider, () => expect(t.db.query(`select public.reschedule_post($1)`, [postId])).rejects.toThrow(/Only the QGR team/));
    await expect(t.asUser(member, () => t.db.query(`select public.reschedule_post($1)`, [uuid()]))).rejects.toThrow(/no longer exists/);
  });
});

describe('post files in Storage', () => {
  it('lets a member upload only into their own folder, and remove only what no open post needs', async () => {
    const { variant } = await adSet();
    await approve(member, variant.A);
    await expect(upload(member, file(teammate))).rejects.toThrow(/row-level security/);
    const kept = file(member, 'mp4');
    await upload(member, kept);
    const postId = await schedule(member, variant.A, [{ place: 'facebook', media_path: kept, media_kind: 'video' }], localIn(2));
    const remove = (user: string, path: string) => t.asUser(user, () => t.value<number>(`with gone as (delete from storage.objects where bucket_id = 'post-media' and name = $1 returning 1) select count(*)::int from gone`, [path]));
    expect(await remove(teammate, kept)).toBe(0);
    await t.asUser(member, () => t.db.query(`select public.cancel_post($1)`, [postId]));
    expect(await remove(teammate, kept)).toBe(1);
    await t.asUser(outsider, async () => {
      expect(await t.value<number>(`select count(*)::int from storage.objects where bucket_id = 'post-media'`)).toBe(0);
    });
  });
});

describe('the Pages posts go to', () => {
  it('keeps them for the team, checks their shape, and clears one left empty', async () => {
    await t.asUser(member, () => t.db.query(`select public.update_publishing_settings('1234567890', 'Quantum Global', '17841400000000000', '@quantumglobal', '', '')`));
    expect(await t.value<string>('select instagram_username from public.team_settings')).toBe('quantumglobal');
    expect(await t.value<string | null>('select linkedin_org_id from public.team_settings')).toBeNull();
    await t.asUser(member, () => expect(t.db.query(`select public.update_publishing_settings('not-a-page', '', '', '', '', '')`)).rejects.toThrow(/facebook_page_id_check/));
    await t.asUser(outsider, () => expect(t.db.query(`select public.update_publishing_settings('', '', '', '', '', '')`)).rejects.toThrow(/Only the QGR team/));
  });
});
