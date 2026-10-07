import { NextResponse } from 'next/server';
import { createRun } from '@/lib/data';
import { parseNewRun } from '@/lib/run-input';
import { checkTeam } from '@/lib/session';

/**
 * Starts a run. The browser never talks to n8n: this route records the run in
 * Supabase as the signed-in teammate, then hands n8n only the run's id, with
 * the webhook's secret, which lives in the server's environment alone.
 */
export async function POST(request: Request) {
  const team = await checkTeam();
  if (!team.ok) return NextResponse.json({ error: team.error }, { status: team.status });
  const body: unknown = await request.json().catch(() => null);
  const parsed = parseNewRun(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const run = await createRun(parsed.value);
  if (!run.ok) return NextResponse.json({ error: run.error }, { status: run.status });
  return NextResponse.json({ id: run.value.id }, { status: 201 });
}
