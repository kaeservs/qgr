// Leads, worked out: which campaign and which ad each came from, how many of
// each campaign's and ad's leads are qualified, and what the team might do
// about it. Every count is computed here from the leads, never by a model; a
// model only judges each lead, and a person's verdict counts over its own.
//
// A lead is tied to an ad by what it carries: Meta's campaign and ad from a
// lead form, or the tags on the link it followed. A QGR post's link is tagged
// by the database as it is scheduled (private.tagged_link, which taggedLink
// here matches), and an ad in Ads Manager named "qgr-<run>-<label>" says the
// same. A lead that carries neither is not tied to a campaign: never guessed.
//
// A suggestion is made only where one ad's leads qualify more, or less, often
// than the rest of its campaign's by more than chance would explain: Fisher's
// exact test at 95%, which holds at the small counts leads come in. A person
// approves it; for a QGR variant that starts a run with the facts as its
// direction. Pure, and tested.

import { PLACE_LABEL } from './post-input';
import { LEAD_PLATFORMS, ZOHO_REGIONS } from './types';
import type { Lead, LeadPlatform, LeadVerdict, Place, Variant, ZohoRegion } from './types';

export const VERDICT_LABEL: Record<LeadVerdict | 'waiting', string> = {
  qualified: 'Qualified',
  not_qualified: 'Not qualified',
  unclear: 'Can’t tell',
  waiting: 'Not judged yet',
};

export const LEAD_PLATFORM_LABEL: Record<LeadPlatform, string> = {
  facebook: 'Facebook',
  instagram: 'Instagram',
  meta: 'Facebook or Instagram',
  linkedin: 'LinkedIn',
  x: 'X',
  website: 'Website',
  other: 'Not known',
};

/** What a lead counts as: a person's verdict over Claude's, or waiting while neither has said. */
export const finalVerdict = (lead: Pick<Lead, 'person' | 'ai'>): LeadVerdict | 'waiting' => lead.person?.verdict ?? lead.ai?.verdict ?? 'waiting';

// ---------------------------------------------------------------- Zoho

/** The CRM's host in each region: Canada's is zohocloud.ca. */
const CRM_HOST: Record<ZohoRegion, string> = {
  com: 'crm.zoho.com',
  eu: 'crm.zoho.eu',
  in: 'crm.zoho.in',
  'com.au': 'crm.zoho.com.au',
  jp: 'crm.zoho.jp',
  ca: 'crm.zohocloud.ca',
  sa: 'crm.zoho.sa',
  'com.cn': 'crm.zoho.com.cn',
};

type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

/**
 * The region and organisation of a Zoho CRM, from its address as the browser
 * shows it (https://crm.zoho.eu/crm/org20123456/tab/Home/begin). The region
 * says which of Zoho's data centres to ask; the organisation makes each lead's
 * link open in it.
 */
export function parseZohoAddress(raw: unknown): Parsed<{ region: ZohoRegion; org: string | null }> {
  const text = typeof raw === 'string' ? raw.trim() : '';
  const m = /^(?:https?:\/\/)?(crm\.zoho(?:cloud)?\.[a-z.]+)(\/crm(?:\/(org\d{1,20}))?)?(?:[/?#].*)?$/i.exec(text);
  const region = m ? (Object.keys(CRM_HOST) as ZohoRegion[]).find((r) => CRM_HOST[r] === m[1]!.toLowerCase()) : undefined;
  if (!m || !region) return { ok: false, error: 'Paste the address of your Zoho CRM as your browser shows it, like https://crm.zoho.com/crm/org123456789/tab/Home.' };
  return { ok: true, value: { region, org: m[3] ? m[3].toLowerCase() : null } };
}

export const zohoAddress = (zoho: { region: ZohoRegion; org: string | null }) => `https://${CRM_HOST[zoho.region]}/crm${zoho.org ? `/${zoho.org}` : ''}`;

export const zohoLeadUrl = (zoho: { region: ZohoRegion; org: string | null }, zohoId: string) => `${zohoAddress(zoho)}/tab/Leads/${zohoId}`;

export const isZohoRegion = (v: unknown): v is ZohoRegion => (ZOHO_REGIONS as readonly unknown[]).includes(v);
export const isLeadPlatform = (v: unknown): v is LeadPlatform => (LEAD_PLATFORMS as readonly unknown[]).includes(v);

// ---------------------------------------------------------------- the team's words

export const CRITERIA_LIMITS = { min: 20, max: 4000 } as const;

export function parseCriteria(raw: unknown): Parsed<string> {
  const text = typeof raw === 'string' ? raw.replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, ' ').trim() : '';
  if (text.length < CRITERIA_LIMITS.min || text.length > CRITERIA_LIMITS.max) return { ok: false, error: `Say what makes a lead qualified in ${CRITERIA_LIMITS.min} to ${CRITERIA_LIMITS.max.toLocaleString('en-US')} characters.` };
  return { ok: true, value: text };
}

/** The team's link for posts: https, no # part, 300 characters at most; empty for none. */
export function parsePostLink(raw: unknown): Parsed<string | null> {
  const text = typeof raw === 'string' ? raw.trim() : '';
  if (!text) return { ok: true, value: null };
  if (text.length > 300 || !/^https:\/\/[^\s?#]+(\?[^\s#]*)?$/.test(text)) return { ok: false, error: 'The link must start with https:// and have no # part.' };
  return { ok: true, value: text };
}

export const NOTE_LIMIT = 500;

export function parseLeadVerdict(verdict: unknown, note: unknown): Parsed<{ verdict: 'qualified' | 'not_qualified' | null; note: string | null }> {
  if (verdict !== null && verdict !== 'qualified' && verdict !== 'not_qualified') return { ok: false, error: 'A lead is qualified or not qualified.' };
  const text = typeof note === 'string' ? note.replace(/\s+/g, ' ').trim() : '';
  if (text.length > NOTE_LIMIT) return { ok: false, error: `Keep the reason under ${NOTE_LIMIT} characters.` };
  return { ok: true, value: { verdict, note: verdict && text ? text : null } };
}

// ---------------------------------------------------------------- tagged links

/** The team's link with the tags that tie a lead to a post: what the database adds to a post that asks for it. */
export function taggedLink(link: string, runId: string, label: Variant['label'], place: Place): string {
  return `${link}${link.includes('?') ? '&' : '?'}utm_source=${place}&utm_medium=social&utm_campaign=qgr-${runId.slice(0, 8)}&utm_content=${label.toLowerCase()}-${place}`;
}

/** Places whose words take a link a person can follow: Instagram's do not. */
export const LINK_PLACES: readonly Place[] = ['facebook', 'linkedin'];

// ---------------------------------------------------------------- campaigns and ads

export interface Counts {
  leads: number;
  qualified: number;
  notQualified: number;
  unclear: number;
  waiting: number;
}

const EMPTY: Counts = { leads: 0, qualified: 0, notQualified: 0, unclear: 0, waiting: 0 };

export function countsOf(leads: readonly Lead[]): Counts {
  const c = { ...EMPTY };
  for (const l of leads) {
    c.leads++;
    const v = finalVerdict(l);
    if (v === 'qualified') c.qualified++;
    else if (v === 'not_qualified') c.notQualified++;
    else if (v === 'unclear') c.unclear++;
    else c.waiting++;
  }
  return c;
}

/** Leads with a verdict; the share qualified is of these. */
export const judged = (c: Counts) => c.qualified + c.notQualified + c.unclear;
export const qualifiedShare = (c: Counts): number | null => (judged(c) > 0 ? c.qualified / judged(c) : null);

export type CampaignKind = 'meta' | 'run' | 'tags' | 'none';

export const CAMPAIGN_KIND_LABEL: Record<CampaignKind, string> = {
  meta: 'Meta lead form',
  run: 'QGR run',
  tags: 'Tagged link',
  none: 'Not tied to a campaign',
};

/** The campaign a lead belongs to: Meta's, the QGR run its link names, its link's campaign tag, or none. */
export function campaignOf(lead: Lead): { key: string; name: string; kind: CampaignKind; runId?: string } {
  const c = lead.campaign;
  if (c.id || c.name) return { key: `meta:${c.id ?? c.name}`, name: c.name ?? `Meta campaign ${c.id}`, kind: 'meta' };
  if (lead.from) return { key: `run:${lead.from.runId}`, name: lead.from.runTitle, kind: 'run', runId: lead.from.runId };
  if (c.utm?.campaign) return { key: `tag:${c.utm.campaign}`, name: c.utm.campaign, kind: 'tags' };
  return { key: 'none', name: CAMPAIGN_KIND_LABEL.none, kind: 'none' };
}

/** The ad within it: Meta's ad, the QGR variant (and the place it went), the link's content tag, or none. */
export function adOf(lead: Lead): { key: string; name: string; variantId?: string; adSetId?: string } {
  const c = lead.campaign;
  const from = lead.from;
  const where = from?.place ? ` on ${from.place === 'x' ? 'X' : PLACE_LABEL[from.place]}` : '';
  if (c.adId || c.adName) {
    return { key: `ad:${c.adId ?? c.adName}`, name: c.adName ?? `Ad ${c.adId}`, ...(from?.variantId ? { variantId: from.variantId } : {}), ...(from?.adSetId ? { adSetId: from.adSetId } : {}) };
  }
  if (from?.variantId && from.label) return { key: `variant:${from.variantId}:${from.place ?? ''}`, name: `Variant ${from.label}${where}`, variantId: from.variantId, ...(from.adSetId ? { adSetId: from.adSetId } : {}) };
  if (c.utm?.content) return { key: `content:${c.utm.content}`, name: c.utm.content };
  return { key: 'none', name: 'Not tied to an ad' };
}

export interface AdGroup {
  key: string;
  name: string;
  variantId?: string;
  adSetId?: string;
  angle?: string;
  counts: Counts;
}

export interface CampaignGroup {
  key: string;
  name: string;
  kind: CampaignKind;
  runId?: string;
  platforms: LeadPlatform[];
  counts: Counts;
  /** Most leads first; the leads tied to no ad last. */
  ads: AdGroup[];
}

const byLeads = <T extends { key: string; counts: Counts }>(a: T, b: T) => (a.key === 'none' ? 1 : b.key === 'none' ? -1 : b.counts.leads - a.counts.leads || a.key.localeCompare(b.key));

/** The leads by campaign and, within each, by ad. Most leads first; the leads tied to nothing last. */
export function groupLeads(leads: readonly Lead[]): CampaignGroup[] {
  type Ads = { info: ReturnType<typeof adOf>; leads: Lead[] };
  type Campaign = { info: ReturnType<typeof campaignOf>; leads: Lead[]; ads: Map<string, Ads> };
  const campaigns = new Map<string, Campaign>();
  for (const lead of leads) {
    const info = campaignOf(lead);
    const group: Campaign = campaigns.get(info.key) ?? { info, leads: [], ads: new Map() };
    group.leads.push(lead);
    const ad = adOf(lead);
    const adGroup: Ads = group.ads.get(ad.key) ?? { info: ad, leads: [] };
    adGroup.leads.push(lead);
    group.ads.set(ad.key, adGroup);
    campaigns.set(info.key, group);
  }
  return [...campaigns.values()]
    .map(({ info, leads: list, ads }): CampaignGroup => ({
      key: info.key,
      name: info.name,
      kind: info.kind,
      ...(info.runId ? { runId: info.runId } : {}),
      platforms: LEAD_PLATFORMS.filter((p) => list.some((l) => l.platform === p)),
      counts: countsOf(list),
      ads: [...ads.values()]
        .map(({ info: ad, leads: adLeads }): AdGroup => {
          const angle = adLeads.find((l) => l.from?.angle)?.from?.angle;
          return { key: ad.key, name: ad.name, ...(ad.variantId ? { variantId: ad.variantId } : {}), ...(ad.adSetId ? { adSetId: ad.adSetId } : {}), ...(angle ? { angle } : {}), counts: countsOf(adLeads) };
        })
        .sort(byLeads),
    }))
    .sort(byLeads);
}

export const PERIODS = [7, 30, 90] as const;
export type Period = (typeof PERIODS)[number] | 'all';

export interface LeadFilter {
  period?: Period;
  platform?: LeadPlatform;
  campaign?: string;
  verdict?: LeadVerdict | 'waiting';
}

/** The leads a page shows: within the period before now, from the platform, in the campaign, with the verdict. */
export function filterLeads(leads: readonly Lead[], filter: LeadFilter, now: string): Lead[] {
  const since = filter.period && filter.period !== 'all' ? Date.parse(now) - filter.period * 86_400_000 : null;
  return leads.filter(
    (l) =>
      (since === null || Date.parse(l.createdAt) >= since) &&
      (!filter.platform || l.platform === filter.platform) &&
      (!filter.campaign || campaignOf(l).key === filter.campaign) &&
      (!filter.verdict || finalVerdict(l) === filter.verdict),
  );
}

// ---------------------------------------------------------------- suggestions

const lnFactorials = (n: number): number[] => {
  const out = [0];
  for (let i = 1; i <= n; i++) out.push(out[i - 1]! + Math.log(i));
  return out;
};

/**
 * Fisher's exact test, two-sided, on a 2×2 table: a of n1 against c of n2.
 * The chance of a split at least as uneven as this one, were both the same.
 */
export function fisher(a: number, n1: number, c: number, n2: number): number {
  const n = n1 + n2;
  const k = a + c;
  const lf = lnFactorials(n);
  const p = (x: number) => Math.exp(lf[k]! + lf[n - k]! + lf[n1]! + lf[n2]! - lf[n]! - lf[x]! - lf[k - x]! - lf[n1 - x]! - lf[n2 - k + x]!);
  const observed = p(a);
  let total = 0;
  for (let x = Math.max(0, k - n2); x <= Math.min(k, n1); x++) {
    const px = p(x);
    // A hair of room for rounding, so the observed table always counts itself.
    if (px <= observed * (1 + 1e-7)) total += px;
  }
  return Math.min(1, total);
}

/** At least this many judged leads in an ad, and in the rest of its campaign, before they are compared. */
export const MIN_JUDGED = 5;
/** 95%, either way round. */
const ALPHA = 0.05;

export interface LeadSuggestion {
  /** Stable across visits: the ad and which way it differs. */
  id: string;
  kind: 'more-like' | 'rethink';
  campaign: string;
  ad: string;
  /** Its leads, and the rest of its campaign's, as counts. */
  facts: { qualified: number; judged: number; restQualified: number; restJudged: number; p: number };
  /** The suggestion, in words worked out from the counts. */
  text: string;
  /** Set when the ad is a QGR variant: approving starts a run from it. */
  variantId?: string;
  adSetId?: string;
  angle?: string;
}

const pct = (x: number) => `${Math.round(x * 100)}%`;

/** Where an ad's leads qualify more or less often than the rest of its campaign's by more than chance. Strongest first. */
export function suggestionsOf(groups: readonly CampaignGroup[]): LeadSuggestion[] {
  const out: LeadSuggestion[] = [];
  for (const g of groups) {
    if (g.kind === 'none') continue;
    for (const ad of g.ads) {
      if (ad.key === 'none') continue;
      const q = ad.counts.qualified;
      const n = judged(ad.counts);
      const restQ = g.counts.qualified - q;
      const restN = judged(g.counts) - n;
      if (n < MIN_JUDGED || restN < MIN_JUDGED) continue;
      const p = fisher(q, n, restQ, restN);
      if (p >= ALPHA) continue;
      const better = q / n > restQ / restN;
      const facts = `${q} of ${n} of its leads qualified (${pct(q / n)}), against ${restQ} of ${restN} (${pct(restN ? restQ / restN : 0)}) for the rest of ${g.name}.`;
      out.push({
        id: `${better ? 'more' : 'rethink'}:${ad.key}`,
        kind: better ? 'more-like' : 'rethink',
        campaign: g.name,
        ad: ad.name,
        facts: { qualified: q, judged: n, restQualified: restQ, restJudged: restN, p },
        text: better ? `Make more like ${ad.name}: ${facts}` : `Rethink ${ad.name}: ${facts}`,
        ...(ad.variantId ? { variantId: ad.variantId } : {}),
        ...(ad.adSetId ? { adSetId: ad.adSetId } : {}),
        ...(ad.angle ? { angle: ad.angle } : {}),
      });
    }
  }
  return out.sort((a, b) => a.facts.p - b.facts.p);
}

/**
 * The direction for the run a suggestion starts once a person approves it:
 * the facts, and what to make of them. The agents read it with the variant's
 * words as the run's source.
 */
export function suggestionDirection(s: LeadSuggestion): string {
  const facts = `${s.facts.qualified} of ${s.facts.judged} leads from ${s.ad} were qualified, against ${s.facts.restQualified} of ${s.facts.restJudged} from the rest of ${s.campaign}.`;
  return s.kind === 'more-like'
    ? `${facts} Write new ads for the same people on the same angle${s.angle ? ` (${s.angle})` : ''}: new words, not copies of these.`
    : `${facts} Few of the people it brought were a fit. Keep the subject, find a different angle that speaks to people who could qualify, and say plainly who EB-5 is for.`;
}

export const suggestionTitle = (s: LeadSuggestion) => `${s.kind === 'more-like' ? 'More like' : 'Rethink'} ${s.ad}`.slice(0, 120);
