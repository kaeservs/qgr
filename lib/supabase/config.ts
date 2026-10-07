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
