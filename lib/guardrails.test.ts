import { describe, expect, it } from 'vitest';
import { copyPlatforms, describeWarning, guardrailWarnings, videoWarnings } from './guardrails';

const copy = (text: string) => ({ meta: { text, headline: 'H', description: 'D', cta: 'Book now' }, x: { text, headline: 'H' } });

describe('guardrailWarnings', () => {
  it('passes clean copy', () => {
    expect(guardrailWarnings('Plan with care.', copy('Talk to an advisor about your options.'), ['meta', 'x'])).toEqual([]);
  });

  it('flags each risky phrase where it appears, platform by platform', () => {
    expect(guardrailWarnings('Risk-free residency', copy('Your green card, guaranteed in 6 months.'), ['meta', 'x'])).toEqual([
      'meta text says "guarantee"',
      'meta text promises a timeline',
      'x text says "guarantee"',
      'x text promises a timeline',
      'image text says "risk-free"',
    ]);
  });

  it('flags "US" for "U.S.", but not "US$"', () => {
    expect(guardrailWarnings('Your US future', copy('From US$800,000, in the U.S.'), ['meta'])).toEqual(['image text writes "US" for "U.S."']);
  });

  it('flags the team’s phrases (Brand memory) whole, in any case, with either apostrophe, after the fixed checks', () => {
    const phrases = ['investment with risk', 'turned down', 'before it reaches you', "shouldn't", "doesn't depend", 'not pressure', 'uncertainty', 'QGR'];
    const posts = { facebook: 'Decide with clarity, not pressure. Every project checked before it reaches you.', instagram: 'The uncertainty ends here. Your plans shouldn’t hang on one employer.' };
    expect(guardrailWarnings('A path that doesn’t depend on one employer', copy('EB-5 is an Investment With Risk. QGR guarantees nothing.'), ['meta'], posts, phrases)).toEqual([
      'meta text says "guarantee"',
      'meta text says "investment with risk"',
      'meta text says "QGR"',
      'image text says "doesn\'t depend"',
      'facebook post says "before it reaches you"',
      'facebook post says "not pressure"',
      'instagram post says "shouldn\'t"',
      'instagram post says "uncertainty"',
    ]);
    // Whole words only: "QGRs" or "turned downtown" are not the phrase.
    expect(guardrailWarnings('Turned downtown', copy('QGRs'), ['meta'], {}, phrases)).toEqual([]);
    // Without phrases, only the fixed checks.
    expect(guardrailWarnings('A path that doesn’t depend on one employer', copy('Plan it.'), ['meta'], posts)).toEqual([]);
  });

  it('holds X to its hard limit and nothing else to a length', () => {
    expect(guardrailWarnings('Fine', copy('a'.repeat(281)), ['meta', 'x'])).toEqual(['x text is 281 characters; X allows 280']);
  });

  it('checks only the platforms asked for', () => {
    expect(guardrailWarnings('Fine', copy('100% approval'), ['meta'])).toEqual(['meta text says "100%"']);
  });

  it('flags the posts after everything else, and holds Instagram to what it takes', () => {
    const posts = {
      facebook: 'Approval guaranteed.',
      instagram: `${'a'.repeat(2190)} ${Array.from({ length: 31 }, (_, i) => `#tag${i}`).join(' ')}`,
      linkedin: 'Plan with care.',
    };
    expect(guardrailWarnings('Risk-free', copy('Fine.'), ['meta', 'x'], posts)).toEqual([
      'image text says "risk-free"',
      'facebook post says "guarantee"',
      `instagram post is ${posts.instagram.length} characters; Instagram allows 2,200`,
      'instagram post has 31 hashtags; Instagram allows 30',
    ]);
  });
});

describe('copyPlatforms', () => {
  it('lists the platforms present, in the dashboard order', () => {
    expect(copyPlatforms({ x: { text: 't', headline: 'h' }, meta: { text: 't', headline: 'h' } })).toEqual(['meta', 'x']);
  });
});

describe('describeWarning', () => {
  it('reads like a sentence', () => {
    expect(describeWarning('meta text says "guarantee"')).toBe('Meta text says “guarantee”');
    expect(describeWarning('linkedin headline promises a timeline')).toBe('LinkedIn headline promises a timeline');
    expect(describeWarning('image text says "risk-free"')).toBe('Image text says “risk-free”');
    expect(describeWarning('x text is 290 characters; X allows 280')).toBe('X text is 290 characters; X allows 280');
    expect(describeWarning('instagram post has 31 hashtags; Instagram allows 30')).toBe('Instagram post has 31 hashtags; Instagram allows 30');
    expect(describeWarning('linkedin post says "100%"')).toBe('LinkedIn post says “100%”');
  });
});

describe('videoWarnings', () => {
  it('flags the words a video adds: its captions and its end card', () => {
    const edit = { captions: [{ text: 'Plain answers.' }, { text: 'Approval guaranteed in 6 months.' }], endCard: { text: 'Risk-free consultation' } };
    expect(videoWarnings(edit)).toEqual(['a caption says "guarantee"', 'end card says "risk-free"', 'a caption promises a timeline']);
    expect(describeWarning('a caption says "guarantee"')).toBe('A caption says “guarantee”');
    expect(videoWarnings({ captions: [], endCard: null })).toEqual([]);
    expect(
      videoWarnings({ captions: [], endCard: null, overlays: [{ text: 'Guaranteed return' }], sequence: [{ kind: 'clip' }, { kind: 'title', text: 'Green card in 6 months', subtext: '' }] }),
    ).toEqual(['a text on the video says "guarantee"', 'a title card promises a timeline']);
    expect(videoWarnings(undefined)).toEqual([]);
  });
});
