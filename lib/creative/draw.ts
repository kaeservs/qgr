// Draws a variant's branded picture onto a canvas: the design the studio shows
// in CSS (components/content/Creative.tsx and previews.module.css), drawn
// again at a post's size so the file that goes out looks like what was
// approved. Every size is a share of the width, as the CSS's container units
// are, so the drawing is the same at any size.

import type { CreativeStyle } from '../types';
import { BRAND_COLORS, wrap } from '../video/draw';
import type { Ctx } from '../video/draw';
import type { Size } from '../video/edit';

const DISPLAY = '"Oswald Variable", Oswald, Impact, "Arial Narrow", sans-serif';
const TEXT = '"Lexend Variable", Lexend, system-ui, sans-serif';

const COLORS = {
  indigoInk: '#1f1e84',
  goldLight: '#f4c66b',
  goldWash: '#fef8eb',
  arcs: ['#2f30ab', '#3f44b4', '#5459c5', '#7a86e4'],
} as const;

/** The shape each place shows a picture in: Meta's feed square, LinkedIn's 1.91:1. */
export type CreativeRatio = 'square' | 'wide';

/** The size a post's picture is made at. */
export const PICTURE_SIZE: Record<CreativeRatio, Size> = {
  square: { width: 1080, height: 1080 },
  wide: { width: 1200, height: 628 },
};

/** The type size, as a share of the width: --type in previews.module.css. */
const TYPE: Record<CreativeStyle, Record<CreativeRatio, number>> = {
  arcs: { square: 0.105, wide: 0.072 },
  split: { square: 0.086, wide: 0.062 },
  spotlight: { square: 0.105, wide: 0.072 },
};

/** The preview the chip's fixed pixel sizes were set at; a bigger picture scales them up. */
const PREVIEW_WIDTH = 440;

export interface CreativeArt {
  text: string;
  style: CreativeStyle;
  ratio: CreativeRatio;
}

/** A picture an image model made, drawn under the words in place of the design. */
export interface CreativePicture {
  image: CanvasImageSource;
  width: number;
  height: number;
}

/**
 * The picture filling the frame, cropped to it about the middle, then darkened
 * as the studio shows it (brightness 0.62): a black wash at 38% is the same,
 * and every browser's canvas draws it.
 */
function cover(ctx: Ctx, size: Size, picture: CreativePicture) {
  const scale = Math.max(size.width / picture.width, size.height / picture.height);
  const w = picture.width * scale;
  const h = picture.height * scale;
  ctx.drawImage(picture.image, (size.width - w) / 2, (size.height - h) / 2, w, h);
  ctx.fillStyle = 'rgb(0 0 0 / 0.38)';
  ctx.fillRect(0, 0, size.width, size.height);
}

/** A circle filled from `center` to `share` of the distance to the farthest corner: CSS's radial-gradient circle with a hard stop. */
function disc(ctx: Ctx, size: Size, cx: number, cy: number, share: number, color: string) {
  const far = Math.max(Math.hypot(cx, cy), Math.hypot(size.width - cx, cy), Math.hypot(cx, size.height - cy), Math.hypot(size.width - cx, size.height - cy));
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(cx, cy, far * share, 0, Math.PI * 2);
  ctx.fill();
}

function art(ctx: Ctx, size: Size, style: CreativeStyle) {
  const { width: w, height: h } = size;
  if (style === 'arcs') {
    ctx.fillStyle = BRAND_COLORS.indigo;
    ctx.fillRect(0, 0, w, h);
    // Largest first: CSS lists the smallest on top.
    [0.66, 0.52, 0.38, 0.24].forEach((share, i) => disc(ctx, size, w / 2, h * 1.35, share, COLORS.arcs[i] ?? BRAND_COLORS.indigo));
  } else if (style === 'split') {
    ctx.fillStyle = BRAND_COLORS.indigo;
    ctx.fillRect(0, 0, w * 0.58, h);
    ctx.fillStyle = BRAND_COLORS.gold;
    ctx.fillRect(w * 0.58, 0, w * 0.42, h);
    disc(ctx, size, w, h, 0.44, COLORS.goldLight);
    disc(ctx, size, w, h, 0.3, '#2f30ab');
    disc(ctx, size, w, h, 0.18, BRAND_COLORS.indigo);
  } else {
    ctx.fillStyle = COLORS.goldWash;
    ctx.fillRect(0, 0, w, h);
    disc(ctx, size, w, h, 0.44, 'rgb(122 134 228 / 0.2)');
    disc(ctx, size, w, h, 0.3, 'rgb(122 134 228 / 0.35)');
    disc(ctx, size, 0, 0, 0.22, 'rgb(239 183 74 / 0.45)');
  }
}

/**
 * Lines as CSS's text-wrap: balance sets them: as many as a greedy wrap
 * needs, each as close to the same width as they can be.
 */
export function balanced(ctx: Ctx, text: string, width: number, max: number): string[] {
  const greedy = wrap(ctx, text, width, max);
  if (greedy.length < 2) return greedy;
  let low = width / greedy.length;
  let high = width;
  for (let i = 0; i < 12; i++) {
    const mid = (low + high) / 2;
    if (wrap(ctx, text, mid, 99).length > greedy.length) low = mid;
    else high = mid;
  }
  return wrap(ctx, text, high, max);
}

/** The brand's chip: white, or indigo on the spotlight's light ground. */
function chip(ctx: Ctx, size: Size, light: boolean, mark: CanvasImageSource | null, name: string) {
  const k = size.width / PREVIEW_WIDTH;
  const font = 11 * k;
  const markSize = mark ? 18 * k : 0;
  ctx.font = `500 ${font}px ${TEXT}`;
  const textWidth = ctx.measureText(name).width;
  const height = Math.max(markSize, font * 1.4) + 8 * k;
  const width = 5 * k + (mark ? markSize + 6 * k : 0) + textWidth + 10 * k;
  const x = size.width * 0.06;
  const y = size.width * 0.05;
  ctx.fillStyle = light ? BRAND_COLORS.indigo : 'rgb(255 255 255 / 0.95)';
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, height / 2);
  ctx.fill();
  let cursor = x + 5 * k;
  if (mark) {
    ctx.drawImage(mark, cursor, y + (height - markSize) / 2, markSize, markSize);
    cursor += markSize + 6 * k;
  }
  ctx.fillStyle = light ? BRAND_COLORS.white : COLORS.indigoInk;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(name, cursor, y + height / 2);
}

/**
 * Draws the picture onto `ctx`, which is `size` large: the design, or the
 * image model's picture under the words when the variant has one.
 */
export function drawCreative(ctx: Ctx, size: Size, creative: CreativeArt, brand: { name: string; mark: CanvasImageSource | null }, picture: CreativePicture | null = null): void {
  const { width: w, height: h } = size;
  const cq = w / 100;
  if (picture) cover(ctx, size, picture);
  else art(ctx, size, creative.style);
  // On a picture the spotlight's indigo words and rule give way to gold, as in the studio.
  const light = creative.style === 'spotlight' && !picture;

  const fontSize = TYPE[creative.style][creative.ratio] * w;
  const lineHeight = fontSize * 1.12;
  const padX = 8 * cq;
  const padY = 7 * cq;
  const left = padX;
  const right = creative.style === 'split' ? 46 * cq : padX;
  const maxWidth = w - left - right;
  ctx.font = `600 ${fontSize}px ${DISPLAY}`;
  if ('letterSpacing' in ctx) ctx.letterSpacing = `${fontSize * 0.005}px`;
  const maxLines = Math.max(1, Math.floor((h - padY * 2) / lineHeight));
  const lines = balanced(ctx, creative.text.trim(), maxWidth, maxLines);
  const rule = light ? 3 * cq + 1.2 * cq : 0;
  const block = lines.length * lineHeight + rule;

  let top: number;
  if (creative.style === 'arcs') top = (creative.ratio === 'wide' ? 13 : 18) * cq;
  else top = padY + (h - padY * 2 - block) / 2;

  ctx.fillStyle = light ? BRAND_COLORS.indigo : BRAND_COLORS.gold;
  ctx.textBaseline = 'middle';
  ctx.textAlign = creative.style === 'arcs' ? 'center' : 'left';
  const x = creative.style === 'arcs' ? w / 2 : left;
  lines.forEach((line, i) => ctx.fillText(line, x, top + lineHeight * (i + 0.5)));
  if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';

  if (light) {
    ctx.fillStyle = BRAND_COLORS.gold;
    ctx.fillRect(left, top + lines.length * lineHeight + 3 * cq, 18 * cq, 1.2 * cq);
  }
  chip(ctx, size, light, brand.mark, brand.name);
}
