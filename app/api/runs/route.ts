import { NextResponse } from 'next/server';
import { createRun } from '@/lib/data';
import { readPage } from '@/lib/page/read';
import { linkToRead, parseNewRun } from '@/lib/run-input';
import { checkTeam } from '@/lib/session';

/**
 * Starts a run. The browser never talks to n8n: this route reads the run's
 * link (the agents never fetch one themselves), records the run in Supabase as
 * the signed-in teammate, then hands n8n only the run's id, with the webhook's
 * secret, which lives in the server's environment alone.
 */
export async function POST(request: Request) {
  const team = await checkTeam();
  if (!team.ok) return NextResponse.json({ error: team.error }, { status: team.status });
  const body: unknown = await request.json().catch(() => null);
  const parsed = parseNewRun(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const link = linkToRead(parsed.value.source);
  const page = link ? await readPage(link) : null;
  // A custom run has nothing else to go on; a competitor run still has their ads.
  if (page && !page.ok && parsed.value.source.kind === 'custom') {
    return NextResponse.json({ error: `${page.error} Paste the page’s text instead, using Text.` }, { status: 422 });
  }

  const run = await createRun(parsed.value, page);
  if (!run.ok) return NextResponse.json({ error: run.error }, { status: run.status });
  return NextResponse.json({ id: run.value.id }, { status: 201 });
}
