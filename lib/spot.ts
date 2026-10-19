// Where a movable thing sits on a frame (a picture ad's words, its logo, a text
// on a video): its centre as a share of the frame's width and height, and its
// size against the size it has where it would sit by itself. Shares rather
// than pixels, so the same spot holds on a preview and on the full-size file.

export interface Spot {
  /** 0 is the left edge, 1 the right. */
  x: number;
  /** 0 is the top, 1 the bottom. */
  y: number;
  /** 1 is its usual size. */
  scale: number;
}

export const SCALE = { min: 0.4, max: 3 } as const;

/** The names of the two things every picture and video can have moved: the ad's words and the logo. */
export const WORDS = 'words';
export const LOGO = 'logo';

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));
/** Three places are finer than a pixel on any frame we make, and keep the JSON short. */
const round = (n: number) => Math.round(n * 1000) / 1000;

/** A spot kept on the frame and within the sizes allowed. */
export const clampSpot = (s: Spot): Spot => ({ x: round(clamp(s.x, 0, 1)), y: round(clamp(s.y, 0, 1)), scale: round(clamp(s.scale, SCALE.min, SCALE.max)) });

/** A spot from saved JSON, or null when it is not one. */
export function parseSpot(raw: unknown): Spot | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const { x, y, scale } = raw as Record<string, unknown>;
  if (typeof x !== 'number' || typeof y !== 'number' || !Number.isFinite(x) || !Number.isFinite(y)) return null;
  const s = typeof scale === 'number' && Number.isFinite(scale) ? scale : 1;
  return clampSpot({ x, y, scale: s });
}

/** A box drawn on a frame, in its pixels: what a person can grab and move. */
export interface Hit {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}
