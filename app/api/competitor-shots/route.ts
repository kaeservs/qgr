import { NextResponse } from 'next/server';
import { createShotUpload, deleteShot } from '@/lib/data';
import { SHOT_TYPES } from '@/lib/data/source';
import type { ShotExtension } from '@/lib/data/source';
import { MAX_SHOT_BYTES, SHOT_PATH } from '@/lib/run-input';
import { checkTeam } from '@/lib/session';

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Hands the browser a link to upload one screenshot of a competitor's ad: a
 * fresh path in the teammate's own folder of competitor-shots, signed as them.
 * Like a clip, it goes straight to Storage.
 */
export async function POST(request: Request) {
  const team = await checkTeam();
  if (!team.ok) return NextResponse.json({ error: team.error }, { status: team.status });
  const body: unknown = await request.json().catch(() => null);
  if (!isRecord(body)) return NextResponse.json({ error: 'Say what is being uploaded.' }, { status: 400 });
  const extension = (Object.keys(SHOT_TYPES) as ShotExtension[]).find((ext) => SHOT_TYPES[ext] === body.type);
  if (!extension) return NextResponse.json({ error: 'Add a PNG, JPEG or WebP screenshot.' }, { status: 400 });
  const { size } = body;
  if (typeof size !== 'number' || !Number.isInteger(size) || size <= 0) return NextResponse.json({ error: 'The screenshot’s size is not readable.' }, { status: 400 });
  if (size > MAX_SHOT_BYTES) return NextResponse.json({ error: 'That screenshot is over 10 MB.' }, { status: 413 });

  const ticket = await createShotUpload(extension);
  if (!ticket.ok) return NextResponse.json({ error: ticket.error }, { status: ticket.status });
  return NextResponse.json({ path: ticket.value.path, url: ticket.value.url, sample: ticket.sample }, { status: 201 });
}

/** Removes a screenshot taken away before its run started. Storage refuses one a run uses, or someone else's. */
export async function DELETE(request: Request) {
  const team = await checkTeam();
  if (!team.ok) return NextResponse.json({ error: team.error }, { status: team.status });
  const body: unknown = await request.json().catch(() => null);
  const path = isRecord(body) ? body.path : null;
  if (typeof path !== 'string' || !SHOT_PATH.test(path)) return NextResponse.json({ error: 'That is not a screenshot uploaded here.' }, { status: 400 });
  const removed = await deleteShot(path);
  if (!removed.ok) return NextResponse.json({ error: removed.error }, { status: removed.status });
  return new NextResponse(null, { status: 204 });
}
