'use client';

import { Bookmark, Ellipsis, Globe, Heart, MessageCircle, Repeat2, Send, Share2, ThumbsUp } from 'lucide-react';
import type { JSX } from 'react';
import { INSTAGRAM_MAX } from '@/lib/guardrails';
import { LIMITS } from '@/lib/edit-input';
import type { Place, Variant } from '@/lib/types';
import type { CreativeVideo } from '../video/VideoCreative';
import { Editable } from './Editable';
import type { CreativeDesign } from '@/lib/creative/design';
import { Mark, Visual } from './Previews';
import type { AdBrand } from './Previews';
import styles from './previews.module.css';

/**
 * A variant's post on a Page, as each platform shows an organic post rather
 * than an ad: the words in full, then the picture (Instagram shows the picture
 * first). Without a post written for the place, its ad copy is shown, because
 * that is what would go out; writing here makes it the post.
 */
export interface PostPreviewProps {
  text: string;
  /** No post is written for this place: the ad copy would go out. */
  fromCopy: boolean;
  creative: Variant['creative'];
  image: string | undefined;
  brand: AdBrand;
  editable: boolean;
  onText: (value: string) => void;
  onCreative: (text: string) => void;
  video?: (CreativeVideo & { label: string }) | undefined;
  design?: { layout: CreativeDesign; brandName: string } | undefined;
}

function FromCopy({ fromCopy }: { fromCopy: boolean }) {
  return fromCopy ? <p className={styles.fromCopy}>No post written for this place yet: its ad copy would go out. Write it here.</p> : null;
}

export function FacebookPost({ text, fromCopy, creative, image, brand, editable, onText, onCreative, video, design }: PostPreviewProps) {
  return (
    <div className={styles.post}>
      <header className={styles.head}>
        <span className={styles.roundLogo}>
          <Mark size={26} />
        </span>
        <span className={styles.who}>
          <strong>{brand.name}</strong>
          <span>
            Just now · <Globe size={11} aria-hidden />
          </span>
        </span>
        <Ellipsis size={18} className={styles.more} aria-hidden />
      </header>
      <div className={styles.body}>
        <FromCopy fromCopy={fromCopy} />
        <Editable editable={editable} value={text} onChange={onText} label="Facebook post" className={styles.text} limit={LIMITS.post} multiline />
      </div>
      <Visual creative={creative} image={image} video={video} design={design} ratio="square" editable={editable} onCreative={onCreative} />
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

export function InstagramPost({ text, fromCopy, creative, image, brand, editable, onText, onCreative, video, design }: PostPreviewProps) {
  const handle = brand.name.toLowerCase().replace(/[^a-z0-9._]/g, '');
  return (
    <div className={styles.post}>
      <header className={styles.head}>
        <span className={styles.roundLogo}>
          <Mark size={26} />
        </span>
        <span className={styles.who}>
          <strong>{handle}</strong>
        </span>
        <Ellipsis size={18} className={styles.more} aria-hidden />
      </header>
      <Visual creative={creative} image={image} video={video} design={design} ratio="square" editable={editable} onCreative={onCreative} />
      <div className={styles.igActions} aria-hidden>
        <Heart size={20} />
        <MessageCircle size={20} />
        <Send size={20} />
        <Bookmark size={20} className={styles.igSave} />
      </div>
      <div className={styles.body}>
        <FromCopy fromCopy={fromCopy} />
        <strong className={styles.igHandle}>{handle}</strong>
        <Editable editable={editable} value={text} onChange={onText} label="Instagram caption" className={styles.text} limit={INSTAGRAM_MAX} multiline />
      </div>
    </div>
  );
}

export function LinkedInPost({ text, fromCopy, creative, image, brand, editable, onText, onCreative, video, design }: PostPreviewProps) {
  return (
    <div className={styles.post}>
      <header className={styles.head}>
        <span className={styles.squareLogo}>
          <Mark size={28} />
        </span>
        <span className={styles.who}>
          <strong>{brand.company}</strong>
          <span>Now · <Globe size={11} aria-hidden /></span>
        </span>
        <Ellipsis size={18} className={styles.more} aria-hidden />
      </header>
      <div className={styles.body}>
        <FromCopy fromCopy={fromCopy} />
        <Editable editable={editable} value={text} onChange={onText} label="LinkedIn post" className={styles.text} limit={LIMITS.post} multiline />
      </div>
      <Visual creative={creative} image={image} video={video} design={design} ratio="wide" editable={editable} onCreative={onCreative} />
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

export const POST_PREVIEW: Record<Place, (props: PostPreviewProps) => JSX.Element> = {
  facebook: FacebookPost,
  instagram: InstagramPost,
  linkedin: LinkedInPost,
};
