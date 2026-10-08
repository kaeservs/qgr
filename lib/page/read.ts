import type { PageRead } from '../types';
import { extractPage } from './extract';
import { fetchPage } from './fetch';
import type { FetchOptions } from './fetch';

// Reads a page someone pasted and says, in plain words, what came of it. The
// result is stored with the run (runs.page) for the agents, so they never
// fetch a link themselves.

const MESSAGES = {
  invalid: 'That isn’t a web address the reader can open.',
  blocked: 'That address isn’t a public website.',
  timeout: 'The page took too long to answer.',
  unreachable: 'The site couldn’t be reached.',
  certificate: 'The site’s security certificate isn’t valid.',
  redirects: 'The page kept redirecting.',
} as const;

function httpMessage(status: number | undefined): string {
  if (status === 401 || status === 403) return `The site turned the reader away (${status}).`;
  if (status === 404 || status === 410) return `That page doesn’t exist (${status}).`;
  if (status === 429) return 'The site is limiting visits right now (429).';
  if (status !== undefined && status >= 500) return `The site had an error (${status}).`;
  return `The site answered ${status ?? 'oddly'}.`;
}

// Browsers read every Latin-1 label as windows-1252, whose bytes 0x80–0x9F are
// curly quotes, dashes and the euro sign. Node's TextDecoder reads them as
// control characters, so those 32 are mapped here.
const WINDOWS_1252_LABELS = new Set(['windows-1252', 'cp1252', 'x-cp1252', 'iso-8859-1', 'iso8859-1', 'iso_8859-1', 'latin1', 'l1', 'ascii', 'us-ascii', 'cp819', 'ibm819']);
const WINDOWS_1252_HIGH = '€\u0081‚ƒ„…†‡ˆ‰Š‹Œ\u008dŽ\u008f\u0090‘’“”•–—˜™š›œ\u009džŸ';

function decodeWindows1252(body: Buffer): string {
  let text = '';
  for (const byte of body) text += byte >= 0x80 && byte <= 0x9f ? WINDOWS_1252_HIGH.charAt(byte - 0x80) : String.fromCharCode(byte);
  return text;
}

/** Text in the encoding the page declares: its header, a byte-order mark, or a <meta charset>. */
export function decodeBody(body: Buffer, charset: string | null): string {
  if (body[0] === 0xef && body[1] === 0xbb && body[2] === 0xbf) return new TextDecoder('utf-8').decode(body);
  let label = charset;
  if (!label) {
    const head = body.subarray(0, 4096).toString('latin1');
    label = /<meta[^>]+charset\s*=\s*["']?([\w.:-]+)/i.exec(head)?.[1] ?? null;
  }
  if (label && WINDOWS_1252_LABELS.has(label.toLowerCase())) return decodeWindows1252(body);
  try {
    return new TextDecoder(label ?? 'utf-8').decode(body);
  } catch {
    return new TextDecoder('utf-8').decode(body);
  }
}

export async function readPage(url: string, options: FetchOptions = {}): Promise<PageRead> {
  const readAt = new Date().toISOString();
  const fetched = await fetchPage(url, options);
  if (!fetched.ok) {
    return { ok: false, url: fetched.url, error: fetched.reason === 'http' ? httpMessage(fetched.status) : MESSAGES[fetched.reason], readAt };
  }

  const type = (fetched.contentType ?? '').split(';')[0]?.trim().toLowerCase() ?? '';
  if (type === 'application/pdf') return { ok: false, url: fetched.url, error: 'That link is a PDF, which can’t be read yet. Paste its text instead.', readAt };
  if (/^(image|video|audio)\//.test(type)) return { ok: false, url: fetched.url, error: 'That link is a file, not a page.', readAt };
  if (type !== '' && type !== 'text/html' && type !== 'application/xhtml+xml' && type !== 'text/plain') {
    return { ok: false, url: fetched.url, error: 'That link isn’t a web page.', readAt };
  }

  const html = decodeBody(fetched.body, fetched.charset);
  if (type === 'text/plain') {
    const text = html.replace(/\s+\n/g, '\n').trim().slice(0, 12_000);
    const words = (text.match(/\S+/g) ?? []).length;
    if (words === 0) return { ok: false, url: fetched.url, error: 'The page has no words to read.', readAt };
    return { ok: true, url: fetched.url, title: null, siteName: null, description: null, type: 'website', text, words, readAt };
  }

  const content = extractPage(html, fetched.url);
  if (content.words === 0 && !content.title) return { ok: false, url: fetched.url, error: 'The page has no words to read.', readAt };
  return { ok: true, url: fetched.url, title: content.title, siteName: content.siteName, description: content.description, type: content.type, text: content.text, words: content.words, readAt };
}
