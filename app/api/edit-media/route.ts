import { NextResponse } from 'next/server';
import { createEditMediaUpload, deleteEditMedia } from '@/lib/data';
import { EDIT_MEDIA_TYPES } from '@/lib/data/source';
import type { EditMediaExtension } from '@/lib/data/source';
import { MAX_CLIP_BYTES } from '@/lib/run-input';
import { MEDIA_PATH } from '@/lib/video/timeline';
import { checkTeam } from '@/lib/session';

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Hands the browser a link to upload a file added to a video edit (another
 * video, a picture or music): a fresh path in the teammate's own folder of
 * edit-media, signed as them. Like a clip, it goes straight to Storage.
 */
export async function POST(request: Request) {
  const team = await checkTeam();
  if (!team.ok) return NextResponse.json({ error: team.error }, { status: team.status });
  const body: unknown = await request.json().catch(() => null);
  if (!isRecord(body)) return NextResponse.json({ error: 'Say what is being uploaded.' }, { status: 400 });
  const extension = (Object.keys(EDIT_MEDIA_TYPES) as EditMediaExtension[]).find((ext) => EDIT_MEDIA_TYPES[ext] === body.type);
  if (!extension) return NextResponse.json({ error: 'Add an MP4, MOV or WebM video, a JPEG, PNG or WebP picture, or MP3, M4A, WAV or OGG music.' }, { status: 400 });
  const { size } = body;
  if (typeof size !== 'number' || !Number.isInteger(size) || size <= 0) return NextResponse.json({ error: 'The file’s size is not readable.' }, { status: 400 });
  if (size > MAX_CLIP_BYTES) return NextResponse.json({ error: 'The file is over 50 MB.' }, { status: 413 });

  const ticket = await createEditMediaUpload(extension);
  if (!ticket.ok) return NextResponse.json({ error: ticket.error }, { status: ticket.status });
  return NextResponse.json({ path: ticket.value.path, url: ticket.value.url, sample: ticket.sample }, { status: 201 });
}

/** Removes a file added to an edit and left out again. Storage refuses one a saved edit uses, or someone else's. */
export async function DELETE(request: Request) {
  const team = await checkTeam();
  if (!team.ok) return NextResponse.json({ error: team.error }, { status: team.status });
  const body: unknown = await request.json().catch(() => null);
  const path = isRecord(body) ? body.path : null;
  if (typeof path !== 'string' || !MEDIA_PATH.test(path) || path.startsWith('local:')) return NextResponse.json({ error: 'That is not a file added here.' }, { status: 400 });
  const removed = await deleteEditMedia(path);
  if (!removed.ok) return NextResponse.json({ error: removed.error }, { status: removed.status });
  return new NextResponse(null, { status: 204 });
}
