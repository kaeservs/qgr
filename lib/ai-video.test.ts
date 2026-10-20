import { describe, expect, it } from 'vitest';
import { cheapest, creditsLeft, fitToModel, formatCredits, notesFor, parseVideoRequest, videoTitle } from './ai-video';

const PROMPT = 'A family walking through a sunlit American suburb at golden hour, slow dolly forward';
const PICTURE = 'refs/1b4e28ba-2fa1-11d2-883f-0016d3cca427/6fa459ea-ee8a-3ca4-894e-db77e160355e.jpg';
const base = { prompt: PROMPT, model: 'seedance_2_0_mini', seconds: 5, aspect: '9:16', quality: '480p' };

describe('what a video request may ask for', () => {
  it('takes a prompt, a model, a length, a shape and a quality the model makes', () => {
    expect(parseVideoRequest({ ...base, prompt: ` ${PROMPT} ` })).toEqual({
      ok: true,
      value: { prompt: PROMPT, model: 'seedance_2_0_mini', seconds: 5, aspect: '9:16', quality: '480p', sound: false, picture: null },
    });
    expect(parseVideoRequest({ ...base, prompt: 'A family' }).ok).toBe(false);
    expect(parseVideoRequest({ ...base, model: 'sora' })).toMatchObject({ error: 'Pick a video model.' });
    expect(parseVideoRequest({ ...base, seconds: 7 })).toMatchObject({ error: 'Seedance 2.0 Mini makes videos of 4, 5, 8, 10, 15 seconds.' });
    expect(parseVideoRequest({ ...base, aspect: '4:5' }).ok).toBe(false);
    // Each model's own quality settings, as Higgsfield names them.
    expect(parseVideoRequest({ ...base, quality: '1080p' })).toMatchObject({ error: 'Seedance 2.0 Mini comes in 480p or 720p.' });
    expect(parseVideoRequest({ ...base, model: 'kling3_0', quality: 'pro' })).toMatchObject({ ok: true, value: { quality: 'pro' } });
    expect(parseVideoRequest({ ...base, model: 'kling3_0', quality: '480p' }).ok).toBe(false);
    expect(parseVideoRequest({ ...base, sound: true })).toMatchObject({ value: { sound: true } });
    expect(parseVideoRequest({ ...base, sound: 'yes' })).toMatchObject({ value: { sound: false } });
  });

  it('takes a first picture only where the model starts from one', () => {
    expect(parseVideoRequest({ ...base, picture: PICTURE })).toMatchObject({ ok: true, value: { picture: PICTURE } });
    expect(parseVideoRequest({ ...base, model: 'kling3_0', quality: 'std', picture: PICTURE }).ok).toBe(true);
    expect(parseVideoRequest({ ...base, model: 'seedance_2_5', picture: PICTURE })).toMatchObject({ error: 'Seedance 2.5 starts from the prompt alone: take the picture away, or pick another model.' });
    // Only a file in the bucket's own folders.
    expect(parseVideoRequest({ ...base, picture: 'https://example.com/a.jpg' })).toMatchObject({ error: 'The first picture did not upload: add it again.' });
    expect(parseVideoRequest({ ...base, picture: '' })).toMatchObject({ value: { picture: null } });
  });

  it('moves a request to the nearest thing another model makes', () => {
    const request = { model: 'seedance_2_0_mini' as const, seconds: 4, aspect: '1:1' as const, quality: '720p', sound: true, picture: PICTURE };
    expect(fitToModel(request, 'kling3_0')).toEqual({ model: 'kling3_0', seconds: 3, aspect: '1:1', quality: 'std', sound: true, picture: PICTURE });
    expect(fitToModel(request, 'seedance_2_5')).toEqual({ model: 'seedance_2_5', seconds: 5, aspect: '1:1', quality: '720p', sound: true, picture: null });
  });

  it('starts each model at its cheapest', () => {
    expect(cheapest('seedance_2_0_mini')).toEqual({ model: 'seedance_2_0_mini', seconds: 4, aspect: '9:16', quality: '480p', sound: false, picture: null });
    expect(cheapest('kling3_0')).toMatchObject({ seconds: 3, quality: 'std' });
  });
});

describe('credits', () => {
  it('counts what the month may still spend', () => {
    expect(creditsLeft({ cap: 100, spent: 12.5 })).toBe(87.5);
    expect(creditsLeft({ cap: 100, spent: 140 })).toBe(0);
  });

  it('says credits as Higgsfield does', () => {
    expect(formatCredits(2)).toBe('2 credits');
    expect(formatCredits(1)).toBe('1 credit');
    expect(formatCredits(7.5)).toBe('7.5 credits');
    // A low-quality picture, and a run's three: never rounded up to a tenth.
    expect(formatCredits(0.25)).toBe('0.25 credits');
    expect(formatCredits(0.25 * 3)).toBe('0.75 credits');
    expect(formatCredits(280)).toBe('280 credits');
  });
});

describe('a video in the library', () => {
  it('is named by the prompt’s first words', () => {
    expect(videoTitle(PROMPT)).toBe('A family walking through a sunlit American suburb…');
    expect(videoTitle('Slow drone shot over the bay.')).toBe('Slow drone shot over the bay');
  });

  it('tells a run what the video is, since the agents cannot watch it', () => {
    expect(notesFor({ prompt: PROMPT, seconds: 10 })).toBe(`An AI-made video (10 seconds, no speech) of: ${PROMPT}`);
    expect(notesFor({ prompt: PROMPT, seconds: 5, sound: true })).toBe(`An AI-made video (5 seconds, with sound but no speech) of: ${PROMPT}`);
  });
});
