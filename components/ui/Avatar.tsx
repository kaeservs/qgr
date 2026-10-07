import { cx } from '@/lib/cx';
import styles from './ui.module.css';

// Neutral tones keyed by the name, so a competitor keeps its colour everywhere
// and none of them borrows the brand's indigo or gold.
const TONES = ['#475569', '#0f766e', '#7c3a6b', '#8a5a2b', '#3f5f8a', '#5b6b2f'];

function toneFor(name: string) {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return TONES[h % TONES.length];
}

export function Avatar({ name, size = 40, brand = false }: { name: string; size?: number; brand?: boolean }) {
  const initials = name
    .split(/\s+/)
    .filter((w) => /^[A-Za-z0-9]/.test(w))
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('');
  return (
    <span
      className={cx(styles.avatar, brand && styles.avatarBrand)}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.36), ...(brand ? {} : { background: toneFor(name) }) }}
      aria-hidden
    >
      {initials}
    </span>
  );
}
