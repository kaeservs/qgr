import { describe, expect, it } from 'vitest';
import { adSignal, impressionsLow, bestPerformers, compact } from './competitor-signal';

describe('how well a competitor’s ad looks to be doing', () => {
  it('rates an ad that has run long, in many versions and places, as strong, saying why', () => {
    expect(adSignal({ daysRunning: 94, versions: 6, placements: ['facebook', 'instagram'], reactions: 1200, comments: 140 })).toEqual({
      level: 'strong',
      score: 4 + 2 + 1 + 2,
      reasons: ['94 days running', '6 versions', 'Facebook + Instagram', '1.2K reactions · 140 comments'],
    });
  });

  it('rates by the facts it has: a few signs are promising, one is little', () => {
    expect(adSignal({ daysRunning: 21, versions: 3, placements: ['facebook'] })).toMatchObject({ level: 'promising', score: 2 });
    expect(adSignal({ daysRunning: 20 })).toMatchObject({ level: 'little', score: 1 });
    // A screenshot's counts alone can carry it.
    expect(adSignal({ daysRunning: null, reactions: 2500, views: 40_000 })).toMatchObject({ level: 'promising', score: 3, reasons: ['2.5K reactions · 40K views'] });
  });

  it('says when an ad is too new to tell, stopped early, or shows nothing', () => {
    expect(adSignal({ daysRunning: 4, versions: 1 })).toMatchObject({ level: 'new', reasons: ['4 days running', '1 version'] });
    // Many copies in its first days already says something.
    expect(adSignal({ daysRunning: 4, versions: 8 })).toMatchObject({ level: 'promising' });
    expect(adSignal({ daysRunning: 9, active: false })).toMatchObject({ level: 'ended', reasons: ['Ran 9 days, now stopped'] });
    expect(adSignal({ daysRunning: null })).toEqual({ level: 'unknown', score: 0, reasons: [] });
    // Stopped, with no dates shown: it says so, and is not rated on days it may not have run.
    expect(adSignal({ daysRunning: null, active: false, versions: 3 })).toMatchObject({ level: 'little', reasons: ['Stopped', '3 versions'] });
  });

  it('puts their best performers first, leaving out what shows little', () => {
    const ads = [
      { id: 'old', daysRunning: 63, versions: 1 },
      { id: 'copied', daysRunning: 41, versions: 6, placements: ['facebook', 'instagram'] },
      { id: 'new', daysRunning: 3 },
      { id: 'little', daysRunning: 15 },
      { id: 'tie', daysRunning: 61 },
    ];
    expect(bestPerformers(ads).map((x) => x.ad.id)).toEqual(['copied', 'old', 'tie']);
  });

  it('writes counts short, the same everywhere', () => {
    expect([compact(347), compact(1200), compact(1000), compact(45_300), compact(2_340_000)]).toEqual(['347', '1.2K', '1K', '45K', '2.3M']);
  });

  it('reads LinkedIn’s impressions range by its low end, and says it as LinkedIn wrote it', () => {
    expect(impressionsLow('10k-20k')).toBe(10_000);
    expect(impressionsLow('<1k')).toBe(0);
    expect(impressionsLow('1M+')).toBe(1_000_000);
    expect(impressionsLow('200k-500k')).toBe(200_000);
    const big = adSignal({ daysRunning: 40, impressions: '200k-500k' });
    expect(big).toMatchObject({ level: 'strong', score: 4 });
    expect(big.reasons).toContain('200k–500k impressions on LinkedIn');
    expect(adSignal({ daysRunning: 3, impressions: '<1k' })).toMatchObject({ level: 'new', score: 0 });
  });
});
