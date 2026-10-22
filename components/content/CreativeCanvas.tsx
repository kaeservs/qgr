'use client';

import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import type { CreativeDesign } from '@/lib/creative/design';
import { drawCreative, loadLogos, loadWordFont, PICTURE_SIZE } from '@/lib/creative/draw';
import type { CreativeLogos, CreativePicture, CreativeRatio } from '@/lib/creative/draw';
import type { Hit } from '@/lib/spot';
import type { CreativeStyle } from '@/lib/types';
import { loadFrameFonts } from '@/lib/video/draw';
import styles from './previews.module.css';

let logos: Promise<CreativeLogos | null> | null = null;
let fonts: Promise<void> | null = null;
const pictures = new Map<string, Promise<CreativePicture | null>>();

/** A picture an image model made, decoded once for every canvas that draws it. */
function pictureAt(url: string): Promise<CreativePicture | null> {
  let p = pictures.get(url);
  if (!p) {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.src = url;
    p = image.decode().then(
      () => ({ image, width: image.naturalWidth, height: image.naturalHeight }),
      () => null,
    );
    pictures.set(url, p);
  }
  return p;
}

export interface DrawnCreative {
  text: string;
  style: CreativeStyle;
  ratio: CreativeRatio;
  image?: string | undefined;
  design: CreativeDesign | null;
  brandName: string;
}

/**
 * Draws a picture ad onto `canvas` at the size it is posted, with
 * drawCreative, the function that makes the posted file, and says where it
 * drew each thing a person can move.
 */
export function useDrawnCreative(canvas: RefObject<HTMLCanvasElement | null>, art: DrawnCreative): Hit[] {
  const [hits, setHits] = useState<Hit[]>([]);
  const [assets, setAssets] = useState<{ logos: CreativeLogos | null; picture: CreativePicture | null; ready: boolean }>({ logos: null, picture: null, ready: false });
  const font = art.design?.font;

  useEffect(() => {
    let live = true;
    logos ??= loadLogos();
    fonts ??= loadFrameFonts();
    void Promise.all([logos, art.image ? pictureAt(art.image) : null, fonts, loadWordFont(font)]).then(([l, picture]) => {
      if (live) setAssets({ logos: l, picture, ready: true });
    });
    return () => {
      live = false;
    };
  }, [art.image, font]);

  useEffect(() => {
    const ctx = canvas.current?.getContext('2d');
    if (!ctx || !assets.ready) return;
    const size = PICTURE_SIZE[art.ratio];
    ctx.clearRect(0, 0, size.width, size.height);
    setHits(drawCreative(ctx, size, { text: art.text, style: art.style, ratio: art.ratio }, { name: art.brandName, logos: assets.logos }, assets.picture, art.design));
  }, [canvas, assets, art.text, art.style, art.ratio, art.design, art.brandName]);

  return hits;
}

/** A picture ad with a layout of its own, drawn as it will be posted. */
export function CreativeCanvas(props: DrawnCreative) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useDrawnCreative(canvas, props);
  const size = PICTURE_SIZE[props.ratio];
  return (
    <canvas
      ref={canvas}
      className={styles.creativeCanvas}
      width={size.width}
      height={size.height}
      role="img"
      aria-label={`The ad’s picture: ${props.text}${props.design?.texts.length ? `, with ${props.design.texts.map((t) => `“${t.text}”`).join(', ')}` : ''}`}
    />
  );
}
