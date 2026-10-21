import { Globe, Mail } from 'lucide-react';
import type { CompetitorPlace } from '@/lib/types';
import { PlatformIcon } from '../ui/PlatformIcon';

/** Where a competitor's item is, as its icon and a name: a platform, their email, or a web page. */
export const PLACE_LABEL: Record<CompetitorPlace, string> = { meta: 'Meta', linkedin: 'LinkedIn', x: 'X', email: 'Email', web: 'Web page' };

export function PlaceIcon({ place, size = 16, decorative = false }: { place: CompetitorPlace; size?: number; decorative?: boolean }) {
  if (place === 'email' || place === 'web') {
    const Icon = place === 'email' ? Mail : Globe;
    return decorative ? <Icon size={size} aria-hidden /> : <Icon size={size} role="img" aria-label={PLACE_LABEL[place]} />;
  }
  return <PlatformIcon platform={place} size={size} decorative={decorative} />;
}
