import { describe, expect, it } from 'vitest';
import { cancellable, monthGrid, movable, postsByDay, postState, shiftMonth } from './posts';
import type { Post, PostTarget } from './types';

const target = (status: PostTarget['status'], place: PostTarget['place'] = 'facebook'): PostTarget => ({ place, text: 'Words', media: 'image', status, standIn: false });
const post = (id: string, scheduledFor: string, ...targets: PostTarget[]): Post => ({
  id,
  variantId: 'v',
  variantLabel: 'A',
  adSetId: 'a',
  adSetTitle: 'Set',
  scheduledFor,
  createdAt: scheduledFor,
  targets,
});

describe('a post in one word', () => {
  it('puts a place that needs a look first, then one still to go', () => {
    expect(postState(post('p', '2026-10-08T13:00:00Z', target('posted'), target('failed', 'linkedin')))).toBe('look');
    expect(postState(post('p', '2026-10-08T13:00:00Z', target('posted'), target('unknown', 'linkedin')))).toBe('look');
    expect(postState(post('p', '2026-10-08T13:00:00Z', target('posted'), target('posting', 'linkedin')))).toBe('waiting');
    expect(postState(post('p', '2026-10-08T13:00:00Z', target('posted'), target('cancelled', 'linkedin')))).toBe('sent');
    expect(postState(post('p', '2026-10-08T13:00:00Z', target('cancelled'), target('cancelled', 'linkedin')))).toBe('cancelled');
  });

  it('moves only what has not started going out, and cancels what is still open', () => {
    expect(movable(post('p', '2026-10-08T13:00:00Z', target('scheduled'), target('scheduled', 'linkedin')))).toBe(true);
    expect(movable(post('p', '2026-10-08T13:00:00Z', target('scheduled'), target('posting', 'linkedin')))).toBe(false);
    expect(movable(post('p', '2026-10-08T13:00:00Z'))).toBe(false);
    expect(cancellable(post('p', '2026-10-08T13:00:00Z', target('posted'), target('failed', 'linkedin')))).toBe(true);
    expect(cancellable(post('p', '2026-10-08T13:00:00Z', target('posted'), target('posting', 'linkedin')))).toBe(false);
  });
});

describe('the calendar', () => {
  it('files posts under the day they go out in the team’s zone, earliest first, without the cancelled ones', () => {
    const late = post('late', '2026-10-09T01:30:00Z', target('scheduled'));
    const early = post('early', '2026-10-08T13:00:00Z', target('posted'));
    const gone = post('gone', '2026-10-08T15:00:00Z', target('cancelled'));
    // 01:30 UTC on the 9th is 21:30 on the 8th in New York.
    expect([...postsByDay([late, gone, early], 'America/New_York')].map(([day, list]) => [day, list.map((p) => p.id)])).toEqual([['2026-10-08', ['early', 'late']]]);
    expect([...postsByDay([late, early], 'UTC')].map(([day]) => day)).toEqual(['2026-10-08', '2026-10-09']);
  });

  it('lays a month out in weeks from Monday', () => {
    const october = monthGrid('2026-10');
    expect(october).toHaveLength(5);
    expect(october[0]).toEqual(['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04']);
    expect(october.at(-1)?.at(-1)).toBe('2026-11-01');
    // February 2027 starts on a Monday and fills four weeks exactly.
    expect(monthGrid('2027-02')).toHaveLength(4);
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
  });
});
