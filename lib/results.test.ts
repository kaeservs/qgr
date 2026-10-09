import { describe, expect, it } from 'vitest';
import { posts } from './mock-data';
import { engagementRate, engagements, formatCount, formatRate, measured, resultsByAngle } from './results';
import type { PostResults } from './types';

const r = (n: Partial<PostResults>): PostResults => ({ reach: null, views: null, reactions: null, comments: null, shares: null, clicks: null, at: '2026-10-07T06:00:00Z', ...n });

describe('a post’s numbers', () => {
  it('counts every engagement, and divides by the people reached', () => {
    expect(engagements(r({ reactions: 71, comments: 9, shares: 6, clicks: 48 }))).toBe(134);
    expect(engagementRate(r({ reach: 1860, reactions: 71, comments: 9, shares: 6, clicks: 48 }))).toBeCloseTo(0.072, 3);
    // Without a reach, per view; with neither, no rate at all.
    expect(engagementRate(r({ views: 1000, reactions: 50 }))).toBe(0.05);
    expect(engagementRate(r({ reactions: 50 }))).toBeNull();
    expect(engagementRate(r({ reach: 0, reactions: 0 }))).toBeNull();
  });

  it('writes counts and rates the same everywhere', () => {
    expect(formatCount(1240)).toBe('1,240');
    expect(formatCount(1234567)).toBe('1,234,567');
    expect(formatCount(940)).toBe('940');
    expect(formatRate(0.0412)).toBe('4.1%');
    expect(formatRate(0.1)).toBe('10.0%');
    expect(formatRate(0)).toBe('0.0%');
    expect(formatRate(0.0004)).toBe('<0.1%');
  });
});

describe('what worked', () => {
  it('lists only places that went out for real and have numbers, newest first', () => {
    const list = measured(posts);
    expect(list.map((m) => `${m.post.id}:${m.place}`)).toEqual(['p-5:linkedin', 'p-4:instagram', 'p-4:facebook', 'p-3:linkedin', 'p-3:facebook']);
  });

  it('adds the places up by angle, best engagement first', () => {
    const angles = resultsByAngle(posts);
    expect(angles.map((a) => a.angle)).toEqual(['Off the treadmill', 'Live Q&A', 'Costs, plainly']);
    const live = angles.find((a) => a.angle === 'Live Q&A')!;
    expect(live).toMatchObject({ places: 2, reach: 2800, engagements: 211, best: 'linkedin' });
    expect(live.rate).toBeCloseTo(211 / 2800, 6);
    // Instagram gives no clicks for a feed post: what it gives still counts.
    expect(angles.find((a) => a.angle === 'Costs, plainly')).toMatchObject({ places: 2, reach: 5360, engagements: 339, best: 'facebook' });
  });
});
