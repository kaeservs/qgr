// Uploads a clip straight to Storage, through a link the app's server signs
// for it (app/api/uploads). XMLHttpRequest rather than fetch, because only it
// reports how much of an upload has gone. The request is the one supabase-js's
// uploadToSignedUrl sends, so Storage reads it the same way.

import { CLIP_TYPES, EDIT_MEDIA_TYPES, POST_MEDIA_TYPES, SHOT_TYPES } from '../data/source';
import type { ClipExtension, EditMediaExtension, PostMediaExtension, ShotExtension } from '../data/source';
import { keepLocalFile } from './local-files';

/** A failure in words a person can act on. */
export class UploadError extends Error {}

export interface Uploaded {
  path: string;
  /** True when nothing was stored: the sample data keeps no uploads. */
  sample: boolean;
}

export const extensionFor = (type: string): ClipExtension | null => (Object.keys(CLIP_TYPES) as ClipExtension[]).find((ext) => CLIP_TYPES[ext] === type) ?? null;

function refusal(xhr: XMLHttpRequest, what: 'clip' | 'file' | 'screenshot' | 'picture'): string {
  if (xhr.status === 413) return what === 'clip' ? 'The clip is over 50 MB. Cut it shorter.' : what === 'screenshot' || what === 'picture' ? `That ${what} is over 10 MB.` : 'The file is over 50 MB.';
  if (/mime|type/i.test(xhr.responseText)) return what === 'clip' ? 'Storage takes MP4, MOV or WebM videos only.' : 'Storage doesn’t take this kind of file.';
  if (xhr.status === 400 && /expired|signature|token/i.test(xhr.responseText)) return 'The upload link expired. Try again.';
  return `Storage refused the ${what} (${xhr.status}). Try again.`;
}

function put(url: string, file: Blob, name: string, what: 'clip' | 'file' | 'screenshot' | 'picture', onProgress: (share: number) => void, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.setRequestHeader('x-upsert', 'false');
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded / e.total);
    };
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new UploadError(refusal(xhr, what))));
    xhr.onerror = () => reject(new UploadError('The upload stopped. Check the connection and try again.'));
    xhr.onabort = () => reject(new DOMException('The upload was cancelled.', 'AbortError'));
    if (signal?.aborted) return xhr.abort();
    signal?.addEventListener('abort', () => xhr.abort(), { once: true });
    const form = new FormData();
    form.append('cacheControl', '3600');
    form.append('', file, name);
    xhr.send(form);
  });
}

/** Uploads one clip and says where it went. */
export async function uploadClip(file: Blob, onProgress: (share: number) => void, signal?: AbortSignal): Promise<Uploaded> {
  const extension = extensionFor(file.type);
  if (!extension) throw new UploadError('Storage takes MP4, MOV or WebM videos only.');
  const init: RequestInit = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: file.type, size: file.size }) };
  if (signal) init.signal = signal;
  const res = await fetch('/api/uploads', init);
  const body = (await res.json().catch(() => null)) as { path?: string; url?: string | null; sample?: boolean; error?: string } | null;
  if (!res.ok || !body?.path) throw new UploadError(body?.error ?? 'The upload could not be started.');
  if (body.sample || !body.url) {
    onProgress(1);
    return { path: body.path, sample: true };
  }
  await put(body.url, file, `clip.${extension}`, 'clip', onProgress, signal);
  onProgress(1);
  return { path: body.path, sample: false };
}

/** Uploads the file a post goes out with, a JPEG or an MP4, through a link /api/post-media signs. */
export async function uploadPostFile(file: Blob, onProgress: (share: number) => void, signal?: AbortSignal): Promise<Uploaded> {
  const extension = (Object.keys(POST_MEDIA_TYPES) as PostMediaExtension[]).find((ext) => POST_MEDIA_TYPES[ext] === file.type);
  if (!extension) throw new UploadError('A post goes out with a JPEG or an MP4.');
  const init: RequestInit = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: file.type, size: file.size }) };
  if (signal) init.signal = signal;
  const res = await fetch('/api/post-media', init);
  const body = (await res.json().catch(() => null)) as { path?: string; url?: string | null; sample?: boolean; error?: string } | null;
  if (!res.ok || !body?.path) throw new UploadError(body?.error ?? 'The post’s file could not be uploaded.');
  if (body.sample || !body.url) {
    onProgress(1);
    return { path: body.path, sample: true };
  }
  await put(body.url, file, `post.${extension}`, 'file', onProgress, signal);
  onProgress(1);
  return { path: body.path, sample: false };
}

/** Removes a post file no post will use. Best effort, like removeUpload. */
export async function removePostFile(path: string): Promise<void> {
  await fetch('/api/post-media', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path }), keepalive: true }).catch(() => undefined);
}

/**
 * Removes an upload no run will use. Best effort: a clip left behind only
 * takes space. `keepalive` lets it finish while the page is closing.
 */
export async function removeUpload(path: string): Promise<void> {
  await fetch('/api/uploads', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path }), keepalive: true }).catch(() => undefined);
}

/** The extension Storage keeps a file added to an edit under, or null when it takes no such file. */
export const editMediaExtension = (type: string): EditMediaExtension | null =>
  (Object.keys(EDIT_MEDIA_TYPES) as EditMediaExtension[]).find((ext) => EDIT_MEDIA_TYPES[ext] === (type === 'audio/x-wav' || type === 'audio/wave' ? 'audio/wav' : type === 'audio/x-m4a' ? 'audio/mp4' : type)) ?? null;

/**
 * Uploads a file added to a video edit through a link /api/edit-media signs.
 * On the sample data nothing is stored: the file stays in this tab, under a
 * `local:` path, until the page is reloaded.
 */
export async function uploadEditFile(file: File, onProgress: (share: number) => void, signal?: AbortSignal): Promise<Uploaded> {
  const extension = editMediaExtension(file.type);
  if (!extension) throw new UploadError('Add an MP4, MOV or WebM video, a JPEG, PNG or WebP picture, or MP3, M4A, WAV or OGG music.');
  const init: RequestInit = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: EDIT_MEDIA_TYPES[extension], size: file.size }) };
  if (signal) init.signal = signal;
  const res = await fetch('/api/edit-media', init);
  const body = (await res.json().catch(() => null)) as { path?: string; url?: string | null; sample?: boolean; error?: string } | null;
  if (!res.ok || !body?.path) throw new UploadError(body?.error ?? 'The file could not be uploaded.');
  if (body.sample || !body.url) {
    keepLocalFile(body.path.replace(/^local:/, ''), file);
    onProgress(1);
    return { path: body.path, sample: true };
  }
  // Storage checks the type against the bucket's list: send the one it knows this file by.
  const typed = file.type === EDIT_MEDIA_TYPES[extension] ? file : new File([file], file.name, { type: EDIT_MEDIA_TYPES[extension] });
  await put(body.url, typed, `media.${extension}`, 'file', onProgress, signal);
  onProgress(1);
  return { path: body.path, sample: false };
}

/** Removes a file added to an edit that no saved edit uses. Best effort. */
export async function removeEditFile(path: string): Promise<void> {
  if (path.startsWith('local:')) return;
  await fetch('/api/edit-media', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path }), keepalive: true }).catch(() => undefined);
}

/** Uploads a screenshot of a competitor's ad through a link /api/competitor-shots signs. */
export async function uploadShot(file: Blob, onProgress: (share: number) => void, signal?: AbortSignal): Promise<Uploaded> {
  const extension = (Object.keys(SHOT_TYPES) as ShotExtension[]).find((ext) => SHOT_TYPES[ext] === file.type);
  if (!extension) throw new UploadError('Add a PNG, JPEG or WebP screenshot.');
  const init: RequestInit = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: file.type, size: file.size }) };
  if (signal) init.signal = signal;
  const res = await fetch('/api/competitor-shots', init);
  const body = (await res.json().catch(() => null)) as { path?: string; url?: string | null; sample?: boolean; error?: string } | null;
  if (!res.ok || !body?.path) throw new UploadError(body?.error ?? 'The screenshot could not be uploaded.');
  if (body.sample || !body.url) {
    onProgress(1);
    return { path: body.path, sample: true };
  }
  await put(body.url, file, `shot.${extension}`, 'screenshot', onProgress, signal);
  onProgress(1);
  return { path: body.path, sample: false };
}

/** Removes a screenshot taken away before its run started. Best effort. */
export async function removeShot(path: string): Promise<void> {
  await fetch('/api/competitor-shots', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path }), keepalive: true }).catch(() => undefined);
}

/**
 * Uploads an AI video's first picture straight to Storage (video-refs, the
 * teammate's own folder), through a link the server signs as them.
 */
export async function uploadVideoPicture(file: Blob, onProgress: (share: number) => void, signal?: AbortSignal): Promise<Uploaded> {
  const extension = (Object.keys(SHOT_TYPES) as ShotExtension[]).find((ext) => SHOT_TYPES[ext] === file.type);
  if (!extension) throw new UploadError('Add a PNG, JPEG or WebP picture.');
  const init: RequestInit = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: file.type, size: file.size }) };
  if (signal) init.signal = signal;
  const res = await fetch('/api/video-refs', init);
  const body = (await res.json().catch(() => null)) as { path?: string; url?: string | null; sample?: boolean; error?: string } | null;
  if (!res.ok || !body?.path) throw new UploadError(body?.error ?? 'The picture could not be uploaded.');
  if (body.sample || !body.url) {
    onProgress(1);
    return { path: body.path, sample: true };
  }
  await put(body.url, file, `picture.${extension}`, 'picture', onProgress, signal);
  onProgress(1);
  return { path: body.path, sample: false };
}

/** Removes a first picture taken away before its video was asked for. Best effort. */
export async function removeVideoPicture(path: string): Promise<void> {
  await fetch('/api/video-refs', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path }), keepalive: true }).catch(() => undefined);
}
