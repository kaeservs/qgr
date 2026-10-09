import { PIPELINE_SECRET_HEADER } from './supabase/config';
import type { PipelineConfig } from './supabase/config';
import type { StageKey } from './types';

export type PipelineStart = { ok: true } | { ok: false; error: string };

/**
 * Hands a recorded run to the n8n pipeline. n8n answers 202 at once and the
 * agents report their own progress to Supabase; this only says whether the
 * hand-over worked, in words a person can act on.
 */
export async function startPipeline(config: PipelineConfig, runId: string, startAt: StageKey, send: typeof fetch = fetch): Promise<PipelineStart> {
  let res: Response;
  try {
    res = await send(config.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', [PIPELINE_SECRET_HEADER]: config.secret },
      body: JSON.stringify({ runId, startAt }),
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    return { ok: false, error: 'The agents could not be reached: n8n did not answer.' };
  }
  if (res.ok) return { ok: true };
  if (res.status === 401 || res.status === 403) return { ok: false, error: 'n8n turned the run away: the webhook secret does not match.' };
  if (res.status === 404) return { ok: false, error: 'n8n has no live pipeline: publish “QGR · Run pipeline”.' };
  return { ok: false, error: `n8n answered ${res.status}.` };
}

/**
 * Tells the publisher a post is due now. Best effort: the publisher also
 * looks for due posts every minute, so a ping that fails only costs a minute.
 */
export async function pingPublisher(config: PipelineConfig, send: typeof fetch = fetch): Promise<boolean> {
  try {
    const res = await send(config.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', [PIPELINE_SECRET_HEADER]: config.secret },
      body: '{}',
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
    });
    return res.ok;
  } catch {
    return false;
  }
}
