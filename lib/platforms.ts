import type { Goal, Platform } from './types';

export const PLATFORM_LABEL: Record<Platform, string> = {
  meta: 'Meta',
  linkedin: 'LinkedIn',
  x: 'X',
};

export const GOAL_LABEL: Record<Goal, string> = {
  consultations: 'Book consultations',
  webinar: 'Webinar sign-ups',
  awareness: 'Brand awareness',
  guide: 'Guide downloads',
};

/**
 * Lengths past which each platform cuts the text off in the feed. They are
 * the platforms' recommendations, not hard limits (X's 280 is the exception),
 * and they move: check them against the current ad specs before relying on one.
 */
export const COPY_LIMITS: Record<Platform, { text: number; headline: number; description?: number }> = {
  meta: { text: 125, headline: 40, description: 30 },
  linkedin: { text: 150, headline: 70 },
  x: { text: 280, headline: 70 },
};

/** Call-to-action buttons each platform offers. X website cards have none. */
export const CTA_OPTIONS: Record<Platform, readonly string[]> = {
  meta: ['Book now', 'Learn more', 'Sign up', 'Contact us', 'Get quote', 'Download'],
  linkedin: ['Learn more', 'Register', 'Sign up', 'Request demo', 'Download', 'Apply'],
  x: [],
};

export type LengthState = 'ok' | 'near' | 'over';

/** Near is the last tenth before the limit: the moment to start trimming. */
export function lengthState(length: number, limit: number): LengthState {
  if (length > limit) return 'over';
  if (length > limit * 0.9) return 'near';
  return 'ok';
}
