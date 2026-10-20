// Higgsfield's price for a video, asked through n8n ("QGR · AI video", its
// Price webhook) before anyone presses Generate. n8n asks Higgsfield with
// get_cost, which makes nothing, and answers with the price and the credits
// left on the team's plan. This only says what came back, in words a person
// can act on.

import { PIPELINE_SECRET_HEADER } from './supabase/config';
import type { PipelineConfig } from './supabase/config';

export type VideoPrice = { ok: true; credits: number; balance: number | null } | { ok: false; error: string };

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Asks n8n for a request's price. Higgsfield can take a while to answer: up to 60 seconds. */
export async function askPrice(config: PipelineConfig, request: unknown, send: typeof fetch = fetch): Promise<VideoPrice> {
  let res: Response;
  try {
    res = await send(config.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', [PIPELINE_SECRET_HEADER]: config.secret },
      body: JSON.stringify(request),
      cache: 'no-store',
      signal: AbortSignal.timeout(60_000),
    });
  } catch {
    return { ok: false, error: 'n8n did not answer: the price could not be asked.' };
  }
  if (res.status === 401 || res.status === 403) return { ok: false, error: 'n8n turned the price away: the webhook secret does not match.' };
  if (res.status === 404) return { ok: false, error: 'n8n has no live AI video workflow: publish “QGR · AI video”.' };
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok || !isRecord(body)) return { ok: false, error: `n8n answered ${res.status} without a price.` };
  if (body.ok !== true) return { ok: false, error: typeof body.error === 'string' && body.error ? body.error : 'Higgsfield gave no price.' };
  const credits = typeof body.credits === 'number' && Number.isFinite(body.credits) && body.credits > 0 ? body.credits : null;
  if (credits === null) return { ok: false, error: 'Higgsfield gave no price.' };
  const balance = typeof body.balance === 'number' && Number.isFinite(body.balance) ? body.balance : null;
  return { ok: true, credits, balance };
}
