import { NextResponse } from 'next/server';
import { createRun } from '@/lib/data';
import { parseNewRun } from '@/lib/run-input';

/**
 * Starts a run. The browser never talks to n8n directly: this route will hold
 * the webhook URL and its secret, insert the run in Supabase and hand n8n only
 * the run's id.
 */
export async function POST(request: Request) {
  const body: unknown = await request.json().catch(() => null);
  const parsed = parseNewRun(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const run = await createRun(parsed.value);
  return NextResponse.json({ id: run.id }, { status: 201 });
}
