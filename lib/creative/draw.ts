// Draws a variant's branded picture onto a canvas: the design the studio shows
// in CSS (components/content/Creative.tsx and previews.module.css), drawn
// again at a post's size so the file that goes out looks like what was
// approved. Every size is a share of the width, as the CSS's container units
// are, so the drawing is the same at any size. A variant with a layout of its
// own (lib/creative/design.ts) is drawn only here, in the studio too, so what
// is moved is exactly what is posted.

import type { Hit, Spot } from '../spot';
import type { CreativeStyle } from '../types';
import { aspectOf, BRAND_COLORS, loadMark, wrap } from '../video/draw';
import type { Ctx } from '../video/draw';
import type { Size } from '../video/edit';
import { DEFAULT_FONT, LOGO, WORD_FONT_FACE, WORDS } from './design';
import type { CreativeDesign, DesignText } from './design';

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

/** The logo's height on a 440-pixel preview, as previews.module.css sets it: smaller on the wide shape, which is half as tall. */
const LOGO_TALL: Record<CreativeRatio, number> = { square: 52, wide: 34 };

export interface CreativeArt {
  text: string;
  style: CreativeStyle;
  ratio: CreativeRatio;
}

/**
 * The full logo, transparent, in the version each ground needs (made from the
 * client's file, 2026-10-22): as given (gold Q, indigo words) on the
 * spotlight's light ground, with white words on indigo or a photograph, and
 * all indigo on the split's gold panel, where its gold half would vanish.
 */
export const LOGOS = {
  colour: '/brand/qgr-logo-full.png',
  light: '/brand/qgr-logo-full-light.png',
  indigo: '/brand/qgr-logo-full-indigo.png',
} as const;
export type CreativeLogos = Record<keyof typeof LOGOS, CanvasImageSource>;

/** The three logos, decoded; null if any could not be loaded, and the page's name shows instead. */
export async function loadLogos(): Promise<CreativeLogos | null> {
  const [colour, light, indigo] = await Promise.all([loadMark(LOGOS.colour), loadMark(LOGOS.light), loadMark(LOGOS.indigo)]);
  return colour && light && indigo ? { colour, light, indigo } : null;
}

/** Loads the font a design's words are set in. A canvas draws in a fallback font until it has loaded. */
export async function loadWordFont(font: CreativeDesign['font']): Promise<void> {
  if (typeof document === 'undefined' || !('fonts' in document)) return;
  const face = WORD_FONT_FACE[font ?? DEFAULT_FONT];
  await document.fonts.load(`${face.weight} 40px ${face.family}`).catch(() => undefined);
}

/** Which logo sits on a style's top right corner. */
export function logoFor(style: CreativeStyle, picture: boolean): keyof typeof LOGOS {
  if (picture) return 'light';
  return style === 'spotlight' ? 'colour' : style === 'split' ? 'indigo' : 'light';
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

/** The brand's chip, measured: its size at `scale` of the usual. */
function chipSize(ctx: Ctx, size: Size, name: string, scale: number) {
  const k = (size.width / PREVIEW_WIDTH) * scale;
  const font = 11 * k;
  ctx.font = `500 ${font}px ${TEXT}`;
  const textWidth = ctx.measureText(name).width;
  const height = font * 1.4 + 8 * k;
  const width = 10 * k + textWidth + 10 * k;
  return { k, font, width, height };
}

/** The page's name in a chip with its top left at (x, y), when the logo could not be loaded: white, or indigo on the spotlight's light ground. */
function chip(ctx: Ctx, size: Size, light: boolean, name: string, x: number, y: number, scale: number): Hit {
  const { k, font, width, height } = chipSize(ctx, size, name, scale);
  ctx.fillStyle = light ? BRAND_COLORS.indigo : 'rgb(255 255 255 / 0.95)';
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, height / 2);
  ctx.fill();
  const cursor = x + 10 * k;
  ctx.font = `500 ${font}px ${TEXT}`;
  ctx.fillStyle = light ? BRAND_COLORS.white : COLORS.indigoInk;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(name, cursor, y + height / 2);
  return { id: LOGO, x, y, width, height };
}

/** An added text's look: its colour, and the band behind it if it has one. */
const LOOK: Record<DesignText['look'], { color: string; band: string | null }> = {
  gold: { color: BRAND_COLORS.gold, band: null },
  white: { color: BRAND_COLORS.white, band: null },
  indigo: { color: BRAND_COLORS.indigo, band: null },
  banner: { color: BRAND_COLORS.gold, band: 'rgb(28 27 157 / 0.92)' },
};

type Face = (typeof WORD_FONT_FACE)[keyof typeof WORD_FONT_FACE];

/** An added text centred on (cx, cy), up to three lines, in the words' font. */
function addedText(ctx: Ctx, size: Size, t: DesignText, face: Face, cx: number, cy: number, scale: number): Hit {
  const look = LOOK[t.look];
  const fontSize = size.width * 0.046 * face.scale * scale;
  ctx.font = `${face.weight} ${fontSize}px ${face.family}`;
  const lines = balanced(ctx, t.text, size.width * 0.84, 3);
  const lineHeight = fontSize * 1.15;
  const pad = look.band ? { x: fontSize * 0.55, y: fontSize * 0.3 } : { x: 0, y: 0 };
  const width = Math.max(...lines.map((l) => ctx.measureText(l).width)) + pad.x * 2;
  const height = lines.length * lineHeight + pad.y * 2;
  const x = cx - width / 2;
  const y = cy - height / 2;
  if (look.band) {
    ctx.fillStyle = look.band;
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, fontSize * 0.3);
    ctx.fill();
  }
  ctx.fillStyle = look.color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  lines.forEach((line, i) => ctx.fillText(line, cx, y + pad.y + lineHeight * (i + 0.5)));
  return { id: t.id, x, y, width, height };
}

/**
 * Draws the picture onto `ctx`, which is `size` large: the design, or the
 * image model's picture under the words when the variant has one, laid out as
 * the variant's own design says where it has one. Returns where it drew each
 * thing a person can move.
 */
export function drawCreative(
  ctx: Ctx,
  size: Size,
  creative: CreativeArt,
  brand: { name: string; logos: CreativeLogos | null },
  picture: CreativePicture | null = null,
  design: CreativeDesign | null = null,
): Hit[] {
  const { width: w, height: h } = size;
  const cq = w / 100;
  const spots: Record<string, Spot> = design?.spots[creative.ratio] ?? {};
  const hits: Hit[] = [];
  if (picture) cover(ctx, size, picture);
  else art(ctx, size, creative.style);
  // The spotlight's light ground takes indigo words; everything else white,
  // unless the design picks a colour. Its gold rule stays on the light ground.
  const light = creative.style === 'spotlight' && !picture;
  const face = WORD_FONT_FACE[design?.font ?? DEFAULT_FONT];

  const text = creative.text.trim();
  if (text) {
    const placed = spots[WORDS];
    const fontSize = TYPE[creative.style][creative.ratio] * face.scale * w * (placed?.scale ?? 1);
    const lineHeight = fontSize * 1.12;
    const padX = 8 * cq;
    const padY = 7 * cq;
    const left = padX;
    const right = creative.style === 'split' ? 46 * cq : padX;
    const maxWidth = w - left - right;
    ctx.font = `${face.weight} ${fontSize}px ${face.family}`;
    if ('letterSpacing' in ctx) ctx.letterSpacing = `${fontSize * 0.005}px`;
    const maxLines = placed ? 6 : Math.max(1, Math.floor((h - padY * 2) / lineHeight));
    const lines = balanced(ctx, text, placed ? Math.min(w * 0.92, maxWidth * Math.max(1, placed.scale)) : maxWidth, maxLines);
    const ruleGap = 3 * cq;
    const ruleHeight = 1.2 * cq;
    const rule = light ? ruleGap + ruleHeight : 0;
    const block = lines.length * lineHeight + rule;
    const centred = creative.style === 'arcs';
    const widest = Math.max(...lines.map((l) => ctx.measureText(l).width));

    // Where the style puts the block, or centred on the spot a person moved it to.
    let top: number;
    let blockLeft: number;
    if (placed) {
      top = placed.y * h - block / 2;
      blockLeft = placed.x * w - widest / 2;
    } else {
      top = creative.style === 'arcs' ? (creative.ratio === 'wide' ? 15 : 20) * cq : padY + (h - padY * 2 - block) / 2;
      blockLeft = centred ? w / 2 - widest / 2 : left;
    }

    ctx.fillStyle = design?.color ?? (light ? BRAND_COLORS.indigo : BRAND_COLORS.white);
    ctx.textBaseline = 'middle';
    ctx.textAlign = centred ? 'center' : 'left';
    const x = centred ? blockLeft + widest / 2 : blockLeft;
    lines.forEach((line, i) => ctx.fillText(line, x, top + lineHeight * (i + 0.5)));
    if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';

    if (light) {
      ctx.fillStyle = BRAND_COLORS.gold;
      ctx.fillRect(blockLeft, top + lines.length * lineHeight + ruleGap, 18 * cq, ruleHeight);
    }
    hits.push({ id: WORDS, x: blockLeft, y: top, width: widest, height: block });
  }

  // Added texts sit one above another from the bottom, unless moved.
  let bottom = h - 6 * cq;
  for (const t of design?.texts ?? []) {
    const placed = spots[t.id];
    if (placed) {
      hits.push(addedText(ctx, size, t, face, placed.x * w, placed.y * h, placed.scale));
      continue;
    }
    // Measured where it would sit, then drawn there: its height is known only once wrapped.
    const probe = measureText(ctx, size, t, face);
    const hit = addedText(ctx, size, t, face, w / 2, bottom - probe / 2, 1);
    bottom = hit.y - 1.6 * cq;
    hits.push(hit);
  }

  if ((design?.logo ?? true) && brand.logos) {
    // The full logo, transparent, top right, at its usual size LOGO_TALL preview pixels tall.
    const image = brand.logos[logoFor(creative.style, Boolean(picture))];
    const placed = spots[LOGO];
    const height = LOGO_TALL[creative.ratio] * (w / PREVIEW_WIDTH) * (placed?.scale ?? 1);
    const width = height * aspectOf(image);
    const x = placed ? placed.x * w - width / 2 : w - w * 0.05 - width;
    const y = placed ? placed.y * h - height / 2 : w * 0.045;
    ctx.drawImage(image, x, y, width, height);
    hits.push({ id: LOGO, x, y, width, height });
  } else if (design?.logo ?? true) {
    // Without the logo (it could not be loaded), the page's name in a chip.
    const placed = spots[LOGO];
    const scale = placed?.scale ?? 1;
    const { width, height } = chipSize(ctx, size, brand.name, scale);
    const x = placed ? placed.x * w - width / 2 : w - w * 0.05 - width;
    const y = placed ? placed.y * h - height / 2 : w * 0.045;
    hits.push(chip(ctx, size, light, brand.name, x, y, scale));
  }
  return hits;
}

/** An added text's height at its usual size, before it is drawn. */
function measureText(ctx: Ctx, size: Size, t: DesignText, face: Face): number {
  const fontSize = size.width * 0.046 * face.scale;
  ctx.font = `${face.weight} ${fontSize}px ${face.family}`;
  const lines = balanced(ctx, t.text, size.width * 0.84, 3);
  return lines.length * fontSize * 1.15 + (LOOK[t.look].band ? fontSize * 0.6 : 0);
}
