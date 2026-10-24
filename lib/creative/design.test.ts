import { describe, expect, it } from 'vitest';
import type { Ctx } from '../video/draw';
import { addText, changeText, DESIGN_LIMITS, isPlain, LOGO, moveTo, parseDesign, PLAIN_DESIGN, putBack, removeText, setColor, setFont, WORDS } from './design';
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
    save: noop,
    restore: noop,
    shadowColor: '',
    shadowBlur: 0,
    fillStyle: '',
    textAlign: 'left',
    textBaseline: 'alphabetic',
  };
  return ctx as unknown as Ctx;
}

const art = { text: 'Plan your family’s move, step by step.', style: 'split' as const, ratio: 'square' as const };
const brand = { name: 'Quantum Global', logo: null };
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
    expect(error(parseDesign({ logo: true, texts: [], font: 'comic' }))).toBe('Pick one of the fonts offered.');
    expect(error(parseDesign({ logo: true, texts: [], color: 'red' }))).toBe('Pick a colour for the words.');
  });

  it('keeps a font and a colour, the default font as none, and a colour put back as plain', () => {
    expect(parseDesign({ logo: true, texts: [], font: 'oswald', color: '#EFB74A' })).toEqual({ ok: true, value: { logo: true, font: 'oswald', color: '#efb74a', texts: [], spots: {} } });
    expect(parseDesign({ logo: true, texts: [], font: 'lexend' })).toEqual({ ok: true, value: null });
    const d = setColor(setFont(PLAIN_DESIGN, 'montserrat'), '#123456');
    expect(d).toMatchObject({ font: 'montserrat', color: '#123456' });
    expect(isPlain(setColor(setFont(d, 'lexend'), null))).toBe(true);
  });
});

describe('drawing a design', () => {
  it('draws a plain design where the style puts things, and says where', () => {
    const hits = drawCreative(fakeCtx(), square, art, brand);
    expect(hits.map((h) => h.id)).toEqual([WORDS, LOGO]);
    // Without the logo loaded, the page's name in a chip, top left.
    const chip = hits[1]!;
    expect(chip.y).toBeCloseTo(square.width * 0.045);
    expect(chip.x).toBeCloseTo(square.width * 0.05);
  });

  it('starts long words below the logo, so nothing overlaps it, unless someone moved either', () => {
    const withLogo = { name: 'Quantum Global', logo: { width: 256, height: 256 } as unknown as CanvasImageSource };
    const long = { ...art, style: 'spotlight' as const, text: 'Meet our team in person at Century G’s in downtown Dubai on 21 and 22 November, and bring every question you have about moving your family to the U.S.' };
    const hits = drawCreative(fakeCtx(), square, long, withLogo);
    const words = hits.find((h) => h.id === WORDS)!;
    const logo = hits.find((h) => h.id === LOGO)!;
    expect(words.y).toBeGreaterThanOrEqual(logo.y + logo.height);
    // Without the logo, the words sit where the style puts them.
    const bare = drawCreative(fakeCtx(), square, long, withLogo, null, { ...PLAIN_DESIGN, logo: false }).find((h) => h.id === WORDS)!;
    expect(bare.y).toBeLessThan(logo.y + logo.height);
  });

  it('draws the Q top left on every ground, glowing white, and scales it where moved', () => {
    const given = { width: 256, height: 256 } as unknown as CanvasImageSource;
    const drawn: { image: unknown; blur: number; glow: string }[] = [];
    const ctx = fakeCtx();
    Object.assign(ctx, { drawImage: (image: unknown) => drawn.push({ image, blur: ctx.shadowBlur, glow: String(ctx.shadowColor) }) });
    const withLogo = { name: 'Quantum Global', logo: given };
    const logo = drawCreative(ctx, square, art, withLogo).find((h) => h.id === LOGO)!;
    const tall = 52 * (square.width / 440);
    expect(logo.height).toBeCloseTo(tall);
    expect(logo.width).toBeCloseTo(tall);
    expect(logo.x).toBeCloseTo(square.width * 0.05);
    expect(logo.y).toBeCloseTo(square.width * 0.045);
    // Drawn once per white shadow, wide and soft, then close.
    expect(drawn.map((d) => [Math.round(d.blur), d.glow])).toEqual([
      [Math.round(tall * 0.36), 'rgb(255 255 255 / 0.9)'],
      [Math.round(tall * 0.12), 'rgb(255 255 255 / 0.95)'],
    ]);
    drawCreative(ctx, square, { ...art, style: 'arcs' }, withLogo);
    drawCreative(ctx, square, { ...art, style: 'spotlight' }, withLogo);
    drawCreative(ctx, square, art, withLogo, { image: given, width: 10, height: 10 });
    expect(drawn.filter((d) => d.image === given)).toHaveLength(9);
    const moved = drawCreative(fakeCtx(), square, art, withLogo, null, moveTo(PLAIN_DESIGN, 'square', LOGO, { x: 0.5, y: 0.5, scale: 2 })).find((h) => h.id === LOGO)!;
    expect(moved.height).toBeCloseTo(logo.height * 2);
    expect(moved.x + moved.width / 2).toBeCloseTo(540);
  });

  it('starts the split style’s words below the Q, which now sits over them', () => {
    const withLogo = { name: 'Quantum Global', logo: { width: 256, height: 256 } as unknown as CanvasImageSource };
    const hits = drawCreative(fakeCtx(), square, art, withLogo);
    const words = hits.find((h) => h.id === WORDS)!;
    const logo = hits.find((h) => h.id === LOGO)!;
    expect(words.y).toBeGreaterThanOrEqual(logo.y + logo.height);
  });

  it('draws the words white by default, indigo on the light spotlight, and in the font and colour a design picks', () => {
    const seen: { font: string; fill: string }[] = [];
    const ctx = fakeCtx();
    const record = Object.assign(ctx, {
      fillText: () => seen.push({ font: (ctx as unknown as { font: string }).font, fill: String((ctx as unknown as { fillStyle: string }).fillStyle) }),
    });
    drawCreative(record, square, art, brand);
    expect(seen[0]).toMatchObject({ fill: '#ffffff' });
    expect(seen[0]!.font).toContain('Lexend');
    seen.length = 0;
    drawCreative(record, square, { ...art, style: 'spotlight' }, brand);
    expect(seen[0]!.fill).toBe('#1c1b9d');
    seen.length = 0;
    drawCreative(record, square, { ...art, style: 'spotlight' }, brand, null, setColor(setFont(PLAIN_DESIGN, 'playfair'), '#EFB74A'));
    expect(seen[0]!.fill).toBe('#efb74a');
    expect(seen[0]!.font).toContain('Playfair');
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
    const wideLogo = wide.find((h) => h.id === LOGO)!;
    expect(wideLogo.x).toBeCloseTo(PICTURE_SIZE.wide.width * 0.05);
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
