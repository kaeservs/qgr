import { lookup as dnsLookup } from 'node:dns';
import type { LookupAddress } from 'node:dns';
import { request as httpRequest } from 'node:http';
import type { ClientRequest, IncomingMessage } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { isIP } from 'node:net';
import type { LookupFunction } from 'node:net';
import { createBrotliDecompress, createGunzip, createInflate } from 'node:zlib';
import type { Transform } from 'node:stream';
import { isPublicAddress } from './address';

// Fetches a page someone pasted, as a careful browser would: public internet
// only, every redirect checked again, a deadline for the whole fetch, and a cap
// on how much is read (after decompression, so a small compressed reply cannot
// unpack into gigabytes). Node's own HTTP client is used, not fetch(), because
// it lets the address check run inside the socket's DNS lookup: the address
// checked is the address connected to.

export interface FetchPolicy {
  /** May the reader connect to this address? */
  allowAddress: (address: string) => boolean;
  /** May the reader use this port? */
  allowPort: (port: number) => boolean;
  /** Resolves a host name to its addresses. Tests replace it. */
  resolve?: (hostname: string) => Promise<LookupAddress[]>;
}

/** The public web, on the standard ports. */
export const PUBLIC_WEB: FetchPolicy = {
  allowAddress: isPublicAddress,
  allowPort: (port) => port === 80 || port === 443,
};

export type FetchFailure = 'invalid' | 'blocked' | 'timeout' | 'unreachable' | 'certificate' | 'http' | 'redirects';

export type FetchResult =
  | { ok: true; url: string; status: number; contentType: string | null; charset: string | null; body: Buffer; truncated: boolean }
  | { ok: false; reason: FetchFailure; url: string; status?: number };

export interface FetchOptions {
  /** For the whole fetch, redirects included. */
  timeoutMs?: number;
  /** Decompressed bytes kept; the rest is not read. */
  maxBytes?: number;
  maxRedirects?: number;
  policy?: FetchPolicy;
}

// A browser's request, with a token saying who is reading. Many sites turn away
// anything that does not look like a browser; the token keeps us identifiable.
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 QGR-LinkReader/1.0',
  Accept: 'text/html,application/xhtml+xml;q=0.9,text/plain;q=0.8,*/*;q=0.5',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept-Encoding': 'gzip, deflate, br',
};

const CERTIFICATE_ERRORS = new Set([
  'CERT_HAS_EXPIRED',
  'CERT_NOT_YET_VALID',
  'DEPTH_ZERO_SELF_SIGNED_CERT',
  'SELF_SIGNED_CERT_IN_CHAIN',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
  'ERR_TLS_CERT_ALTNAME_INVALID',
]);

class Refused extends Error {
  constructor(readonly reason: FetchFailure) {
    super(reason);
  }
}

const defaultResolve = (hostname: string) =>
  new Promise<LookupAddress[]>((resolve, reject) => {
    dnsLookup(hostname, { all: true, verbatim: true }, (err, addresses) => (err ? reject(err) : resolve(addresses)));
  });

/** Why a URL may not be fetched at all, before any connection is made. */
function refuseUrl(url: URL, policy: FetchPolicy): FetchFailure | null {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return 'invalid';
  if (url.username || url.password) return 'invalid';
  const port = url.port ? Number(url.port) : url.protocol === 'https:' ? 443 : 80;
  if (!policy.allowPort(port)) return 'blocked';
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost')) return 'blocked';
  // A typed address skips DNS, and so the lookup check: check it here.
  if (isIP(host) && !policy.allowAddress(host)) return 'blocked';
  return null;
}

type Hop = { ok: true; redirect: string | null; status: number; contentType: string | null; body: Buffer; truncated: boolean } | { ok: false; reason: FetchFailure };

function fetchOnce(url: URL, policy: FetchPolicy, timeoutMs: number, maxBytes: number): Promise<Hop> {
  return new Promise((resolve) => {
    let settled = false;
    let req: ClientRequest | undefined;
    const timer = setTimeout(() => {
      settle({ ok: false, reason: 'timeout' });
      req?.destroy();
    }, timeoutMs);
    function settle(hop: Hop) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(hop);
    }

    const lookup: LookupFunction = (hostname, options, callback) => {
      (policy.resolve ?? defaultResolve)(hostname).then(
        (addresses) => {
          // One private address among public ones is enough to refuse: the
          // socket may pick any of them.
          if (addresses.some((a) => !policy.allowAddress(a.address))) return callback(new Refused('blocked'), '');
          const wanted = options.family === 4 || options.family === 6 ? addresses.filter((a) => a.family === options.family) : addresses;
          const first = wanted[0];
          if (!first) return callback(Object.assign(new Error(`No address for ${hostname}`), { code: 'ENOTFOUND' }), '');
          if (options.all) callback(null, wanted);
          else callback(null, first.address, first.family);
        },
        (err: NodeJS.ErrnoException) => callback(err, ''),
      );
    };

    const send = url.protocol === 'https:' ? httpsRequest : httpRequest;
    req = send(url, { method: 'GET', headers: HEADERS, lookup, agent: false }, (res: IncomingMessage) => {
      const status = res.statusCode ?? 0;
      const location = res.headers.location;
      if (status >= 300 && status < 400 && location) {
        res.resume();
        return settle({ ok: true, redirect: location, status, contentType: null, body: Buffer.alloc(0), truncated: false });
      }

      const encoding = String(res.headers['content-encoding'] ?? '').toLowerCase();
      let stream: IncomingMessage | Transform = res;
      if (encoding === 'gzip' || encoding === 'x-gzip') stream = res.pipe(createGunzip());
      else if (encoding === 'deflate') stream = res.pipe(createInflate());
      else if (encoding === 'br') stream = res.pipe(createBrotliDecompress());

      const chunks: Buffer[] = [];
      let size = 0;
      const done = (truncated: boolean) =>
        settle({ ok: true, redirect: null, status, contentType: res.headers['content-type'] ?? null, body: Buffer.concat(chunks), truncated });
      stream.on('data', (chunk: Buffer) => {
        if (settled) return;
        const room = maxBytes - size;
        if (chunk.length >= room) {
          chunks.push(chunk.subarray(0, room));
          size = maxBytes;
          done(true);
          res.destroy();
          return;
        }
        chunks.push(chunk);
        size += chunk.length;
      });
      stream.on('end', () => done(false));
      stream.on('error', () => settle({ ok: false, reason: 'unreachable' }));
      if (stream !== res) res.on('error', () => settle({ ok: false, reason: 'unreachable' }));
    });

    req.on('error', (err: NodeJS.ErrnoException) => {
      if (err instanceof Refused) return settle({ ok: false, reason: err.reason });
      settle({ ok: false, reason: err.code && CERTIFICATE_ERRORS.has(err.code) ? 'certificate' : 'unreachable' });
    });
    req.end();
  });
}

export async function fetchPage(input: string, options: FetchOptions = {}): Promise<FetchResult> {
  const { timeoutMs = 8000, maxBytes = 2_000_000, maxRedirects = 5, policy = PUBLIC_WEB } = options;
  const deadline = Date.now() + timeoutMs;
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return { ok: false, reason: 'invalid', url: input };
  }

  for (let hop = 0; ; hop += 1) {
    const refused = refuseUrl(url, policy);
    if (refused) return { ok: false, reason: refused, url: url.href };
    const remaining = deadline - Date.now();
    if (remaining <= 0) return { ok: false, reason: 'timeout', url: url.href };

    const result = await fetchOnce(url, policy, remaining, maxBytes);
    if (!result.ok) return { ok: false, reason: result.reason, url: url.href };
    if (result.redirect !== null) {
      if (hop >= maxRedirects) return { ok: false, reason: 'redirects', url: url.href };
      try {
        url = new URL(result.redirect, url);
      } catch {
        return { ok: false, reason: 'invalid', url: url.href };
      }
      continue;
    }
    if (result.status >= 400 || result.status < 200) return { ok: false, reason: 'http', status: result.status, url: url.href };

    const charset = /charset\s*=\s*"?([\w.:-]+)/i.exec(result.contentType ?? '')?.[1] ?? null;
    return { ok: true, url: url.href, status: result.status, contentType: result.contentType, charset, body: result.body, truncated: result.truncated };
  }
}
