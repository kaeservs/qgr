import { NextResponse } from 'next/server';
import { createReferenceUpload, deleteReference } from '@/lib/data';
import { SHOT_TYPES } from '@/lib/data/source';
import type { ShotExtension } from '@/lib/data/source';
import { MAX_REFERENCE_BYTES, REFERENCE_PATH } from '@/lib/run-media';
import { checkTeam } from '@/lib/session';

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Hands the browser a link to upload one reference picture for Higgsfield: a
 * fresh path in the teammate's own folder of run-refs, signed as them. It goes
 * straight to Storage; n8n signs it again for Higgsfield once the run starts.
 */
export async function POST(request: Request) {
  const team = await checkTeam();
  if (!team.ok) return NextResponse.json({ error: team.error }, { status: team.status });
  const body: unknown = await request.json().catch(() => null);
  if (!isRecord(body)) return NextResponse.json({ error: 'Say what is being uploaded.' }, { status: 400 });
  const extension = (Object.keys(SHOT_TYPES) as ShotExtension[]).find((ext) => SHOT_TYPES[ext] === body.type);
  if (!extension) return NextResponse.json({ error: 'Add a PNG, JPEG or WebP picture.' }, { status: 400 });
  const { size } = body;
  if (typeof size !== 'number' || !Number.isInteger(size) || size <= 0) return NextResponse.json({ error: 'The picture’s size is not readable.' }, { status: 400 });
  if (size > MAX_REFERENCE_BYTES) return NextResponse.json({ error: 'That picture is over 10 MB.' }, { status: 413 });

  const ticket = await createReferenceUpload(extension);
  if (!ticket.ok) return NextResponse.json({ error: ticket.error }, { status: ticket.status });
  return NextResponse.json({ path: ticket.value.path, url: ticket.value.url, sample: ticket.sample }, { status: 201 });
}

/** Removes a reference picture taken away before its run started. Storage refuses one a run uses, or someone else's. */
export async function DELETE(request: Request) {
  const team = await checkTeam();
  if (!team.ok) return NextResponse.json({ error: team.error }, { status: team.status });
  const body: unknown = await request.json().catch(() => null);
  const path = isRecord(body) ? body.path : null;
  if (typeof path !== 'string' || !REFERENCE_PATH.test(path)) return NextResponse.json({ error: 'That is not a picture uploaded here.' }, { status: 400 });
  const removed = await deleteReference(path);
  if (!removed.ok) return NextResponse.json({ error: removed.error }, { status: removed.status });
  return new NextResponse(null, { status: 204 });
}
