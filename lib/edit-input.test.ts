import { describe, expect, it } from 'vitest';
import { isRecordId, parseBrandExample, parseBrandMemory, parseBrandProfile, parsePicturePrompt, parseVariantEdit } from './edit-input';
import { parseAgentSettings } from './post-input';

describe('parseVariantEdit', () => {
  const copy = { meta: { text: ' Talk to an advisor. ', headline: 'Plan ahead', description: 'Free call', cta: 'Book now' }, x: { text: 'Plan ahead.', headline: 'EB-5' } };

  it('keeps the platforms sent, trimmed', () => {
    const parsed = parseVariantEdit({ creativeText: ' Plan with care ', copy });
    expect(parsed).toEqual({
      ok: true,
      value: {
        creativeText: 'Plan with care',
        copy: { meta: { text: 'Talk to an advisor.', headline: 'Plan ahead', description: 'Free call', cta: 'Book now' }, x: { text: 'Plan ahead.', headline: 'EB-5' } },
        posts: {},
      },
    });
  });

  it('keeps the posts for the places its copy goes to, trimmed, and drops an empty one', () => {
    const parsed = parseVariantEdit({ creativeText: 'Words', copy, posts: { facebook: ' The full post. ', instagram: '  ' } });
    expect(parsed).toMatchObject({ ok: true, value: { posts: { facebook: 'The full post.' } } });
    // No LinkedIn copy, so no LinkedIn post.
    expect(parseVariantEdit({ creativeText: 'Words', copy, posts: { linkedin: 'A post.' } })).toEqual({ ok: false, error: 'A post is for a place this ad does not go to.' });
    expect(parseVariantEdit({ creativeText: 'Words', copy, posts: { facebook: 'x'.repeat(3001) } })).toMatchObject({ ok: false });
    expect(parseVariantEdit({ creativeText: 'Words', copy, posts: 'nope' })).toMatchObject({ ok: false });
  });

  it('ignores fields and platforms it does not know', () => {
    const parsed = parseVariantEdit({ creativeText: 'Words', copy: { tiktok: { text: 't', headline: 'h' }, x: { text: 't', headline: 'h', image: 'evil' } } });
    expect(parsed).toEqual({ ok: true, value: { creativeText: 'Words', copy: { x: { text: 't', headline: 'h' } }, posts: {} } });
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

describe('parseBrandMemory', () => {
  it('tidies the topics and keeps the format notes it knows', () => {
    const parsed = parseBrandMemory({ topics: [' EB-5 basics ', 'EB-5 basics', ''], postFormats: { instagram: ' Hashtags last. ', tiktok: 'No.', x: ' ' }, pictureStyle: ' Warm light. ' });
    expect(parsed).toEqual({ ok: true, value: { topics: ['EB-5 basics'], postFormats: { instagram: 'Hashtags last.' }, pictureStyle: 'Warm light.' } });
  });

  it('refuses too many topics and notes past their length', () => {
    expect(parseBrandMemory({ topics: Array.from({ length: 41 }, (_, i) => `Topic ${i}`) })).toMatchObject({ ok: false });
    expect(parseBrandMemory({ postFormats: { facebook: 'x'.repeat(10001) } })).toMatchObject({ ok: false });
    expect(parseBrandMemory({ pictureStyle: 'x'.repeat(4001) })).toMatchObject({ ok: false });
    // Well past what it once took, as the team asked.
    expect(parseBrandMemory({ topics: ['t'.repeat(300)], postFormats: { facebook: 'x'.repeat(10000) }, pictureStyle: 'x'.repeat(4000) })).toMatchObject({ ok: true });
  });
});

describe('parseBrandExample', () => {
  it('needs a place and the post, and keeps a note when there is one', () => {
    expect(parseBrandExample({ place: 'instagram', text: ' A post. ', note: ' Saved a lot. ' })).toEqual({ ok: true, value: { place: 'instagram', text: 'A post.', note: 'Saved a lot.' } });
    expect(parseBrandExample({ place: 'x', text: 'A post.', note: ' ' })).toEqual({ ok: true, value: { place: 'x', text: 'A post.' } });
    expect(parseBrandExample({ place: 'tiktok', text: 'A post.' })).toEqual({ ok: false, error: 'Say where the post ran.' });
    expect(parseBrandExample({ place: 'x', text: ' ' })).toEqual({ ok: false, error: 'Paste the post.' });
  });
});

describe('parsePicturePrompt', () => {
  it('keeps the scene, trimmed, up to what fits the image model with the picture style', () => {
    expect(parsePicturePrompt('  A harbour at dawn  ')).toEqual({ ok: true, value: 'A harbour at dawn' });
    expect(parsePicturePrompt('   ')).toEqual({ ok: false, error: 'Describe the picture first.' });
    expect(parsePicturePrompt(42)).toMatchObject({ ok: false });
    expect(parsePicturePrompt('x'.repeat(1200))).toMatchObject({ ok: true });
    expect(parsePicturePrompt('x'.repeat(1201))).toEqual({ ok: false, error: 'Keep the picture prompt under 1,200 characters.' });
  });
});

describe('parseAgentSettings: pictures', () => {
  const base = { timeZone: 'America/New_York', strategistAuto: true, contentAuto: true, picturesAuto: false, adsSource: 'sample', scanEvery: 'off', scanDay: 1, scanHour: 9 };

  it('takes the stand-in or Cloudflare with its account, lowercased', () => {
    expect(parseAgentSettings({ ...base, pictureModel: 'stand-in', cloudflareAccount: '' })).toMatchObject({ ok: true, value: { pictureModel: 'stand-in', cloudflareAccount: '' } });
    expect(parseAgentSettings({ ...base, pictureModel: 'cloudflare', cloudflareAccount: ' 0123456789ABCDEF0123456789abcdef ' })).toMatchObject({
      ok: true,
      value: { pictureModel: 'cloudflare', cloudflareAccount: '0123456789abcdef0123456789abcdef' },
    });
  });

  it('refuses another model, Cloudflare without an account, and an account that is not one', () => {
    expect(parseAgentSettings({ ...base, pictureModel: 'midjourney', cloudflareAccount: '' })).toEqual({ ok: false, error: 'Say what makes the pictures.' });
    expect(parseAgentSettings({ ...base, pictureModel: 'cloudflare', cloudflareAccount: '' })).toEqual({ ok: false, error: 'Cloudflare Workers AI needs your Cloudflare account ID.' });
    expect(parseAgentSettings({ ...base, pictureModel: 'stand-in', cloudflareAccount: 'my-account' })).toMatchObject({ ok: false, error: expect.stringMatching(/32 characters/) });
  });

  it('takes Higgsfield at a quality, low when none is said, and no other quality', () => {
    expect(parseAgentSettings({ ...base, pictureModel: 'higgsfield', cloudflareAccount: '', picturesQuality: 'medium' })).toMatchObject({ ok: true, value: { pictureModel: 'higgsfield', picturesQuality: 'medium' } });
    expect(parseAgentSettings({ ...base, pictureModel: 'higgsfield', cloudflareAccount: '' })).toMatchObject({ ok: true, value: { picturesQuality: 'low' } });
    expect(parseAgentSettings({ ...base, pictureModel: 'higgsfield', cloudflareAccount: '', picturesQuality: 'ultra' })).toEqual({ ok: false, error: 'Higgsfield draws pictures at low, medium or high quality.' });
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
