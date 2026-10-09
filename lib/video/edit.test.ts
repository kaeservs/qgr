import { describe, expect, it } from 'vitest';
import {
  addCaption,
  captionAt,
  captionsFromTranscript,
  clipTimeAt,
  clock,
  defaultEdit,
  editedSeconds,
  editedTimeAt,
  frameSize,
  gapAt,
  keptSeconds,
  length,
  MAX_CAPTIONS,
  MAX_PARTS,
  moveEdge,
  nextPlayable,
  parseSubtitles,
  parseVideoEdit,
  placePicture,
  removePart,
  restoreGap,
  splitAt,
  wholeClip,
} from './edit';
import type { Part, VideoEdit } from './edit';

// A 30-second clip with its middle cut out: 0–10 and 20–30 kept.
const cut: Part[] = [
  { start: 0, end: 10 },
  { start: 20, end: 30 },
];

describe('the two clocks', () => {
  it('maps an edited second to the clip and back', () => {
    expect(clipTimeAt(cut, 0)).toBe(0);
    expect(clipTimeAt(cut, 9.5)).toBe(9.5);
    expect(clipTimeAt(cut, 10)).toBe(20);
    expect(clipTimeAt(cut, 15)).toBe(25);
    expect(clipTimeAt(cut, 20)).toBeNull();
    expect(editedTimeAt(cut, 25)).toBe(15);
    expect(editedTimeAt(cut, 15)).toBeNull();
  });

  it('counts the end card in the edited length', () => {
    expect(keptSeconds(cut)).toBe(20);
    expect(editedSeconds({ keep: cut, endCard: { text: 'Book', seconds: 3 } })).toBe(23);
  });

  it('jumps over a cut while playing, and stops after the last part', () => {
    expect(nextPlayable(cut, 5)).toBeNull();
    expect(nextPlayable(cut, 9.99)).toBe(20);
    expect(nextPlayable(cut, 14)).toBe(20);
    expect(nextPlayable(cut, 29.99)).toBe('end');
    // Parts that touch play straight through.
    expect(nextPlayable(splitAt(wholeClip(30), 10), 9.99)).toBeNull();
  });
});

describe('cutting', () => {
  it('splits a part at the playhead, but not at its very edge', () => {
    expect(splitAt(wholeClip(30), 12.3456)).toEqual([
      { start: 0, end: 12.346 },
      { start: 12.346, end: 30 },
    ]);
    expect(splitAt(wholeClip(30), 0.1)).toEqual(wholeClip(30));
    expect(splitAt(cut, 15)).toEqual(cut);
  });

  it('stops splitting at the limit', () => {
    let keep = wholeClip(600);
    for (let t = 1; t < 100; t++) keep = splitAt(keep, t);
    expect(keep).toHaveLength(MAX_PARTS);
  });

  it('removes a part, never the last one', () => {
    expect(removePart(cut, 0)).toEqual([{ start: 20, end: 30 }]);
    expect(removePart(wholeClip(30), 0)).toEqual(wholeClip(30));
    expect(removePart(cut, 5)).toEqual(cut);
  });

  it('moves an edge within the neighbours and the clip', () => {
    expect(moveEdge(cut, 0, 'end', 25, 30)).toEqual([{ start: 0, end: 20 }, cut[1]]);
    expect(moveEdge(cut, 1, 'start', 5, 30)).toEqual([cut[0], { start: 10, end: 30 }]);
    expect(moveEdge(cut, 1, 'end', 99, 30)).toEqual(cut);
    // A part never shrinks below the shortest part.
    expect(moveEdge(cut, 0, 'end', 0, 30)).toEqual([{ start: 0, end: 0.2 }, cut[1]]);
  });

  it('finds a cut stretch and puts it back', () => {
    expect(gapAt(cut, 15, 30)).toEqual({ start: 10, end: 20 });
    expect(gapAt(cut, 5, 30)).toBeNull();
    expect(gapAt([{ start: 0, end: 10 }], 12, 30)).toEqual({ start: 10, end: 30 });
    expect(restoreGap(cut, 15, 30)).toEqual([cut[0], { start: 10, end: 20 }, cut[1]]);
  });
});

describe('captions', () => {
  it('shows the caption under the playhead, the later one when two overlap', () => {
    const captions = [
      { start: 1, end: 4, text: 'One' },
      { start: 3, end: 6, text: 'Two' },
    ];
    expect(captionAt(captions, 2)?.text).toBe('One');
    expect(captionAt(captions, 3.5)?.text).toBe('Two');
    expect(captionAt(captions, 6)).toBeNull();
  });

  it('adds one that ends before the next', () => {
    const { captions, index } = addCaption([{ start: 5, end: 7, text: 'Later' }], 4, 30);
    expect(index).toBe(0);
    expect(captions[0]).toEqual({ start: 4, end: 5, text: '' });
  });

  it('reads SRT and WebVTT files', () => {
    const srt = '1\r\n00:00:01,000 --> 00:00:03,500\r\nWhat does <i>EB-5</i>\r\nactually involve?\r\n\r\n2\r\n00:00:04,000 --> 00:00:06,000\r\nLet&apos;s see.\r\n';
    expect(parseSubtitles(srt)).toEqual([
      { start: 1, end: 3.5, text: 'What does EB-5 actually involve?' },
      { start: 4, end: 6, text: "Let's see." },
    ]);
    const vtt = 'WEBVTT\n\n00:07.250 --> 00:09.000 align:center\n<v Host>Plain answers.\n\nNOTE skipped\n';
    expect(parseSubtitles(vtt)).toEqual([{ start: 7.25, end: 9, text: 'Plain answers.' }]);
    expect(parseSubtitles('not subtitles at all')).toEqual([]);
  });
});

describe('the frame', () => {
  const hd = { width: 1920, height: 1080 };

  it('keeps the clip’s sharpness and never grows past 1080p', () => {
    expect(frameSize({ aspect: 'original', fit: 'fill' }, hd)).toEqual(hd);
    expect(frameSize({ aspect: '1:1', fit: 'fill' }, hd)).toEqual({ width: 1080, height: 1080 });
    expect(frameSize({ aspect: '9:16', fit: 'fill' }, hd)).toEqual({ width: 608, height: 1080 });
    // A fit puts the whole picture inside, so the frame is larger than the crop.
    expect(frameSize({ aspect: '9:16', fit: 'fit' }, hd)).toEqual({ width: 1080, height: 1920 });
    expect(frameSize({ aspect: 'original', fit: 'fill' }, { width: 3840, height: 2160 })).toEqual(hd);
    // Sides are even, for H.264.
    expect(frameSize({ aspect: 'original', fit: 'fill' }, { width: 853, height: 479 })).toEqual({ width: 854, height: 480 });
  });

  it('crops around the focus point, or fits inside the frame', () => {
    const frame = { width: 1080, height: 1080 };
    expect(placePicture({ fit: 'fill', focus: { x: 0, y: 0.5 } }, hd, frame)).toMatchObject({ sx: 0, sw: 1080, sh: 1080, dw: 1080 });
    expect(placePicture({ fit: 'fill', focus: { x: 1, y: 0.5 } }, hd, frame).sx).toBe(840);
    expect(placePicture({ fit: 'fit', focus: { x: 0.5, y: 0.5 } }, hd, frame)).toMatchObject({ sx: 0, sw: 1920, dx: 0, dy: 236.25, dw: 1080, dh: 607.5 });
  });
});

describe('parseVideoEdit', () => {
  const edit = (change: Partial<VideoEdit> = {}): VideoEdit => ({ ...defaultEdit(30), ...change });

  it('accepts an edit and tidies it', () => {
    const r = parseVideoEdit(
      edit({
        keep: cut,
        aspect: '9:16',
        captions: [
          { start: 21, end: 23, text: '  Second  ' },
          { start: 1, end: 2, text: 'First' },
          { start: 3, end: 4, text: '   ' },
        ],
        endCard: { text: ' Book your free consultation ', seconds: 3 },
        cover: 99,
      }),
      30,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.captions.map((c) => c.text)).toEqual(['First', 'Second']);
    expect(r.value.endCard).toEqual({ text: 'Book your free consultation', seconds: 3 });
    // The cover is clamped to a frame of the video.
    expect(r.value.cover).toBe(22.95);
  });

  it('refuses what the clip cannot hold, in words', () => {
    const refused = (raw: unknown) => {
      const r = parseVideoEdit(raw, 30);
      return r.ok ? null : r.error;
    };
    expect(refused(null)).toBe('The edit is not readable.');
    expect(refused(edit({ keep: [] }))).toBe('Keep at least one part of the clip.');
    expect(refused(edit({ keep: [{ start: 0, end: 40 }] }))).toBe('A kept part is outside the clip.');
    expect(refused(edit({ keep: [{ start: 0, end: 10 }, { start: 5, end: 20 }] }))).toBe('The kept parts overlap.');
    expect(refused({ ...edit(), aspect: '2:1' })).toBe('Pick a shape for the video.');
    expect(refused(edit({ captions: [{ start: 0, end: 2, text: 'x'.repeat(201) }] }))).toBe('Keep each caption under 200 characters.');
    expect(refused(edit({ endCard: { text: '', seconds: 3 } }))).toBe('The end card needs some words.');
    expect(refused(edit({ endCard: { text: 'Book', seconds: 30 } }))).toBe('The end card shows for 1 to 8 seconds.');
    expect(refused({ ...edit(), volume: 2 })).toBe('The volume is not readable.');
    expect(refused({ ...edit(), logo: 'center' })).toBe('Pick a corner for the logo.');
  });
});

describe('time in words', () => {
  it('reads like a timeline and like a duration', () => {
    expect(clock(65.34)).toBe('1:05.3');
    expect(clock(59.96)).toBe('1:00.0');
    expect(length(83.4)).toBe('1:23');
  });
});

describe('captions from the clip’s speech', () => {
  it('keeps the lines heard in the kept parts, cut to them', () => {
    const lines = [
      { start: 0.5, end: 2.5, text: 'EB-5 is an investment.' },
      { start: 3, end: 5.2, text: 'This part is cut.' },
      { start: 6, end: 9, text: '  It carries   risk. ' },
    ];
    expect(captionsFromTranscript(lines, [{ start: 0, end: 2 }, { start: 5.5, end: 8 }])).toEqual([
      { start: 0.5, end: 2, text: 'EB-5 is an investment.' },
      { start: 6, end: 8, text: 'It carries risk.' },
    ]);
  });

  it('stops at the most captions an edit holds', () => {
    const lines = Array.from({ length: 150 }, (_, i) => ({ start: i, end: i + 0.8, text: `Line ${i}` }));
    expect(captionsFromTranscript(lines, [{ start: 0, end: 200 }])).toHaveLength(MAX_CAPTIONS);
  });
});
