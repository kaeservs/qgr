import { PLACE_LABEL } from '@/lib/post-input';
import type { ExamplePlace } from '@/lib/types';
import { PlaceIcon, PlatformIcon } from '../ui/PlatformIcon';

export const EXAMPLE_LABEL: Record<ExamplePlace, string> = { ...PLACE_LABEL, x: 'X' };

/** The mark of the place a post that works ran: Facebook, Instagram, LinkedIn or X. */
export function ExampleIcon({ place, size = 16 }: { place: ExamplePlace; size?: number }) {
  return place === 'x' ? <PlatformIcon platform="x" size={size} decorative /> : <PlaceIcon place={place} size={size} decorative />;
}
