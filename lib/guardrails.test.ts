import { describe, expect, it } from 'vitest';
import { copyPlatforms, describeWarning, guardrailWarnings } from './guardrails';

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

  it('holds X to its hard limit and nothing else to a length', () => {
    expect(guardrailWarnings('Fine', copy('a'.repeat(281)), ['meta', 'x'])).toEqual(['x text is 281 characters; X allows 280']);
  });

  it('checks only the platforms asked for', () => {
    expect(guardrailWarnings('Fine', copy('100% approval'), ['meta'])).toEqual(['meta text says "100%"']);
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
  });
});
