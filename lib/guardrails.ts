import { PLATFORM_LABEL } from './platforms';
import { PLACES, PLATFORMS } from './types';
import type { Place, Platform, PlatformCopy } from './types';

// The checks the Content Agent runs on Claude's answer
// (n8n/code/content-read-answer.js), run again here whenever a person edits a
// variant, so the flags always describe the words on screen. They flag a
// phrase for a person to judge; they never change a word. n8n/code.test.ts
// keeps the two in step.

const RULES: readonly (readonly [RegExp, string])[] = [
  [/guarantee/i, 'says "guarantee"'],
  [/risk[\s-]?free/i, 'says "risk-free"'],
  [/\b100\s?%/, 'says "100%"'],
  [/\bassured\b/i, 'says "assured"'],
  [/\bin\s+\d+\s+(days|weeks|months)\b/i, 'promises a timeline'],
  [/investment with risk/i, 'says "an investment with risk"'],
  [/\bturn(s|ed|ing)? (them |it |projects? )?down\b|\bwould(n['’]t| not) back\b|\bbefore (it|they) reach(es)? you\b|\bfalls? short\b/i, 'says QGR turns projects down'],
  [/\bshould(n['’]t| not)\b|\b(doesn['’]t|does not|don['’]t|do not) (have to )?(depend|hinge|rest)\b/i, 'leads with a problem ("shouldn\'t", "doesn\'t depend")'],
  [/\b(not|without|rather than|no)\s+(any\s+)?(pressure|pushing|rush(ing)?|sales pitch|hard sell)\b/i, 'contrasts with other advisors ("not pressure")'],
  [/\btired of\b|\buncertaint(y|ies)\b|\bworr(y|ied|ies)\b|\banxi(ety|ous)\b|\bstress(ed|ful)?\b|\bfears?\b/i, 'sells by worry ("uncertainty", "tired of")'],
  [/\bUS\b(?!\$)/, 'writes "US" for "U.S."'],
];

const FIELDS = ['text', 'headline', 'description'] as const;

/** X refuses a longer post; the other platforms' lengths are recommendations. */
export const X_MAX = 280;
/** Instagram refuses a longer caption, or more hashtags. */
export const INSTAGRAM_MAX = 2200;
export const INSTAGRAM_HASHTAGS = 30;

/** The hashtags in a post, as Instagram counts them. */
export const hashtagsIn = (text: string): number => (text.match(/(^|\s)#[^\s#]+/g) ?? []).length;

/**
 * The flags for a variant's words: its ad copy for each platform, the words on
 * its image, then its posts for each place. A post is flagged like copy, and
 * past what Instagram takes.
 */
export function guardrailWarnings(
  creativeText: string,
  copy: Partial<Record<Platform, PlatformCopy>>,
  platforms: readonly Platform[],
  posts: Partial<Record<Place, string>> = {},
): string[] {
  const warnings: string[] = [];
  for (const p of platforms) {
    const c = copy[p];
    if (!c) continue;
    for (const field of FIELDS) {
      const value = c[field];
      if (!value) continue;
      for (const [rule, says] of RULES) if (rule.test(value)) warnings.push(`${p} ${field} ${says}`);
    }
    if (p === 'x' && c.text.length > X_MAX) warnings.push(`x text is ${c.text.length} characters; X allows ${X_MAX}`);
  }
  for (const [rule, says] of RULES) if (rule.test(creativeText)) warnings.push(`image text ${says}`);
  for (const place of PLACES) {
    const post = posts[place];
    if (!post) continue;
    for (const [rule, says] of RULES) if (rule.test(post)) warnings.push(`${place} post ${says}`);
    if (place === 'instagram' && post.length > INSTAGRAM_MAX) warnings.push(`instagram post is ${post.length} characters; Instagram allows ${INSTAGRAM_MAX.toLocaleString('en-US')}`);
    if (place === 'instagram' && hashtagsIn(post) > INSTAGRAM_HASHTAGS) warnings.push(`instagram post has ${hashtagsIn(post)} hashtags; Instagram allows ${INSTAGRAM_HASHTAGS}`);
  }
  return warnings;
}

/**
 * The same checks on the words a video adds to an ad: its captions and its
 * end card. People write these in the studio, so they are flagged like copy.
 */
export function videoWarnings(
  edit:
    | {
        captions: readonly { text: string }[];
        endCard: { text: string } | null;
        overlays?: readonly { text: string }[] | undefined;
        sequence?: readonly ({ kind: 'title'; text: string; subtext: string } | { kind: 'clip' | 'image' })[] | undefined;
      }
    | undefined,
): string[] {
  if (!edit) return [];
  const warnings: string[] = [];
  const titles = (edit.sequence ?? []).flatMap((s) => (s.kind === 'title' ? [s.text, s.subtext] : []));
  for (const [rule, says] of RULES) {
    if (edit.captions.some((c) => rule.test(c.text))) warnings.push(`a caption ${says}`);
    if (edit.endCard && rule.test(edit.endCard.text)) warnings.push(`end card ${says}`);
    if ((edit.overlays ?? []).some((o) => rule.test(o.text))) warnings.push(`a text on the video ${says}`);
    if (titles.some((t) => rule.test(t))) warnings.push(`a title card ${says}`);
  }
  return warnings;
}

/** The same checks on the texts a person adds to a picture ad's design. */
export function designWarnings(design: { texts: readonly { text: string }[] } | undefined): string[] {
  if (!design) return [];
  const warnings: string[] = [];
  for (const [rule, says] of RULES) if (design.texts.some((t) => rule.test(t.text))) warnings.push(`a text on the picture ${says}`);
  return warnings;
}

/** The same checks on a long video's moment's hook, worded as the Moments agent's script words them (moments-read-answer.js). */
export function hookWarnings(hook: string): string[] {
  return RULES.filter(([rule]) => rule.test(hook)).map(([, says]) => `Hook ${says}`);
}

/** The platforms a copy object covers, in the dashboard's order. */
export const copyPlatforms = (copy: Partial<Record<Platform, PlatformCopy>>): Platform[] => PLATFORMS.filter((p) => copy[p] !== undefined);

/** A flag as a person reads it: `meta text says "guarantee"` becomes `Meta text says “guarantee”`. */
export function describeWarning(warning: string): string {
  const space = warning.indexOf(' ');
  const head = space === -1 ? warning : warning.slice(0, space);
  const rest = space === -1 ? '' : warning.slice(space);
  const label = (PLATFORMS as readonly string[]).includes(head) ? PLATFORM_LABEL[head as Platform] : head.charAt(0).toUpperCase() + head.slice(1);
  return `${label}${rest}`.replace(/"([^"]*)"/g, '“$1”');
}
