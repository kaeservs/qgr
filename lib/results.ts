// How posts did, from the numbers each platform gave. Every rate is computed
// here from those counts, never by a model; the strategist's code computes the
// same rate (n8n/code/strategist-build-request.js), and n8n/code.test.ts keeps
// the two in step.

import type { Place, Post, PostResults } from './types';

/** Everything people did with a post: reactions, comments, shares and clicks. */
export const engagements = (r: PostResults) => (r.reactions ?? 0) + (r.comments ?? 0) + (r.shares ?? 0) + (r.clicks ?? 0);

/** The people a post reached; views where a platform gives no reach. */
export const audience = (r: PostResults) => r.reach ?? r.views;

/** Engagements per person reached (or per view); null when there is neither. */
export function engagementRate(r: PostResults): number | null {
  const base = audience(r);
  return base !== null && base > 0 ? engagements(r) / base : null;
}

/** One angle's posts added up: places that went out for real and have numbers. */
export interface AngleResults {
  angle: string;
  /** Places measured: a post to Facebook and LinkedIn counts twice. */
  places: number;
  reach: number;
  engagements: number;
  rate: number | null;
  /** The place it did best on. */
  best: Place | null;
}

/** Every measured place, newest first, with the post it belongs to. */
export function measured(posts: readonly Post[]): { post: Post; place: Place; results: PostResults }[] {
  return posts
    .flatMap((post) => post.targets.flatMap((t) => (t.results && audience(t.results) !== null ? [{ post, place: t.place, results: t.results, at: t.postedAt ?? post.scheduledFor }] : [])))
    .sort((a, b) => b.at.localeCompare(a.at))
    .map(({ post, place, results }) => ({ post, place, results }));
}

/** The angles posts were written to, best engagement first. */
export function resultsByAngle(posts: readonly Post[]): AngleResults[] {
  const by = new Map<string, { places: number; reach: number; engagements: number; best: { place: Place; rate: number } | null }>();
  for (const { post, place, results } of measured(posts)) {
    const key = post.angle;
    const sum = by.get(key) ?? { places: 0, reach: 0, engagements: 0, best: null };
    const rate = engagementRate(results);
    sum.places += 1;
    sum.reach += audience(results) ?? 0;
    sum.engagements += engagements(results);
    if (rate !== null && (!sum.best || rate > sum.best.rate)) sum.best = { place, rate };
    by.set(key, sum);
  }
  return [...by]
    .map(([angle, s]) => ({ angle, places: s.places, reach: s.reach, engagements: s.engagements, rate: s.reach > 0 ? s.engagements / s.reach : null, best: s.best?.place ?? null }))
    .sort((a, b) => (b.rate ?? -1) - (a.rate ?? -1) || b.reach - a.reach);
}

/** `1,240` and `12,400`: grouped by hand, so the server and every browser write it the same. */
export function formatCount(n: number): string {
  const whole = String(Math.round(Math.abs(n)));
  return `${n < 0 ? '-' : ''}${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
}

/** `4.1%`. Under one in a thousand reads `<0.1%`, so a rate never looks like nothing happened when something did. */
export function formatRate(rate: number): string {
  if (rate > 0 && rate < 0.001) return '<0.1%';
  return `${(Math.round(rate * 1000) / 10).toFixed(1)}%`;
}
