import { beforeAll, describe, expect, it } from 'vitest';
import { testDatabase } from '../test/supabase';
import type { TestDatabase } from '../test/supabase';

// Brand memory (what the team posts about, how it formats a post, how its
// pictures look, and posts that work) and the posts a variant carries in full:
// who may change them, what each agent is given, and what goes out.

let t: TestDatabase;
let member = '';
let outsider = '';

const EXCERPT = 'Plain words about EB-5 for families planning a move to the United States.';
const STRATEGY = {
  title: 'Memory check',
  positioning: 'Plain advice',
  audiences: ['Families'],
  angles: ['One', 'Two', 'Three'].map((name) => ({ name, why: 'w', hook: 'h', based_on_hook: null })),
  channels: [{ platform: 'meta', share: 60, role: 'r', format: 'f' }, { platform: 'linkedin', share: 40, role: 'r', format: 'f' }],
  guardrails: ['g'],
};
const copy = {
  meta: { text: 'Plan your EB-5 path with people who show their working.', headline: 'EB-5, mapped out', cta: 'Learn more' },
  linkedin: { text: 'Families on H-1B visas: plan EB-5 early.', headline: 'Plan early' },
};
const posts = {
  facebook: '  Planning a move as a family? Here is how EB-5 works, step by step.\n\nBook a free consultation.  ',
  instagram: 'Your family, your timeline, your questions.\n\n#EB5 #USResidency',
  linkedin: 'Most families we meet start with one question: where do we begin?',
};
const variant = (label: string, i: number, extra: Record<string, unknown> = {}) => ({ label, angle: STRATEGY.angles[i]!.name, creative_text: 'Plan with care', creative_style: 'arcs', image_prompt: '', copy, warnings: [], ...extra });

/** A custom run through the strategist, ready for the Content Agent. */
async function toContent(platforms = ['meta', 'linkedin']): Promise<string> {
  const runId = await t.asUser(member, () => t.value<string>(`select public.create_run('custom', 'text', 'Memory check', $2::text[], 'consultations', p_excerpt => $1)`, [EXCERPT, platforms]));
  await t.asService(async () => {
    await t.db.query(`select public.agent_begin($1, 'strategist')`, [runId]);
    await t.db.query(`select public.agent_finish_strategist($1, $2::jsonb)`, [runId, JSON.stringify({ ...STRATEGY, channels: STRATEGY.channels.filter((c) => platforms.includes(c.platform)) })]);
    await t.db.query(`select public.agent_begin($1, 'content')`, [runId]);
  });
  return runId;
}

const finishContent = (runId: string, variants: unknown[]) => t.asService(() => t.value<string>(`select public.agent_finish_content($1, $2::jsonb)`, [runId, JSON.stringify({ title: 'Memory check', variants })]));
const variantId = (runId: string, label: string) => t.value<string>(`select v.id from public.ad_variants v join public.ad_sets s on s.id = v.ad_set_id where s.run_id = $1 and v.label = $2`, [runId, label]);
const saveWords = (variant: string, words: Record<string, string>) =>
  t.asUser(member, () => t.db.query(`select public.save_variant_words($1, 'Plan with care', $2::jsonb, $3::jsonb, '{}')`, [variant, JSON.stringify(copy), JSON.stringify(words)]));

beforeAll(async () => {
  t = await testDatabase();
  member = await t.addUser('member@qgr.example', 'owner');
  outsider = await t.addUser('stranger@elsewhere.example');
}, 60_000);

describe('brand memory', () => {
  it('keeps what the team posts about, how it formats posts and how its pictures look, tidied', async () => {
    await t.asUser(member, () =>
      t.db.query(`select public.update_brand_memory(array[' EB-5 basics ', 'Family moves', 'EB-5 basics'], $1::jsonb, '  Warm light, families, indigo and gold.  ')`, [JSON.stringify({ instagram: '  Short lines, then 5 hashtags.  ', linkedin: 'A strong first line.' })]),
    );
    const brand = await t.value<{ topics: string[]; post_formats: Record<string, string>; picture_style: string }>(`select to_jsonb(b) from public.brand_profile b`);
    expect(brand.topics).toEqual(['EB-5 basics', 'Family moves']);
    expect(brand.post_formats).toEqual({ instagram: 'Short lines, then 5 hashtags.', linkedin: 'A strong first line.' });
    expect(brand.picture_style).toBe('Warm light, families, indigo and gold.');

    await t.asUser(member, async () => {
      await expect(t.db.query(`select public.update_brand_memory(array[$1], '{}'::jsonb, null)`, ['x'.repeat(301)])).rejects.toThrow(/Up to 40 topics/);
      await expect(t.db.query(`select public.update_brand_memory('{}', '{"tiktok": "Dance"}'::jsonb, null)`)).rejects.toThrow(/Format notes go by platform/);
      await expect(t.db.query(`select public.update_brand_memory('{}', '{}'::jsonb, $1)`, ['x'.repeat(4001)])).rejects.toThrow(/under 4,000/);
      // Well past what it once took: long notes, a long picture style, a long pasted post.
      await t.db.query(`select public.update_brand_memory(array[$1], jsonb_build_object('facebook', $2::text), $3)`, ['t'.repeat(300), 'f'.repeat(10000), 's'.repeat(4000)]);
      const long = await t.value<string>(`select public.add_brand_example('linkedin', $1, $2)`, ['p'.repeat(10000), 'n'.repeat(2000)]);
      await t.db.query(`select public.remove_brand_example($1)`, [long]);
      // Empty clears: no topics, no notes, no picture style.
      await t.db.query(`select public.update_brand_memory('{}', '{}'::jsonb, '  ')`);
    });
    expect(await t.value<string | null>('select picture_style from public.brand_profile')).toBeNull();
    await t.asUser(outsider, () => expect(t.db.query(`select public.update_brand_memory('{}', '{}'::jsonb, null)`)).rejects.toThrow(/Only the QGR team/));
  });

  it('starts with the rules the agents followed, keeps the team’s edits tidied, and hands them to every agent and every picture', async () => {
    type Rules = { copy_rules: string[]; picture_rules: string[]; video_rules: string[]; flag_phrases: string[] };
    const seeded = await t.value<Rules>(`select to_jsonb(b) from public.brand_profile b`);
    expect(seeded.copy_rules).toContain('Call the company Quantum Global (or Quantum Global Residency), never QGR.');
    expect(seeded.picture_rules[1]).toMatch(/^The people are Indian/);
    expect(seeded.video_rules).toContain('No flags.');
    expect(seeded.flag_phrases).toEqual(expect.arrayContaining(['QGR', "shouldn't", 'not pressure']));

    await t.asUser(member, () =>
      t.db.query(`select public.update_content_rules(array[' Write U.S. ', 'Speak to parents.'], array['The people are Indian.'], '{}', array['QGR', ' qgr ', 'act now'])`),
    );
    const saved = await t.value<Rules>(`select to_jsonb(b) from public.brand_profile b`);
    expect(saved.copy_rules).toEqual(['Write U.S.', 'Speak to parents.']);
    expect(saved.picture_rules).toEqual(['The people are Indian.']);
    expect(saved.video_rules).toEqual([]);
    // A phrase is kept once, whatever its case.
    expect(saved.flag_phrases).toHaveLength(2);
    expect(saved.flag_phrases).toEqual(expect.arrayContaining(['act now']));

    await t.asUser(member, async () => {
      await expect(t.db.query(`select public.update_content_rules(array[$1], '{}', '{}', '{}')`, ['x'.repeat(1001)])).rejects.toThrow(/Up to 30 rules/);
      await expect(t.db.query(`select public.update_content_rules('{}', '{}', '{}', array['x'])`)).rejects.toThrow(/phrases to flag/);
    });
    await t.asUser(outsider, () => expect(t.db.query(`select public.update_content_rules('{}', '{}', '{}', '{}')`)).rejects.toThrow(/Only the QGR team/));

    // Every agent is given them with the brand.
    const runId = await t.asUser(member, () => t.value<string>(`select public.create_run('custom', 'text', 'Rules check', array['meta'], 'consultations', p_excerpt => $1)`, [EXCERPT]));
    const begun = await t.asService(() => t.value<{ brand: Rules }>(`select public.agent_begin($1, 'strategist')`, [runId]));
    expect(begun.brand.copy_rules).toEqual(['Write U.S.', 'Speak to parents.']);
    expect(begun.brand.flag_phrases).toEqual(expect.arrayContaining(['act now']));
  });

  it('keeps posts that work for the team, and gives every agent the memory', async () => {
    await t.asUser(member, () => t.db.query(`select public.update_brand_memory(array['Family moves'], '{"facebook": "Two short paragraphs."}'::jsonb, 'Warm light.')`));
    const pasted = await t.asUser(member, () => t.value<string>(`select public.add_brand_example('instagram', '  Three questions to ask before you pick a project.  ', ' Saved and shared a lot ')`));
    await t.asUser(member, async () => {
      await expect(t.db.query(`select public.add_brand_example('tiktok', 'x')`)).rejects.toThrow(/Facebook, Instagram, LinkedIn or X/);
      await expect(t.db.query(`select public.add_brand_example('x', '   ')`)).rejects.toThrow(/Paste the post/);
    });
    await t.asUser(outsider, async () => {
      await expect(t.db.query(`select public.add_brand_example('x', 'Mine')`)).rejects.toThrow(/Only the QGR team/);
      expect(await t.value<number>('select count(*)::int from public.brand_examples')).toBe(0);
    });

    const runId = await t.asUser(member, () => t.value<string>(`select public.create_run('competitor', 'website', 'h.example', array['meta'], 'consultations', p_url => 'https://h.example/')`));
    const begun = await t.asService(() => t.value<{ brand: { topics: string[]; post_formats: object; picture_style: string }; examples: Record<string, unknown>[]; results: unknown }>(`select public.agent_begin($1, 'tracker')`, [runId]));
    expect(begun.brand).toMatchObject({ topics: ['Family moves'], post_formats: { facebook: 'Two short paragraphs.' }, picture_style: 'Warm light.' });
    expect(begun.examples).toEqual([{ place: 'instagram', text: 'Three questions to ask before you pick a project.', note: 'Saved and shared a lot', source: 'pasted' }]);
    // How posts did goes to the strategist and the Content Agent, not the tracker.
    expect(begun.results).toBeNull();

    // Taken out, it is no longer the agents' to read.
    await t.asUser(member, () => t.db.query(`select public.remove_brand_example($1)`, [pasted]));
    await t.asUser(member, () => expect(t.db.query(`select public.remove_brand_example($1)`, [pasted])).rejects.toThrow(/not in brand memory/));
    const again = await t.asUser(member, () => t.value<string>(`select public.create_run('competitor', 'website', 'h.example', array['meta'], 'consultations', p_url => 'https://h.example/')`));
    expect((await t.asService(() => t.value<{ examples: unknown[] }>(`select public.agent_begin($1, 'tracker')`, [again]))).examples).toEqual([]);
  });

  it('keeps a post that went out, once, when the team says it worked', async () => {
    const runId = await toContent();
    await finishContent(runId, ['A', 'B', 'C'].map((l, i) => variant(l, i)));
    const a = await variantId(runId, 'A');
    await t.asUser(member, () => t.db.query(`select public.approve_variant($1)`, [a]));
    const postId = await t.asUser(member, () => t.value<string>(`select public.schedule_post($1, '[{"place": "linkedin"}]'::jsonb)`, [a]));
    await expect(t.asUser(member, () => t.db.query(`select public.remember_post($1, 'linkedin')`, [postId]))).rejects.toThrow(/Only a post that went out/);

    await t.asService(async () => {
      await t.db.query('select public.publisher_take_due()');
      await t.db.query(`select public.publisher_finish($1, 'linkedin', null, null, true)`, [postId]);
    });
    await t.asUser(member, () => t.db.query(`select public.remember_post($1, 'linkedin', 'Lots of comments')`, [postId]));
    expect(await t.value<Record<string, unknown>>(`select jsonb_build_object('place', place, 'text', text, 'note', note, 'source', source) from public.brand_examples where post_id = $1`, [postId])).toEqual({
      place: 'linkedin',
      text: copy.linkedin.text,
      note: 'Lots of comments',
      source: 'marked',
    });
    await t.asUser(member, () => expect(t.db.query(`select public.remember_post($1, 'linkedin')`, [postId])).rejects.toThrow(/already in brand memory/));
    await t.asUser(outsider, () => expect(t.db.query(`select public.remember_post($1, 'linkedin')`, [postId])).rejects.toThrow(/Only the QGR team/));

    // Taken out and marked again, it comes back with its note.
    const id = await t.value<string>(`select id from public.brand_examples where post_id = $1`, [postId]);
    await t.asUser(member, () => t.db.query(`select public.remove_brand_example($1)`, [id]));
    expect(await t.asUser(member, () => t.value<string>(`select public.remember_post($1, 'linkedin')`, [postId]))).toBe(id);
    expect(await t.value<string | null>(`select coalesce(note, '') || ' / ' || coalesce(removed_at::text, 'kept') from public.brand_examples where id = $1`, [id])).toBe('Lots of comments / kept');
  });
});

describe('posts written in full', () => {
  it('keeps the Content Agent’s posts for the places the run posts to, tidied', async () => {
    const runId = await toContent();
    await finishContent(runId, ['A', 'B', 'C'].map((l, i) => variant(l, i, { posts })));
    expect(await t.value<Record<string, string>>(`select v.posts from public.ad_variants v join public.ad_sets s on s.id = v.ad_set_id where s.run_id = $1 and v.label = 'A'`, [runId])).toEqual({
      facebook: posts.facebook.trim(),
      instagram: posts.instagram,
      linkedin: posts.linkedin,
    });

    // A run for Meta alone takes no LinkedIn post.
    const metaOnly = await toContent(['meta']);
    const metaCopy = { meta: copy.meta };
    await expect(finishContent(metaOnly, ['A', 'B', 'C'].map((l, i) => ({ ...variant(l, i, { posts }), copy: metaCopy })))).rejects.toThrow(/a place this run does not post to/);
    // Without posts (a Content Agent from before them) the ads still save.
    await finishContent(metaOnly, ['A', 'B', 'C'].map((l, i) => ({ ...variant(l, i), copy: metaCopy })));
    expect(await t.value<object>(`select v.posts from public.ad_variants v join public.ad_sets s on s.id = v.ad_set_id where s.run_id = $1 and v.label = 'B'`, [metaOnly])).toEqual({});
  });

  it('saves a person’s edit to the posts, taking the approval back, and only for the run’s places', async () => {
    const runId = await toContent(['meta']);
    await finishContent(runId, ['A', 'B', 'C'].map((l, i) => ({ ...variant(l, i, { posts: { facebook: posts.facebook } }), copy: { meta: copy.meta } })));
    const a = await variantId(runId, 'A');
    await t.asUser(member, () => t.db.query(`select public.approve_variant($1)`, [a]));
    const save = (words: Record<string, string>) =>
      t.asUser(member, () => t.db.query(`select public.save_variant_words($1, 'Plan with care', $2::jsonb, $3::jsonb, '{}')`, [a, JSON.stringify({ meta: copy.meta }), JSON.stringify(words)]));

    // The same words: nothing changes.
    await save({ facebook: posts.facebook });
    expect(await t.value<string | null>('select approved_at::text from public.ad_variants where id = $1', [a])).not.toBeNull();
    await save({ facebook: 'A shorter post.', instagram: 'A caption. #EB5' });
    expect(await t.value<object>('select posts from public.ad_variants where id = $1', [a])).toEqual({ facebook: 'A shorter post.', instagram: 'A caption. #EB5' });
    expect(await t.value<string | null>('select approved_at::text from public.ad_variants where id = $1', [a])).toBeNull();

    await expect(save({ linkedin: 'Not this run' })).rejects.toThrow(/a place this run does not post to/);
    await expect(save({ facebook: '   ' })).rejects.toThrow(/empty or over 3,000/);
    await expect(save({ facebook: 'x'.repeat(3001) })).rejects.toThrow(/empty or over 3,000/);
    await t.asUser(outsider, () => expect(t.db.query(`select public.save_variant_words($1, 'x', '{}'::jsonb, '{}'::jsonb, '{}')`, [a])).rejects.toThrow(/Only the QGR team/));
  });

  it('sends each place its post in full, and the ad copy where there is none', async () => {
    const runId = await toContent();
    await finishContent(runId, ['A', 'B', 'C'].map((l, i) => variant(l, i)));
    const a = await variantId(runId, 'A');
    await saveWords(a, { facebook: 'The Facebook post, in full.' });
    await t.asUser(member, () => t.db.query(`select public.approve_variant($1)`, [a]));
    const postId = await t.asUser(member, () => t.value<string>(`select public.schedule_post($1, '[{"place": "facebook"}, {"place": "linkedin"}]'::jsonb)`, [a]));
    const sent = await t.db.query<{ place: string; text: string }>(`select place, text from public.post_targets where post_id = $1 order by place`, [postId]);
    expect(sent.rows).toEqual([
      { place: 'facebook', text: 'The Facebook post, in full.' },
      { place: 'linkedin', text: copy.linkedin.text },
    ]);
  });

  it('shows the Content Agent how recent posts did, with their words', async () => {
    const runId = await toContent(['linkedin']);
    await finishContent(runId, ['A', 'B', 'C'].map((l, i) => ({ ...variant(l, i, { posts: { linkedin: 'The LinkedIn post that went out.' } }), copy: { linkedin: copy.linkedin } })));
    const b = await variantId(runId, 'B');
    await t.asUser(member, () => t.db.query(`select public.approve_variant($1)`, [b]));
    const postId = await t.asUser(member, () => t.value<string>(`select public.schedule_post($1, '[{"place": "linkedin"}]'::jsonb)`, [b]));
    await t.asService(async () => {
      await t.db.query('select public.publisher_take_due()');
      await t.db.query(`select public.publisher_finish($1, 'linkedin', 'li_1', null, false)`, [postId]);
      await t.db.query(`select public.results_record($1, 'linkedin', '{"reach": 900, "reactions": 30}'::jsonb)`, [postId]);
    });
    const next = await toContent(['linkedin']);
    const begun = await t.asService(() =>
      t.value<{ results: Record<string, unknown>[] }>(`select public.agent_begin($1, 'content') from (select public.agent_fail($1, 'content', 'again')) x`, [next]),
    );
    expect(begun.results[0]).toMatchObject({ place: 'linkedin', text: 'The LinkedIn post that went out.', reach: 900, reactions: 30 });
  });
});
