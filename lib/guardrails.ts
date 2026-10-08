import { PLATFORM_LABEL } from './platforms';
import { PLATFORMS } from './types';
import type { Platform, PlatformCopy } from './types';

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
];

const FIELDS = ['text', 'headline', 'description'] as const;

/** X refuses a longer post; the other platforms' lengths are recommendations. */
export const X_MAX = 280;

export function guardrailWarnings(creativeText: string, copy: Partial<Record<Platform, PlatformCopy>>, platforms: readonly Platform[]): string[] {
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
  return warnings;
}

/**
 * The same checks on the words a video adds to an ad: its captions and its
 * end card. People write these in the studio, so they are flagged like copy.
 */
export function videoWarnings(edit: { captions: readonly { text: string }[]; endCard: { text: string } | null } | undefined): string[] {
  if (!edit) return [];
  const warnings: string[] = [];
  for (const [rule, says] of RULES) {
    if (edit.captions.some((c) => rule.test(c.text))) warnings.push(`a caption ${says}`);
    if (edit.endCard && rule.test(edit.endCard.text)) warnings.push(`end card ${says}`);
  }
  return warnings;
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
