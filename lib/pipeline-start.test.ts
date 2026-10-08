import { describe, expect, it } from 'vitest';
import { startPipeline } from './pipeline-start';

const config = { url: 'https://n8n.example/webhook/qgr-run', secret: 's3cret' };

describe('startPipeline', () => {
  it('posts the run id and where to start, with the secret header', async () => {
    let sent: { url: string; init: RequestInit } | null = null;
    const send = (async (url: string, init: RequestInit) => {
      sent = { url, init };
      return new Response(null, { status: 202 });
    }) as typeof fetch;
    expect(await startPipeline(config, 'run-1', 'strategist', send)).toEqual({ ok: true });
    expect(sent!.url).toBe(config.url);
    expect(sent!.init.method).toBe('POST');
    expect(new Headers(sent!.init.headers).get('X-QGR-Secret')).toBe('s3cret');
    expect(JSON.parse(String(sent!.init.body))).toEqual({ runId: 'run-1', startAt: 'strategist' });
  });

  it('says why a hand-over failed', async () => {
    const answer = (status: number) => (async () => new Response(null, { status })) as typeof fetch;
    expect(await startPipeline(config, 'r', 'tracker', answer(403))).toEqual({ ok: false, error: 'n8n turned the run away: the webhook secret does not match.' });
    expect(await startPipeline(config, 'r', 'tracker', answer(404))).toMatchObject({ ok: false, error: expect.stringContaining('publish') });
    expect(await startPipeline(config, 'r', 'tracker', answer(500))).toEqual({ ok: false, error: 'n8n answered 500.' });
    const down = (async () => {
      throw new TypeError('fetch failed');
    }) as typeof fetch;
    expect(await startPipeline(config, 'r', 'tracker', down)).toEqual({ ok: false, error: 'The agents could not be reached: n8n did not answer.' });
  });
});
