// A/B tests: an ad set's variants posted to the same place, side by side. A
// test is any place two or more variants of one ad set went to, or are going
// to, for real. Every number comes from the platforms' counts (lib/results.ts),
// never from a model.
//
// A variant leads only when it is ahead of the next best by more than chance
// would explain at the reach both have had: a two-proportion z-test at 95%
// confidence on engagements per person reached, each variant having reached at
// least MIN_REACH people. Until then the test says how many people each would
// need to reach for the gap it shows to count, if the rates held: the reach
// threshold, computed from the rates themselves.

import { audience, engagements } from './results';
import type { Place, Post, Variant } from './types';

/** Below this many people the normal approximation the test leans on does not hold. */
export const MIN_REACH = 100;

/** 95% confidence, either way round. */
const Z = 1.96;

export interface TestArm {
  variantId: string;
  label: Variant['label'];
  angle: string;
  /** People reached (or views where a platform gives no reach), over the variant's posts here that have numbers. */
  reach: number;
  engagements: number;
  /** Engagements per person reached; null until a post of it here has numbers. */
  rate: number | null;
  /** Posts of it here that went out and have no numbers yet (they are read every six hours). */
  awaiting: number;
  /** When the next post of it here goes out, if one is still to go. */
  next: string | null;
  /** The newest picture of it that went, or goes, out here. */
  thumbnail?: string;
  /** The newest live post of it here. */
  url?: string;
}

export type Verdict =
  /** Ahead of the next best by more than chance would explain. */
  | { kind: 'leads'; leader: string; over: string; lift: number | null }
  /** A gap, but too small for the reach so far: each should reach about `needReach` people. */
  | { kind: 'too-early'; ahead: string; behind: string; needReach: number }
  /** The same rate so far: nothing to tell apart. */
  | { kind: 'even' }
  /** Fewer than two variants have numbers yet. */
  | { kind: 'waiting' };

export interface ABTest {
  adSetId: string;
  adSetTitle: string;
  place: Place;
  /** Best rate first; the variants without numbers after, by label. */
  arms: TestArm[];
  verdict: Verdict;
  /** The newest post in the test, for ordering. */
  latest: string;
}

/** A share of people, kept to what a proportion can be: a post can have more engagements than people. */
const share = (arm: TestArm) => Math.min(arm.engagements, arm.reach) / arm.reach;

/** Whether the best variant leads, and if not, what it would take to tell. */
export function verdictOf(arms: readonly TestArm[]): Verdict {
  const measured = arms.filter((a) => a.rate !== null && a.reach > 0).sort((a, b) => share(b) - share(a));
  if (measured.length < 2) return { kind: 'waiting' };
  const [best, next] = measured as [TestArm, TestArm];
  const p1 = share(best);
  const p2 = share(next);
  if (p1 === p2) return { kind: 'even' };
  const pooled = (p1 * best.reach + p2 * next.reach) / (best.reach + next.reach);
  const z = (p1 - p2) / Math.sqrt(pooled * (1 - pooled) * (1 / best.reach + 1 / next.reach));
  if (z >= Z && best.reach >= MIN_REACH && next.reach >= MIN_REACH) {
    return { kind: 'leads', leader: best.variantId, over: next.variantId, lift: p2 > 0 ? p1 / p2 - 1 : null };
  }
  // The reach each would need, with these rates, for the gap to clear the test.
  const need = Math.ceil((2 * Z * Z * pooled * (1 - pooled)) / (p1 - p2) ** 2);
  return { kind: 'too-early', ahead: best.variantId, behind: next.variantId, needReach: Math.max(MIN_REACH, need) };
}

/** Every place two or more variants of one ad set went, or go, to for real; the newest first. */
export function abTests(posts: readonly Post[]): ABTest[] {
  const groups = new Map<string, { adSetId: string; adSetTitle: string; place: Place; latest: string; arms: Map<string, TestArm & { seen: string }> }>();
  for (const post of posts) {
    for (const t of post.targets) {
      // Only what went, or goes, out for real: a stand-in posted nothing, and a failed or cancelled place nothing either.
      const out = t.status === 'posted' && !t.standIn;
      const toGo = t.status === 'scheduled' || t.status === 'posting';
      if (!out && !toGo) continue;
      const key = `${post.adSetId}|${t.place}`;
      const at = t.postedAt ?? post.scheduledFor;
      const group = groups.get(key) ?? { adSetId: post.adSetId, adSetTitle: post.adSetTitle, place: t.place, latest: at, arms: new Map() };
      if (at > group.latest) group.latest = at;
      const arm = group.arms.get(post.variantId) ?? {
        variantId: post.variantId,
        label: post.variantLabel,
        angle: post.angle,
        reach: 0,
        engagements: 0,
        rate: null,
        awaiting: 0,
        next: null,
        seen: '',
      };
      if (out) {
        const base = t.results ? audience(t.results) : null;
        if (t.results && base !== null && base > 0) {
          arm.reach += base;
          arm.engagements += engagements(t.results);
        } else {
          arm.awaiting += 1;
        }
      } else if (arm.next === null || post.scheduledFor < arm.next) {
        arm.next = post.scheduledFor;
      }
      if (at >= arm.seen) {
        arm.seen = at;
        if (post.thumbnail) arm.thumbnail = post.thumbnail;
        if (out && t.url) arm.url = t.url;
      }
      group.arms.set(post.variantId, arm);
      groups.set(key, group);
    }
  }
  return [...groups.values()]
    .filter((g) => g.arms.size >= 2)
    .map((g) => {
      const arms = [...g.arms.values()].map(({ seen: _seen, ...arm }) => ({ ...arm, rate: arm.reach > 0 ? arm.engagements / arm.reach : null }));
      arms.sort((a, b) => (b.rate ?? -1) - (a.rate ?? -1) || a.label.localeCompare(b.label));
      return { adSetId: g.adSetId, adSetTitle: g.adSetTitle, place: g.place, arms, verdict: verdictOf(arms), latest: g.latest };
    })
    .sort((a, b) => b.latest.localeCompare(a.latest) || a.place.localeCompare(b.place));
}

/** `88,000`, `2,400`, `350`: the reach a test needs, as near as it is worth saying. */
export function roughCount(n: number): number {
  if (n < 1000) return Math.ceil(n / 10) * 10;
  const unit = 10 ** (Math.floor(Math.log10(n)) - 1);
  return Math.ceil(n / unit) * unit;
}
