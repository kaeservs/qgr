// The pieces a frame of an edited video is drawn with: the brand's colours and
// type, its background, the logo on its plate, blocks of words and the end card.
// lib/video/compose.ts draws whole frames from them. Every size is a share of
// the frame, so a small preview and a 1080p export look the same.

import { LOGO } from '../spot';
import type { Hit, Spot } from '../spot';
import type { Corner, Size } from './edit';

/** The brand's colours, as app/globals.css has them. A canvas can't read CSS variables in an export. */
export const BRAND_COLORS = {
  indigo: '#1c1b9d',
  indigoDeep: '#15147c',
  indigoSoft: '#3f44b4',
  gold: '#efb74a',
  white: '#ffffff',
  ink: '#0e0f2c',
} as const;

export const DISPLAY = '"Oswald Variable", Oswald, Impact, "Arial Narrow", sans-serif';
export const TEXT = '"Lexend Variable", Lexend, system-ui, sans-serif';

/** What the frame names: the page's name and website, and the logo once it has loaded. */
export interface FrameBrand {
  name: string;
  website: string;
  /** The Q (public/brand/qgr-q.png); without it, the page's name in a pill. */
  mark: CanvasImageSource | null;
}

/**
 * A video's logo: the Q alone, transparent, as the client gave it
 * (2026-10-22). Most of their videos carry a logo already, so an edit starts
 * with none (defaultEdit) and the Q goes on only when a person picks a corner.
 */
export const LOGO_SRC = '/brand/qgr-q.png';

/** An image's width over its height, read off whatever kind of image it is. */
export function aspectOf(image: CanvasImageSource): number {
  const i = image as { naturalWidth?: number; naturalHeight?: number; width?: unknown; height?: unknown };
  const w = i.naturalWidth || (typeof i.width === 'number' ? i.width : 0);
  const h = i.naturalHeight || (typeof i.height === 'number' ? i.height : 0);
  return w > 0 && h > 0 ? w / h : 1;
}

/** A decoded frame of the clip, at whatever size it was decoded. */
export interface Picture {
  image: CanvasImageSource;
  width: number;
  height: number;
}

export type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export function roundedRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

/** Lines of `text` no wider than `width`, at most `max` of them; the last is cut with an ellipsis. */
export function wrap(ctx: Ctx, text: string, width: number, max: number): string[] {
  const fit = (line: string) => {
    if (ctx.measureText(line).width <= width) return line;
    let cut = line;
    while (cut.length > 1 && ctx.measureText(`${cut}…`).width > width) cut = cut.slice(0, -1);
    return `${cut.trimEnd()}…`;
  };
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word;
    if (!line || ctx.measureText(next).width <= width) line = next;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  // What does not fit in `max` lines ends the last one, cut short with an ellipsis.
  if (lines.length > max) return [...lines.slice(0, max - 1), fit(lines.slice(max - 1).join(' '))].map(fit);
  return lines.map(fit);
}

export function background(ctx: Ctx, size: Size) {
  const fill = ctx.createLinearGradient(0, 0, size.width, size.height);
  fill.addColorStop(0, BRAND_COLORS.indigoDeep);
  fill.addColorStop(1, BRAND_COLORS.indigoSoft);
  ctx.fillStyle = fill;
  ctx.fillRect(0, 0, size.width, size.height);
}

/** The site's hero arcs, faint, from a corner. */
export function arcs(ctx: Ctx, size: Size, unit: number) {
  ctx.save();
  ctx.strokeStyle = 'rgb(255 255 255 / 0.09)';
  ctx.lineWidth = Math.max(1, unit * 0.5);
  const long = Math.max(size.width, size.height);
  for (const share of [0.45, 0.65, 0.85]) {
    ctx.beginPath();
    ctx.arc(size.width, size.height, long * share, Math.PI, Math.PI * 1.5);
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * The mark and the page's name in a pill, in its corner, or centred on the
 * spot a person dragged it to at its size there. Returns where it drew it, for
 * what sits below or above it and for the editor's handle.
 */
export function logo(ctx: Ctx, size: Size, frameUnit: number, corner: Corner, brand: FrameBrand, at?: Spot): Hit {
  const unit = frameUnit * (at?.scale ?? 1);
  const margin = frameUnit * 5;
  if (brand.mark) {
    // The Q, transparent, 9 units tall: no plate or pill behind it.
    const height = unit * 9;
    const width = height * aspectOf(brand.mark);
    const px = at ? at.x * size.width - width / 2 : corner.endsWith('left') ? margin : size.width - margin - width;
    const py = at ? at.y * size.height - height / 2 : corner.startsWith('top') ? margin : size.height - margin - height;
    ctx.drawImage(brand.mark, px, py, width, height);
    return { id: LOGO, x: px, y: py, width, height };
  }
  const height = unit * 7;
  const markSize = unit * 4.6;
  ctx.font = `600 ${unit * 2.9}px ${TEXT}`;
  const name = brand.name;
  const textWidth = ctx.measureText(name).width;
  const pad = unit * 1.3;
  const width = pad + (brand.mark ? markSize + unit * 1.1 : 0) + textWidth + pad * 1.3;
  const x = at ? at.x * size.width - width / 2 : corner.endsWith('left') ? margin : size.width - margin - width;
  const y = at ? at.y * size.height - height / 2 : corner.startsWith('top') ? margin : size.height - margin - height;
  ctx.fillStyle = 'rgb(14 15 44 / 0.55)';
  roundedRect(ctx, x, y, width, height, height / 2);
  ctx.fill();
  let cursor = x + pad;
  if (brand.mark) {
    ctx.drawImage(brand.mark, cursor, y + (height - markSize) / 2, markSize, markSize);
    cursor += markSize + unit * 1.1;
  }
  ctx.fillStyle = BRAND_COLORS.white;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillText(name, cursor, y + height / 2 + unit * 0.15);
  return { id: LOGO, x, y, width, height };
}

export interface Block {
  lines: string[];
  lineHeight: number;
  width: number;
  height: number;
  pad: { x: number; y: number };
}

export function block(ctx: Ctx, text: string, font: string, fontSize: number, maxWidth: number, maxLines: number, pad: { x: number; y: number }): Block {
  ctx.font = font;
  const lines = wrap(ctx, text, maxWidth - pad.x * 2, maxLines);
  const lineHeight = fontSize * 1.18;
  const width = Math.max(...lines.map((l) => ctx.measureText(l).width)) + pad.x * 2;
  return { lines, lineHeight, width, height: lines.length * lineHeight + pad.y * 2, pad };
}

export function drawBlock(ctx: Ctx, b: Block, centerX: number, top: number, fill: string, color: string, radius: number) {
  ctx.fillStyle = fill;
  roundedRect(ctx, centerX - b.width / 2, top, b.width, b.height, radius);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  b.lines.forEach((line, i) => ctx.fillText(line, centerX, top + b.pad.y + b.lineHeight * (i + 0.5)));
}

export function endCard(ctx: Ctx, size: Size, unit: number, text: string, brand: FrameBrand) {
  background(ctx, size);
  arcs(ctx, size, unit);
  const markSize = unit * 14;
  const plate = brand.mark ? { width: markSize * aspectOf(brand.mark), height: markSize } : null;
  const words = block(ctx, text, `600 ${unit * 8}px ${DISPLAY}`, unit * 8, size.width * 0.84, 3, { x: 0, y: 0 });
  ctx.font = `500 ${unit * 3.6}px ${TEXT}`;
  const site = brand.website.replace(/^https?:\/\//, '').replace(/\/$/, '');
  const gap = unit * 3.5;
  const total = (plate ? plate.height + gap : 0) + words.height + gap + unit * 3.6;
  let y = (size.height - total) / 2;
  if (brand.mark && plate) {
    ctx.drawImage(brand.mark, (size.width - plate.width) / 2, y, plate.width, plate.height);
    y += plate.height + gap;
  }
  ctx.font = `600 ${unit * 8}px ${DISPLAY}`;
  ctx.fillStyle = BRAND_COLORS.gold;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  words.lines.forEach((line, i) => ctx.fillText(line, size.width / 2, y + words.lineHeight * (i + 0.5)));
  y += words.height + gap;
  ctx.font = `500 ${unit * 3.6}px ${TEXT}`;
  ctx.fillStyle = BRAND_COLORS.white;
  ctx.fillText(site, size.width / 2, y + unit * 1.8);
}

/** Loads the fonts a frame is drawn in. A canvas draws in a fallback font until they have loaded. */
export async function loadFrameFonts(): Promise<void> {
  if (typeof document === 'undefined' || !('fonts' in document)) return;
  await Promise.all([document.fonts.load(`600 40px ${DISPLAY}`), document.fonts.load(`500 20px ${TEXT}`), document.fonts.load(`600 20px ${TEXT}`)]).catch(() => undefined);
}

/** The logo, decoded, for drawing; null if it could not be loaded. */
export async function loadMark(src = LOGO_SRC): Promise<HTMLImageElement | null> {
  try {
    const image = new Image();
    image.src = src;
    await image.decode();
    return image;
  } catch {
    return null;
  }
}
