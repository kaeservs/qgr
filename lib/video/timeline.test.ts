import { describe, expect, it } from 'vitest';
import {
  addCutaway,
  fitCutaways,
  longEditSeconds,
  shiftCutaways,
  aiPath,
  aiVideoOf,
  aiVideosOf,
  animate,
  captionClockAt,
  compactEdit,
  CUT,
  cutawayAt,
  DEFAULT_EFFECTS,
  filterOf,
  frameAt,
  insertAt,
  insertPiece,
  keepOfSequence,
  layout,
  mediaOf,
  motionAt,
  moveCutaway,
  movePiece,
  parseMusic,
  parseOverlays,
  parseSequence,
  placeAt,
  removePiece,
  sequenceOf,
  sequenceSeconds,
  setTransition,
  splitPiece,
  spotIn,
  timelineSeconds,
  trimPiece,
  wordAt,
} from './timeline';
import type { Cutaway, Segment } from './timeline';
import { defaultEdit, parseVideoEdit, withCutawaysFitted } from './edit';

const clip = (id: string, start: number, end: number, extra: Partial<Extract<Segment, { kind: 'clip' }>> = {}): Segment => ({ id, kind: 'clip', media: null, start, end, speed: 1, volume: 1, effects: DEFAULT_EFFECTS, transition: CUT, ...extra });
const PICTURE = { path: 'media/00000000-0000-4000-8000-000000000001/00000000-0000-4000-8000-000000000002.jpg', name: 'office.jpg', width: 1600, height: 900 };
const OTHER = { path: 'media/00000000-0000-4000-8000-000000000001/00000000-0000-4000-8000-000000000003.mp4', name: 'b-roll.mp4', width: 1920, height: 1080, duration: 12 };
const MUSIC = { path: 'media/00000000-0000-4000-8000-000000000001/00000000-0000-4000-8000-000000000004.mp3', name: 'calm.mp3', width: 0, height: 0, duration: 90 };
const image = (id: string, seconds: number, extra: Partial<Segment> = {}): Segment => ({ id, kind: 'image', media: PICTURE, seconds, effects: DEFAULT_EFFECTS, transition: CUT, ...extra }) as Segment;

describe('an edit before the timeline', () => {
  it('is the same video as a sequence: a piece a kept part, cut straight on', () => {
    const edit = { ...defaultEdit(30), keep: [{ start: 0, end: 5 }, { start: 10, end: 20 }], endCard: { text: 'Book', seconds: 3 } };
    const seq = sequenceOf(edit);
    expect(seq.map((s) => [s.kind, s.kind === 'clip' && s.start, s.transition.type])).toEqual([
      ['clip', 0, 'cut'],
      ['clip', 10, 'cut'],
    ]);
    expect(timelineSeconds(edit)).toBe(18);
    // A frame in the second part shows the clip's second it always showed.
    expect(frameAt(layout(seq), 7).current?.source).toBe(12);
  });
});

describe('the timeline’s clock', () => {
  it('lays pieces end to end, a transition sharing the end of one and the start of the next', () => {
    const seq = [clip('a', 0, 4), image('b', 3, { transition: { type: 'fade', seconds: 1 } }), clip('c', 10, 12, { speed: 2 })];
    const placed = layout(seq);
    expect(placed.map((p) => [p.at, p.until, p.overlap])).toEqual([
      [0, 4, 0],
      [3, 6, 1],
      [6, 7, 0],
    ]);
    expect(sequenceSeconds(placed)).toBe(7);
    // In the fade both show, the picture coming in.
    const mid = frameAt(placed, 3.5);
    expect(mid.current?.placed.segment.id).toBe('b');
    expect(mid.previous?.placed.segment.id).toBe('a');
    expect(mid.progress).toBeCloseTo(0.5);
    // At double speed a second of the timeline is two of the clip.
    expect(frameAt(placed, 6.5).current?.source).toBe(11);
    expect(frameAt(placed, 7.2).onEndCard).toBe(true);
  });

  it('keeps a transition shorter than either piece it joins', () => {
    const placed = layout([clip('a', 0, 1), clip('b', 5, 6, { transition: { type: 'fade', seconds: 2 } })]);
    expect(placed[1]!.overlap).toBe(0.9);
  });

  it('shows the captions of the run’s clip while a piece of it plays, and none over a picture', () => {
    const placed = layout([clip('a', 2, 6), image('b', 3)]);
    expect(captionClockAt(frameAt(placed, 1))).toBe(3);
    expect(captionClockAt(frameAt(placed, 5))).toBeNull();
  });

  it('hands the database the kept parts of the run’s clip, in order and merged', () => {
    expect(keepOfSequence([clip('a', 10, 15), image('b', 2), clip('c', 0, 4), clip('d', 3, 6), { ...clip('e', 0, 3), media: OTHER } as Segment])).toEqual([
      { start: 0, end: 6 },
      { start: 10, end: 15 },
    ]);
  });

  it('lists the files an edit uses besides the clip', () => {
    const seq = [clip('a', 0, 4), image('b', 3), { ...clip('c', 0, 3), media: OTHER } as Segment];
    expect(mediaOf({ sequence: seq, music: { media: MUSIC, volume: 0.4, fadeIn: 1, fadeOut: 2, duck: true } }).map((m) => m.name)).toEqual(['office.jpg', 'b-roll.mp4', 'calm.mp3']);
  });
});

describe('changing the sequence', () => {
  const seq = [clip('a', 0, 10), image('b', 4)];

  it('splits a piece where the playhead is, and nowhere too close to an edge', () => {
    const split = splitPiece(seq, 'a', 3);
    expect(split.map((s) => s.kind === 'clip' && [s.start, s.end])).toEqual([[0, 3], [3, 10], false]);
    expect(splitPiece(seq, 'a', 0.1)).toHaveLength(2);
    expect(splitPiece(seq, 'b', 1).map((s) => s.kind === 'image' && s.seconds)).toEqual([false, 1, 3]);
  });

  it('moves, inserts and removes pieces, keeping one of the run’s clip', () => {
    expect(movePiece(seq, 'b', -1).map((s) => s.id)).toEqual(['b', 'a']);
    expect(movePiece(seq, 'b', 1).map((s) => s.id)).toEqual(['a', 'b']);
    expect(insertPiece(seq, image('c', 2), 'a').map((s) => s.id)).toEqual(['a', 'c', 'b']);
    expect(removePiece(seq, 'a').map((s) => s.id)).toEqual(['a', 'b']);
    expect(removePiece(seq, 'b').map((s) => s.id)).toEqual(['a']);
  });

  it('trims a clip piece inside its source', () => {
    expect(trimPiece(seq, 'a', 'end', 40, 30)[0]).toMatchObject({ end: 30 });
    expect(trimPiece(seq, 'a', 'start', 9.9, 30)[0]).toMatchObject({ start: 9.7 });
  });

  it('keeps a transition’s length within reason, and a cut as a cut', () => {
    expect(setTransition(seq, 'b', { type: 'slide-left', seconds: 9 })[1]!.transition).toEqual({ type: 'slide-left', seconds: 2 });
    expect(setTransition(seq, 'b', { type: 'cut' })[1]!.transition).toEqual(CUT);
  });
});

describe('what the browser sends', () => {
  it('takes a sequence inside its sources, with some of the run’s clip, no longer than ten minutes', () => {
    const raw = [clip('a', 0, 10), image('b', 3), { ...clip('c', 0, 12), media: OTHER }, { id: 't1', kind: 'title', text: '  Plan  early ', subtext: '', style: 'gold', seconds: 2, effects: { filter: 'warm', zoom: 9 }, transition: { type: 'fade', seconds: 0.5 } }];
    const out = parseSequence(raw, 30);
    expect(typeof out).not.toBe('string');
    const title = (out as Segment[])[3]!;
    expect(title).toMatchObject({ kind: 'title', text: 'Plan early', effects: { filter: 'warm', zoom: 2 }, transition: { type: 'fade', seconds: 0.5 } });
    expect(parseSequence([image('b', 3)], 30)).toBe('Keep at least one piece of the run’s clip.');
    expect(parseSequence([clip('a', 0, 40)], 30)).toBe('A piece of a clip is outside it.');
    expect(parseSequence([clip('a', 0, 10), { ...clip('c', 0, 20), media: OTHER }], 30)).toBe('A piece of a clip is outside it.');
    expect(parseSequence([clip('a', 0, 10), { ...image('b', 3), media: { ...PICTURE, path: 'elsewhere/x.jpg' } }], 30)).toBe('A file in the edit was not added here.');
    expect(parseSequence([clip('a', 0, 10), clip('a', 10, 20)], 30)).toBe('A piece of the video is not readable.');
  });

  it('takes texts on the video inside it, and music', () => {
    expect(parseOverlays([{ id: 'o1', text: ' Ask us ', start: 1, end: 99, place: 'top', style: 'outline', animation: 'pop', size: 'large' }], 20)).toEqual([
      { id: 'o1', text: 'Ask us', start: 1, end: 20, place: 'top', style: 'outline', animation: 'pop', size: 'large' },
    ]);
    expect(parseOverlays([{ id: 'o1', text: 'x', start: 5, end: 2 }], 20)).toBe('A text on the video is outside it.');
    expect(parseMusic({ media: MUSIC, volume: 3, fadeIn: 1, fadeOut: 9 })).toMatchObject({ volume: 1, fadeOut: 5, duck: true });
    expect(parseMusic(null)).toBeNull();
  });
});

describe('how things move and look', () => {
  it('zooms and pans across a piece’s length', () => {
    const fx = { ...DEFAULT_EFFECTS, motion: 'zoom-in' as const };
    expect(motionAt(fx, 0, 4).zoom).toBe(1);
    expect(motionAt(fx, 4, 4).zoom).toBeCloseTo(1.15);
    expect(motionAt({ ...DEFAULT_EFFECTS, motion: 'pan-right' }, 2, 4).dx).toBe(0);
  });

  it('writes a canvas filter from a preset and the adjustments', () => {
    expect(filterOf(DEFAULT_EFFECTS)).toBe('none');
    expect(filterOf({ ...DEFAULT_EFFECTS, filter: 'bw', brightness: 0.2 })).toBe('grayscale(1) brightness(1.2)');
  });

  it('animates text in and out, and types it out', () => {
    expect(animate('fade', 0, 5, 10).alpha).toBe(0);
    expect(animate('fade', 1, 5, 10).alpha).toBe(1);
    expect(animate('fade', 1, 0.15, 10).alpha).toBeCloseTo(0.5);
    expect(animate('typewriter', 0.1, 5, 40).chars).toBe(3);
  });

  it('finds the word being said in a caption', () => {
    const caption = { start: 10, end: 14, text: 'one two three four' };
    expect(wordAt(caption, 10)).toBe(0);
    expect(wordAt(caption, 13.9)).toBe(3);
  });
});

describe('the sound', () => {
  it('fades a clip through its transitions, and leaves a sped-up piece silent', async () => {
    const { pieceGainAt } = await import('./timeline');
    const placed = layout([clip('a', 0, 4), clip('b', 10, 14, { transition: { type: 'fade', seconds: 1 }, volume: 0.5 }), clip('c', 0, 4, { speed: 2 })]);
    expect(pieceGainAt(placed, 0, 2, 1)).toBe(1);
    expect(pieceGainAt(placed, 0, 3.5, 1)).toBeCloseTo(0.5);
    expect(pieceGainAt(placed, 1, 3.5, 1)).toBeCloseTo(0.25);
    expect(pieceGainAt(placed, 1, 5, 0.8)).toBeCloseTo(0.4);
    expect(pieceGainAt(placed, 2, 8, 1)).toBe(0);
  });

  it('fades the music in and out, lower while a clip speaks', async () => {
    const { musicGainAt, musicSourceAt, DUCK } = await import('./timeline');
    const music = { media: MUSIC, volume: 0.8, fadeIn: 2, fadeOut: 2, duck: true };
    const placed = layout([image('a', 4), clip('b', 0, 4)]);
    expect(musicGainAt(music, placed, 1, 8, 1)).toBeCloseTo(0.4);
    expect(musicGainAt(music, placed, 3, 8, 1)).toBeCloseTo(0.8);
    expect(musicGainAt(music, placed, 5.5, 8, 1)).toBeCloseTo(0.8 * DUCK);
    expect(musicGainAt(music, placed, 5.5, 8, 0)).toBeCloseTo(0.8);
    expect(musicGainAt({ ...music, duck: false }, placed, 5.5, 8, 1)).toBeCloseTo(0.8);
    expect(musicGainAt(music, placed, 7.5, 8, 1)).toBeCloseTo(0.8 * DUCK * 0.25);
    expect(musicSourceAt(music, 100)).toBe(10);
  });
});

describe('an edit with a timeline', () => {
  it('is checked whole, and keeps the parts of the run’s clip it uses for the database', async () => {
    const { parseVideoEdit, editedSeconds } = await import('./edit');
    const raw = { ...defaultEdit(30), sequence: [clip('b', 20, 25), image('a', 3, { transition: { type: 'dip-black', seconds: 1 } }), clip('c', 0, 5)], overlays: [{ id: 'o', text: 'Hi', start: 0, end: 2 }], look: { captionStyle: 'karaoke' }, music: null, cover: 99 };
    const parsed = parseVideoEdit(raw, 30);
    if (!parsed.ok) throw new Error(parsed.error);
    expect(parsed.value.keep).toEqual([{ start: 0, end: 5 }, { start: 20, end: 25 }]);
    expect(editedSeconds(parsed.value)).toBe(12);
    expect(parsed.value.cover).toBeCloseTo(11.95);
    expect(parsed.value.look).toEqual({ captionStyle: 'karaoke', textAnimation: 'none', progressBar: false });
    expect(parsed.value.overlays).toHaveLength(1);
    expect('music' in parsed.value).toBe(false);
    expect(parseVideoEdit({ ...raw, sequence: [image('a', 3)] }, 30)).toEqual({ ok: false, error: 'Keep at least one piece of the run’s clip.' });
  });
});

describe('saving an edit', () => {
  it('keeps a plain cut as kept parts, and a timeline as its sequence', async () => {
    const { compactEdit } = await import('./timeline');
    const base = defaultEdit(30);
    expect(compactEdit({ ...base, sequence: [clip('a', 0, 5), clip('b', 10, 20)], overlays: [], look: { captionStyle: 'box', textAnimation: 'none', progressBar: false } })).toEqual({ ...base, keep: [{ start: 0, end: 5 }, { start: 10, end: 20 }] });
    const reordered = compactEdit({ ...base, sequence: [clip('b', 10, 20), clip('a', 0, 5)] });
    expect(reordered.sequence).toHaveLength(2);
    expect(reordered.keep).toEqual([{ start: 0, end: 5 }, { start: 10, end: 20 }]);
    expect(compactEdit({ ...base, sequence: [clip('a', 0, 5, { effects: { ...DEFAULT_EFFECTS, filter: 'bw' } })] }).sequence).toHaveLength(1);
  });
});

describe('what a person drags on the video', () => {
  const overlay = { id: 'o1', text: 'Ask us', start: 0, end: 5, place: 'top' as const, style: 'banner' as const, animation: 'fade' as const, size: 'medium' as const };
  const base = { ...defaultEdit(20), logo: 'top-left' as const, overlays: [overlay] };

  it('puts the words, the logo and a text where they are dragged, and back in their places', () => {
    let edit = placeAt(base, 'words', { x: 0.5, y: 0.7, scale: 1.4 });
    edit = placeAt(edit, 'logo', { x: 1.3, y: 0.9, scale: 0.1 });
    edit = placeAt(edit, 'o1', { x: 0.2, y: 0.2, scale: 1 });
    expect(spotIn(edit, 'words')).toEqual({ x: 0.5, y: 0.7, scale: 1.4 });
    // Kept on the frame, and no smaller than allowed.
    expect(spotIn(edit, 'logo')).toEqual({ x: 1, y: 0.9, scale: 0.4 });
    expect(spotIn(edit, 'o1')).toEqual({ x: 0.2, y: 0.2, scale: 1 });
    expect(placeAt(edit, 'ghost', { x: 0, y: 0, scale: 1 })).toEqual(edit);
    let back = placeAt(placeAt(placeAt(edit, 'words', null), 'logo', null), 'o1', null);
    expect(back).toEqual(base);
    back = placeAt(back, 'logo', null);
    expect(back).not.toHaveProperty('logoSpot');
  });

  it('keeps where things were dragged when the edit is read back, and drops a logo spot with no logo', () => {
    const edit = placeAt(placeAt(placeAt(base, 'words', { x: 0.5, y: 0.7, scale: 1.4 }), 'logo', { x: 0.8, y: 0.1, scale: 1 }), 'o1', { x: 0.3, y: 0.6, scale: 2 });
    const read = parseVideoEdit(JSON.parse(JSON.stringify(edit)), 20);
    expect(read.ok && read.value.text.spot).toEqual({ x: 0.5, y: 0.7, scale: 1.4 });
    expect(read.ok && read.value.logoSpot).toEqual({ x: 0.8, y: 0.1, scale: 1 });
    expect(read.ok && read.value.overlays?.[0]?.spot).toEqual({ x: 0.3, y: 0.6, scale: 2 });
    const hidden = parseVideoEdit(JSON.parse(JSON.stringify({ ...edit, logo: null })), 20);
    expect(hidden.ok && hidden.value).not.toHaveProperty('logoSpot');
  });
});

describe('AI videos in an edit', () => {
  const VIDEO = '7104c8e0-5a0b-44f7-94fb-2cc144d960c0';
  const AI = { path: aiPath(VIDEO), name: 'A student on campus', width: 854, height: 480, duration: 5 };
  const ai = (id: string): Segment => ({ id, kind: 'clip', media: AI, start: 0, end: 5, speed: 1, volume: 1, effects: DEFAULT_EFFECTS, transition: CUT });
  const cut = (id: string, at: number, start = 0, end = 5): Cutaway => ({ id, media: AI, at, start, end });

  it('names one by its id, and no other file', () => {
    expect(aiVideoOf(AI.path)).toBe(VIDEO);
    expect(aiVideoOf(OTHER.path)).toBeNull();
    expect(aiVideoOf('ai:../videos/x')).toBeNull();
    expect(aiVideosOf({ sequence: [clip('k0', 0, 10), ai('a1')], cutaways: [cut('c1', 2)] })).toEqual([VIDEO]);
  });

  it('goes in at the playhead: the piece under it splits, and what follows plays later', () => {
    // A 7-minute cut of a talk: 0:00-3:00, then 5:00-9:00.
    const talk = [clip('k0', 0, 180), clip('k1', 300, 540)];
    const at3 = insertAt(talk, ai('a1'), 90);
    expect(at3.map((s) => [s.id === 'a1' ? 'ai' : s.kind, s.kind === 'clip' ? s.start : 0, s.kind === 'clip' ? s.end : 0])).toEqual([
      ['clip', 0, 90],
      ['ai', 0, 5],
      ['clip', 90, 180],
      ['clip', 300, 540],
    ]);
    expect(sequenceSeconds(layout(at3))).toBe(425);
    // At a join it goes between the two pieces, splitting nothing.
    expect(insertAt(talk, ai('a2'), 180).map((s) => s.id)).toEqual(['k0', 'a2', 'k1']);
    expect(insertAt(talk, ai('a3'), 0).map((s) => s.id)).toEqual(['a3', 'k0', 'k1']);
    // Past the end, it is the last piece.
    expect(insertAt(talk, ai('a4'), 900).map((s) => s.id)).toEqual(['k0', 'k1', 'a4']);
  });

  it('reads as a piece of the sequence, unchecked by extension, and never as music or a picture', () => {
    const edit = parseVideoEdit({ ...defaultEdit(600), sequence: [clip('k0', 0, 180), ai('a1')] }, 600);
    expect(edit.ok && edit.value.sequence?.[1]).toMatchObject({ media: { path: AI.path, duration: 5 } });
    expect(parseMusic({ media: AI })).toBe('An AI video can only be a video in the edit.');
    expect(parseSequence([clip('k0', 0, 10), { ...image('i1', 3), media: AI }], 600)).toBe('An AI video can only be a video in the edit.');
  });
});

describe('cutaways: another video over the sequence while its sound goes on', () => {
  const B_ROLL = { ...OTHER, duration: 12 };
  const c = (id: string, at: number, start = 0, end = 5): Cutaway => ({ id, media: B_ROLL, at, start, end });

  it('stay inside the video when it gets shorter, and move with the talk when a piece goes in before them', () => {
    const list = [c('c1', 5), c('c2', 25, 0, 10)];
    // Cut down to 28 s: the second is trimmed to the end; too near the end, it no longer fits at all.
    expect(fitCutaways(list, 28)).toEqual([c('c1', 5), c('c2', 25, 0, 3)]);
    expect(fitCutaways(list, 25.2)).toEqual([c('c1', 5)]);
    expect(shiftCutaways(list, 10, 4)).toEqual([c('c1', 5), c('c2', 29, 0, 10)]);
    // The editor fits them on every change, so the edit always saves.
    const edit = { ...defaultEdit(10), cutaways: [c('c1', 2), c('c2', 11)] };
    const fitted = withCutawaysFitted(edit);
    expect(fitted.cutaways).toEqual([c('c1', 2)]);
    expect(parseVideoEdit(fitted, 10).ok).toBe(true);
    expect(parseVideoEdit(edit, 10)).toMatchObject({ ok: false });
  });

  it('show over their stretch, from their own second', () => {
    const list = [c('c1', 10, 2, 7), c('c2', 30)];
    expect(cutawayAt(list, 9.9)).toBeNull();
    expect(cutawayAt(list, 10)).toMatchObject({ cutaway: { id: 'c1' }, source: 2 });
    expect(cutawayAt(list, 12.5)?.source).toBe(4.5);
    expect(cutawayAt(list, 15)).toBeNull();
    expect(cutawayAt(list, 34)?.cutaway.id).toBe('c2');
  });

  it('go in where there is room, as much as fits, in order', () => {
    const list = [c('c1', 20)];
    // Up to the next one.
    expect(addCutaway(list, c('c2', 17), 60)).toEqual([c('c2', 17, 0, 3), c('c1', 20)]);
    // Never over another, or past the end.
    expect(addCutaway(list, c('c3', 22), 60)).toEqual(list);
    expect(addCutaway([], c('c4', 58), 60)).toEqual([c('c4', 58, 0, 2)]);
    expect(addCutaway([], c('c5', 59.9), 60)).toEqual([]);
  });

  it('move and trim inside their video, the video and clear of the others', () => {
    const list = [c('c1', 10), c('c2', 20)];
    expect(moveCutaway(list, 'c1', { at: 18 }, 60)).toEqual([c('c1', 15), c('c2', 20)]);
    expect(moveCutaway(list, 'c1', { end: 12 }, 60)).toEqual([c('c1', 10, 0, 10), c('c2', 20)]);
    expect(moveCutaway(list, 'c2', { at: 2 }, 60)).toEqual([c('c1', 10), c('c2', 15)]);
  });

  it('are checked as the studio sends them, and kept when the edit is saved', () => {
    const base = { ...defaultEdit(60), keep: [{ start: 0, end: 60 }] };
    const ok = parseVideoEdit({ ...base, cutaways: [c('c2', 30), c('c1', 10, 2, 7)] }, 60);
    expect(ok.ok && ok.value.cutaways?.map((x) => x.id)).toEqual(['c1', 'c2']);
    expect(ok.ok && compactEdit(ok.value).cutaways).toHaveLength(2);
    expect(parseVideoEdit({ ...base, cutaways: [c('c1', 10), c('c2', 12)] }, 60)).toEqual({ ok: false, error: 'Two videos over the video overlap: move one.' });
    expect(parseVideoEdit({ ...base, cutaways: [c('c1', 10, 0, 20)] }, 60)).toEqual({ ok: false, error: 'A video over the video is outside it.' });
    expect(parseVideoEdit({ ...base, cutaways: [c('c1', 70)] }, 60)).toEqual({ ok: false, error: 'A video over the video starts past its end.' });
    // Near the end it is cut to fit.
    const tail = parseVideoEdit({ ...base, cutaways: [c('c1', 58)] }, 60);
    expect(tail.ok && tail.value.cutaways?.[0]?.end).toBe(2);
    // Its file is one the edit uses.
    expect(mediaOf({ cutaways: [c('c1', 10)] }).map((m) => m.path)).toEqual([B_ROLL.path]);
    // None is the same edit as before.
    const none = parseVideoEdit({ ...base, cutaways: [] }, 60);
    expect(none.ok && 'cutaways' in compactEdit(none.value)).toBe(false);
  });
});

describe('a whole long video’s edit', () => {
  it('may be as long as the video, with room for what goes in it; an ad stays at ten minutes', () => {
    const hour = 3600;
    const edit = { ...defaultEdit(hour), sequence: [clip('k0', 0, hour), clip('k1', 0, 5, { media: { ...OTHER, duration: 5 } })] };
    expect(parseVideoEdit(edit, hour)).toMatchObject({ ok: false, error: 'Keep the video to ten minutes.' });
    expect(parseVideoEdit(edit, hour, longEditSeconds(hour)).ok).toBe(true);
    expect(longEditSeconds(120)).toBe(720);
  });
});
