// What a post's places add up to, for the Posts list and the two calendars.
// Pure, so the list, the calendars and the tests agree.

import { dayInZone, formatInZone } from './schedule';
import type { Place, Post, PostTarget } from './types';

/** One word for a post: a place that needs a look wins, then one still to go, then what went out. */
export type PostState = 'look' | 'waiting' | 'sent' | 'cancelled';

export function postState(post: Post): PostState {
  if (post.targets.some((t) => t.status === 'failed' || t.status === 'unknown')) return 'look';
  if (post.targets.some((t) => t.status === 'scheduled' || t.status === 'posting')) return 'waiting';
  if (post.targets.every((t) => t.status === 'cancelled')) return 'cancelled';
  return 'sent';
}

/** Only a post none of whose places has started going out can be moved (`reschedule_post`). */
export const movable = (post: Post) => post.targets.length > 0 && post.targets.every((t) => t.status === 'scheduled');

/** Something on it can still be cancelled, or dismissed if it failed. */
export const cancellable = (post: Post) => post.targets.some((t) => t.status === 'scheduled' || t.status === 'failed' || t.status === 'unknown');

/**
 * Posts by the day they go out in the team's zone (`YYYY-MM-DD`), earliest
 * first within a day. Cancelled posts are left out: the calendar is what goes
 * out, and the list keeps the rest.
 */
export function postsByDay(posts: readonly Post[], zone: string): Map<string, Post[]> {
  const days = new Map<string, Post[]>();
  for (const post of [...posts].sort((a, b) => a.scheduledFor.localeCompare(b.scheduledFor))) {
    if (postState(post) === 'cancelled') continue;
    const day = dayInZone(post.scheduledFor, zone);
    days.set(day, [...(days.get(day) ?? []), post]);
  }
  return days;
}

/**
 * The weeks of a month, Monday first, padded with the neighbouring months'
 * days. `month` is `YYYY-MM`; each day is `YYYY-MM-DD`, a wall date with no
 * zone of its own.
 */
export function monthGrid(month: string): string[][] {
  const [year = 1970, m = 1] = month.split('-').map(Number);
  const first = new Date(Date.UTC(year, m - 1, 1));
  const offset = (first.getUTCDay() + 6) % 7;
  const daysInMonth = new Date(Date.UTC(year, m, 0)).getUTCDate();
  const weeks = Math.ceil((offset + daysInMonth) / 7);
  return Array.from({ length: weeks }, (_, w) =>
    Array.from({ length: 7 }, (_, d) => new Date(Date.UTC(year, m - 1, 1 - offset + w * 7 + d)).toISOString().slice(0, 10)),
  );
}

/** `YYYY-MM` moved by whole months. */
export function shiftMonth(month: string, by: number): string {
  const [year = 1970, m = 1] = month.split('-').map(Number);
  return new Date(Date.UTC(year, m - 1 + by, 1)).toISOString().slice(0, 7);
}

const PLACE_NAME: Record<Place, string> = { facebook: 'Facebook', instagram: 'Instagram', linkedin: 'LinkedIn' };

function placesSaid(targets: readonly PostTarget[]): string {
  const names = targets.map((t) => PLACE_NAME[t.place]);
  return names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/**
 * What deleting a post would do to its places, said before a person confirms:
 * what is still to go out and when (it is cancelled), what is going out now
 * (the database refuses), and what went out for real, which stays on the
 * platform. A stand-in posted nothing, so it needs no word.
 */
export function deleteWarnings(post: Post, zone: string): string[] {
  const by = (status: PostTarget['status']) => post.targets.filter((t) => t.status === status);
  const lines: string[] = [];
  const scheduled = by('scheduled');
  if (scheduled.length > 0) lines.push(`Scheduled for ${formatInZone(post.scheduledFor, zone)} on ${placesSaid(scheduled)}: deleting cancels it.`);
  const posting = by('posting');
  if (posting.length > 0) lines.push(`Going out on ${placesSaid(posting)} right now: wait for it to finish before deleting.`);
  const posted = by('posted').filter((t) => !t.standIn);
  if (posted.length > 0) lines.push(`Already posted on ${placesSaid(posted)}: it stays there. Delete it on the platform too if you want it gone.`);
  const unknown = by('unknown');
  if (unknown.length > 0) lines.push(`May have gone out on ${placesSaid(unknown)}: check there, since deleting here does not take it down.`);
  return lines;
}

/** The question a post's Delete asks first. */
export function deletePostQuestion(post: Post, zone: string): string {
  return [`Delete the post of variant ${post.variantLabel} of “${post.adSetTitle}”?`, ...deleteWarnings(post, zone)].join('\n\n');
}

/** The question a run's Delete asks first: what goes with it, and every post of it still to go out or already out. */
export function deleteRunQuestion(title: string, posts: readonly Post[], zone: string): string {
  const lines = [`Delete the run “${title}”? Its strategy and ads go with it, and it leaves the dashboard.`];
  if (posts.length > 0) lines.push(`It has ${posts.length === 1 ? '1 post' : `${posts.length} posts`}, deleted with it.`);
  for (const post of posts) for (const line of deleteWarnings(post, zone)) lines.push(`Variant ${post.variantLabel}: ${line}`);
  return lines.join('\n\n');
}
