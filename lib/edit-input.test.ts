import { describe, expect, it } from 'vitest';
import { isRecordId, parseBrandProfile, parseVariantEdit } from './edit-input';

describe('parseVariantEdit', () => {
  const copy = { meta: { text: ' Talk to an advisor. ', headline: 'Plan ahead', description: 'Free call', cta: 'Book now' }, x: { text: 'Plan ahead.', headline: 'EB-5' } };

  it('keeps the platforms sent, trimmed', () => {
    const parsed = parseVariantEdit({ creativeText: ' Plan with care ', copy });
    expect(parsed).toEqual({
      ok: true,
      value: {
        creativeText: 'Plan with care',
        copy: { meta: { text: 'Talk to an advisor.', headline: 'Plan ahead', description: 'Free call', cta: 'Book now' }, x: { text: 'Plan ahead.', headline: 'EB-5' } },
      },
    });
  });

  it('ignores fields and platforms it does not know', () => {
    const parsed = parseVariantEdit({ creativeText: 'Words', copy: { tiktok: { text: 't', headline: 'h' }, x: { text: 't', headline: 'h', image: 'evil' } } });
    expect(parsed).toEqual({ ok: true, value: { creativeText: 'Words', copy: { x: { text: 't', headline: 'h' } } } });
  });

  it('refuses empty or missing parts', () => {
    expect(parseVariantEdit({ creativeText: '  ', copy })).toMatchObject({ ok: false });
    expect(parseVariantEdit({ creativeText: 'Words', copy: { meta: { text: 't', headline: ' ' } } })).toMatchObject({ ok: false, error: 'Every ad needs its text and a headline.' });
    expect(parseVariantEdit({ creativeText: 'Words', copy: {} })).toMatchObject({ ok: false, error: 'The ad has no copy.' });
    expect(parseVariantEdit('nope')).toMatchObject({ ok: false });
  });

  it('refuses copy far past any platform’s length', () => {
    expect(parseVariantEdit({ creativeText: 'Words', copy: { x: { text: 'x'.repeat(3001), headline: 'h' } } })).toMatchObject({ ok: false });
    expect(parseVariantEdit({ creativeText: 'w'.repeat(121), copy })).toMatchObject({ ok: false });
  });
});

describe('parseBrandProfile', () => {
  const profile = {
    company: 'Quantum Global Residency',
    website: 'quantumglobalresidency.com',
    offer: 'EB-5 guidance',
    audience: 'Families',
    voice: ['Calm', 'Expert', 'Calm'],
    guardrails: ['Never promise an outcome', ' '],
    pageName: 'Quantum Global',
    xHandle: 'quantumglobal',
  };

  it('tidies the handle and the lists', () => {
    const parsed = parseBrandProfile(profile);
    expect(parsed).toMatchObject({ ok: true, value: { voice: ['Calm', 'Expert'], guardrails: ['Never promise an outcome'], xHandle: '@quantumglobal' } });
  });

  it('names the field that is missing', () => {
    expect(parseBrandProfile({ ...profile, offer: ' ' })).toEqual({ ok: false, error: 'Fill in what you offer.' });
    expect(parseBrandProfile({ ...profile, voice: [] })).toMatchObject({ ok: false });
    expect(parseBrandProfile({ ...profile, xHandle: '@not a handle' })).toMatchObject({ ok: false });
  });
});

describe('isRecordId', () => {
  it('takes uuids and sample ids, nothing else', () => {
    expect(isRecordId('9b2f1c1e-8a4d-4b55-9a2b-1f0d3c4e5a6b')).toBe(true);
    expect(isRecordId('v-q4-a')).toBe(true);
    expect(isRecordId('../etc')).toBe(false);
    expect(isRecordId(42)).toBe(false);
  });
});
