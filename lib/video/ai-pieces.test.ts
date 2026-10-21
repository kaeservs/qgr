import { describe, expect, it } from 'vitest';
import type { AiVideo } from '../types';
import { aiMediaOf, aiStates, shapeForEdit, withoutFile } from './ai-pieces';
import { CUT, DEFAULT_EFFECTS } from './timeline';
import type { Cutaway, Segment } from './timeline';

const video = (id: string, status: AiVideo['status'], extra: Partial<AiVideo> = {}): AiVideo => ({
  id,
  title: 'A student on campus',
  prompt: 'A student walks across a sunny campus, seen from behind.',
  model: 'seedance_2_0_mini',
  seconds: 5,
  aspect: '16:9',
  quality: '480p',
  sound: false,
  picture: null,
  credits: 1,
  status,
  createdAt: '2026-10-21T09:00:00Z',
  ...extra,
});
const piece = (id: string, path: string): Segment => ({ id, kind: 'clip', media: { path, name: id, width: 854, height: 480, duration: 5 }, start: 0, end: 5, speed: 1, volume: 1, effects: DEFAULT_EFFECTS, transition: CUT });
const own: Segment = { id: 'k0', kind: 'clip', media: null, start: 0, end: 60, speed: 1, volume: 1, effects: DEFAULT_EFFECTS, transition: CUT };
const over = (id: string, path: string): Cutaway => ({ id, media: { path, name: id, width: 854, height: 480, duration: 5 }, at: 10, start: 0, end: 5 });

describe('an AI video for an edit', () => {
  it('is asked for in the edit’s shape, or the nearest Higgsfield makes', () => {
    const wide = { width: 1920, height: 1080 };
    expect(shapeForEdit('9:16', wide)).toBe('9:16');
    expect(shapeForEdit('4:5', wide)).toBe('9:16');
    expect(shapeForEdit('original', wide)).toBe('16:9');
    expect(shapeForEdit('original', { width: 1080, height: 1920 })).toBe('9:16');
    expect(shapeForEdit('original', { width: 1080, height: 1080 })).toBe('1:1');
  });

  it('is a file of the edit whose length and size are known before it is made', () => {
    expect(aiMediaOf(video('v1', 'asked', { quality: '720p' }))).toEqual({ path: 'ai:v1', name: 'A student on campus', width: 1280, height: 720, duration: 5 });
  });
});

describe('how an edit’s AI videos stand', () => {
  const edit = { sequence: [own, piece('a1', 'ai:v1'), piece('a2', 'ai:v2')], cutaways: [over('c1', 'ai:v3'), over('c2', 'ai:v4')] };

  it('waits for those being made, and names those not made with why', () => {
    const known = new Map([video('v1', 'ready'), video('v2', 'making'), video('v3', 'failed', { error: 'Higgsfield’s safety check stopped it.' })].map((v) => [v.id, v]));
    expect(aiStates(edit, known)).toEqual({
      waiting: new Set(['ai:v2']),
      lost: [
        { path: 'ai:v3', name: 'c1', why: 'Higgsfield’s safety check stopped it.' },
        { path: 'ai:v4', name: 'c2', why: 'It is no longer in the library.' },
      ],
    });
  });

  it('counts every one as waiting until the server has said', () => {
    expect(aiStates(edit, null).waiting).toEqual(new Set(['ai:v1', 'ai:v2', 'ai:v3', 'ai:v4']));
  });

  it('takes one out wherever it is, never the clip itself', () => {
    const out = withoutFile(edit, 'ai:v3');
    expect(out.cutaways.map((c) => c.id)).toEqual(['c2']);
    expect(withoutFile(edit, 'ai:v1').sequence.map((s) => s.id)).toEqual(['k0', 'a2']);
  });
});
