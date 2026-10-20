import { describe, expect, it } from 'vitest';
import { askPrice } from './video-price';

const config = { url: 'https://n8n.example/webhook/qgr-video-price', secret: 's3cret' };
const answer = (status: number, body: unknown): typeof fetch => async () => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('Higgsfield’s price, through n8n', () => {
  it('sends the request with the webhook secret, and reads the price and the plan’s credits', async () => {
    let sent: RequestInit | undefined;
    const send: typeof fetch = async (_url, init) => {
      sent = init;
      return new Response(JSON.stringify({ ok: true, credits: 2, balance: 280 }), { status: 200 });
    };
    expect(await askPrice(config, { model: 'seedance_2_0_mini', seconds: 4 }, send)).toEqual({ ok: true, credits: 2, balance: 280 });
    expect(sent?.method).toBe('POST');
    expect((sent?.headers as Record<string, string>)['X-QGR-Secret']).toBe('s3cret');
    expect(JSON.parse(sent?.body as string)).toEqual({ model: 'seedance_2_0_mini', seconds: 4 });
  });

  it('says plainly why there is no price', async () => {
    expect(await askPrice(config, {}, answer(200, { ok: true, credits: 7.5, balance: null }))).toEqual({ ok: true, credits: 7.5, balance: null });
    expect(await askPrice(config, {}, answer(200, { ok: false, error: 'Higgsfield could not be reached just now: try again in a minute.' }))).toEqual({ ok: false, error: 'Higgsfield could not be reached just now: try again in a minute.' });
    expect(await askPrice(config, {}, answer(200, { ok: true, credits: 0 }))).toEqual({ ok: false, error: 'Higgsfield gave no price.' });
    expect(await askPrice(config, {}, answer(403, {}))).toMatchObject({ error: expect.stringMatching(/secret does not match/) });
    expect(await askPrice(config, {}, answer(404, {}))).toMatchObject({ error: expect.stringMatching(/publish “QGR · AI video”/) });
    expect(await askPrice(config, {}, answer(500, { message: 'boom' }))).toEqual({ ok: false, error: 'n8n answered 500 without a price.' });
    const down: typeof fetch = async () => {
      throw new TypeError('fetch failed');
    };
    expect(await askPrice(config, {}, down)).toEqual({ ok: false, error: 'n8n did not answer: the price could not be asked.' });
  });
});
