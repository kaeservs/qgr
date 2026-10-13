import { describe, expect, it } from 'vitest';
import { addToPiece } from './speech-long';
import { linesFromChunks, MAX_LINES, MAX_LONG_LINES } from './transcribe';

describe('a long video’s sound, a piece at a time', () => {
  it('mixes the channels and brings 48 kHz down to Whisper’s 16 kHz', () => {
    // One second of stereo at 48 kHz: the left at 0.6, the right at 0.2.
    const frames = 48_000;
    const piece = new Float32Array(16_000);
    addToPiece(piece, 0, { timestamp: 0, sampleRate: 48_000, numberOfFrames: frames, channels: [new Float32Array(frames).fill(0.6), new Float32Array(frames).fill(0.2)] });
    expect(piece[0]).toBeCloseTo(0.4, 5);
    expect(piece[15_999]).toBeCloseTo(0.4, 5);
  });

  it('puts a sample where it falls in the piece, and nothing outside it', () => {
    // A piece from 300 s to 302 s; a half-second sample at 301 s.
    const piece = new Float32Array(2 * 16_000);
    addToPiece(piece, 300, { timestamp: 301, sampleRate: 16_000, numberOfFrames: 8_000, channels: [new Float32Array(8_000).fill(1)] });
    expect(piece[15_999]).toBe(0);
    expect(piece[16_000]).toBe(1);
    expect(piece[23_999]).toBe(1);
    expect(piece[24_000]).toBe(0);
    // A sample running past the piece's end is cut there.
    addToPiece(piece, 300, { timestamp: 301.9, sampleRate: 16_000, numberOfFrames: 16_000, channels: [new Float32Array(16_000).fill(0.5)] });
    expect(piece[31_999]).toBe(0.5);
  });

  it('keeps an hour’s lines, where a clip keeps a thousand', () => {
    const chunks = Array.from({ length: 2000 }, (_, i) => ({ timestamp: [i * 1.8, i * 1.8 + 1.7], text: `Line ${i}.` }));
    expect(linesFromChunks(chunks, 3600)).toHaveLength(MAX_LINES);
    expect(linesFromChunks(chunks, 3600, MAX_LONG_LINES)).toHaveLength(2000);
  });
});
