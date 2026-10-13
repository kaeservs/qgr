import { describe, expect, it } from 'vitest';
import { fitToModel, notesFor, parseVideoRequest } from './ai-video';

const PROMPT = 'A family walking through a sunlit American suburb at golden hour, slow dolly forward';
const picture = { kind: 'image', name: 'first-frame.jpg', size: 200_000 };
const clip = (seconds: number) => ({ kind: 'clip', name: 'move.mp4', size: 3_000_000, seconds });

describe('what a video request may ask for', () => {
  it('takes a prompt, a model, a length and a shape the model makes', () => {
    expect(parseVideoRequest({ prompt: ` ${PROMPT} `, model: 'seedance', seconds: 10, aspect: '9:16' })).toEqual({
      ok: true,
      value: { prompt: PROMPT, model: 'seedance', seconds: 10, aspect: '9:16', references: [] },
    });
    expect(parseVideoRequest({ prompt: 'A family', model: 'seedance', seconds: 10, aspect: '9:16' }).ok).toBe(false);
    expect(parseVideoRequest({ prompt: PROMPT, model: 'sora', seconds: 10, aspect: '9:16' })).toMatchObject({ error: 'Pick a video model.' });
    expect(parseVideoRequest({ prompt: PROMPT, model: 'hailuo', seconds: 5, aspect: '9:16' })).toMatchObject({ error: 'Hailuo 2.3 makes videos of 6, 10 seconds.' });
    expect(parseVideoRequest({ prompt: PROMPT, model: 'hailuo', seconds: 6, aspect: '1:1' }).ok).toBe(false);
  });

  it('holds references to what each model takes', () => {
    // Kling brings a picture to life: it needs exactly one.
    expect(parseVideoRequest({ prompt: PROMPT, model: 'kling', seconds: 5, aspect: '1:1' })).toMatchObject({ error: 'Kling 3.0 starts from a picture: add one.' });
    expect(parseVideoRequest({ prompt: PROMPT, model: 'kling', seconds: 5, aspect: '1:1', references: [picture] }).ok).toBe(true);
    expect(parseVideoRequest({ prompt: PROMPT, model: 'kling', seconds: 5, aspect: '1:1', references: [picture, picture] }).ok).toBe(false);
    // Seedance follows pictures and one short clip; Hailuo takes no clip.
    expect(parseVideoRequest({ prompt: PROMPT, model: 'seedance', seconds: 5, aspect: '16:9', references: [picture, clip(8)] }).ok).toBe(true);
    expect(parseVideoRequest({ prompt: PROMPT, model: 'seedance', seconds: 5, aspect: '16:9', references: [clip(8), clip(4)] }).ok).toBe(false);
    expect(parseVideoRequest({ prompt: PROMPT, model: 'seedance', seconds: 5, aspect: '16:9', references: [clip(40)] })).toMatchObject({ error: 'A reference clip must be 15 seconds or less.' });
    expect(parseVideoRequest({ prompt: PROMPT, model: 'hailuo', seconds: 6, aspect: '16:9', references: [clip(5)] })).toMatchObject({ error: 'Hailuo 2.3 takes no reference clip.' });
    expect(parseVideoRequest({ prompt: PROMPT, model: 'seedance', seconds: 5, aspect: '16:9', references: [{ ...picture, size: 30_000_000 }] }).ok).toBe(false);
  });

  it('moves a request to the nearest thing another model makes', () => {
    expect(fitToModel({ model: 'seedance', seconds: 5, aspect: '1:1' }, 'hailuo')).toEqual({ model: 'hailuo', seconds: 6, aspect: '9:16' });
    expect(fitToModel({ model: 'hailuo', seconds: 10, aspect: '16:9' }, 'kling')).toEqual({ model: 'kling', seconds: 10, aspect: '16:9' });
  });

  it('tells a run what the video is, since the agents cannot watch it', () => {
    expect(notesFor({ prompt: PROMPT, seconds: 10 })).toBe(`An AI-made video (10 seconds, no speech) of: ${PROMPT}`);
  });
});
