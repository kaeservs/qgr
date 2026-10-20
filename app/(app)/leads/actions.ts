'use server';

import { createRun, getAdSet, getLeads, getRun, judgeLeadsAgain, readLeadsNow, saveLeadCriteria, savePostLink, setLeadsSource, setLeadVerdict } from '@/lib/data';
import type { Saved } from '@/lib/data';
import { groupLeads, parseCriteria, parseLeadVerdict, parsePostLink, parseZohoAddress, suggestionDirection, suggestionsOf, suggestionTitle } from '@/lib/leads';
import { PLACE_LABEL } from '@/lib/post-input';
import { PLATFORM_LABEL } from '@/lib/platforms';
import { MAX_EXCERPT } from '@/lib/run-input';
import { checkTeam } from '@/lib/session';
import { PLACES } from '@/lib/types';

const ID = /^[\w-]{1,64}$/;

export async function saveLeadCriteriaAction(criteria: unknown): Promise<Saved> {
  const team = await checkTeam();
  if (!team.ok) return team;
  const parsed = parseCriteria(criteria);
  if (!parsed.ok) return { ok: false, status: 400, error: parsed.error };
  return saveLeadCriteria(parsed.value);
}

/** Zoho on, from the CRM's address as the browser shows it; or off. */
export async function setLeadsSourceAction(address: unknown): Promise<Saved> {
  const team = await checkTeam();
  if (!team.ok) return team;
  if (address === null) return setLeadsSource('off', null);
  const parsed = parseZohoAddress(address);
  if (!parsed.ok) return { ok: false, status: 400, error: parsed.error };
  return setLeadsSource('zoho', parsed.value);
}

export async function setLeadVerdictAction(leadId: unknown, verdict: unknown, note: unknown): Promise<Saved> {
  const team = await checkTeam();
  if (!team.ok) return team;
  if (typeof leadId !== 'string' || !ID.test(leadId)) return { ok: false, status: 400, error: 'That lead is gone.' };
  const parsed = parseLeadVerdict(verdict, note);
  if (!parsed.ok) return { ok: false, status: 400, error: parsed.error };
  return setLeadVerdict(leadId, parsed.value.verdict, parsed.value.note);
}

/** One lead, or every lead judged on older criteria (or that failed). */
export async function judgeLeadsAgainAction(leadId: unknown): Promise<Saved<{ count: number }>> {
  const team = await checkTeam();
  if (!team.ok) return team;
  if (leadId !== null && (typeof leadId !== 'string' || !ID.test(leadId))) return { ok: false, status: 400, error: 'That lead is gone.' };
  return judgeLeadsAgain(leadId);
}

export async function readLeadsNowAction(): Promise<Saved> {
  const team = await checkTeam();
  if (!team.ok) return team;
  return readLeadsNow();
}

export async function savePostLinkAction(link: unknown): Promise<Saved> {
  const team = await checkTeam();
  if (!team.ok) return team;
  const parsed = parsePostLink(link);
  if (!parsed.ok) return { ok: false, status: 400, error: parsed.error };
  return savePostLink(parsed.value);
}

/**
 * Approves a suggestion: a run built on the variant it is about, with the
 * counts behind it as the agents' direction. The suggestion is worked out
 * again here from the leads as they are now; nothing the browser says about it
 * is taken on trust.
 */
export async function approveSuggestionAction(suggestionId: unknown): Promise<Saved<{ id: string }>> {
  const team = await checkTeam();
  if (!team.ok) return team;
  if (typeof suggestionId !== 'string' || suggestionId.length > 200) return { ok: false, status: 400, error: 'That suggestion is not there any more.' };
  const { leads } = await getLeads();
  const suggestion = suggestionsOf(groupLeads(leads)).find((s) => s.id === suggestionId);
  if (!suggestion) return { ok: false, status: 409, error: 'That suggestion is not there any more: the leads have changed since. Look again.' };
  if (!suggestion.variantId || !suggestion.adSetId) return { ok: false, status: 400, error: 'This ad is not one of QGR’s runs, so there are no words to start from. Act on it in Ads Manager.' };

  const set = await getAdSet(suggestion.adSetId);
  const variant = set?.variants.find((v) => v.id === suggestion.variantId);
  const run = set ? await getRun(set.runId) : null;
  if (!set || !variant || !run) return { ok: false, status: 404, error: 'The ad this is about is not there any more.' };

  // What the agents start from: the variant's own words, everywhere it went.
  const words = [
    `The ad this run builds on: variant ${variant.label} of "${set.title}", on the angle "${variant.angle}".`,
    ...PLACES.flatMap((place) => (variant.posts?.[place] ? [`${PLACE_LABEL[place]} post:\n${variant.posts[place]}`] : [])),
    ...Object.entries(variant.copy).flatMap(([platform, copy]) => (copy ? [`${PLATFORM_LABEL[platform as keyof typeof PLATFORM_LABEL]} ad:\n${copy.headline ? `${copy.headline}\n` : ''}${copy.text}`] : [])),
  ]
    .join('\n\n')
    .slice(0, MAX_EXCERPT);

  return createRun(
    {
      source: { kind: 'custom', type: 'text', excerpt: words },
      platforms: run.platforms,
      goal: run.goal,
      title: suggestionTitle(suggestion),
      guidance: suggestionDirection(suggestion),
    },
    null,
  );
}
