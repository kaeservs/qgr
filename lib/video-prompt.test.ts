import { describe, expect, it } from 'vitest';
import { askVideoPrompt, linesAround, MAX_CONTEXT_LINES, parseVideoPromptRequest } from './video-prompt';
import type { VideoPromptPayload } from './video-prompt';

const config = { url: 'https://n8n.example/webhook/qgr-video-prompt', secret: 's3cret' };
const answer = (status: number, body: unknown): typeof fetch => async () => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
/** A line every five seconds for ten minutes. */
const TALK = Array.from({ length: 120 }, (_, i) => ({ start: i * 5, end: i * 5 + 4.5, text: `Line ${i}` }));
const PAYLOAD: VideoPromptPayload = {
  long_video_id: null,
  at: 180,
  seconds: 5,
  aspect: '16:9',
  mode: 'insert',
  idea: '',
  lines: [{ start: 178, end: 182, text: 'Many of our families send a child to study in the U.S.' }],
  brand: { company: 'QGR', offer: 'EB-5', audience: 'Families', guardrails: [], look: null, rules: [], donts: [] },
};

describe('what is said around the point', () => {
  it('is the lines within 45 seconds either side, or of the stretch a cutaway covers', () => {
    expect(linesAround(TALK, 180).map((l) => l.text)).toEqual(TALK.filter((l) => l.end >= 135 && l.start <= 225).map((l) => l.text));
    expect(linesAround(TALK, 360, 420)[0]?.start).toBe(315);
    expect(linesAround(TALK, 360, 420).at(-1)?.start).toBeLessThanOrEqual(465);
  });

  it('keeps the nearest when there are too many, in order', () => {
    const dense = Array.from({ length: 200 }, (_, i) => ({ start: i, end: i + 0.9, text: `Line ${i}` }));
    const near = linesAround(dense, 100);
    expect(near).toHaveLength(MAX_CONTEXT_LINES);
    expect(near[0]!.start).toBe(80);
    expect(near.map((l) => l.start)).toEqual([...near.map((l) => l.start)].sort((a, b) => a - b));
  });
});

describe('the request the browser sends', () => {
  const ok = { at: 180.04, seconds: 5, aspect: '16:9', mode: 'cover', idea: ' a student   on campus ', lines: [{ start: 178, end: 182, text: 'Studying in the U.S.' }] };

  it('is read and tidied', () => {
    expect(parseVideoPromptRequest({ ...ok, longVideoId: '7104c8e0-5a0b-44f7-94fb-2cc144d960c0' })).toEqual({
      ok: true,
      value: { longVideoId: '7104c8e0-5a0b-44f7-94fb-2cc144d960c0', at: 180, seconds: 5, aspect: '16:9', mode: 'cover', idea: 'a student on campus', lines: [{ start: 178, end: 182, text: 'Studying in the U.S.' }] },
    });
  });

  it('needs something to write from, and an AI video’s length and shape', () => {
    expect(parseVideoPromptRequest({ ...ok, idea: '', lines: [] })).toEqual({ ok: false, error: 'Nothing is said here to write from: say what the video should show.' });
    expect(parseVideoPromptRequest({ ...ok, seconds: 30 })).toMatchObject({ ok: false });
    expect(parseVideoPromptRequest({ ...ok, aspect: '4:5' })).toMatchObject({ ok: false });
    expect(parseVideoPromptRequest({ ...ok, idea: 'x'.repeat(401) })).toMatchObject({ ok: false });
    expect(parseVideoPromptRequest({ ...ok, lines: Array.from({ length: 41 }, () => ok.lines[0]) })).toMatchObject({ ok: false });
  });
});

describe('Claude’s prompt, through n8n', () => {
  it('sends the request with the webhook secret, and reads the prompt', async () => {
    let sent: RequestInit | undefined;
    const send: typeof fetch = async (_url, init) => {
      sent = init;
      return new Response(JSON.stringify({ ok: true, prompt: 'A student walks across a sunny U.S. campus, seen from behind.', why: 'They talk about studying in the U.S.' }), { status: 200 });
    };
    expect(await askVideoPrompt(config, PAYLOAD, send)).toEqual({ ok: true, prompt: 'A student walks across a sunny U.S. campus, seen from behind.', why: 'They talk about studying in the U.S.' });
    expect((sent?.headers as Record<string, string>)['X-QGR-Secret']).toBe('s3cret');
    expect(JSON.parse(sent?.body as string)).toEqual(PAYLOAD);
  });

  it('says plainly why there is none', async () => {
    expect(await askVideoPrompt(config, PAYLOAD, answer(200, { ok: false, error: 'Claude declined to write it.' }))).toEqual({ ok: false, error: 'Claude declined to write it.' });
    expect(await askVideoPrompt(config, PAYLOAD, answer(200, { ok: true, prompt: 'Too short' }))).toEqual({ ok: false, error: 'Claude wrote no prompt.' });
    expect(await askVideoPrompt(config, PAYLOAD, answer(404, {}))).toMatchObject({ error: expect.stringMatching(/publish “QGR · AI video”/) });
    const down: typeof fetch = async () => {
      throw new TypeError('fetch failed');
    };
    expect(await askVideoPrompt(config, PAYLOAD, down)).toMatchObject({ ok: false, error: expect.stringMatching(/did not answer/) });
  });
});
