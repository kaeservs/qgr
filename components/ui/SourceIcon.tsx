import { FileText, Globe, Link2, Mic, Newspaper, Upload, Video } from 'lucide-react';
import type { SourceKind } from '@/lib/sources';

const ICON = { website: Globe, ad_link: Link2, upload: Upload, podcast: Mic, blog: Newspaper, video: Video, text: FileText } as const;

export function SourceIcon({ kind, size = 15 }: { kind: SourceKind; size?: number }) {
  const Icon = ICON[kind];
  return <Icon size={size} strokeWidth={1.9} aria-hidden />;
}
