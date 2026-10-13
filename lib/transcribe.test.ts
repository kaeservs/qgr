import { describe, expect, it } from 'vitest';
import { linesFromChunks, MAX_LINES, transcriptText } from './transcribe';

// Whisper's passages, as transformers.js returns them with return_timestamps.
const JFK = [
  { timestamp: [0, 8], text: ' And so my fellow Americans ask not what your country can do for you' },
  { timestamp: [8, 11], text: ' ask what you can do for your country.' },
];

describe('linesFromChunks', () => {
  it('splits each passage into caption-sized lines sharing its time by their length', () => {
    const lines = linesFromChunks(JFK);
    expect(lines.map((l) => l.text)).toEqual(['And so my fellow Americans ask not what', 'your country can do for you', 'ask what you can do for your country.']);
    expect(lines.every((l) => l.text.length <= 42)).toBe(true);
    // The first passage's eight seconds, shared by length (39 and 27 characters).
    expect(lines[0]).toEqual({ start: 0, end: 4.73, text: 'And so my fellow Americans ask not what' });
    expect(lines[1]).toEqual({ start: 4.73, end: 8, text: 'your country can do for you' });
    expect(lines[2]).toEqual({ start: 8, end: 11, text: 'ask what you can do for your country.' });
    expect(transcriptText(lines)).toBe('And so my fellow Americans ask not what your country can do for you ask what you can do for your country.');
  });

  it('ends a line where a sentence ends', () => {
    const lines = linesFromChunks([{ timestamp: [2, 6], text: ' EB-5 is an investment. It carries risk!  Ask us.' }]);
    expect(lines.map((l) => l.text)).toEqual(['EB-5 is an investment.', 'It carries risk!', 'Ask us.']);
    expect(lines[0]!.start).toBe(2);
    expect(lines[2]!.end).toBe(6);
  });

  it('gives a passage with no end the time to the next one, the clip’s end, or as long as its words take', () => {
    expect(linesFromChunks([{ timestamp: [0, null], text: 'First.' }, { timestamp: [3, 5], text: 'Second.' }])[0]).toEqual({ start: 0, end: 3, text: 'First.' });
    expect(linesFromChunks([{ timestamp: [10, null], text: 'The last words of the clip.' }], 12)).toEqual([{ start: 10, end: 11.8, text: 'The last words of the clip.' }]);
    expect(linesFromChunks([{ timestamp: [10, null], text: 'Said slowly at the very end.' }], 10.5)).toEqual([{ start: 10, end: 10.5, text: 'Said slowly at the very end.' }]);
    expect(linesFromChunks([{ timestamp: [10, null], text: 'No clip length known.' }])).toEqual([{ start: 10, end: 11.4, text: 'No clip length known.' }]);
    // Never past the clip's end: a passage after it is left out.
    expect(linesFromChunks([{ timestamp: [8, 20], text: 'Runs over.' }, { timestamp: [10.2, 11], text: 'After the picture ends.' }], 10)).toEqual([{ start: 8, end: 10, text: 'Runs over.' }]);
  });

  it('leaves out noise, a line said again straight after itself, and anything malformed', () => {
    const lines = linesFromChunks([
      { timestamp: [0, 2], text: ' [Music]' },
      { timestamp: [2, 4], text: '(upbeat music) [BLANK_AUDIO]' },
      { timestamp: [4, 6], text: ' Thank you.' },
      { timestamp: [6, 8], text: ' Thank you.' },
      { timestamp: [8, 9], text: '' },
      { timestamp: [9, 8], text: 'Backwards.' },
      { timestamp: ['x', 10], text: 'Not a time.' },
      { text: 'No time.' },
      null,
      { timestamp: [10, 12], text: 'Kept.' },
    ]);
    expect(lines).toEqual([
      { start: 4, end: 6, text: 'Thank you.' },
      { start: 10, end: 12, text: 'Kept.' },
    ]);
    expect(linesFromChunks('nonsense')).toEqual([]);
    expect(linesFromChunks(null)).toEqual([]);
  });

  it('keeps a long word whole and stops at the most a transcript holds', () => {
    const long = 'x'.repeat(60);
    expect(linesFromChunks([{ timestamp: [0, 2], text: `A ${long} word` }]).map((l) => l.text)).toEqual(['A', long, 'word']);
    const many = Array.from({ length: MAX_LINES + 50 }, (_, i) => ({ timestamp: [i, i + 1] as [number, number], text: `Line ${i}.` }));
    expect(linesFromChunks(many)).toHaveLength(MAX_LINES);
  });
});
