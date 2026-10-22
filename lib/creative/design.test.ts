import { describe, expect, it } from 'vitest';
import type { Ctx } from '../video/draw';
import { addText, changeText, DESIGN_LIMITS, isPlain, LOGO, moveTo, parseDesign, PLAIN_DESIGN, putBack, removeText, WORDS } from './design';
import type { CreativeDesign } from './design';
import { drawCreative, PICTURE_SIZE } from './draw';

/** A canvas that draws nothing and measures every character as half the font's size. */
function fakeCtx(): Ctx {
  const state = { font: '10px x' };
  const noop = () => undefined;
  const ctx = {
    get font() {
      return state.font;
    },
    set font(v: string) {
      state.font = v;
    },
    measureText: (text: string) => ({ width: text.length * Number(/([\d.]+)px/.exec(state.font)?.[1] ?? 10) * 0.5 }),
    fillRect: noop,
    fillText: noop,
    beginPath: noop,
    arc: noop,
    fill: noop,
    roundRect: noop,
    drawImage: noop,
    fillStyle: '',
    textAlign: 'left',
    textBaseline: 'alphabetic',
  };
  return ctx as unknown as Ctx;
}

const art = { text: 'Plan your family’s move, step by step.', style: 'split' as const, ratio: 'square' as const };
const brand = { name: 'Quantum Global', mark: null };
const square = PICTURE_SIZE.square;

describe('a picture’s design', () => {
  it('starts plain, and is plain again once everything is put back', () => {
    expect(isPlain(PLAIN_DESIGN)).toBe(true);
    const moved = moveTo(PLAIN_DESIGN, 'square', WORDS, { x: 0.5, y: 0.3, scale: 1.2 });
    expect(isPlain(moved)).toBe(false);
    expect(isPlain(putBack(moved, 'square', WORDS))).toBe(true);
    expect(isPlain({ ...PLAIN_DESIGN, logo: false })).toBe(false);
  });

  it('keeps each shape’s spots apart, and on the frame', () => {
    const d = moveTo(moveTo(PLAIN_DESIGN, 'square', LOGO, { x: 1.4, y: -0.2, scale: 9 }), 'wide', LOGO, { x: 0.9, y: 0.1, scale: 1 });
    expect(d.spots.square?.[LOGO]).toEqual({ x: 1, y: 0, scale: 3 });
    expect(d.spots.wide?.[LOGO]).toEqual({ x: 0.9, y: 0.1, scale: 1 });
  });

  it('adds texts up to the limit, changes them, and takes one away with its spots', () => {
    let d: CreativeDesign = PLAIN_DESIGN;
    for (let i = 0; i < DESIGN_LIMITS.texts + 2; i++) d = addText(d, `Text ${i}`);
    expect(d.texts).toHaveLength(DESIGN_LIMITS.texts);
    const id = d.texts[0]!.id;
    d = changeText(d, id, { text: 'x'.repeat(200), look: 'banner' });
    expect(d.texts[0]).toMatchObject({ look: 'banner', text: 'x'.repeat(DESIGN_LIMITS.text) });
    d = moveTo(moveTo(d, 'square', id, { x: 0.5, y: 0.5, scale: 1 }), 'wide', id, { x: 0.5, y: 0.5, scale: 1 });
    d = removeText(d, id);
    expect(d.texts.map((t) => t.id)).not.toContain(id);
    expect(d.spots.square).toEqual({});
    expect(d.spots.wide).toEqual({});
  });

  it('reads a person’s design back, refusing what is not one, and a plain one as nothing', () => {
    expect(parseDesign(null)).toEqual({ ok: true, value: null });
    expect(parseDesign({ logo: true, texts: [], spots: {} })).toEqual({ ok: true, value: null });
    const raw = {
      logo: false,
      texts: [{ id: 't1', text: '  Free  call\u0007 ', look: 'banner' }, { id: 't2', text: 'Book', look: 'neon' }],
      spots: { square: { words: { x: 0.5, y: 0.4, scale: 1.1 }, t1: { x: 2, y: 0.9 }, ghost: { x: 0.1, y: 0.1, scale: 1 } }, wide: {} },
    };
    expect(parseDesign(raw)).toEqual({
      ok: true,
      value: {
        logo: false,
        texts: [{ id: 't1', text: 'Free call', look: 'banner' }, { id: 't2', text: 'Book', look: 'white' }],
        // A spot naming nothing on the picture is dropped; one off the frame is brought onto it.
        spots: { square: { words: { x: 0.5, y: 0.4, scale: 1.1 }, t1: { x: 1, y: 0.9, scale: 1 } } },
      },
    });
    const error = (r: ReturnType<typeof parseDesign>) => (r.ok ? null : r.error);
    expect(error(parseDesign({ texts: [] }))).toBe('Say whether the logo shows.');
    expect(error(parseDesign({ logo: true, texts: [{ id: 't1', text: ' ' }] }))).toBe('A text on the picture is empty: write it or take it away.');
    expect(error(parseDesign({ logo: true, texts: [{ id: 't1', text: 'a' }, { id: 't1', text: 'b' }] }))).toBe('A text on the picture is there twice.');
    expect(error(parseDesign({ logo: true, texts: Array.from({ length: 7 }, (_, i) => ({ id: `t${i}`, text: 'a' })) }))).toBe('Up to 6 texts on a picture.');
    expect(error(parseDesign({ logo: true, texts: [], spots: { square: { words: { x: 'left', y: 0 } } } }))).toBe('A place on the picture is not readable.');
  });
});

describe('drawing a design', () => {
  it('draws a plain design where the style puts things, and says where', () => {
    const hits = drawCreative(fakeCtx(), square, art, brand);
    expect(hits.map((h) => h.id)).toEqual([WORDS, LOGO]);
    // The logo's chip sits in the top left, as it always has.
    expect(hits[1]).toMatchObject({ x: square.width * 0.06, y: square.width * 0.05 });
  });

  it('draws the full logo on its plate, kept to the logo’s shape, and scales it where moved', () => {
    const logoImage = { width: 438, height: 252 } as unknown as CanvasImageSource;
    const withLogo = { name: 'Quantum Global', mark: logoImage };
    const plate = drawCreative(fakeCtx(), square, art, withLogo).find((h) => h.id === LOGO)!;
    const tall = 46 * (square.width / 440);
    expect(plate).toMatchObject({ x: square.width * 0.06, y: square.width * 0.05 });
    expect(plate.height).toBeCloseTo(tall * 1.32);
    expect(plate.width).toBeCloseTo(tall * (438 / 252) + tall * 0.32);
    const moved = drawCreative(fakeCtx(), square, art, withLogo, null, moveTo(PLAIN_DESIGN, 'square', LOGO, { x: 0.5, y: 0.5, scale: 2 })).find((h) => h.id === LOGO)!;
    expect(moved.height).toBeCloseTo(plate.height * 2);
    expect(moved.x + moved.width / 2).toBeCloseTo(540);
  });

  it('centres a moved thing on its spot, at its size', () => {
    const design = moveTo(moveTo(PLAIN_DESIGN, 'square', WORDS, { x: 0.5, y: 0.75, scale: 0.8 }), 'square', LOGO, { x: 0.8, y: 0.9, scale: 2 });
    const hits = drawCreative(fakeCtx(), square, art, brand, null, design);
    const centre = (id: string) => {
      const h = hits.find((x) => x.id === id)!;
      return [Math.round(h.x + h.width / 2), Math.round(h.y + h.height / 2)];
    };
    expect(centre(WORDS)).toEqual([540, 810]);
    expect(centre(LOGO)).toEqual([864, 972]);
    const plainLogo = drawCreative(fakeCtx(), square, art, brand).find((h) => h.id === LOGO)!;
    expect(hits.find((h) => h.id === LOGO)!.height).toBeCloseTo(plainLogo.height * 2);
    // The wide shape keeps its own layout.
    const wide = drawCreative(fakeCtx(), PICTURE_SIZE.wide, { ...art, ratio: 'wide' }, brand, null, design);
    expect(wide.find((h) => h.id === LOGO)).toMatchObject({ x: PICTURE_SIZE.wide.width * 0.06 });
  });

  it('stacks added texts from the bottom, and leaves the logo off when asked', () => {
    let design = addText(addText({ ...PLAIN_DESIGN, logo: false }, 'Free consultation'), 'Book today', 'banner');
    const [first, second] = design.texts;
    let hits = drawCreative(fakeCtx(), square, art, brand, null, design);
    expect(hits.map((h) => h.id)).toEqual([WORDS, first!.id, second!.id]);
    const a = hits[1]!;
    const b = hits[2]!;
    expect(a.y + a.height).toBeCloseTo(square.height - square.width * 0.06);
    expect(b.y + b.height).toBeLessThan(a.y);
    design = moveTo(design, 'square', second!.id, { x: 0.3, y: 0.2, scale: 1 });
    hits = drawCreative(fakeCtx(), square, art, brand, null, design);
    const moved = hits.find((h) => h.id === second!.id)!;
    expect(Math.round(moved.x + moved.width / 2)).toBe(324);
  });
});
