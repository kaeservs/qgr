import { describe, expect, it } from 'vitest';
import { abTests, MIN_REACH, roughCount, verdictOf } from './ab-tests';
import type { TestArm } from './ab-tests';
import { posts } from './mock-data';
import type { Post } from './types';

const arm = (variantId: string, reach: number, engagements: number): TestArm => ({
  variantId,
  label: variantId.toUpperCase() as TestArm['label'],
  angle: 'angle',
  reach,
  engagements,
  rate: reach > 0 ? engagements / reach : null,
  awaiting: 0,
  next: null,
});

describe('who leads a test', () => {
  it('marks a leader only when it is ahead by more than chance would explain', () => {
    // 8.2% of 940 people against 3.0% of 2,600: far past chance.
    expect(verdictOf([arm('a', 940, 77), arm('b', 2600, 78)])).toEqual({ kind: 'leads', leader: 'a', over: 'b', lift: expect.closeTo(1.7305, 3) });
    // 7.2% against 7.0%: a gap that size needs about 88,000 people each before it counts.
    const close = verdictOf([arm('a', 1860, 134), arm('b', 2240, 156)]);
    expect(close).toMatchObject({ kind: 'too-early', ahead: 'a', behind: 'b' });
    expect(close.kind === 'too-early' && roughCount(close.needReach)).toBe(88_000);
  });

  it('waits for the reach the test leans on, however wide the gap', () => {
    // 30% against 5%, but of 60 people: the normal approximation does not hold yet.
    expect(verdictOf([arm('a', 60, 18), arm('b', 60, 3)])).toEqual({ kind: 'too-early', ahead: 'a', behind: 'b', needReach: MIN_REACH });
    expect(verdictOf([arm('a', 6000, 1800), arm('b', 6000, 300)])).toMatchObject({ kind: 'leads', leader: 'a' });
  });

  it('compares the best with the next best, and says when there is nothing to compare', () => {
    // C is behind both: A against B decides it.
    expect(verdictOf([arm('c', 5000, 50), arm('a', 5000, 400), arm('b', 5000, 390)])).toMatchObject({ kind: 'too-early', ahead: 'a', behind: 'b' });
    expect(verdictOf([arm('a', 500, 20), arm('b', 800, 32)])).toEqual({ kind: 'even' });
    expect(verdictOf([arm('a', 500, 0), arm('b', 800, 0)])).toEqual({ kind: 'even' });
    expect(verdictOf([arm('a', 500, 20), arm('b', 0, 0)])).toEqual({ kind: 'waiting' });
    // A post can have more engagements than people: it counts as everyone engaged.
    expect(verdictOf([arm('a', 200, 260), arm('b', 200, 20)])).toMatchObject({ kind: 'leads', leader: 'a', lift: 9 });
  });

  it('says the reach a test needs as near as it is worth saying', () => {
    expect(roughCount(87_665)).toBe(88_000);
    expect(roughCount(2_301)).toBe(2_400);
    expect(roughCount(1_000)).toBe(1_000);
    expect(roughCount(343)).toBe(350);
    expect(roughCount(100)).toBe(100);
  });
});

describe('the tests in the posts', () => {
  it('finds every place two variants of one ad set went, or go, to for real', () => {
    const tests = abTests(posts);
    expect(tests.map((t) => `${t.adSetId}:${t.place}:${t.verdict.kind}`)).toEqual(['a-northstar:facebook:too-early', 'a-northstar:instagram:waiting', 'a-northstar:linkedin:leads']);
    const [facebook, instagram, linkedin] = tests;
    // Facebook: A's numbers, and another post of A on its way.
    expect(facebook!.arms.map((a) => [a.label, a.reach, a.engagements, a.next])).toEqual([
      ['A', 1860, 134, '2026-10-08T13:00:00Z'],
      ['B', 2240, 156, null],
    ]);
    // Instagram: B measured, A still to go out.
    expect(instagram!.arms.map((a) => [a.label, a.rate === null ? null : Number(a.rate.toFixed(4)), a.next])).toEqual([
      ['B', 0.0587, null],
      ['A', null, '2026-10-08T13:00:00Z'],
    ]);
    expect(linkedin!.verdict).toMatchObject({ kind: 'leads', leader: 'v-ns-a', over: 'v-ns-b' });
    // The podcast went to LinkedIn with one variant only: no test.
    expect(tests.some((t) => t.adSetId === 'a-podcast')).toBe(false);
  });

  it('leaves out what went through a stand-in, failed or was cancelled, and counts what is still to read', () => {
    const post = (id: string, variantId: string, target: Partial<Post['targets'][number]>): Post => ({
      id,
      variantId,
      variantLabel: variantId === 'v1' ? 'A' : 'B',
      adSetId: 's1',
      adSetTitle: 'Set',
      angle: 'angle',
      scheduledFor: '2026-10-01T10:00:00Z',
      createdAt: '2026-09-30T10:00:00Z',
      targets: [{ place: 'facebook', text: 'words', media: 'image', status: 'posted', postedAt: '2026-10-01T10:00:05Z', standIn: false, ...target }],
    });
    expect(abTests([post('p1', 'v1', {}), post('p2', 'v2', { standIn: true })])).toEqual([]);
    expect(abTests([post('p1', 'v1', {}), post('p2', 'v2', { status: 'failed' })])).toEqual([]);
    expect(abTests([post('p1', 'v1', {}), post('p2', 'v2', { status: 'cancelled' })])).toEqual([]);
    const [test] = abTests([post('p1', 'v1', { url: 'https://www.facebook.com/1_2' }), post('p2', 'v2', {})]);
    expect(test!.verdict).toEqual({ kind: 'waiting' });
    expect(test!.arms.map((a) => [a.label, a.awaiting, a.url])).toEqual([
      ['A', 1, 'https://www.facebook.com/1_2'],
      ['B', 1, undefined],
    ]);
  });
});
