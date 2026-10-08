import { describe, expect, it } from 'vitest';
import { linkToRead, normalizeUrl, parseNewRun, runTitle } from './run-input';

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

  it('refuses links that are not ordinary public pages', () => {
    for (const bad of ['http://169.254.169.254/latest', '10.0.0.1', 'https://[::1]/', 'https://user:pw@horizonvisa.com/', 'horizonvisa.com:8443']) {
      expect(normalizeUrl(bad), bad).toBeNull();
    }
    expect(normalizeUrl('horizonvisa.com:443/x')).toBe('https://horizonvisa.com/x');
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

  it('accepts an uploaded clip with notes on what is said in it', () => {
    const clip = { path: 'uploads/b263a35f-fb56-49bf-a032-59be7540d321/0d3b9e6a-1c2f-4b8e-9a7d-5e4f3c2b1a09.mp4', name: ' Episode\u0007 12 cut.mp4 ', duration: 42.123456, width: 1920, height: 1080, size: 31_000_000 };
    const notes = 'Our founder explains the four steps of EB-5.';
    const r = parseNewRun({ ...base, source: { kind: 'custom', type: 'video', clip, notes } });
    expect(r).toEqual({
      ok: true,
      value: { source: { kind: 'custom', type: 'video', clip: { ...clip, name: 'Episode 12 cut.mp4', duration: 42.123 }, notes }, platforms: ['meta', 'x'], goal: 'consultations' },
    });
    expect(r.ok && runTitle(r.value)).toBe('Video · Episode 12 cut');
    expect(r.ok && linkToRead(r.value.source)).toBeNull();
  });

  it('refuses a clip from anywhere else, too long or too large, or without notes', () => {
    const clip = { path: 'uploads/b263a35f-fb56-49bf-a032-59be7540d321/0d3b9e6a-1c2f-4b8e-9a7d-5e4f3c2b1a09.webm', name: 'a.webm', duration: 30, width: 1280, height: 720, size: 1000 };
    const notes = 'What is said in the clip, in a sentence.';
    const error = (source: unknown) => {
      const r = parseNewRun({ ...base, source });
      return r.ok ? null : r.error;
    };
    expect(error({ kind: 'custom', type: 'video', clip, notes })).toBeNull();
    expect(error({ kind: 'custom', type: 'video', clip: { ...clip, path: 'uploads/../../etc/passwd.mp4' }, notes })).toBe('That clip was not uploaded here.');
    expect(error({ kind: 'custom', type: 'video', clip: { ...clip, path: clip.path.replace('.webm', '.exe') }, notes })).toBe('That clip was not uploaded here.');
    expect(error({ kind: 'custom', type: 'video', clip: { ...clip, duration: 601 }, notes })).toBe('Cut the clip to 10:00 or less.');
    expect(error({ kind: 'custom', type: 'video', clip: { ...clip, size: 60 * 1024 * 1024 }, notes })).toBe('The clip is over 50 MB.');
    expect(error({ kind: 'custom', type: 'video', clip, notes: 'Short.' })).toMatch(/at least 20 characters/);
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

describe('linkToRead', () => {
  it('reads a website or a content page, never an ad library, text or an upload', () => {
    expect(linkToRead({ kind: 'competitor', input: 'website', url: 'https://horizonvisa.com/' })).toBe('https://horizonvisa.com/');
    expect(linkToRead({ kind: 'competitor', input: 'ad_link', url: 'https://facebook.com/ads/library/?id=1' })).toBeNull();
    expect(linkToRead({ kind: 'competitor', input: 'upload', name: 'Atlas', files: ['a.png'] })).toBeNull();
    expect(linkToRead({ kind: 'custom', type: 'blog', url: 'https://journal.example/post' })).toBe('https://journal.example/post');
    expect(linkToRead({ kind: 'custom', type: 'text', excerpt: 'x'.repeat(60) })).toBeNull();
  });
});
