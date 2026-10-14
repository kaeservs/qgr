import { describe, expect, it } from 'vitest';
import { clipTranscript, clock, momentOf, momentText, nudge, parseLongVideo, sameFile, sampleMoments, titleFromFile } from './long-video';

const TRANSCRIPT = Array.from({ length: 60 }, (_, i) => ({ start: i * 10, end: i * 10 + 9.5, text: `Line ${i}.` }));
const FILE = { name: 'webinar.mp4', size: 900_000_000, duration: 600, width: 1920, height: 1080 };

describe('keeping a long video', () => {
  it('takes a name, the file it was and what was heard', () => {
    const r = parseLongVideo({ title: '  EB-5   webinar ', file: FILE, transcript: TRANSCRIPT, guidance: ' Families first ' });
    expect(r).toMatchObject({ ok: true, value: { title: 'EB-5 webinar', guidance: 'Families first', file: FILE } });
    expect(r.ok && r.value.transcript).toHaveLength(60);
    expect(parseLongVideo({ title: 'x', file: FILE, transcript: TRANSCRIPT }).ok && 'guidance' in (parseLongVideo({ title: 'x', file: FILE, transcript: TRANSCRIPT }) as { value: object }).value).toBe(false);
  });

  it('refuses what the browser could not have made', () => {
    expect(parseLongVideo({ title: '', file: FILE, transcript: TRANSCRIPT })).toMatchObject({ error: 'Name the video.' });
    expect(parseLongVideo({ title: 'x', file: { ...FILE, duration: 4 * 3600 }, transcript: TRANSCRIPT })).toMatchObject({ error: 'A long video can be up to three hours.' });
    expect(parseLongVideo({ title: 'x', file: FILE, transcript: [] })).toMatchObject({ error: 'Nothing was heard in the video yet.' });
    expect(parseLongVideo({ title: 'x', file: FILE, transcript: [{ start: 700, end: 705, text: 'Past the end' }] })).toMatchObject({ error: 'A transcript line is outside the video.' });
    expect(parseLongVideo({ title: 'x', file: FILE, transcript: [{ start: 5, end: 4, text: 'Backwards' }] }).ok).toBe(false);
    expect(parseLongVideo({ title: 'x', file: FILE, transcript: TRANSCRIPT, guidance: 'x'.repeat(2001) }).ok).toBe(false);
  });

  it('names a video after its file, and knows the file again', () => {
    expect(titleFromFile('Q3_webinar_final.mp4')).toBe('Q3 webinar final');
    expect(sameFile(FILE, { size: 900_000_000, duration: 600.4 })).toBe(true);
    expect(sameFile(FILE, { size: 899_999_999, duration: 600 })).toBe(false);
  });
});

describe('moments, by line', () => {
  it('takes a moment’s times and words from its lines', () => {
    const m = momentOf(TRANSCRIPT, 3, 6)!;
    expect(m).toMatchObject({ first: 3, last: 6, start: 30, end: 69.5, source: 'team', title: 'Line 3.' });
    expect(momentText(TRANSCRIPT, 3, 5)).toBe('Line 3. Line 4. Line 5.');
    expect(momentOf(TRANSCRIPT, 6, 3)).toBeNull();
    expect(momentOf(TRANSCRIPT, 58, 70)).toBeNull();
  });

  it('gives the clip cut from a moment its captions in its own seconds', () => {
    expect(clipTranscript(TRANSCRIPT, 3, 4)).toEqual([
      { start: 0, end: 9.5, text: 'Line 3.' },
      { start: 10, end: 19.5, text: 'Line 4.' },
    ]);
  });

  it('nudges a moment a line at either end, never inside out, outside or past two and a half minutes', () => {
    const m = { ...momentOf(TRANSCRIPT, 3, 6, { title: 'Kept', source: 'agent' })!, runIds: ['r-1'] };
    expect(nudge(TRANSCRIPT, m, 'start', -1)).toMatchObject({ first: 2, last: 6, start: 20, title: 'Kept', source: 'agent', runIds: ['r-1'] });
    expect(nudge(TRANSCRIPT, m, 'end', 1)).toMatchObject({ first: 3, last: 7, end: 79.5 });
    const one = momentOf(TRANSCRIPT, 3, 3)!;
    expect(nudge(TRANSCRIPT, one, 'end', -1)).toBe(one);
    expect(nudge(TRANSCRIPT, momentOf(TRANSCRIPT, 0, 2)!, 'start', -1).first).toBe(0);
    const long = momentOf(TRANSCRIPT, 0, 14)!;
    expect(nudge(TRANSCRIPT, long, 'end', 1)).toBe(long);
  });

  it('spreads the sample data’s moments across the video, none overlapping', () => {
    const moments = sampleMoments(TRANSCRIPT);
    expect(moments.map((m) => [m.first, m.last])).toEqual([
      [0, 3],
      [12, 15],
      [24, 27],
      [36, 39],
      [48, 51],
    ]);
    expect(moments[0]!.title).toBe('Sample moment: Line 0.');
  });

  it('writes a moment’s place in the video as a clock', () => {
    expect(clock(245)).toBe('4:05');
    expect(clock(3725)).toBe('1:02:05');
  });
});
