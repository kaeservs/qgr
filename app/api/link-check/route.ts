import { NextResponse } from 'next/server';
import { readPage } from '@/lib/page/read';
import { normalizeUrl } from '@/lib/run-input';
import { checkTeam } from '@/lib/session';

/**
 * Reads a pasted link the way a run will, so the form can say at once whether
 * the page can be read. Returns what was found about the page, never its text.
 */
export async function POST(request: Request) {
  const team = await checkTeam();
  if (!team.ok) return NextResponse.json({ error: team.error }, { status: team.status });
  const body: unknown = await request.json().catch(() => null);
  const raw = typeof body === 'object' && body !== null && 'url' in body ? (body as { url: unknown }).url : null;
  const url = typeof raw === 'string' ? normalizeUrl(raw) : null;
  if (!url) return NextResponse.json({ error: 'Paste a full link, like horizonvisa.com.' }, { status: 400 });

  const page = await readPage(url);
  if (!page.ok) return NextResponse.json({ ok: false, url: page.url, error: page.error });
  return NextResponse.json({ ok: true, url: page.url, title: page.title, siteName: page.siteName, type: page.type, words: page.words });
}
