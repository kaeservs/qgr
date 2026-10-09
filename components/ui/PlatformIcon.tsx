import { PLATFORM_LABEL } from '@/lib/platforms';
import { PLACE_LABEL } from '@/lib/post-input';
import type { Place, Platform } from '@/lib/types';

// Meta and X marks from simple-icons (CC0). LinkedIn's mark is drawn here:
// simple-icons no longer carries it.
const META =
  'M6.915 4.03c-1.968 0-3.683 1.28-4.871 3.113C.704 9.208 0 11.883 0 14.449c0 .706.07 1.369.21 1.973a6.624 6.624 0 0 0 .265.86 5.297 5.297 0 0 0 .371.761c.696 1.159 1.818 1.927 3.593 1.927 1.497 0 2.633-.671 3.965-2.444.76-1.012 1.144-1.626 2.663-4.32l.756-1.339.186-.325c.061.1.121.196.183.3l2.152 3.595c.724 1.21 1.665 2.556 2.47 3.314 1.046.987 1.992 1.22 3.06 1.22 1.075 0 1.876-.355 2.455-.843a3.743 3.743 0 0 0 .81-.973c.542-.939.861-2.127.861-3.745 0-2.72-.681-5.357-2.084-7.45-1.282-1.912-2.957-2.93-4.716-2.93-1.047 0-2.088.467-3.053 1.308-.652.57-1.257 1.29-1.82 2.05-.69-.875-1.335-1.547-1.958-2.056-1.182-.966-2.315-1.303-3.454-1.303zm10.16 2.053c1.147 0 2.188.758 2.992 1.999 1.132 1.748 1.647 4.195 1.647 6.4 0 1.548-.368 2.9-1.839 2.9-.58 0-1.027-.23-1.664-1.004-.496-.601-1.343-1.878-2.832-4.358l-.617-1.028a44.908 44.908 0 0 0-1.255-1.98c.07-.109.141-.224.211-.327 1.12-1.667 2.118-2.602 3.358-2.602zm-10.201.553c1.265 0 2.058.791 2.675 1.446.307.327.737.871 1.234 1.579l-1.02 1.566c-.757 1.163-1.882 3.017-2.837 4.338-1.191 1.649-1.81 1.817-2.486 1.817-.524 0-1.038-.237-1.383-.794-.263-.426-.464-1.13-.464-2.046 0-2.221.63-4.535 1.66-6.088.454-.687.964-1.226 1.533-1.533a2.264 2.264 0 0 1 1.088-.285z';
const X =
  'M14.234 10.162 22.977 0h-2.072l-7.591 8.824L7.251 0H.258l9.168 13.343L.258 24H2.33l8.016-9.318L16.749 24h6.993zm-2.837 3.299-.929-1.329L3.076 1.56h3.182l5.965 8.532.929 1.329 7.754 11.09h-3.182z';

/** The platform's own colour, used only for its mark. */
const COLOR: Record<Platform, string> = { meta: '#0467DF', linkedin: '#0A66C2', x: '#0F1419' };

/** Pass `decorative` when the platform's name is already written beside the mark. */
export function PlatformIcon({ platform, size = 16, mono = false, decorative = false }: { platform: Platform; size?: number; mono?: boolean; decorative?: boolean }) {
  const fill = mono ? 'currentColor' : COLOR[platform];
  const label = PLATFORM_LABEL[platform];
  const a11y = decorative ? ({ 'aria-hidden': true } as const) : ({ role: 'img', 'aria-label': label } as const);
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" focusable="false" {...a11y}>
      {!decorative && <title>{label}</title>}
      {platform === 'meta' && <path d={META} fill={fill} />}
      {platform === 'x' && <path d={X} fill={fill} />}
      {platform === 'linkedin' && (
        <>
          <rect width="24" height="24" rx="4" fill={fill} />
          <circle cx="6.6" cy="6.7" r="1.9" fill="#fff" />
          <rect x="4.9" y="9.6" width="3.4" height="9.6" rx="0.4" fill="#fff" />
          <path d="M10.6 9.6h3.2v1.45c.52-.95 1.75-1.7 3.35-1.7 2.75 0 3.55 1.75 3.55 4.3v5.55h-3.4v-4.9c0-1.25-.3-2.2-1.55-2.2-1.35 0-1.75 1-1.75 2.35v4.75h-3.4z" fill="#fff" />
        </>
      )}
    </svg>
  );
}

export function PlatformIcons({ platforms, size = 16 }: { platforms: readonly Platform[]; size?: number }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      {platforms.map((p) => (
        <PlatformIcon key={p} platform={p} size={size} />
      ))}
    </span>
  );
}

const PLACE_COLOR: Record<Place, string> = { facebook: '#0866FF', instagram: '#E4405F', linkedin: COLOR.linkedin };

/** Where a post goes: Facebook and Instagram drawn plainly here, LinkedIn as above. */
export function PlaceIcon({ place, size = 16, decorative = false }: { place: Place; size?: number; decorative?: boolean }) {
  if (place === 'linkedin') return <PlatformIcon platform="linkedin" size={size} decorative={decorative} />;
  const label = PLACE_LABEL[place];
  const a11y = decorative ? ({ 'aria-hidden': true } as const) : ({ role: 'img', 'aria-label': label } as const);
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" focusable="false" {...a11y}>
      {!decorative && <title>{label}</title>}
      {place === 'facebook' ? (
        <>
          <circle cx="12" cy="12" r="12" fill={PLACE_COLOR.facebook} />
          <path d="M13.4 24v-8.6h2.9l.45-3.4H13.4V9.86c0-.98.28-1.66 1.69-1.66h1.8V5.17A24 24 0 0 0 14.27 5c-2.6 0-4.37 1.59-4.37 4.5V12H7v3.4h2.9V24z" fill="#fff" />
        </>
      ) : (
        <>
          <rect width="24" height="24" rx="6" fill={PLACE_COLOR.instagram} />
          <rect x="5" y="5" width="14" height="14" rx="4" fill="none" stroke="#fff" strokeWidth="1.8" />
          <circle cx="12" cy="12" r="3.4" fill="none" stroke="#fff" strokeWidth="1.8" />
          <circle cx="16.3" cy="7.7" r="1.1" fill="#fff" />
        </>
      )}
    </svg>
  );
}
