'use client';

import { ChartNoAxesColumn, Ellipsis, Globe, Heart, MessageCircle, Repeat2, Send, Share2, ThumbsUp } from 'lucide-react';
import Image from 'next/image';
import type { JSX } from 'react';
import { cx } from '@/lib/cx';
import { COPY_LIMITS, CTA_OPTIONS } from '@/lib/platforms';
import type { Platform, PlatformCopy, Variant } from '@/lib/types';
import { VideoCreative } from '../video/VideoCreative';
import type { CreativeVideo } from '../video/VideoCreative';
import { Creative } from './Creative';
import { Editable } from './Editable';
import styles from './previews.module.css';

/** How the ad names its advertiser: from the brand profile in Settings. */
export interface AdBrand {
  /** The page name, e.g. Quantum Global. */
  name: string;
  /** The company, as LinkedIn shows it. */
  company: string;
  /** The website, as the link bar shows it: no scheme. */
  domain: string;
  xHandle: string;
}

export interface PreviewProps {
  copy: PlatformCopy;
  creative: Variant['creative'];
  /** The generated image, once an image model is connected. */
  image: string | undefined;
  brand: AdBrand;
  editable: boolean;
  onCopy: (field: keyof PlatformCopy, value: string) => void;
  onCreative: (text: string) => void;
  /** For a run that started from a clip: the variant's video, drawn in place of the image. */
  video?: (CreativeVideo & { label: string }) | undefined;
}

/** The image, or the video when the variant is one. */
function Visual({ creative, image, video, ratio, editable, onCreative }: Pick<PreviewProps, 'creative' | 'image' | 'video' | 'editable' | 'onCreative'> & { ratio: 'square' | 'wide' }) {
  if (video) return <VideoCreative video={video} words={creative.text} label={video.label} />;
  return <Creative text={creative.text} style={creative.style} image={image} ratio={ratio} editable={editable} onChange={onCreative} />;
}

function Cta({ platform, value, editable, onChange, className }: { platform: Platform; value: string; editable: boolean; onChange: (v: string) => void; className: string | undefined }) {
  if (!editable) return <span className={className}>{value}</span>;
  const options = CTA_OPTIONS[platform].includes(value) ? CTA_OPTIONS[platform] : [value, ...CTA_OPTIONS[platform]];
  return (
    <select className={cx(className, styles.ctaSelect)} value={value} onChange={(e) => onChange(e.target.value)} aria-label="Button">
      {options.map((o) => (
        <option key={o}>{o}</option>
      ))}
    </select>
  );
}

const Mark = ({ size }: { size: number }) => <Image src="/brand/qgr-mark.png" alt="" width={size} height={size} />;

export function MetaPreview({ copy, creative, image, brand, editable, onCopy, onCreative, video }: PreviewProps) {
  const limits = COPY_LIMITS.meta;
  return (
    <div className={styles.post}>
      <header className={styles.head}>
        <span className={styles.roundLogo}>
          <Mark size={26} />
        </span>
        <span className={styles.who}>
          <strong>{brand.name}</strong>
          <span>
            Sponsored · <Globe size={11} aria-hidden />
          </span>
        </span>
        <Ellipsis size={18} className={styles.more} aria-hidden />
      </header>
      <div className={styles.body}>
        <Editable editable={editable} value={copy.text} onChange={(v) => onCopy('text', v)} label="Primary text" className={styles.text} limit={limits.text} multiline />
      </div>
      <Visual creative={creative} image={image} video={video} ratio="square" editable={editable} onCreative={onCreative} />
      <div className={styles.metaBar}>
        <span className={styles.metaBarText}>
          <span className={styles.metaDomain}>{brand.domain}</span>
          <Editable editable={editable} value={copy.headline} onChange={(v) => onCopy('headline', v)} label="Headline" className={styles.metaHeadline} limit={limits.headline} />
          <Editable editable={editable} value={copy.description ?? ''} onChange={(v) => onCopy('description', v)} label="Description" className={styles.metaDesc} limit={limits.description} />
        </span>
        <Cta platform="meta" value={copy.cta ?? 'Learn more'} editable={editable} onChange={(v) => onCopy('cta', v)} className={styles.metaCta} />
      </div>
      <footer className={styles.actions} aria-hidden>
        <span>
          <ThumbsUp size={16} /> Like
        </span>
        <span>
          <MessageCircle size={16} /> Comment
        </span>
        <span>
          <Share2 size={16} /> Share
        </span>
      </footer>
    </div>
  );
}

export function LinkedInPreview({ copy, creative, image, brand, editable, onCopy, onCreative, video }: PreviewProps) {
  const limits = COPY_LIMITS.linkedin;
  return (
    <div className={styles.post}>
      <header className={styles.head}>
        <span className={styles.squareLogo}>
          <Mark size={28} />
        </span>
        <span className={styles.who}>
          <strong>{brand.company}</strong>
          <span>Promoted</span>
        </span>
        <Ellipsis size={18} className={styles.more} aria-hidden />
      </header>
      <div className={styles.body}>
        <Editable editable={editable} value={copy.text} onChange={(v) => onCopy('text', v)} label="Introductory text" className={styles.text} limit={limits.text} multiline />
      </div>
      <Visual creative={creative} image={image} video={video} ratio="wide" editable={editable} onCreative={onCreative} />
      <div className={styles.liBar}>
        <span className={styles.liBarText}>
          <Editable editable={editable} value={copy.headline} onChange={(v) => onCopy('headline', v)} label="Headline" className={styles.liHeadline} limit={limits.headline} />
          <span className={styles.liDomain}>{brand.domain}</span>
        </span>
        <Cta platform="linkedin" value={copy.cta ?? 'Learn more'} editable={editable} onChange={(v) => onCopy('cta', v)} className={styles.liCta} />
      </div>
      <footer className={styles.actions} aria-hidden>
        <span>
          <ThumbsUp size={16} /> Like
        </span>
        <span>
          <MessageCircle size={16} /> Comment
        </span>
        <span>
          <Repeat2 size={16} /> Repost
        </span>
        <span>
          <Send size={16} /> Send
        </span>
      </footer>
    </div>
  );
}

export function XPreview({ copy, creative, image, brand, editable, onCopy, onCreative, video }: PreviewProps) {
  const limits = COPY_LIMITS.x;
  return (
    <div className={cx(styles.post, styles.xPost)}>
      <span className={styles.xAvatar}>
        <Mark size={30} />
      </span>
      <div className={styles.xMain}>
        <header className={styles.xHead}>
          <strong>{brand.name}</strong>
          <span>{brand.xHandle}</span>
          <span>· Ad</span>
          <Ellipsis size={16} className={styles.more} aria-hidden />
        </header>
        <Editable editable={editable} value={copy.text} onChange={(v) => onCopy('text', v)} label="Post text" className={cx(styles.text, styles.xText)} limit={limits.text} multiline />
        <div className={styles.xCard}>
          <Visual creative={creative} image={image} video={video} ratio="wide" editable={editable} onCreative={onCreative} />
          <div className={styles.xCardFoot}>
            <span className={styles.liDomain}>{brand.domain}</span>
            <Editable editable={editable} value={copy.headline} onChange={(v) => onCopy('headline', v)} label="Card title" className={styles.xCardTitle} limit={limits.headline} />
          </div>
        </div>
        <footer className={cx(styles.actions, styles.xActions)} aria-hidden>
          <MessageCircle size={16} />
          <Repeat2 size={16} />
          <Heart size={16} />
          <ChartNoAxesColumn size={16} />
        </footer>
      </div>
    </div>
  );
}

export const PREVIEW: Record<Platform, (props: PreviewProps) => JSX.Element> = {
  meta: MetaPreview,
  linkedin: LinkedInPreview,
  x: XPreview,
};
