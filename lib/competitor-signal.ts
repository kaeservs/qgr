// How well a competitor's ad looks to be doing, from what is public. Meta does
// not publish another advertiser's spend, clicks or impressions, so this is
// worked out of the signs an ad that works leaves: it keeps running (an
// advertiser stops paying for one that loses money), they run more copies of
// it ("N ads use this creative and text"), it is placed widely, and, where a
// screenshot shows them, people react to it. Computed here, never by a model,
// and every rating says the facts it rests on. Pure, and tested.

/** The facts an ad carries; null is "not shown", never zero. */
export interface AdFacts {
  daysRunning: number | null;
  versions?: number | null;
  placements?: readonly string[];
  active?: boolean | null;
  reactions?: number;
  comments?: number;
  shares?: number;
  views?: number;
}

export type SignalLevel = 'strong' | 'promising' | 'little' | 'new' | 'ended' | 'unknown';

export interface AdSignal {
  level: SignalLevel;
  /** For ordering: the points the facts add up to. */
  score: number;
  /** The facts it rests on, as a person reads them. */
  reasons: string[];
}

export const SIGNAL_LABEL: Record<SignalLevel, string> = {
  strong: 'Strong',
  promising: 'Promising',
  little: 'Little sign yet',
  new: 'Too new to tell',
  ended: 'Stopped early',
  unknown: 'Not enough shown',
};

const PLACEMENT_LABEL: Record<string, string> = {
  facebook: 'Facebook',
  instagram: 'Instagram',
  messenger: 'Messenger',
  audience_network: 'Audience Network',
  threads: 'Threads',
  whatsapp: 'WhatsApp',
};

/** 1.2K, 45K, 2.3M: the same on the server and in the browser (no Intl). */
export function compact(n: number): string {
  if (n >= 1_000_000) return `${trim(n / 1_000_000)}M`;
  if (n >= 10_000) return `${Math.round(n / 1000)}K`;
  if (n >= 1000) return `${trim(n / 1000)}K`;
  return String(n);
}
const trim = (n: number) => (Math.round(n * 10) / 10).toString();

/**
 * Points: days running (14, 30, 60 and 90 days are 1 to 4), versions (2 or
 * more is 1, 5 or more is 2), placed in two or more places (1), reactions,
 * comments and shares together (100 is 1, 1,000 is 2), views (10,000 is 1).
 * Four or more is strong, two or more promising. An ad stopped within two
 * weeks is stopped early; one under a week old with less than two points is
 * too new to tell; one with nothing shown at all says so.
 */
export function adSignal(ad: AdFacts): AdSignal {
  const reasons: string[] = [];
  let score = 0;
  const days = ad.daysRunning;
  if (days !== null) {
    score += days >= 90 ? 4 : days >= 60 ? 3 : days >= 30 ? 2 : days >= 14 ? 1 : 0;
    reasons.push(ad.active === false ? `Ran ${days} day${days === 1 ? '' : 's'}, now stopped` : days === 0 ? 'Started today' : `${days} day${days === 1 ? '' : 's'} running`);
  }
  const versions = ad.versions ?? null;
  if (versions !== null) {
    score += versions >= 5 ? 2 : versions >= 2 ? 1 : 0;
    reasons.push(`${versions} version${versions === 1 ? '' : 's'}`);
  }
  const places = (ad.placements ?? []).map((p) => PLACEMENT_LABEL[p] ?? p);
  if (places.length > 0) {
    if (places.length >= 2) score += 1;
    reasons.push(places.join(' + '));
  }
  const engaged = (ad.reactions ?? 0) + (ad.comments ?? 0) + (ad.shares ?? 0);
  const said = [
    ad.reactions !== undefined ? `${compact(ad.reactions)} reaction${ad.reactions === 1 ? '' : 's'}` : null,
    ad.comments !== undefined ? `${compact(ad.comments)} comment${ad.comments === 1 ? '' : 's'}` : null,
    ad.shares !== undefined ? `${compact(ad.shares)} share${ad.shares === 1 ? '' : 's'}` : null,
    ad.views !== undefined ? `${compact(ad.views)} view${ad.views === 1 ? '' : 's'}` : null,
  ].filter((s): s is string => s !== null);
  if (said.length > 0) reasons.push(said.join(' · '));
  score += engaged >= 1000 ? 2 : engaged >= 100 ? 1 : 0;
  if ((ad.views ?? 0) >= 10_000) score += 1;

  const level: SignalLevel =
    ad.active === false && days !== null && days < 14
      ? 'ended'
      : reasons.length === 0
        ? 'unknown'
        : days !== null && days < 7 && score < 2
          ? 'new'
          : score >= 4
            ? 'strong'
            : score >= 2
              ? 'promising'
              : 'little';
  return { level, score, reasons };
}

/**
 * Their best performers: the ads with the most points, then the longest
 * running; only those with something to show (strong or promising).
 */
export function bestPerformers<A extends AdFacts>(ads: readonly A[], n = 3): { ad: A; signal: AdSignal }[] {
  return ads
    .map((ad) => ({ ad, signal: adSignal(ad) }))
    .filter((x) => x.signal.level === 'strong' || x.signal.level === 'promising')
    .sort((a, b) => b.signal.score - a.signal.score || (b.ad.daysRunning ?? -1) - (a.ad.daysRunning ?? -1))
    .slice(0, n);
}
