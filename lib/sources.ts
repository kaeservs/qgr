import { hostOf } from './format';
import type { RunSource } from './types';

export type SourceKind = 'website' | 'ad_link' | 'upload' | 'podcast' | 'blog' | 'video' | 'text';

export const sourceKind = (s: RunSource): SourceKind => (s.kind === 'competitor' ? s.input : s.type);

export const SOURCE_LABEL: Record<SourceKind, string> = {
  website: 'Competitor website',
  ad_link: 'Competitor ad link',
  upload: 'Uploaded ads',
  podcast: 'Podcast episode',
  blog: 'Blog post',
  video: 'Video',
  text: 'Pasted text',
};

/** The short line that says where a run came from: a host, a file count or the text's opening. */
export function sourceDetail(s: RunSource): string {
  if (s.kind === 'competitor') {
    return s.input === 'upload' ? `${s.files.length} file${s.files.length === 1 ? '' : 's'}` : hostOf(s.url);
  }
  return s.type === 'text' ? `${s.excerpt.slice(0, 60).trimEnd()}…` : hostOf(s.url);
}
