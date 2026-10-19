// A picture ad's own layout: where its words and logo sit, how big, and the
// texts a person adds (a line of proof, a call to action). Kept per variant in
// ad_variants.design and drawn by lib/creative/draw.ts, which draws the studio's
// view of it and the file that is posted alike. Each shape (Meta's square,
// LinkedIn's wide) keeps its own spots, since a place that suits one rarely
// suits the other; anything without a spot sits where the design puts it.
// Pure, and tested.

import { clampSpot, LOGO, parseSpot, WORDS } from '../spot';
import type { Spot } from '../spot';
import type { CreativeRatio } from './draw';

export const DESIGN_SHAPES: readonly CreativeRatio[] = ['square', 'wide'];

/** How an added text looks: in the headline's gold or in white, in indigo, or gold on an indigo band. */
export const TEXT_LOOKS = ['gold', 'white', 'indigo', 'banner'] as const;
export type TextLook = (typeof TEXT_LOOKS)[number];
export const TEXT_LOOK_LABEL: Record<TextLook, string> = { gold: 'Gold', white: 'White', indigo: 'Indigo', banner: 'Band' };

export interface DesignText {
  id: string;
  text: string;
  look: TextLook;
}

export interface CreativeDesign {
  /** Whether the logo shows. */
  logo: boolean;
  texts: DesignText[];
  /** Where each thing sits on each shape: `words`, `logo` or a text's id. */
  spots: Partial<Record<CreativeRatio, Record<string, Spot>>>;
}

export const DESIGN_LIMITS = { texts: 6, text: 120 } as const;

export { LOGO, WORDS };

/** The design every ad starts from: the logo, the words where the style puts them, nothing added. */
export const PLAIN_DESIGN: CreativeDesign = { logo: true, texts: [], spots: {} };

/** Whether a design is the plain one, saved as nothing. */
export const isPlain = (d: CreativeDesign): boolean =>
  d.logo && d.texts.length === 0 && DESIGN_SHAPES.every((shape) => Object.keys(d.spots[shape] ?? {}).length === 0);

export const designOf = (d: CreativeDesign | null | undefined): CreativeDesign => d ?? PLAIN_DESIGN;

const words = (v: string) => v.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();

let counter = 0;
/** A short id for an added text, unique within its design. */
export const newTextId = (): string => `t${Date.now().toString(36)}${(counter++).toString(36)}`;

// ---------------------------------------------------------------- changes

export function moveTo(d: CreativeDesign, shape: CreativeRatio, id: string, spot: Spot): CreativeDesign {
  return { ...d, spots: { ...d.spots, [shape]: { ...(d.spots[shape] ?? {}), [id]: clampSpot(spot) } } };
}

/** Puts a thing back where the design puts it, on one shape. */
export function putBack(d: CreativeDesign, shape: CreativeRatio, id: string): CreativeDesign {
  const { [id]: _gone, ...rest } = d.spots[shape] ?? {};
  return { ...d, spots: { ...d.spots, [shape]: rest } };
}

export function addText(d: CreativeDesign, text: string, look: TextLook = 'white'): CreativeDesign {
  if (d.texts.length >= DESIGN_LIMITS.texts) return d;
  return { ...d, texts: [...d.texts, { id: newTextId(), text: text.slice(0, DESIGN_LIMITS.text), look }] };
}

export function changeText(d: CreativeDesign, id: string, change: Partial<Omit<DesignText, 'id'>>): CreativeDesign {
  return { ...d, texts: d.texts.map((t) => (t.id === id ? { ...t, ...change, ...(change.text !== undefined ? { text: change.text.slice(0, DESIGN_LIMITS.text) } : {}) } : t)) };
}

/** Takes a text away, with its spots on every shape. */
export function removeText(d: CreativeDesign, id: string): CreativeDesign {
  const spots: CreativeDesign['spots'] = {};
  for (const shape of DESIGN_SHAPES) {
    const kept = d.spots[shape];
    if (!kept) continue;
    const { [id]: _gone, ...rest } = kept;
    spots[shape] = rest;
  }
  return { ...d, texts: d.texts.filter((t) => t.id !== id), spots };
}

// ---------------------------------------------------------------- reading it back

type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string };
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const ID = /^[\w-]{1,24}$/;

/**
 * The app's check of a design from a person: texts within the limits, every
 * spot on the frame and naming the words, the logo or one of its texts. A
 * plain design reads as null, saved as nothing. The database checks the shape
 * again (save_variant_design).
 */
export function parseDesign(raw: unknown): ParseResult<CreativeDesign | null> {
  if (raw === null || raw === undefined) return { ok: true, value: null };
  if (!isRecord(raw)) return { ok: false, error: 'The design is not readable.' };
  if (typeof raw.logo !== 'boolean') return { ok: false, error: 'Say whether the logo shows.' };
  const rawTexts = Array.isArray(raw.texts) ? raw.texts : [];
  if (rawTexts.length > DESIGN_LIMITS.texts) return { ok: false, error: `Up to ${DESIGN_LIMITS.texts} texts on a picture.` };
  const texts: DesignText[] = [];
  for (const t of rawTexts) {
    if (!isRecord(t) || typeof t.id !== 'string' || !ID.test(t.id) || typeof t.text !== 'string') return { ok: false, error: 'A text on the picture is not readable.' };
    const text = words(t.text);
    if (!text) return { ok: false, error: 'A text on the picture is empty: write it or take it away.' };
    if (text.length > DESIGN_LIMITS.text) return { ok: false, error: `Keep each text on the picture under ${DESIGN_LIMITS.text} characters.` };
    if (texts.some((x) => x.id === t.id)) return { ok: false, error: 'A text on the picture is there twice.' };
    texts.push({ id: t.id, text, look: (TEXT_LOOKS as readonly unknown[]).includes(t.look) ? (t.look as TextLook) : 'white' });
  }
  const known = new Set([WORDS, LOGO, ...texts.map((t) => t.id)]);
  const spots: CreativeDesign['spots'] = {};
  const rawSpots = isRecord(raw.spots) ? raw.spots : {};
  for (const shape of DESIGN_SHAPES) {
    const list = rawSpots[shape];
    if (list === undefined) continue;
    if (!isRecord(list)) return { ok: false, error: 'The layout is not readable.' };
    const kept: Record<string, Spot> = {};
    for (const [id, value] of Object.entries(list)) {
      if (!known.has(id)) continue;
      const spot = parseSpot(value);
      if (!spot) return { ok: false, error: 'A place on the picture is not readable.' };
      kept[id] = spot;
    }
    if (Object.keys(kept).length > 0) spots[shape] = kept;
  }
  const design: CreativeDesign = { logo: raw.logo, texts, spots };
  return { ok: true, value: isPlain(design) ? null : design };
}
