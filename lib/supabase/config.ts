// Where the app finds Supabase and the n8n pipeline. Both are optional: without
// Supabase the dashboard runs on its sample data; without n8n, a run cannot
// start. None of these reach the browser: they have no NEXT_PUBLIC_ prefix and
// only server code reads them.

export interface SupabaseConfig {
  url: string;
  /** The publishable key. Public by design: row level security guards the data. */
  key: string;
}

export function supabaseConfig(): SupabaseConfig | null {
  const url = process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_PUBLISHABLE_KEY?.trim();
  return url && key ? { url, key } : null;
}

export interface PipelineConfig {
  /** The "QGR · Run pipeline" webhook in n8n. */
  url: string;
  /** Sent as PIPELINE_SECRET_HEADER; the webhook's Header Auth credential holds the same value. */
  secret: string;
}

export const PIPELINE_SECRET_HEADER = 'X-QGR-Secret';

export function pipelineConfig(): PipelineConfig | null {
  const url = process.env.N8N_RUN_WEBHOOK_URL?.trim();
  const secret = process.env.N8N_RUN_WEBHOOK_SECRET?.trim();
  return url && secret ? { url, secret } : null;
}

/**
 * The "QGR · Publisher" webhook, which sends a post that is due now instead of
 * waiting for the publisher's next minute. Its own setting, or else the run
 * webhook's address with /qgr-publish in place of /qgr-run; the same secret.
 */
export const publisherConfig = (): PipelineConfig | null => siblingWebhook('N8N_PUBLISH_WEBHOOK_URL', 'qgr-publish');

/**
 * The "QGR · Pictures" webhook, which makes a picture someone asked for now
 * instead of at the workflow's next five minutes. Found the same way as the
 * publisher's.
 */
export const picturesConfig = (): PipelineConfig | null => siblingWebhook('N8N_PICTURES_WEBHOOK_URL', 'qgr-picture');

/** The "QGR · Moments" webhook, which looks at a long video now instead of at the workflow's next five minutes. */
export const momentsConfig = (): PipelineConfig | null => siblingWebhook('N8N_MOMENTS_WEBHOOK_URL', 'qgr-moments');

/** The "QGR · Leads" webhook, which reads Zoho and judges the leads waiting now instead of in its next fifteen minutes. */
export const leadsConfig = (): PipelineConfig | null => siblingWebhook('N8N_LEADS_WEBHOOK_URL', 'qgr-leads');

/** The "QGR · AI video" webhook, which sends a video someone asked for now instead of at the workflow's next minute. */
export const videoConfig = (): PipelineConfig | null => siblingWebhook('N8N_VIDEO_WEBHOOK_URL', 'qgr-video');

/** The same workflow's price webhook: Higgsfield's price for a request, answered at once (nothing is made). */
export const videoPriceConfig = (): PipelineConfig | null => siblingWebhook('N8N_VIDEO_PRICE_WEBHOOK_URL', 'qgr-video-price');

/** A webhook beside the run pipeline's: its own setting, or the run webhook's address with its path in place of qgr-run. */
function siblingWebhook(setting: string, path: string): PipelineConfig | null {
  const pipeline = pipelineConfig();
  if (!pipeline) return null;
  const own = process.env[setting]?.trim();
  if (own) return { url: own, secret: pipeline.secret };
  return /\/qgr-run$/.test(pipeline.url) ? { url: pipeline.url.replace(/\/qgr-run$/, `/${path}`), secret: pipeline.secret } : null;
}
