// Draws one frame of an edited video: the picture as the edit frames it, then
// the variant's words, the caption on screen, the mark and, after the last
// part, the end card. The studio's preview and the exported file are both
// drawn by this, so what a person sees is what they export. Every size is a
// share of the frame, so a small preview and a 1080p export look the same.

import { captionAt, placePicture } from './edit';
import type { Corner, Size, VideoEdit } from './edit';

/** The brand's colours, as app/globals.css has them. A canvas can't read CSS variables in an export. */
export const BRAND_COLORS = {
  indigo: '#1c1b9d',
  indigoDeep: '#15147c',
  indigoSoft: '#3f44b4',
  gold: '#efb74a',
  white: '#ffffff',
  ink: '#0e0f2c',
} as const;

const DISPLAY = '"Oswald Variable", Oswald, Impact, "Arial Narrow", sans-serif';
const TEXT = '"Lexend Variable", Lexend, system-ui, sans-serif';

/** What the frame names: the page's name and website, and the mark once it has loaded. */
export interface FrameBrand {
  name: string;
  website: string;
  mark: CanvasImageSource | null;
}

/** A decoded frame of the clip, at whatever size it was decoded. */
export interface Picture {
  image: CanvasImageSource;
  width: number;
  height: number;
}

export interface Scene {
  edit: VideoEdit;
  /** The words over the video: the variant's creative text. */
  words: string;
  brand: FrameBrand;
  /** The edited video's second this frame is at. */
  time: number;
  /** The clip's second it shows; null on the end card. */
  clipTime: number | null;
}

export type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

function roundedRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
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

function background(ctx: Ctx, size: Size) {
  const fill = ctx.createLinearGradient(0, 0, size.width, size.height);
  fill.addColorStop(0, BRAND_COLORS.indigoDeep);
  fill.addColorStop(1, BRAND_COLORS.indigoSoft);
  ctx.fillStyle = fill;
  ctx.fillRect(0, 0, size.width, size.height);
}

/** The site's hero arcs, faint, from a corner. */
function arcs(ctx: Ctx, size: Size, unit: number) {
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

/** The mark and the page's name in a pill. Returns its height, for what sits below or above it. */
function logo(ctx: Ctx, size: Size, unit: number, corner: Corner, brand: FrameBrand): number {
  const height = unit * 7;
  const markSize = unit * 4.6;
  ctx.font = `600 ${unit * 2.9}px ${TEXT}`;
  const name = brand.name;
  const textWidth = ctx.measureText(name).width;
  const pad = unit * 1.3;
  const width = pad + (brand.mark ? markSize + unit * 1.1 : 0) + textWidth + pad * 1.3;
  const margin = unit * 5;
  const x = corner.endsWith('left') ? margin : size.width - margin - width;
  const y = corner.startsWith('top') ? margin : size.height - margin - height;
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
  return height;
}

interface Block {
  lines: string[];
  lineHeight: number;
  width: number;
  height: number;
  pad: { x: number; y: number };
}

function block(ctx: Ctx, text: string, font: string, fontSize: number, maxWidth: number, maxLines: number, pad: { x: number; y: number }): Block {
  ctx.font = font;
  const lines = wrap(ctx, text, maxWidth - pad.x * 2, maxLines);
  const lineHeight = fontSize * 1.18;
  const width = Math.max(...lines.map((l) => ctx.measureText(l).width)) + pad.x * 2;
  return { lines, lineHeight, width, height: lines.length * lineHeight + pad.y * 2, pad };
}

function drawBlock(ctx: Ctx, b: Block, centerX: number, top: number, fill: string, color: string, radius: number) {
  ctx.fillStyle = fill;
  roundedRect(ctx, centerX - b.width / 2, top, b.width, b.height, radius);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  b.lines.forEach((line, i) => ctx.fillText(line, centerX, top + b.pad.y + b.lineHeight * (i + 0.5)));
}

function endCard(ctx: Ctx, size: Size, unit: number, text: string, brand: FrameBrand) {
  background(ctx, size);
  arcs(ctx, size, unit);
  const markSize = unit * 13;
  const words = block(ctx, text, `600 ${unit * 8}px ${DISPLAY}`, unit * 8, size.width * 0.84, 3, { x: 0, y: 0 });
  ctx.font = `500 ${unit * 3.6}px ${TEXT}`;
  const site = brand.website.replace(/^https?:\/\//, '').replace(/\/$/, '');
  const gap = unit * 3.5;
  const total = (brand.mark ? markSize + gap : 0) + words.height + gap + unit * 3.6;
  let y = (size.height - total) / 2;
  if (brand.mark) {
    ctx.drawImage(brand.mark, (size.width - markSize) / 2, y, markSize, markSize);
    y += markSize + gap;
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

/** Draws the frame of `scene` onto `ctx`, which is `size` large. */
export function drawFrame(ctx: Ctx, size: Size, picture: Picture | null, scene: Scene): void {
  const { edit } = scene;
  const unit = Math.min(size.width, size.height) / 100;

  if (scene.clipTime === null) {
    if (edit.endCard) endCard(ctx, size, unit, edit.endCard.text, scene.brand);
    else background(ctx, size);
    return;
  }

  background(ctx, size);
  if (picture) {
    const p = placePicture(edit, picture, size);
    ctx.drawImage(picture.image, p.sx, p.sy, p.sw, p.sh, p.dx, p.dy, p.dw, p.dh);
  }

  const margin = unit * 5;
  const gap = unit * 2;
  let top = margin;
  let bottom = size.height - margin;
  if (edit.logo) {
    const height = logo(ctx, size, unit, edit.logo, scene.brand);
    if (edit.logo.startsWith('top')) top += height + gap;
    else bottom -= height + gap;
  }

  // Captions keep their place whether one is showing or not, so the words above them never jump.
  const captionSize = unit * 4.4;
  const captionPad = { x: unit * 2.2, y: unit * 1.3 };
  if (edit.captions.length > 0) {
    const caption = captionAt(edit.captions, scene.clipTime);
    const reserve = captionSize * 1.18 * 2 + captionPad.y * 2;
    if (caption?.text.trim()) {
      const b = block(ctx, caption.text, `500 ${captionSize}px ${TEXT}`, captionSize, size.width - margin * 2, 2, captionPad);
      drawBlock(ctx, b, size.width / 2, bottom - b.height, 'rgb(0 0 0 / 0.72)', BRAND_COLORS.white, unit * 1.2);
    }
    bottom -= reserve + gap;
  }

  const words = scene.words.trim();
  if (edit.text.show && words && (edit.text.until === null || scene.time < edit.text.until)) {
    const fontSize = unit * 6.8;
    const b = block(ctx, words, `600 ${fontSize}px ${DISPLAY}`, fontSize, size.width - margin * 2, 3, { x: unit * 2.6, y: unit * 1.7 });
    const y = edit.text.place === 'top' ? top : edit.text.place === 'bottom' ? bottom - b.height : (size.height - b.height) / 2;
    drawBlock(ctx, b, size.width / 2, y, 'rgb(28 27 157 / 0.92)', BRAND_COLORS.gold, unit * 2);
  }
}

/** Loads the fonts a frame is drawn in. A canvas draws in a fallback font until they have loaded. */
export async function loadFrameFonts(): Promise<void> {
  if (typeof document === 'undefined' || !('fonts' in document)) return;
  await Promise.all([document.fonts.load(`600 40px ${DISPLAY}`), document.fonts.load(`500 20px ${TEXT}`), document.fonts.load(`600 20px ${TEXT}`)]).catch(() => undefined);
}

/** The mark, decoded, for drawing; null if it could not be loaded. */
export async function loadMark(src = '/brand/qgr-mark.png'): Promise<HTMLImageElement | null> {
  try {
    const image = new Image();
    image.src = src;
    await image.decode();
    return image;
  } catch {
    return null;
  }
}
