import { describe, expect, it } from 'vitest';
import { cancellable, deletePostQuestion, deleteRunQuestion, deleteWarnings, monthGrid, movable, postsByDay, postState, shiftMonth } from './posts';
import type { Post, PostTarget } from './types';

const target = (status: PostTarget['status'], place: PostTarget['place'] = 'facebook'): PostTarget => ({ place, text: 'Words', media: 'image', status, standIn: false });
const post = (id: string, scheduledFor: string, ...targets: PostTarget[]): Post => ({
  id,
  variantId: 'v',
  variantLabel: 'A',
  adSetId: 'a',
  adSetTitle: 'Set',
  angle: 'Plain answers',
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

describe('asking before a post or a run is deleted', () => {
  const zone = 'Asia/Dubai';

  it('says when and where a scheduled post was to go out, and that deleting cancels it', () => {
    const p = post('p', '2026-10-24T06:00:00Z', target('scheduled'), target('scheduled', 'linkedin'));
    expect(deleteWarnings(p, zone)).toEqual(['Scheduled for Sat 24 Oct, 10:00 on Facebook and LinkedIn: deleting cancels it.']);
    expect(deletePostQuestion(p, zone)).toBe('Delete the post of variant A of “Set”?\n\nScheduled for Sat 24 Oct, 10:00 on Facebook and LinkedIn: deleting cancels it.');
  });

  it('says a real post stays on its platform, and leaves a stand-in and a cancelled place unsaid', () => {
    const p = post('p', '2026-10-20T06:00:00Z', target('posted'), { ...target('posted', 'instagram'), standIn: true }, target('cancelled', 'linkedin'), target('unknown', 'linkedin'));
    expect(deleteWarnings(p, zone)).toEqual([
      'Already posted on Facebook: it stays there. Delete it on the platform too if you want it gone.',
      'May have gone out on LinkedIn: check there, since deleting here does not take it down.',
    ]);
    expect(deleteWarnings(post('q', '2026-10-20T06:00:00Z', target('cancelled')), zone)).toEqual([]);
    expect(deleteWarnings(post('r', '2026-10-20T06:00:00Z', target('posting')), zone)).toEqual(['Going out on Facebook right now: wait for it to finish before deleting.']);
  });

  it('lists every post of a run, by variant, under what goes with it', () => {
    const scheduled = post('p', '2026-10-24T06:00:00Z', target('scheduled', 'instagram'));
    const sent = { ...post('q', '2026-10-20T06:00:00Z', target('posted', 'linkedin')), variantLabel: 'B' as const };
    expect(deleteRunQuestion('Q4 push', [scheduled, sent], zone).split('\n\n')).toEqual([
      'Delete the run “Q4 push”? Its strategy and ads go with it, and it leaves the dashboard.',
      'It has 2 posts, deleted with it.',
      'Variant A: Scheduled for Sat 24 Oct, 10:00 on Instagram: deleting cancels it.',
      'Variant B: Already posted on LinkedIn: it stays there. Delete it on the platform too if you want it gone.',
    ]);
    expect(deleteRunQuestion('Empty', [], zone)).toBe('Delete the run “Empty”? Its strategy and ads go with it, and it leaves the dashboard.');
  });
});
