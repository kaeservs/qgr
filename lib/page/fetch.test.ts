import { createServer } from 'node:http';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { brotliCompressSync, gzipSync } from 'node:zlib';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { fetchPage, PUBLIC_WEB } from './fetch';
import type { FetchPolicy } from './fetch';
import { decodeBody, readPage } from './read';

// A real server on this machine plays the web. The default policy must refuse
// it (it is loopback); the test policy allows exactly 127.0.0.1, so anything
// else a redirect or a DNS answer points at is still refused.

let server: Server;
let base = '';

beforeAll(async () => {
  server = createServer((req, res) => {
    const path = req.url ?? '/';
    const html = (body: string, headers: Record<string, string> = {}) => {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', ...headers });
      res.end(body);
    };
    if (path === '/page') return html(`<html><head><title>Hello</title></head><body><main><p>Host ${req.headers.host}. Agent ${req.headers['user-agent']}</p></main></body></html>`);
    if (path === '/hop1') return res.writeHead(301, { location: '/hop2' }).end();
    if (path === '/hop2') return res.writeHead(302, { location: `${base}/page` }).end();
    if (path === '/loop') return res.writeHead(302, { location: '/loop' }).end();
    if (path === '/to-metadata') return res.writeHead(302, { location: 'http://169.254.169.254/latest/meta-data/' }).end();
    if (path === '/to-other-loopback') return res.writeHead(302, { location: base.replace('127.0.0.1', '127.0.0.2') + '/page' }).end();
    if (path === '/gzip') {
      res.writeHead(200, { 'content-type': 'text/html', 'content-encoding': 'gzip' });
      return res.end(gzipSync('<p>squeezed with gzip</p>'));
    }
    if (path === '/br') {
      res.writeHead(200, { 'content-type': 'text/html', 'content-encoding': 'br' });
      return res.end(brotliCompressSync('<p>squeezed with brotli</p>'));
    }
    if (path === '/bomb') {
      res.writeHead(200, { 'content-type': 'text/html', 'content-encoding': 'gzip' });
      return res.end(gzipSync(Buffer.alloc(5_000_000, 'a')));
    }
    if (path === '/big') return html('x'.repeat(50_000));
    if (path === '/slow') return void setTimeout(() => html('<p>late</p>'), 1500);
    if (path === '/forbidden') return res.writeHead(403, { 'content-type': 'text/html' }).end('<p>Access denied</p>');
    if (path === '/pdf') {
      res.writeHead(200, { 'content-type': 'application/pdf' });
      return res.end('%PDF-1.7');
    }
    if (path === '/latin1') {
      res.writeHead(200, { 'content-type': 'text/html; charset=windows-1252' });
      return res.end(Buffer.from([0x3c, 0x70, 0x3e, 0x63, 0x61, 0x66, 0xe9, 0x20, 0x96, 0x20, 0x6f, 0x6b, 0x3c, 0x2f, 0x70, 0x3e]));
    }
    res.writeHead(404).end();
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

const names: Record<string, string[]> = {
  'ok.test': ['127.0.0.1'],
  'evil.test': ['10.0.0.5'],
  'mixed.test': ['127.0.0.1', '10.0.0.5'],
};
const local: FetchPolicy = {
  allowAddress: (address) => address === '127.0.0.1',
  allowPort: () => true,
  resolve: async (hostname) => (names[hostname] ?? []).map((address) => ({ address, family: 4 })),
};
const port = () => base.split(':').pop();

describe('fetchPage, default policy', () => {
  it('refuses this machine, private networks and odd addresses before connecting', async () => {
    for (const url of [`${base}/page`, 'http://localhost/', 'http://app.localhost/', 'http://169.254.169.254/latest/meta-data/', 'http://[::1]/', 'http://10.0.0.1/', 'http://[::ffff:127.0.0.1]/']) {
      expect((await fetchPage(url)).ok, url).toBe(false);
      expect(await fetchPage(url), url).toMatchObject({ reason: 'blocked' });
    }
  });

  it('refuses other protocols, credentials in the link and odd ports', async () => {
    expect(await fetchPage('ftp://example.com/file')).toMatchObject({ ok: false, reason: 'invalid' });
    expect(await fetchPage('https://user:secret@example.com/')).toMatchObject({ ok: false, reason: 'invalid' });
    expect(await fetchPage('https://example.com:8443/')).toMatchObject({ ok: false, reason: 'blocked' });
    expect(await fetchPage('not a url')).toMatchObject({ ok: false, reason: 'invalid' });
    expect(PUBLIC_WEB.allowPort(443) && PUBLIC_WEB.allowPort(80)).toBe(true);
  });
});

describe('fetchPage, allowing only 127.0.0.1', () => {
  it('reads a page, as a browser would ask for it', async () => {
    const page = await fetchPage(`${base}/page`, { policy: local });
    expect(page).toMatchObject({ ok: true, status: 200, charset: 'utf-8', truncated: false });
    expect(page.ok && page.body.toString()).toContain('QGR-LinkReader/1.0');
  });

  it('follows redirects, relative and absolute, and reports where it ended', async () => {
    expect(await fetchPage(`${base}/hop1`, { policy: local })).toMatchObject({ ok: true, url: `${base}/page` });
    expect(await fetchPage(`${base}/loop`, { policy: local })).toMatchObject({ ok: false, reason: 'redirects' });
  });

  it('checks every redirect again', async () => {
    expect(await fetchPage(`${base}/to-metadata`, { policy: local })).toMatchObject({ ok: false, reason: 'blocked' });
    expect(await fetchPage(`${base}/to-other-loopback`, { policy: local })).toMatchObject({ ok: false, reason: 'blocked' });
  });

  it('checks the address a name resolves to, refusing a name with any private address', async () => {
    const ok = await fetchPage(`http://ok.test:${port()}/page`, { policy: local });
    expect(ok.ok && ok.body.toString()).toContain(`Host ok.test:${port()}`);
    expect(await fetchPage(`http://evil.test:${port()}/page`, { policy: local })).toMatchObject({ ok: false, reason: 'blocked' });
    expect(await fetchPage(`http://mixed.test:${port()}/page`, { policy: local })).toMatchObject({ ok: false, reason: 'blocked' });
    expect(await fetchPage(`http://nowhere.test:${port()}/page`, { policy: local })).toMatchObject({ ok: false, reason: 'unreachable' });
  });

  it('unpacks gzip and brotli, and stops reading at the cap, after unpacking', async () => {
    const gz = await fetchPage(`${base}/gzip`, { policy: local });
    expect(gz.ok && gz.body.toString()).toBe('<p>squeezed with gzip</p>');
    const br = await fetchPage(`${base}/br`, { policy: local });
    expect(br.ok && br.body.toString()).toBe('<p>squeezed with brotli</p>');
    const bomb = await fetchPage(`${base}/bomb`, { policy: local, maxBytes: 10_000 });
    expect(bomb).toMatchObject({ ok: true, truncated: true });
    expect(bomb.ok && bomb.body.length).toBe(10_000);
    const big = await fetchPage(`${base}/big`, { policy: local, maxBytes: 1_000 });
    expect(big.ok && big.body.length).toBe(1_000);
  });

  it('gives up on a slow site at the deadline', async () => {
    const started = Date.now();
    expect(await fetchPage(`${base}/slow`, { policy: local, timeoutMs: 200 })).toMatchObject({ ok: false, reason: 'timeout' });
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it('reports the status of a page that refuses', async () => {
    expect(await fetchPage(`${base}/forbidden`, { policy: local })).toMatchObject({ ok: false, reason: 'http', status: 403 });
  });
});

describe('readPage', () => {
  it('reads a page into what the agents need', async () => {
    const page = await readPage(`${base}/hop1`, { policy: local });
    expect(page).toMatchObject({ ok: true, url: `${base}/page`, title: 'Hello', type: 'website' });
    expect(page.ok && page.words).toBeGreaterThan(3);
  });

  it('says in plain words why a page could not be read', async () => {
    expect(await readPage(`${base}/forbidden`, { policy: local })).toMatchObject({ ok: false, error: 'The site turned the reader away (403).' });
    expect(await readPage(`${base}/pdf`, { policy: local })).toMatchObject({ ok: false, error: expect.stringContaining('PDF') });
    expect(await readPage(`${base}/page`)).toMatchObject({ ok: false, error: 'That address isn’t a public website.' });
  });

  it('decodes the encoding the page declares', async () => {
    const page = await readPage(`${base}/latin1`, { policy: local });
    expect(page.ok && page.text).toBe('café – ok');
  });
});

describe('decodeBody', () => {
  it('reads a <meta charset> when the header has none, and survives an unknown one', () => {
    const latin = Buffer.concat([Buffer.from('<meta charset="iso-8859-1"><p>'), Buffer.from([0x63, 0x61, 0x66, 0xe9]), Buffer.from('</p>')]);
    expect(decodeBody(latin, null)).toContain('café');
    expect(decodeBody(Buffer.from('plain'), 'no-such-charset')).toBe('plain');
  });
});
