// Draws one frame of an edited video from its timeline: the piece on screen
// (a part of a clip, a picture or a title card) with its effects and motion,
// two pieces at once through a transition, then everything laid over the
// video: the mark, the captions in their style, the variant's words and the
// edit's own texts as they animate in and out, and a progress bar. After the
// last piece, the end card. The studio's preview and the exported file are
// both drawn by this, so what a person sees is what they export.
//
// The caller decodes: `pictureOf` hands over the frame a piece shows (from a
// <video> while previewing, from the decoder while exporting), or null while it
// is not ready, which draws the brand's indigo in its place. A cutaway (another
// video over the sequence for a stretch) comes from `cutawayOf` the same way,
// and an AI video still being made shows as on its way.

import { DEFAULT_FONT, WORD_FONT_FACE } from '../creative/design';
import { WORDS } from '../spot';
import type { Hit } from '../spot';
import { captionAt, placePicture } from './edit';
import type { Caption, Size, VideoEdit } from './edit';
import { BRAND_COLORS, DISPLAY, TEXT, arcs, background, block, endCard, logo, roundedRect, wrap } from './draw';
import type { Block, Ctx, FrameBrand, Picture } from './draw';
import { animate, captionClockAt, cutawayAt, ease, filterOf, frameAt, lookOf, motionAt, wordAt } from './timeline';
import type { CaptionStyle, Cutaway, Look, Overlay, OverlayStyle, Placed, Segment, Showing, TextSize, TransitionType } from './timeline';

export interface TimelineScene {
  edit: VideoEdit;
  /** layout(sequenceOf(edit)), worked out once for every frame. */
  placed: readonly Placed[];
  /** The whole video's length, end card included. */
  total: number;
  /** The variant's words over the video. */
  words: string;
  brand: FrameBrand;
  /** The edited video's second this frame is at. */
  time: number;
  /** Files the edit names that are not made yet (AI videos Higgsfield is making): shown as on their way. */
  waiting?: ReadonlySet<string>;
}

export type PictureOf = (showing: Showing) => Picture | null;
/** The frame a cutaway shows at `source`, a second of its own video, or null while it is not ready. */
export type CutawayOf = (cutaway: Cutaway, source: number) => Picture | null;

/** In place of an AI video not made yet: the brand's indigo, saying so. */
function onItsWay(ctx: Ctx, size: Size, unit: number) {
  background(ctx, size);
  const fontSize = unit * 4.2;
  ctx.font = `600 ${fontSize}px ${TEXT}`;
  ctx.fillStyle = 'rgb(255 255 255 / 0.9)';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('AI video on its way', size.width / 2, size.height / 2 - fontSize * 0.7);
  ctx.font = `400 ${fontSize * 0.7}px ${TEXT}`;
  ctx.fillStyle = 'rgb(255 255 255 / 0.7)';
  ctx.fillText('Higgsfield is making it: it shows here once it is ready', size.width / 2, size.height / 2 + fontSize * 0.6);
}

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

// ---------------------------------------------------------------- a piece

let noise: CanvasImageSource | null = null;
/** A small tile of grey noise, made once, for film grain. */
function grainTile(): CanvasImageSource | null {
  if (noise) return noise;
  const side = 160;
  const canvas = typeof document !== 'undefined' ? document.createElement('canvas') : typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(side, side) : null;
  if (!canvas) return null;
  canvas.width = side;
  canvas.height = side;
  const ctx = canvas.getContext('2d') as Ctx | null;
  if (!ctx) return null;
  const image = ctx.createImageData(side, side);
  // A fixed sequence, so an export and its preview have the same grain.
  let seed = 7;
  for (let i = 0; i < image.data.length; i += 4) {
    seed = (seed * 16807) % 2147483647;
    const v = 128 + ((seed % 160) - 80);
    image.data[i] = v;
    image.data[i + 1] = v;
    image.data[i + 2] = v;
    image.data[i + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);
  noise = canvas;
  return noise;
}

function grain(ctx: Ctx, size: Size, local: number) {
  const tile = grainTile();
  if (!tile) return;
  const pattern = ctx.createPattern(tile, 'repeat');
  if (!pattern) return;
  // A new offset twelve times a second: grain that moves like film's.
  const step = Math.floor(local * 12);
  ctx.save();
  ctx.globalAlpha = 0.16;
  ctx.globalCompositeOperation = 'overlay';
  ctx.translate(-((step * 53) % 160), -((step * 97) % 160));
  ctx.fillStyle = pattern;
  ctx.fillRect(0, 0, size.width + 160, size.height + 160);
  ctx.restore();
}

function vignette(ctx: Ctx, size: Size) {
  const r = Math.hypot(size.width, size.height) / 2;
  const shade = ctx.createRadialGradient(size.width / 2, size.height / 2, r * 0.5, size.width / 2, size.height / 2, r);
  shade.addColorStop(0, 'rgb(0 0 0 / 0)');
  shade.addColorStop(1, 'rgb(0 0 0 / 0.6)');
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, size.width, size.height);
}

const TITLE_COLORS = {
  brand: { title: BRAND_COLORS.gold, sub: BRAND_COLORS.white },
  dark: { title: BRAND_COLORS.white, sub: BRAND_COLORS.gold },
  light: { title: BRAND_COLORS.indigo, sub: BRAND_COLORS.ink },
  gold: { title: BRAND_COLORS.indigoDeep, sub: BRAND_COLORS.ink },
} as const;

function titleCard(ctx: Ctx, size: Size, unit: number, seg: Extract<Segment, { kind: 'title' }>, local: number, look: Look) {
  if (seg.style === 'brand') {
    background(ctx, size);
    arcs(ctx, size, unit);
  } else {
    ctx.fillStyle = seg.style === 'dark' ? BRAND_COLORS.ink : seg.style === 'light' ? BRAND_COLORS.white : BRAND_COLORS.gold;
    ctx.fillRect(0, 0, size.width, size.height);
  }
  const colors = TITLE_COLORS[seg.style];
  const a = animate(look.textAnimation, local, seg.seconds - local, seg.text.length);
  const titleSize = unit * 10;
  const subSize = unit * 4.2;
  ctx.font = `600 ${titleSize}px ${DISPLAY}`;
  const lines = wrap(ctx, seg.text, size.width * 0.84, 3);
  ctx.font = `500 ${subSize}px ${TEXT}`;
  const subLines = seg.subtext ? wrap(ctx, seg.subtext, size.width * 0.78, 3) : [];
  const gap = unit * 3;
  const height = lines.length * titleSize * 1.12 + (subLines.length ? gap + subLines.length * subSize * 1.35 : 0);
  ctx.save();
  ctx.globalAlpha *= a.alpha;
  ctx.translate(size.width / 2, size.height / 2 + a.dy * size.height);
  ctx.scale(a.scale, a.scale);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  let y = -height / 2;
  let left = a.chars;
  ctx.font = `600 ${titleSize}px ${DISPLAY}`;
  ctx.fillStyle = colors.title;
  for (const line of lines) {
    const shown = line.slice(0, Math.max(0, left));
    left -= line.length + 1;
    ctx.fillText(shown, 0, y + titleSize * 0.56);
    y += titleSize * 1.12;
  }
  if (subLines.length && left >= 0) {
    y += gap;
    ctx.font = `500 ${subSize}px ${TEXT}`;
    ctx.fillStyle = colors.sub;
    for (const line of subLines) {
      ctx.fillText(line, 0, y + subSize * 0.68);
      y += subSize * 1.35;
    }
  }
  ctx.restore();
}

/** One piece as its effects make it, filling the frame. `blur` is a transition's, in pixels. */
function drawPiece(ctx: Ctx, size: Size, unit: number, edit: VideoEdit, look: Look, s: Showing, picture: Picture | null, blur = 0, waiting?: ReadonlySet<string>) {
  const seg = s.placed.segment;
  if (!picture && seg.kind === 'clip' && seg.media && waiting?.has(seg.media.path)) {
    ctx.save();
    onItsWay(ctx, size, unit);
    ctx.restore();
    return;
  }
  const fx = seg.effects;
  const length = s.placed.until - s.placed.at;
  ctx.save();
  if (seg.kind === 'title') {
    if (fx.filter !== 'none' || blur > 0) ctx.filter = `${filterOf(fx) === 'none' ? '' : filterOf(fx)} ${blur > 0 ? `blur(${blur}px)` : ''}`.trim();
    titleCard(ctx, size, unit, seg, s.local, look);
  } else {
    background(ctx, size);
    if (picture) {
      const focus = seg.kind === 'clip' && seg.media === null ? edit.focus : { x: 0.5, y: 0.5 };
      const p = placePicture({ fit: edit.fit, focus }, picture, size);
      if (fx.blurFill && (p.dw < size.width - 1 || p.dh < size.height - 1)) {
        // Around a fitted picture, the picture itself, blurred and dimmed, instead of indigo.
        const cover = placePicture({ fit: 'fill', focus: { x: 0.5, y: 0.5 } }, picture, size);
        ctx.save();
        ctx.filter = `blur(${unit * 3}px) brightness(0.7)`;
        ctx.drawImage(picture.image, cover.sx, cover.sy, cover.sw, cover.sh, -unit * 4, -unit * 4, size.width + unit * 8, size.height + unit * 8);
        ctx.restore();
      }
      const m = motionAt(fx, s.local, length);
      const sw = p.sw / m.zoom;
      const sh = p.sh / m.zoom;
      const sx = p.sx + (p.sw - sw) * (0.5 + m.dx);
      const sy = p.sy + (p.sh - sh) * (0.5 + m.dy);
      const filter = [filterOf(fx), blur > 0 ? `blur(${blur}px)` : ''].filter((f) => f && f !== 'none').join(' ');
      ctx.save();
      if (filter) ctx.filter = filter;
      if (fx.flip) {
        ctx.translate(size.width, 0);
        ctx.scale(-1, 1);
      }
      ctx.drawImage(picture.image, sx, sy, sw, sh, p.dx, p.dy, p.dw, p.dh);
      ctx.restore();
    }
  }
  ctx.filter = 'none';
  if (fx.vignette) vignette(ctx, size);
  if (fx.grain) grain(ctx, size, s.local);
  ctx.restore();
}

/** Two pieces through a transition, `q` (0 to 1, eased) of the way from the one going out to the one coming in. */
function drawTransition(ctx: Ctx, size: Size, unit: number, type: TransitionType, q: number, out: (blur?: number) => void, into: (blur?: number) => void) {
  const { width: w, height: h } = size;
  const layer = (fn: () => void) => {
    ctx.save();
    fn();
    ctx.restore();
  };
  switch (type) {
    case 'fade':
      out();
      layer(() => {
        ctx.globalAlpha = q;
        into();
      });
      return;
    case 'dip-black':
    case 'dip-white': {
      if (q < 0.5) out();
      else into();
      ctx.fillStyle = type === 'dip-black' ? '#000' : '#fff';
      ctx.globalAlpha = 1 - Math.abs(q * 2 - 1);
      ctx.fillRect(0, 0, w, h);
      ctx.globalAlpha = 1;
      return;
    }
    case 'slide-left':
    case 'slide-right':
    case 'slide-up':
    case 'slide-down': {
      const [dx, dy] = type === 'slide-left' ? [-w, 0] : type === 'slide-right' ? [w, 0] : type === 'slide-up' ? [0, -h] : [0, h];
      layer(() => {
        ctx.translate(dx * q, dy * q);
        out();
      });
      layer(() => {
        ctx.translate(-dx * (1 - q), -dy * (1 - q));
        into();
      });
      return;
    }
    case 'wipe-left':
    case 'wipe-right':
      out();
      layer(() => {
        ctx.beginPath();
        if (type === 'wipe-right') ctx.rect(0, 0, w * q, h);
        else ctx.rect(w * (1 - q), 0, w * q, h);
        ctx.clip();
        into();
      });
      return;
    case 'circle':
      out();
      layer(() => {
        ctx.beginPath();
        ctx.arc(w / 2, h / 2, (Math.hypot(w, h) / 2) * q, 0, Math.PI * 2);
        ctx.clip();
        into();
      });
      return;
    case 'zoom':
      layer(() => {
        const z = 1 + q * 0.35;
        ctx.translate(w / 2, h / 2);
        ctx.scale(z, z);
        ctx.translate(-w / 2, -h / 2);
        out();
      });
      layer(() => {
        const z = 0.85 + 0.15 * q;
        ctx.globalAlpha = q;
        ctx.translate(w / 2, h / 2);
        ctx.scale(z, z);
        ctx.translate(-w / 2, -h / 2);
        into();
      });
      return;
    case 'blur':
      out(q * unit * 6);
      layer(() => {
        ctx.globalAlpha = q;
        into((1 - q) * unit * 6);
      });
      return;
    default:
      into();
  }
}

// ---------------------------------------------------------------- words over the video

/** A block drawn with an animation: faded, scaled about its middle, risen a little, or typed out. */
function drawAnimated(ctx: Ctx, b: Block, centerX: number, top: number, fill: string | null, color: string, radius: number, a: ReturnType<typeof animate>, outline = 0) {
  if (a.alpha <= 0 || a.chars <= 0) return;
  ctx.save();
  ctx.globalAlpha *= a.alpha;
  const cy = top + b.height / 2;
  ctx.translate(centerX, cy + a.dy * b.height * 6);
  ctx.scale(a.scale, a.scale);
  ctx.translate(-centerX, -cy);
  if (fill) {
    ctx.fillStyle = fill;
    roundedRect(ctx, centerX - b.width / 2, top, b.width, b.height, radius);
    ctx.fill();
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  let left = a.chars;
  b.lines.forEach((line, i) => {
    const shown = line.slice(0, Math.max(0, left));
    left -= line.length + 1;
    if (!shown) return;
    const y = top + b.pad.y + b.lineHeight * (i + 0.5);
    if (outline > 0) {
      ctx.lineJoin = 'round';
      ctx.lineWidth = outline;
      ctx.strokeStyle = 'rgb(0 0 0 / 0.85)';
      ctx.strokeText(shown, centerX, y);
    } else if (!fill) {
      ctx.shadowColor = 'rgb(0 0 0 / 0.7)';
      ctx.shadowBlur = b.lineHeight * 0.25;
    }
    ctx.fillStyle = color;
    ctx.fillText(shown, centerX, y);
    ctx.shadowBlur = 0;
  });
  ctx.restore();
}

const OVERLAY_FONT: Record<TextSize, number> = { small: 4.6, medium: 6.2, large: 8.4 };

const OVERLAY_LOOK: Record<OverlayStyle, { fill: string | null; color: string; outline: boolean; font: 'display' | 'text' }> = {
  banner: { fill: 'rgb(28 27 157 / 0.92)', color: BRAND_COLORS.gold, outline: false, font: 'display' },
  plain: { fill: null, color: BRAND_COLORS.white, outline: false, font: 'display' },
  outline: { fill: null, color: BRAND_COLORS.white, outline: true, font: 'display' },
  highlight: { fill: BRAND_COLORS.gold, color: BRAND_COLORS.indigoDeep, outline: false, font: 'display' },
  'lower-third': { fill: 'rgb(14 15 44 / 0.86)', color: BRAND_COLORS.white, outline: false, font: 'text' },
};

/** The space words are laid in: from below the mark at the top to above the captions at the bottom. Each block takes its share. */
interface Bands {
  top: number;
  bottom: number;
  gap: number;
}

function place(bands: Bands, where: 'top' | 'middle' | 'bottom', height: number, size: Size): number {
  if (where === 'top') {
    const y = bands.top;
    bands.top += height + bands.gap;
    return y;
  }
  if (where === 'bottom') {
    bands.bottom -= height;
    const y = bands.bottom;
    bands.bottom -= bands.gap;
    return y;
  }
  return (size.height - height) / 2;
}

function overlay(ctx: Ctx, size: Size, unit: number, o: Overlay, time: number, bands: Bands): Hit {
  const style = OVERLAY_LOOK[o.style];
  const fontSize = unit * OVERLAY_FONT[o.size] * (o.spot?.scale ?? 1);
  const font = style.font === 'display' ? `600 ${fontSize}px ${DISPLAY}` : `600 ${fontSize * 0.78}px ${TEXT}`;
  const margin = unit * 5;
  const pad = style.fill ? { x: unit * 2.4, y: unit * 1.5 } : { x: 0, y: unit * 0.6 };
  const b = block(ctx, o.text, font, style.font === 'display' ? fontSize : fontSize * 0.78, size.width - margin * 2, 3, pad);
  // Where its place puts it, or centred on the spot a person dragged it to.
  const top = o.spot ? o.spot.y * size.height - b.height / 2 : place(bands, o.place, b.height, size);
  const a = animate(o.animation, time - o.start, o.end - time, o.text.length);
  if (o.style === 'lower-third') {
    // Left-aligned, with a gold bar down its edge.
    const x = o.spot ? o.spot.x * size.width - (b.width + unit * 1.2) / 2 : margin;
    ctx.save();
    ctx.globalAlpha *= a.alpha;
    ctx.translate(-(1 - a.alpha) * unit * 6, a.dy * b.height * 6);
    ctx.fillStyle = style.fill ?? '';
    roundedRect(ctx, x, top, b.width + unit * 1.2, b.height, unit * 0.8);
    ctx.fill();
    ctx.fillStyle = BRAND_COLORS.gold;
    ctx.fillRect(x, top, unit * 1.2, b.height);
    ctx.font = font;
    ctx.fillStyle = style.color;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    let left = a.chars;
    b.lines.forEach((line, i) => {
      const shown = line.slice(0, Math.max(0, left));
      left -= line.length + 1;
      ctx.fillText(shown, x + unit * 1.2 + pad.x, top + pad.y + b.lineHeight * (i + 0.5));
    });
    ctx.restore();
    return { id: o.id, x, y: top, width: b.width + unit * 1.2, height: b.height };
  }
  ctx.font = font;
  const centre = o.spot ? o.spot.x * size.width : size.width / 2;
  drawAnimated(ctx, b, centre, top, style.fill, style.color, unit * 1.6, a, style.outline ? unit * 1.1 : 0);
  return { id: o.id, x: centre - b.width / 2, y: top, width: b.width, height: b.height };
}

function captions(ctx: Ctx, size: Size, unit: number, list: readonly Caption[], clipTime: number | null, style: CaptionStyle, margin: number, bottom: number): number {
  const fontSize = style === 'minimal' ? unit * 3.8 : style === 'box' ? unit * 4.4 : unit * 5.6;
  const font = style === 'box' || style === 'minimal' ? `500 ${fontSize}px ${TEXT}` : `600 ${fontSize}px ${DISPLAY}`;
  const pad = style === 'box' ? { x: unit * 2.2, y: unit * 1.3 } : { x: 0, y: unit * 0.6 };
  // Captions keep their place whether one is showing or not, so the words above them never jump.
  const reserve = fontSize * 1.18 * 2 + pad.y * 2;
  const caption = clipTime === null ? null : captionAt(list, clipTime);
  if (!caption?.text.trim() || clipTime === null) return reserve;
  const b = block(ctx, caption.text, font, fontSize, size.width - margin * 2, 2, pad);
  const top = bottom - b.height;
  const none = { alpha: 1, scale: 1, dy: 0, chars: caption.text.length };
  if (style === 'box') drawAnimated(ctx, b, size.width / 2, top, 'rgb(0 0 0 / 0.72)', BRAND_COLORS.white, unit * 1.2, none);
  else if (style === 'minimal') drawAnimated(ctx, b, size.width / 2, top, null, BRAND_COLORS.white, 0, none);
  else if (style === 'bold') drawAnimated(ctx, b, size.width / 2, top, null, BRAND_COLORS.white, 0, none, unit * 1.2);
  else {
    // Word by word: the word being said in gold, the rest in white, all outlined.
    const current = wordAt(caption, clipTime);
    ctx.save();
    ctx.font = font;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = unit * 1.2;
    ctx.strokeStyle = 'rgb(0 0 0 / 0.85)';
    const space = ctx.measureText(' ').width;
    let index = 0;
    b.lines.forEach((line, i) => {
      const y = top + b.pad.y + b.lineHeight * (i + 0.5);
      let x = size.width / 2 - ctx.measureText(line).width / 2;
      for (const word of line.split(' ')) {
        ctx.strokeText(word, x, y);
        ctx.fillStyle = index === current ? BRAND_COLORS.gold : BRAND_COLORS.white;
        ctx.fillText(word, x, y);
        x += ctx.measureText(word).width + space;
        index += 1;
      }
    });
    ctx.restore();
  }
  return reserve;
}

// ---------------------------------------------------------------- the frame

/**
 * Draws the frame of `scene` onto `ctx`, which is `size` large. Returns where
 * it drew what a person can drag: the words, the logo and the texts showing.
 */
export function drawTimelineFrame(ctx: Ctx, size: Size, scene: TimelineScene, pictureOf: PictureOf, cutawayOf?: CutawayOf): Hit[] {
  const hits: Hit[] = [];
  const { edit, placed, time } = scene;
  const look = lookOf(edit);
  const unit = Math.min(size.width, size.height) / 100;
  const frame = frameAt(placed, time);

  ctx.save();
  ctx.globalAlpha = 1;
  ctx.filter = 'none';
  if (frame.onEndCard || !frame.current) {
    if (edit.endCard) endCard(ctx, size, unit, edit.endCard.text, scene.brand);
    else background(ctx, size);
    ctx.restore();
    return hits;
  }

  const current = frame.current;
  const into = (blur?: number) => drawPiece(ctx, size, unit, edit, look, current, pictureOf(current), blur, scene.waiting);
  if (frame.previous) {
    const previous = frame.previous;
    const out = (blur?: number) => drawPiece(ctx, size, unit, edit, look, previous, pictureOf(previous), blur, scene.waiting);
    drawTransition(ctx, size, unit, current.placed.segment.transition.type, ease(frame.progress), out, into);
  } else {
    into();
  }

  // A cutaway covers the sequence's picture for its stretch; its sound stays the sequence's.
  const over = cutawayAt(edit.cutaways, time);
  if (over) {
    const picture = cutawayOf?.(over.cutaway, over.source) ?? null;
    ctx.save();
    if (picture) {
      background(ctx, size);
      const p = placePicture({ fit: edit.fit, focus: { x: 0.5, y: 0.5 } }, picture, size);
      ctx.drawImage(picture.image, p.sx, p.sy, p.sw, p.sh, p.dx, p.dy, p.dw, p.dh);
    } else if (scene.waiting?.has(over.cutaway.media.path)) {
      onItsWay(ctx, size, unit);
    }
    ctx.restore();
  }

  const margin = unit * 5;
  const gap = unit * 2;
  const bands: Bands = { top: margin, bottom: size.height - margin, gap };
  if (edit.logo) {
    const hit = logo(ctx, size, unit, edit.logo, scene.brand, edit.logoSpot);
    hits.push(hit);
    // Dragged somewhere of its own, the logo leaves the bands to the words.
    if (!edit.logoSpot) {
      if (edit.logo.startsWith('top')) bands.top += hit.height + gap;
      else bands.bottom -= hit.height + gap;
    }
  }
  if (look.progressBar) bands.bottom -= unit * 1.5;

  if (edit.captions.length > 0) {
    const reserve = captions(ctx, size, unit, edit.captions, captionClockAt(frame), look.captionStyle, margin, bands.bottom);
    bands.bottom -= reserve + gap;
  }

  const words = scene.words.trim();
  if (edit.text.show && words && (edit.text.until === null || time < edit.text.until)) {
    const spot = edit.text.spot;
    const face = WORD_FONT_FACE[edit.text.font ?? DEFAULT_FONT];
    const color = edit.text.color ?? BRAND_COLORS.white;
    const fontSize = unit * 6.8 * face.scale * (spot?.scale ?? 1);
    const font = `${face.weight} ${fontSize}px ${face.family}`;
    const b = block(ctx, words, font, fontSize, size.width - margin * 2, 3, { x: unit * 2.6, y: unit * 1.7 });
    const top = spot ? spot.y * size.height - b.height / 2 : place(bands, edit.text.place, b.height, size);
    const centre = spot ? spot.x * size.width : size.width / 2;
    const until = edit.text.until ?? scene.total - (edit.endCard?.seconds ?? 0);
    const a = animate(look.textAnimation, time, until - time, words.length);
    ctx.font = font;
    // White on the indigo band by default, as the words on a picture ad are
    // (the client's choice, 2026-10-22); a dark colour picked goes on a light band.
    drawAnimated(ctx, b, centre, top, bandFor(color), color, unit * 2, a);
    hits.push({ id: WORDS, x: centre - b.width / 2, y: top, width: b.width, height: b.height });
  }

  for (const o of edit.overlays ?? []) {
    if (time >= o.start && time < o.end) hits.push(overlay(ctx, size, unit, o, time, bands));
  }

  if (look.progressBar && scene.total > 0) {
    ctx.fillStyle = 'rgb(255 255 255 / 0.25)';
    ctx.fillRect(0, size.height - unit * 1, size.width, unit * 1);
    ctx.fillStyle = BRAND_COLORS.gold;
    ctx.fillRect(0, size.height - unit * 1, size.width * clamp(time / scene.total, 0, 1), unit * 1);
  }
  ctx.restore();
  return hits;
}

/** The band behind the variant's words: indigo under a light colour, near-white under a dark one, so they always read. */
export function bandFor(color: string): string {
  const hex = /^#([0-9a-f]{6})$/i.exec(color)?.[1];
  if (!hex) return 'rgb(28 27 157 / 0.92)';
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.3 ? 'rgb(255 255 255 / 0.92)' : 'rgb(28 27 157 / 0.92)';
}
