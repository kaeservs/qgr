import { describe, expect, it } from 'vitest';
import { linkToRead, MAX_GUIDANCE, MIN_EXCERPT, normalizeUrl, parseAdsRun, parseNewRun, runTitle } from './run-input';

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

  it('starts a run from screenshots of their ads uploaded here, named for whose they are', () => {
    const shot = (n: number, ext = 'png') => `shots/b263a35f-fb56-49bf-a032-59be7540d321/0d3b9e6a-1c2f-4b8e-9a7d-5e4f3c2b1a${String(n).padStart(2, '0')}.${ext}`;
    const source = (s: Record<string, unknown>) => parseNewRun({ ...base, source: { kind: 'competitor', input: 'upload', name: '  Atlas   Visa ', files: [shot(1), shot(2, 'jpg')], ...s } });
    expect(source({})).toEqual({ ok: true, value: { source: { kind: 'competitor', input: 'upload', name: 'Atlas Visa', files: [shot(1), shot(2, 'jpg')] }, platforms: ['meta', 'x'], goal: 'consultations' } });
    const error = (s: Record<string, unknown>) => {
      const r = source(s);
      return r.ok ? null : r.error;
    };
    expect(error({ name: ' ' })).toBe('Say whose ads these are.');
    expect(error({ files: [] })).toBe('Add at least one screenshot of their ads.');
    expect(error({ files: Array.from({ length: 11 }, (_, i) => shot(i)) })).toBe('Add up to 10 screenshots.');
    // Runs from before named bare files the tracker never saw.
    expect(error({ files: ['a.png'] })).toBe('A screenshot was not uploaded here.');
    expect(error({ files: [shot(1, 'gif')] })).toBe('A screenshot was not uploaded here.');
    expect(error({ files: [shot(1), shot(1)] })).toBe('A screenshot is there twice.');
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

  it('takes the edit made as a clip was uploaded, checked as the studio’s are', async () => {
    const { defaultEdit } = await import('./video/edit');
    const clip = { path: 'uploads/b263a35f-fb56-49bf-a032-59be7540d321/0d3b9e6a-1c2f-4b8e-9a7d-5e4f3c2b1a09.webm', name: 'a.webm', duration: 30, width: 1280, height: 720, size: 1000 };
    const notes = 'What is said in the clip, in a sentence.';
    const base = { platforms: ['meta'], goal: 'consultations' };
    const edit = { ...defaultEdit(30), aspect: '4:5', keep: [{ start: 0, end: 10 }] };
    const r = parseNewRun({ ...base, source: { kind: 'custom', type: 'video', clip: { ...clip, edit }, notes } });
    expect(r.ok && 'clip' in r.value.source ? r.value.source.clip.edit : null).toMatchObject({ aspect: '4:5', keep: [{ start: 0, end: 10 }] });
    expect(parseNewRun({ ...base, source: { kind: 'custom', type: 'video', clip: { ...clip, edit: { ...edit, keep: [{ start: 0, end: 90 }] } }, notes } })).toEqual({ ok: false, error: 'A kept part is outside the clip.' });
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

  it('keeps the direction for the agents, line breaks and all, within its limit', () => {
    const source = { kind: 'custom', type: 'text', excerpt: 'x'.repeat(MIN_EXCERPT) };
    const given = parseNewRun({ ...base, source, guidance: '  Lead with families.\n- Rural projects\u0007 only  ' });
    expect(given.ok && given.value.guidance).toBe('Lead with families.\n- Rural projects  only');
    const blank = parseNewRun({ ...base, source, guidance: ' \n ' });
    expect(blank.ok && 'guidance' in blank.value).toBe(false);
    expect(parseNewRun({ ...base, source, guidance: 'x'.repeat(MAX_GUIDANCE) }).ok).toBe(true);
    const long = parseNewRun({ ...base, source, guidance: 'x'.repeat(MAX_GUIDANCE + 1) });
    expect(!long.ok && long.error).toMatch(/under 2,000 characters/);
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

describe('parseAdsRun', () => {
  const base = { reportId: '0d3b9e6a-1c2f-4b8e-9a7d-5e4f3c2b1a09', adIds: ['a-1', 'a-2'], platforms: ['x', 'meta'], goal: 'webinar' };
  const error = (body: Record<string, unknown>) => {
    const r = parseAdsRun({ ...base, ...body });
    return r.ok ? null : r.error;
  };

  it('takes a report’s id, up to 20 of its ads and the usual choices', () => {
    expect(parseAdsRun({ ...base, guidance: ' Lead with families. ', title: ' Push ' })).toEqual({
      ok: true,
      value: { reportId: base.reportId, adIds: ['a-1', 'a-2'], platforms: ['meta', 'x'], goal: 'webinar', title: 'Push', guidance: 'Lead with families.' },
    });
  });

  it('refuses no ads, too many, the same twice, and anything that is not an id', () => {
    expect(error({ adIds: [] })).toBe('Choose at least one of their ads.');
    expect(error({ adIds: Array.from({ length: 21 }, (_, i) => `a-${i}`) })).toBe('Choose up to 20 ads.');
    expect(error({ adIds: ['a-1', 'a-1'] })).toBe('Choose ads from this report.');
    expect(error({ adIds: ['a 1'] })).toBe('Choose ads from this report.');
    expect(error({ reportId: '../x' })).toBe('That report is not there any more.');
    expect(error({ platforms: [] })).toBe('Pick at least one platform.');
  });
});
