'use client';

import { ArrowLeft, Check, Copy, MousePointerClick, Pencil, RotateCcw, TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { approveVariantAction, saveVariantAction } from '@/app/(app)/content/actions';
import { cx } from '@/lib/cx';
import { describeWarning, guardrailWarnings } from '@/lib/guardrails';
import { PLATFORM_LABEL } from '@/lib/platforms';
import type { AdSet, Platform, PlatformCopy, Strategy, Variant } from '@/lib/types';
import { PlatformIcon } from '../ui/PlatformIcon';
import { StatusPill } from '../ui/StatusPill';
import { useToast } from '../ui/Toast';
import { PREVIEW } from './Previews';
import type { AdBrand } from './Previews';
import styles from './content.module.css';

const sameWords = (a: Variant, b: Variant | undefined) => !!b && a.creative.text === b.creative.text && JSON.stringify(a.copy) === JSON.stringify(b.copy);

function asText(copy: PlatformCopy): string {
  const lines = [copy.text, '', copy.headline];
  if (copy.description) lines.push(copy.description);
  if (copy.cta) lines.push(`[${copy.cta}]`);
  return lines.join('\n');
}

/**
 * Three variants side by side, each drawn as the platform's own post. Selecting
 * one highlights it and makes it editable in place; the others stay as they
 * are, for comparison. Edits are saved when the variant is left (Done, Escape,
 * or picking another) and before it is approved. Guardrail flags are worked
 * out from the words on screen as they change.
 */
export function AdStudio({ adSet, strategy, platforms, brand }: { adSet: AdSet; strategy: Strategy | null; platforms: Platform[]; brand: AdBrand }) {
  const toast = useToast();
  const [platform, setPlatform] = useState<Platform>(platforms[0] ?? 'meta');
  const [variants, setVariants] = useState(adSet.variants);
  // The last version the server holds, for Reset and for knowing what changed.
  const [saved, setSaved] = useState(() => new Map(adSet.variants.map((v) => [v.id, v])));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState<'saving' | 'approving' | null>(null);
  const selected = variants.find((v) => v.id === selectedId);
  const isDirty = (v: Variant) => !sameWords(v, saved.get(v.id));
  const anyDirty = variants.some(isDirty);

  const update = (id: string, change: (v: Variant) => Variant) => setVariants((list) => list.map((v) => (v.id === id ? change(v) : v)));

  /** Saves a variant's words if they changed. False when the save failed, so the edit stays open. */
  async function persist(v: Variant): Promise<boolean> {
    if (!isDirty(v)) return true;
    setBusy('saving');
    const result = await saveVariantAction(v.id, { creativeText: v.creative.text, copy: v.copy });
    setBusy(null);
    if (!result.ok) {
      toast(result.error, 'info');
      return false;
    }
    const kept = { ...v, warnings: result.value.warnings };
    setSaved((map) => new Map(map).set(v.id, kept));
    toast(result.sample ? 'Saved for this session' : `Variant ${v.label} saved`);
    return true;
  }

  async function leave() {
    if (selected && !(await persist(selected))) return;
    setSelectedId(null);
  }

  async function pick(id: string) {
    if (busy) return;
    if (selected && !(await persist(selected))) return;
    setSelectedId(id);
  }

  async function approve(v: Variant) {
    if (!(await persist(v))) return;
    setBusy('approving');
    const result = await approveVariantAction(v.id);
    setBusy(null);
    if (!result.ok) return toast(result.error, 'info');
    update(v.id, (x) => ({ ...x, approved: true }));
    setSaved((map) => {
      const was = map.get(v.id);
      return was ? new Map(map).set(v.id, { ...was, approved: true }) : map;
    });
    toast(`Variant ${v.label} approved`);
  }

  // Escape leaves a field first, then the variant (saving it).
  useEffect(() => {
    if (!selectedId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const active = document.activeElement;
      if (active instanceof HTMLTextAreaElement || active instanceof HTMLSelectElement) active.blur();
      else void leave();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });

  // Closing the tab with unsaved words asks first.
  useEffect(() => {
    if (!anyDirty) return;
    const onLeave = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', onLeave);
    return () => window.removeEventListener('beforeunload', onLeave);
  }, [anyDirty]);

  const status = variants.some((v) => v.approved) ? 'approved' : 'review';

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
                {busy === 'saving' ? (
                  'Saving…'
                ) : (
                  <>
                    Editing <strong>variant {selected.label}</strong> for {PLATFORM_LABEL[platform]}
                  </>
                )}
              </span>
            </p>
            <div className={styles.tools}>
              <button
                type="button"
                className="btn btn-quiet btn-sm"
                disabled={!isDirty(selected) || busy !== null}
                onClick={() => {
                  const kept = saved.get(selected.id);
                  // Reset drops the changes not saved yet; it never undoes an approval.
                  if (kept) update(selected.id, (v) => (v.approved && !kept.approved ? { ...kept, approved: true } : kept));
                }}
              >
                <RotateCcw size={15} aria-hidden />
                Reset
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={!selected.copy[platform]}
                onClick={async () => {
                  const copy = selected.copy[platform];
                  if (!copy) return;
                  try {
                    await navigator.clipboard.writeText(asText(copy));
                    toast('Ad copy copied');
                  } catch {
                    toast('Copying is blocked in this browser', 'info');
                  }
                }}
              >
                <Copy size={15} aria-hidden />
                Copy
              </button>
              <button type="button" className="btn btn-ghost btn-sm" disabled={busy !== null} onClick={() => void leave()}>
                Done
              </button>
              <button type="button" className="btn btn-primary btn-sm" disabled={selected.approved || busy !== null} onClick={() => void approve(selected)}>
                <Check size={15} aria-hidden />
                {selected.approved ? 'Approved' : busy === 'approving' ? 'Approving…' : 'Approve'}
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
          const copy = v.copy[platform];
          const flags = guardrailWarnings(v.creative.text, v.copy, platforms);
          return (
            <section key={v.id} className={cx(styles.variant, isSelected && styles.variantSelected)} aria-label={`Variant ${v.label}: ${v.angle}`}>
              <div className={styles.variantHead}>
                <span className={styles.letter}>{v.label}</span>
                <span className={styles.angle}>{v.angle}</span>
                {v.approved && <StatusPill status="approved" small />}
                {isSelected && !v.approved && <span className={cx('pill pill-sm', styles.editingPill)}>Editing</span>}
              </div>
              {flags.length > 0 && (
                <div className={styles.flags} role="note">
                  <TriangleAlert size={15} aria-hidden />
                  <div>
                    <p className={styles.flagsTitle}>Check before approving</p>
                    <ul>
                      {flags.map((f) => (
                        <li key={f}>{describeWarning(f)}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
              <div className={styles.frame}>
                {copy ? (
                  <Preview
                    copy={copy}
                    creative={v.creative}
                    image={v.imageUrl}
                    brand={brand}
                    editable={isSelected && busy === null}
                    onCopy={(field, value) => update(v.id, (x) => {
                      const current = x.copy[platform];
                      return current ? { ...x, copy: { ...x.copy, [platform]: { ...current, [field]: value } } } : x;
                    })}
                    onCreative={(text) => update(v.id, (x) => ({ ...x, creative: { ...x.creative, text } }))}
                  />
                ) : (
                  <p className={cx('muted small', styles.noCopy)}>No {PLATFORM_LABEL[platform]} copy in this variant.</p>
                )}
                {!isSelected && (
                  <button type="button" className={styles.pick} onClick={() => void pick(v.id)} aria-label={`Select variant ${v.label} to edit`}>
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
