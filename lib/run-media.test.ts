import { describe, expect, it } from 'vitest';
import { parseNewRun } from './run-input';
import { clipOfVideo, forTheRun, mediaSaid, parseRunMedia, videoPriceRequest, videoSize } from './run-media';

const ref = (n: number, ext = 'png') => `refs/b263a35f-fb56-49bf-a032-59be7540d321/0d3b9e6a-1c2f-4b8e-9a7d-5e4f3c2b1a${String(n).padStart(2, '0')}.${ext}`;
const error = (raw: unknown) => {
  const r = parseRunMedia(raw);
  return r.ok ? null : r.error;
};

describe('parseRunMedia', () => {
  it('keeps the answer, with up to four references and what each shows', () => {
    expect(parseRunMedia({ kind: 'design' })).toEqual({ ok: true, value: { kind: 'design', references: [] } });
    expect(parseRunMedia({ kind: 'pictures', references: [{ path: ref(1), note: '  Our Miami\n office ' }, { path: ref(2, 'jpg'), note: '' }] })).toEqual({
      ok: true,
      value: { kind: 'pictures', references: [{ path: ref(1), note: 'Our Miami office' }, { path: ref(2, 'jpg') }] },
    });
    expect(parseRunMedia({ kind: 'video', references: [], video: { seconds: 4, quality: '480p', aspect: '9:16' } })).toEqual({
      ok: true,
      value: { kind: 'video', references: [], video: { seconds: 4, quality: '480p', aspect: '9:16' } },
    });
  });

  it('refuses what the database would', () => {
    expect(error({ kind: 'collage' })).toMatch(/design, AI pictures or AI video/);
    expect(error({ kind: 'design', references: [{ path: ref(1) }] })).toMatch(/design uses none/);
    expect(error({ kind: 'pictures', references: [1, 2, 3, 4, 5].map((n) => ({ path: ref(n) })) })).toMatch(/up to 4/);
    expect(error({ kind: 'pictures', references: [{ path: 'refs/someone/else.png' }] })).toMatch(/not uploaded here/);
    expect(error({ kind: 'pictures', references: [{ path: ref(1) }, { path: ref(1) }] })).toMatch(/twice/);
    expect(error({ kind: 'pictures', references: [{ path: ref(1), note: 'x'.repeat(121) }] })).toMatch(/under 120/);
    expect(error({ kind: 'pictures', video: { seconds: 4, quality: '480p', aspect: '9:16' } })).toMatch(/Only a video run/);
    expect(error({ kind: 'video' })).toMatch(/how long/);
    expect(error({ kind: 'video', video: { seconds: 6, quality: '480p', aspect: '9:16' } })).toMatch(/seconds long/);
    expect(error({ kind: 'video', video: { seconds: 4, quality: '1080p', aspect: '9:16' } })).toMatch(/480p or 720p/);
    expect(error({ kind: 'video', video: { seconds: 4, quality: '480p', aspect: '4:5' } })).toMatch(/9:16, 1:1 or 16:9/);
  });

  it('goes with a new run, except one from a clip, whose ads are the clip', () => {
    const base = { platforms: ['meta'], goal: 'consultations', source: { kind: 'competitor', input: 'website', url: 'horizonvisa.com' } };
    const run = parseNewRun({ ...base, media: { kind: 'pictures', references: [{ path: ref(1) }] } });
    expect(run.ok && run.value.media).toEqual({ kind: 'pictures', references: [{ path: ref(1) }] });
    // Asked nothing: the team's switch decides, as before.
    const plain = parseNewRun(base);
    expect(plain.ok && 'media' in plain.value).toBe(false);
    expect(parseNewRun({ ...base, media: { kind: 'video' } })).toMatchObject({ ok: false });

    const clip = { path: 'uploads/b263a35f-fb56-49bf-a032-59be7540d321/0d3b9e6a-1c2f-4b8e-9a7d-5e4f3c2b1a09.mp4', name: 'Talk.mp4', duration: 30, width: 1280, height: 720, size: 1000 };
    const fromClip = { ...base, source: { kind: 'custom', type: 'video', clip, notes: 'What is said in the clip, in plain words.' } };
    expect(parseNewRun({ ...fromClip, media: { kind: 'pictures', references: [] } })).toEqual({ ok: false, error: expect.stringMatching(/run from a clip/) });
    expect(parseNewRun(fromClip).ok).toBe(true);
  });
});

describe('a video run', () => {
  it('is priced as Higgsfield prices one silent Seedance 2.0 Mini video, three times', () => {
    expect(videoPriceRequest({ seconds: 4, quality: '480p', aspect: '9:16' })).toEqual({ prompt: '', model: 'seedance_2_0_mini', seconds: 4, aspect: '9:16', quality: '480p', sound: false, picture: false });
    expect(forTheRun(2)).toBe(6);
    expect(forTheRun(0.25)).toBe(0.75);
    expect(mediaSaid('video', { seconds: 4, quality: '480p', aspect: '9:16', credits: 2 })).toBe('An AI video for every ad: 4 s, 480p, 9:16, silent; 2 credits each, 6 for the three');
  });

  it('makes each ad’s video a clip the studio can edit and post, once it is made', () => {
    expect(videoSize('9:16', '480p')).toEqual({ width: 480, height: 854 });
    expect(videoSize('16:9', '720p')).toEqual({ width: 1280, height: 720 });
    expect(videoSize('1:1', '720p')).toEqual({ width: 720, height: 720 });
    const made = { id: 'v1', status: 'ready', seconds: 4, aspect: '9:16', quality: '480p', path: 'videos/v1.mp4', url: 'https://x.example/v1' } as const;
    expect(clipOfVideo(made, 'B')).toEqual({ path: 'videos/v1.mp4', name: 'Variant B video', duration: 4, size: 0, width: 480, height: 854 });
    expect(clipOfVideo({ ...made, status: 'making' }, 'B')).toBeNull();
  });
});
