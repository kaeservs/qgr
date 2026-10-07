import { describe, expect, it } from 'vitest';
import { normalizeUrl, parseNewRun } from './run-input';

describe('normalizeUrl', () => {
  it('accepts what people paste', () => {
    expect(normalizeUrl('horizonvisa.com')).toBe('https://horizonvisa.com/');
    expect(normalizeUrl('  www.horizonvisa.com/ads  ')).toBe('https://www.horizonvisa.com/ads');
    expect(normalizeUrl('http://horizonvisa.com')).toBe('http://horizonvisa.com/');
  });

  it('refuses anything that is not a web address', () => {
    for (const bad of ['', 'horizon', 'javascript:alert(1)', 'ftp://files.example/x', 'two words.com', 'https://localhost/']) {
      expect(normalizeUrl(bad)).toBeNull();
    }
  });
});

describe('parseNewRun', () => {
  const base = { platforms: ['meta', 'x'], goal: 'consultations' };

  it('accepts a competitor website and keeps platforms in display order', () => {
    const r = parseNewRun({ ...base, platforms: ['x', 'meta', 'x'], source: { kind: 'competitor', input: 'website', url: 'horizonvisa.com' } });
    expect(r).toEqual({ ok: true, value: { source: { kind: 'competitor', input: 'website', url: 'https://horizonvisa.com/' }, platforms: ['meta', 'x'], goal: 'consultations' } });
  });

  it('needs a name and at least one file for uploaded ads', () => {
    expect(parseNewRun({ ...base, source: { kind: 'competitor', input: 'upload', name: '', files: ['a.png'] } }).ok).toBe(false);
    expect(parseNewRun({ ...base, source: { kind: 'competitor', input: 'upload', name: 'Atlas', files: [] } }).ok).toBe(false);
    expect(parseNewRun({ ...base, source: { kind: 'competitor', input: 'upload', name: 'Atlas', files: ['a.png'] } }).ok).toBe(true);
  });

  it('caps uploads at ten files', () => {
    const files = Array.from({ length: 11 }, (_, i) => `ad-${i}.png`);
    expect(parseNewRun({ ...base, source: { kind: 'competitor', input: 'upload', name: 'Atlas', files } }).ok).toBe(false);
  });

  it('accepts a custom link and refuses a short pasted text', () => {
    expect(parseNewRun({ ...base, source: { kind: 'custom', type: 'podcast', url: 'podcasts.example/ep-12' } }).ok).toBe(true);
    expect(parseNewRun({ ...base, source: { kind: 'custom', type: 'text', excerpt: 'too short' } }).ok).toBe(false);
    expect(parseNewRun({ ...base, source: { kind: 'custom', type: 'text', excerpt: 'EB-5 '.repeat(20) } }).ok).toBe(true);
  });

  it('needs a platform and a known goal', () => {
    const source = { kind: 'competitor', input: 'website', url: 'horizonvisa.com' };
    expect(parseNewRun({ source, platforms: [], goal: 'consultations' }).ok).toBe(false);
    expect(parseNewRun({ source, platforms: ['tiktok'], goal: 'consultations' }).ok).toBe(false);
    expect(parseNewRun({ source, platforms: ['meta'], goal: 'go viral' }).ok).toBe(false);
  });

  it('keeps a run name only when one was given', () => {
    const source = { kind: 'competitor', input: 'website', url: 'horizonvisa.com' };
    const named = parseNewRun({ ...base, source, title: '  Q4 push  ' });
    const unnamed = parseNewRun({ ...base, source, title: '   ' });
    expect(named.ok && named.value.title).toBe('Q4 push');
    expect(unnamed.ok && 'title' in unnamed.value).toBe(false);
  });
});

describe('competitorInputFor', () => {
  it('tells an ad library link from a website', async () => {
    const { competitorInputFor } = await import('./run-input');
    expect(competitorInputFor('https://www.facebook.com/ads/library/?id=123')).toBe('ad_link');
    expect(competitorInputFor('https://www.linkedin.com/ad-library/search?companyIds=1')).toBe('ad_link');
    expect(competitorInputFor('https://horizonvisa.com/')).toBe('website');
  });
});
