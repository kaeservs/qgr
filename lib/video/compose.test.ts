import { describe, expect, it } from 'vitest';
import { LOGO, WORDS } from '../spot';
import { bandFor, drawTimelineFrame } from './compose';
import type { Ctx } from './draw';
import { defaultEdit } from './edit';
import { layout, placeAt, sequenceOf } from './timeline';
import type { VideoEdit } from './edit';

/** A canvas that draws nothing and measures every character as half the font's size. */
function fakeCtx(): Ctx {
  const state: Record<string | symbol, unknown> = { font: '10px x', globalAlpha: 1 };
  const fontPx = () => Number(/([\d.]+)px/.exec(String(state.font))?.[1] ?? 10);
  return new Proxy(state, {
    get(target, prop) {
      if (prop === 'measureText') return (text: string) => ({ width: text.length * fontPx() * 0.5 });
      if (prop in target) return target[prop];
      if (typeof prop === 'string' && prop.startsWith('create')) return () => ({ addColorStop: () => undefined });
      return () => undefined;
    },
    set(target, prop, value) {
      target[prop] = value;
      return true;
    },
  }) as unknown as Ctx;
}

const size = { width: 1080, height: 1920 };
const overlay = { id: 'o1', text: 'Ask us anything', start: 0, end: 5, place: 'bottom' as const, style: 'banner' as const, animation: 'none' as const, size: 'medium' as const };

function hitsAt(edit: VideoEdit, time = 1) {
  const placed = layout(sequenceOf(edit));
  return drawTimelineFrame(fakeCtx(), size, { edit, placed, total: 20, words: 'Plan your move', brand: { name: 'Quantum Global', website: 'qgr.example', mark: null }, time }, () => null);
}
const centre = (hits: ReturnType<typeof hitsAt>, id: string) => {
  const h = hits.find((x) => x.id === id)!;
  return [Math.round(h.x + h.width / 2), Math.round(h.y + h.height / 2)];
};

describe('a frame’s words, logo and texts', () => {
  const edit: VideoEdit = { ...defaultEdit(20), logo: 'top-left', aspect: '9:16', overlays: [overlay] };

  it('says where it drew each thing a person can drag', () => {
    const hits = hitsAt(edit);
    expect(hits.map((h) => h.id)).toEqual([LOGO, WORDS, 'o1']);
    // In their places: the logo in its corner, the words under it, the text at the bottom.
    expect(hits[0]!.x).toBeLessThan(size.width / 2);
    expect(hits[1]!.y).toBeGreaterThan(hits[0]!.y + hits[0]!.height);
    expect(hits[2]!.y).toBeGreaterThan(size.height / 2);
  });

  it('centres a dragged thing on its spot, at its size', () => {
    const moved = placeAt(placeAt(placeAt(edit, WORDS, { x: 0.5, y: 0.5, scale: 1.5 }), LOGO, { x: 0.8, y: 0.9, scale: 2 }), 'o1', { x: 0.3, y: 0.2, scale: 1 });
    const hits = hitsAt(moved);
    expect(centre(hits, WORDS)).toEqual([540, 960]);
    expect(centre(hits, LOGO)).toEqual([864, 1728]);
    expect(centre(hits, 'o1')).toEqual([324, 384]);
    const plain = hitsAt(edit);
    expect(hits.find((h) => h.id === LOGO)!.height).toBeCloseTo(plain.find((h) => h.id === LOGO)!.height * 2);
    expect(hits.find((h) => h.id === WORDS)!.height).toBeGreaterThan(plain.find((h) => h.id === WORDS)!.height);
  });

  it('draws nothing to drag on the end card, and only the texts on screen', () => {
    expect(hitsAt({ ...edit, endCard: { text: 'Book a call', seconds: 3 } }, 21)).toEqual([]);
    expect(hitsAt(edit, 6).map((h) => h.id)).toEqual([LOGO, WORDS]);
  });
});

describe('the band behind a video’s words', () => {
  it('is indigo under white or gold words, and light under dark ones, so they always read', () => {
    expect(bandFor('#ffffff')).toBe('rgb(28 27 157 / 0.92)');
    expect(bandFor('#efb74a')).toBe('rgb(28 27 157 / 0.92)');
    expect(bandFor('#1c1b9d')).toBe('rgb(255 255 255 / 0.92)');
    expect(bandFor('#111111')).toBe('rgb(255 255 255 / 0.92)');
  });
});
