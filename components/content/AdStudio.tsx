'use client';

import { ArrowLeft, Check, Copy, MousePointerClick, Pencil, RotateCcw } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { cx } from '@/lib/cx';
import { PLATFORM_LABEL } from '@/lib/platforms';
import type { AdSet, Platform, PlatformCopy, Strategy, Variant } from '@/lib/types';
import { PlatformIcon } from '../ui/PlatformIcon';
import { StatusPill } from '../ui/StatusPill';
import { useToast } from '../ui/Toast';
import { PREVIEW } from './Previews';
import styles from './content.module.css';

const same = (a: Variant, b: Variant | undefined) => !!b && a.creative.text === b.creative.text && JSON.stringify(a.copy) === JSON.stringify(b.copy);

function asText(copy: PlatformCopy): string {
  const lines = [copy.text, '', copy.headline];
  if (copy.description) lines.push(copy.description);
  if (copy.cta) lines.push(`[${copy.cta}]`);
  return lines.join('\n');
}

/**
 * Three variants side by side, each drawn as the platform's own post. Selecting
 * one highlights it and makes it editable in place; the others stay as they
 * are, for comparison. Edits live in this page until the backend saves them.
 */
export function AdStudio({ adSet, strategy, platforms }: { adSet: AdSet; strategy: Strategy | null; platforms: Platform[] }) {
  const toast = useToast();
  const [platform, setPlatform] = useState<Platform>(platforms[0] ?? 'meta');
  const [variants, setVariants] = useState(adSet.variants);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const originals = useMemo(() => new Map(adSet.variants.map((v) => [v.id, v])), [adSet.variants]);
  const selected = variants.find((v) => v.id === selectedId);

  // Escape leaves a field first, then the variant.
  useEffect(() => {
    if (!selectedId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const active = document.activeElement;
      if (active instanceof HTMLTextAreaElement || active instanceof HTMLSelectElement) active.blur();
      else setSelectedId(null);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [selectedId]);

  const update = (id: string, change: (v: Variant) => Variant) => setVariants((list) => list.map((v) => (v.id === id ? change(v) : v)));

  const anyApproved = variants.some((v) => v.approved);
  const status = anyApproved ? 'approved' : 'review';

  return (
    <div className={cx('page', styles.studio)}>
      <Link href="/content" className="back">
        <ArrowLeft size={16} aria-hidden />
        Content
      </Link>

      <header className="page-head">
        <div>
          <h1 className="display h1">{adSet.title}</h1>
          <p className={styles.meta}>
            {strategy && (
              <Link href={`/strategy/${strategy.id}`} className="link">
                View strategy
              </Link>
            )}
            <span>{variants.length} variants</span>
            <StatusPill status={status} small />
          </p>
        </div>
        {platforms.length > 1 && (
          <div className={styles.platforms} role="radiogroup" aria-label="Preview on">
            {platforms.map((p) => (
              <button key={p} type="button" role="radio" aria-checked={platform === p} className={cx(styles.platformBtn, platform === p && styles.platformBtnOn)} onClick={() => setPlatform(p)}>
                <PlatformIcon platform={p} size={16} decorative />
                {PLATFORM_LABEL[p]}
              </button>
            ))}
          </div>
        )}
      </header>

      <div className={cx(styles.toolbar, selected && styles.toolbarActive)} aria-live="polite">
        {selected ? (
          <>
            <p className={styles.toolbarText}>
              <Pencil size={16} aria-hidden />
              <span>
                Editing <strong>variant {selected.label}</strong> for {PLATFORM_LABEL[platform]}
              </span>
            </p>
            <div className={styles.tools}>
              <button
                type="button"
                className="btn btn-quiet btn-sm"
                disabled={same(selected, originals.get(selected.id))}
                onClick={() => {
                  const original = originals.get(selected.id);
                  if (!original) return;
                  // Reset restores the agent's words, not the approval.
                  const { approved: _approved, ...words } = original;
                  update(selected.id, (v) => (v.approved ? { ...words, approved: true } : words));
                }}
              >
                <RotateCcw size={15} aria-hidden />
                Reset
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(asText(selected.copy[platform]));
                    toast('Ad copy copied');
                  } catch {
                    toast('Copying is blocked in this browser', 'info');
                  }
                }}
              >
                <Copy size={15} aria-hidden />
                Copy
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSelectedId(null)}>
                Done
              </button>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={selected.approved}
                onClick={() => {
                  update(selected.id, (v) => ({ ...v, approved: true }));
                  toast(`Variant ${selected.label} approved`);
                }}
              >
                <Check size={15} aria-hidden />
                {selected.approved ? 'Approved' : 'Approve'}
              </button>
            </div>
          </>
        ) : (
          <p className={styles.toolbarText}>
            <MousePointerClick size={16} aria-hidden />
            Pick a variant to edit it.
          </p>
        )}
      </div>

      <div className={styles.variants}>
        {variants.map((v) => {
          const isSelected = v.id === selectedId;
          const Preview = PREVIEW[platform];
          return (
            <section key={v.id} className={cx(styles.variant, isSelected && styles.variantSelected)} aria-label={`Variant ${v.label}: ${v.angle}`}>
              <div className={styles.variantHead}>
                <span className={styles.letter}>{v.label}</span>
                <span className={styles.angle}>{v.angle}</span>
                {v.approved && <StatusPill status="approved" small />}
                {isSelected && !v.approved && <span className={cx('pill pill-sm', styles.editingPill)}>Editing</span>}
              </div>
              <div className={styles.frame}>
                <Preview
                  copy={v.copy[platform]}
                  creative={v.creative}
                  editable={isSelected}
                  onCopy={(field, value) => update(v.id, (x) => ({ ...x, copy: { ...x.copy, [platform]: { ...x.copy[platform], [field]: value } } }))}
                  onCreative={(text) => update(v.id, (x) => ({ ...x, creative: { ...x.creative, text } }))}
                />
                {!isSelected && (
                  <button type="button" className={styles.pick} onClick={() => setSelectedId(v.id)} aria-label={`Select variant ${v.label} to edit`}>
                    <span className={styles.pickHint}>
                      <Pencil size={14} aria-hidden />
                      Edit
                    </span>
                  </button>
                )}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
