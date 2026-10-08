import { Parser } from 'htmlparser2';

// Turns a page's HTML into what an agent should read: its title and
// description, and its words without menus, footers, scripts or markup. Pure,
// so it is tested with saved pages (extract.test.ts).
//
// Where the words come from, best first:
// - an article's own body when the page publishes it as structured data
//   (JSON-LD articleBody);
// - the text inside <main> or <article>;
// - the whole body, without navigation, footers, forms and asides.
// A video or podcast page is mostly an app shell, so its description (on
// YouTube, the full description inside the page's data) is what counts.

export type PageType = 'article' | 'video' | 'podcast' | 'website';

export interface PageContent {
  title: string | null;
  siteName: string | null;
  description: string | null;
  type: PageType;
  lang: string | null;
  text: string;
  words: number;
}

/** What an agent gets of a page, at most: about two thousand words. */
export const MAX_TEXT = 12_000;

const SKIP = new Set(['script', 'style', 'noscript', 'svg', 'template', 'iframe', 'canvas', 'nav', 'footer', 'aside', 'form', 'button', 'select', 'dialog', 'head']);
const BLOCK = new Set([
  'p', 'div', 'section', 'article', 'main', 'header', 'li', 'ul', 'ol', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'br', 'tr', 'td', 'th',
  'table', 'blockquote', 'figure', 'figcaption', 'pre', 'dd', 'dt', 'hr', 'summary', 'details',
]);

const clean = (value: string | undefined | null): string | null => {
  const text = (value ?? '').replace(/\s+/g, ' ').trim();
  return text === '' ? null : text;
};

/** Collapses runs of spaces, keeps one line per block, drops repeated lines (menus, cookie bars). */
function tidy(raw: string): string {
  const seen = new Set<string>();
  const lines: string[] = [];
  for (const line of raw.split('\n')) {
    const text = line.replace(/[^\S\n]+/g, ' ').trim();
    if (text === '' || seen.has(text)) continue;
    seen.add(text);
    lines.push(text);
  }
  return lines.join('\n');
}

const truncate = (text: string, max: number) => {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const space = cut.lastIndexOf(' ');
  return `${space > max * 0.8 ? cut.slice(0, space) : cut}…`;
};

const wordCount = (text: string) => (text.match(/\S+/g) ?? []).length;

type Json = string | number | boolean | null | Json[] | { [key: string]: Json };
const isObject = (v: unknown): v is { [key: string]: Json } => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: Json | undefined): string | null => (typeof v === 'string' ? clean(v) : isObject(v) && typeof v.text === 'string' ? clean(v.text) : null);

interface LinkedData {
  types: string[];
  headline: string | null;
  description: string | null;
  body: string | null;
}

/** The facts a page publishes about itself as JSON-LD, flattened across @graph. */
function readLinkedData(blocks: string[]): LinkedData {
  const found: LinkedData = { types: [], headline: null, description: null, body: null };
  const visit = (node: Json | undefined, depth: number) => {
    if (depth > 6 || node === undefined) return;
    if (Array.isArray(node)) return node.forEach((n) => visit(n, depth + 1));
    if (!isObject(node)) return;
    const type = node['@type'];
    const types = (Array.isArray(type) ? type : [type]).filter((t): t is string => typeof t === 'string');
    found.types.push(...types);
    const interesting = types.some((t) => /Article|BlogPosting|Posting|Report|Episode|VideoObject|Clip|WebPage|CreativeWork/.test(t));
    if (interesting) {
      found.headline ??= str(node.headline) ?? str(node.name);
      const description = str(node.description);
      if (description && description.length > (found.description?.length ?? 0)) found.description = description;
      const body = str(node.articleBody) ?? str(node.transcript) ?? str(node.text);
      if (body && body.length > (found.body?.length ?? 0)) found.body = body;
    }
    if (node['@graph'] !== undefined) visit(node['@graph'], depth + 1);
    if (node.mainEntity !== undefined) visit(node.mainEntity, depth + 1);
  };
  for (const block of blocks) {
    try {
      visit(JSON.parse(block) as Json, 0);
    } catch {
      // A malformed block is skipped; the rest of the page still counts.
    }
  }
  return found;
}

/** YouTube keeps a video's full description in the page's player data; the meta tag holds a cut-down copy. */
function youTubeDescription(html: string): string | null {
  const match = /"shortDescription":"((?:[^"\\]|\\.)*)"/.exec(html);
  if (!match?.[1]) return null;
  try {
    return clean(JSON.parse(`"${match[1]}"`) as string);
  } catch {
    return null;
  }
}

function pageType(url: URL, ogType: string | null, ld: LinkedData): PageType {
  const host = url.hostname.replace(/^www\./, '');
  if (/(^|\.)youtube\.com$|^youtu\.be$|(^|\.)vimeo\.com$|(^|\.)loom\.com$/.test(host)) return 'video';
  if (/^podcasts\.apple\.com$|^open\.spotify\.com$|(^|\.)podbean\.com$|(^|\.)buzzsprout\.com$|(^|\.)transistor\.fm$|(^|\.)simplecast\.com$/.test(host)) return 'podcast';
  const og = ogType ?? '';
  if (og.startsWith('video')) return 'video';
  if (og.includes('podcast') || og === 'music.song') return 'podcast';
  if (ld.types.some((t) => /Episode|PodcastSeries|AudioObject/.test(t))) return 'podcast';
  if (ld.types.some((t) => /VideoObject/.test(t))) return 'video';
  if (og === 'article' || ld.types.some((t) => /Article|BlogPosting/.test(t))) return 'article';
  return 'website';
}

export function extractPage(html: string, pageUrl: string, maxText = MAX_TEXT): PageContent {
  const url = new URL(pageUrl);
  const meta = new Map<string, string>();
  const ldBlocks: string[] = [];
  let lang: string | null = null;
  let title = '';
  let firstH1 = '';
  const all: string[] = [];
  const main: string[] = [];

  const stack: { skip: boolean; main: boolean }[] = [];
  let skipping = 0;
  let inMain = 0;
  let inTitle = false;
  let inH1 = false;
  let ldScript: string[] | null = null;

  const parser = new Parser(
    {
      onopentag(name, attrs) {
        const role = (attrs.role ?? '').toLowerCase();
        const hidden = 'hidden' in attrs || attrs['aria-hidden'] === 'true';
        const skip = SKIP.has(name) || hidden || role === 'navigation' || role === 'banner' || role === 'contentinfo';
        const isMain = name === 'main' || name === 'article' || role === 'main';
        stack.push({ skip, main: isMain });
        if (skip) skipping += 1;
        if (isMain) inMain += 1;

        if (name === 'html' && attrs.lang) lang = attrs.lang;
        if (name === 'title') inTitle = true;
        if (name === 'h1' && !firstH1) inH1 = true;
        if (name === 'meta') {
          const key = (attrs.property ?? attrs.name ?? attrs.itemprop ?? '').toLowerCase();
          if (key && attrs.content !== undefined && !meta.has(key)) meta.set(key, attrs.content);
        }
        if (name === 'script' && (attrs.type ?? '').toLowerCase().includes('ld+json')) ldScript = [];
        if (BLOCK.has(name) && skipping === 0) {
          all.push('\n');
          if (inMain > 0) main.push('\n');
        }
      },
      ontext(text) {
        if (inTitle) title += text;
        if (ldScript) ldScript.push(text);
        if (skipping > 0) return;
        if (inH1) firstH1 += text;
        all.push(text);
        if (inMain > 0) main.push(text);
      },
      onclosetag(name) {
        if (name === 'title') inTitle = false;
        if (name === 'h1') inH1 = false;
        if (name === 'script' && ldScript) {
          ldBlocks.push(ldScript.join(''));
          ldScript = null;
        }
        const open = stack.pop();
        if (open?.skip) skipping -= 1;
        if (open?.main) inMain -= 1;
        if (BLOCK.has(name) && skipping === 0) {
          all.push('\n');
          if (inMain > 0) main.push('\n');
        }
      },
    },
    { decodeEntities: true },
  );
  parser.write(html);
  parser.end();

  const ld = readLinkedData(ldBlocks);
  const type = pageType(url, clean(meta.get('og:type')), ld);
  const isYouTube = /(^|\.)youtube\.com$|^youtu\.be$/.test(url.hostname.replace(/^www\./, ''));

  const descriptions = [
    isYouTube ? youTubeDescription(html) : null,
    ld.description,
    clean(meta.get('og:description')),
    clean(meta.get('description')),
    clean(meta.get('twitter:description')),
  ].filter((d): d is string => d !== null);
  // The longest says the most; meta descriptions are often cut short.
  const description = descriptions.sort((a, b) => b.length - a.length)[0] ?? null;

  const mainText = tidy(main.join(''));
  const allText = tidy(all.join(''));
  const pageText = mainText.length >= 300 ? mainText : allText;
  const body = ld.body && ld.body.length >= 300 ? ld.body : pageText;

  let text: string;
  if (type === 'video' || type === 'podcast') {
    // The page around a player is menus and other episodes: lead with the description.
    text = [description, ld.body && ld.body !== description ? ld.body : null, (description?.length ?? 0) < 200 ? pageText : null]
      .filter((t): t is string => !!t)
      .join('\n\n');
  } else {
    text = body.length < 200 && description && !body.includes(description) ? `${description}\n\n${body}`.trim() : body;
  }
  text = truncate(text, maxText);

  return {
    title: clean(meta.get('og:title')) ?? clean(meta.get('twitter:title')) ?? clean(title) ?? ld.headline ?? clean(firstH1),
    siteName: clean(meta.get('og:site_name')) ?? clean(meta.get('application-name')),
    description,
    type,
    lang: clean(lang),
    text,
    words: wordCount(text),
  };
}
