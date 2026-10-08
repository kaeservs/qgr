// Uploads a clip straight to Storage, through a link the app's server signs
// for it (app/api/uploads). XMLHttpRequest rather than fetch, because only it
// reports how much of an upload has gone. The request is the one supabase-js's
// uploadToSignedUrl sends, so Storage reads it the same way.

import { CLIP_TYPES } from '../data/source';
import type { ClipExtension } from '../data/source';

/** A failure in words a person can act on. */
export class UploadError extends Error {}

export interface Uploaded {
  path: string;
  /** True when nothing was stored: the sample data keeps no uploads. */
  sample: boolean;
}

export const extensionFor = (type: string): ClipExtension | null => (Object.keys(CLIP_TYPES) as ClipExtension[]).find((ext) => CLIP_TYPES[ext] === type) ?? null;

function refusal(xhr: XMLHttpRequest): string {
  if (xhr.status === 413) return 'The clip is over 50 MB. Cut it shorter.';
  if (/mime|type/i.test(xhr.responseText)) return 'Storage takes MP4, MOV or WebM videos only.';
  if (xhr.status === 400 && /expired|signature|token/i.test(xhr.responseText)) return 'The upload link expired. Try again.';
  return `Storage refused the clip (${xhr.status}). Try again.`;
}

function put(url: string, file: Blob, extension: ClipExtension, onProgress: (share: number) => void, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.setRequestHeader('x-upsert', 'false');
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded / e.total);
    };
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new UploadError(refusal(xhr))));
    xhr.onerror = () => reject(new UploadError('The upload stopped. Check the connection and try again.'));
    xhr.onabort = () => reject(new DOMException('The upload was cancelled.', 'AbortError'));
    if (signal?.aborted) return xhr.abort();
    signal?.addEventListener('abort', () => xhr.abort(), { once: true });
    const form = new FormData();
    form.append('cacheControl', '3600');
    form.append('', file, `clip.${extension}`);
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
  await put(body.url, file, extension, onProgress, signal);
  onProgress(1);
  return { path: body.path, sample: false };
}

/**
 * Removes an upload no run will use. Best effort: a clip left behind only
 * takes space. `keepalive` lets it finish while the page is closing.
 */
export async function removeUpload(path: string): Promise<void> {
  await fetch('/api/uploads', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path }), keepalive: true }).catch(() => undefined);
}
