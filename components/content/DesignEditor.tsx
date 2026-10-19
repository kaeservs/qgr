'use client';

import { Plus, Redo2, RotateCcw, Trash2, TriangleAlert, Undo2, X as Close } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { saveDesignAction, saveVariantAction } from '@/app/(app)/content/actions';
import { addText, changeText, DESIGN_LIMITS, DESIGN_SHAPES, designOf, isPlain, LOGO, moveTo, PLAIN_DESIGN, putBack, removeText, TEXT_LOOK_LABEL, TEXT_LOOKS, WORDS } from '@/lib/creative/design';
import type { CreativeDesign, TextLook } from '@/lib/creative/design';
import { PICTURE_SIZE } from '@/lib/creative/draw';
import type { CreativeRatio } from '@/lib/creative/draw';
import { cx } from '@/lib/cx';
import { LIMITS } from '@/lib/edit-input';
import { describeWarning, designWarnings, guardrailWarnings } from '@/lib/guardrails';
import { SCALE } from '@/lib/spot';
import type { Spot } from '@/lib/spot';
import type { Variant } from '@/lib/types';
import { DragLayer } from '../ui/DragLayer';
import { Toggle } from '../ui/Toggle';
import { useToast } from '../ui/Toast';
import { useUndoable } from '../video/player';
import video from '../video/video.module.css';
import { useDrawnCreative } from './CreativeCanvas';
import styles from './content.module.css';

const SHAPE_LABEL: Record<CreativeRatio, string> = { square: 'Square · Meta', wide: 'Wide · LinkedIn' };

/** What the editor hands back once saved: the variant's layout and words as the server now holds them. */
export interface SavedDesign {
  design: CreativeDesign | null;
  creativeText: string;
  warnings?: string[];
}

/**
 * A picture ad's own layout: drag the words, the logo and any text added to
 * where they should sit, and size them, on each shape the ad is posted in.
 * The picture is drawn by the function that makes the posted file, so what
 * is placed here is what goes out. A new layout needs approving again.
 */
export function DesignEditor({
  variant,
  brandName,
  waitingToPost,
  onClose,
  onSaved,
}: {
  variant: Variant;
  /** The name the logo shows, as on the posted picture. */
  brandName: string;
  waitingToPost: boolean;
  onClose: () => void;
  onSaved: (saved: SavedDesign) => void;
}) {
  const toast = useToast();
  const dialog = useRef<HTMLDialogElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const started = useMemo(() => designOf(variant.design), [variant.design]);
  const history = useUndoable<CreativeDesign>(started);
  const design = history.value;
  const [shape, setShape] = useState<CreativeRatio>('square');
  const [words, setWords] = useState(variant.creative.text);
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);
  const size = PICTURE_SIZE[shape];
  const hits = useDrawnCreative(canvas, { text: words, style: variant.creative.style, ratio: shape, image: variant.imageUrl, design, brandName });
  const locked = waitingToPost || busy;

  useEffect(() => {
    const d = dialog.current;
    if (d && !d.open) d.showModal();
    return () => d?.close();
  }, []);

  const labels: Record<string, string> = { [WORDS]: 'the words', [LOGO]: 'the logo', ...Object.fromEntries(design.texts.map((t) => [t.id, `“${t.text}”`])) };
  const spotOf = (id: string): Spot | undefined => design.spots[shape]?.[id];
  /** Where a thing is now: its spot, or the middle of where it is drawn. */
  const placeOf = (id: string): Spot | null => {
    const spot = spotOf(id);
    if (spot) return spot;
    const hit = hits.find((h) => h.id === id);
    return hit ? { x: (hit.x + hit.width / 2) / size.width, y: (hit.y + hit.height / 2) / size.height, scale: 1 } : null;
  };
  const resize = (id: string, scale: number, settle: boolean) => {
    const at = placeOf(id);
    if (!at) return;
    const next = moveTo(design, shape, id, { ...at, scale });
    if (settle) history.settle(next);
    else history.preview(next);
  };

  const flags = [...guardrailWarnings(words, variant.copy, []).filter((f) => f.startsWith('image text')), ...designWarnings(design)];
  const changed = JSON.stringify(design) !== JSON.stringify(started) || words.trim() !== variant.creative.text;
  const chosen = selected && (selected === WORDS || selected === LOGO || design.texts.some((t) => t.id === selected)) ? selected : null;
  const chosenText = design.texts.find((t) => t.id === chosen);

  function close() {
    if (changed && !leaving) return setLeaving(true);
    onClose();
  }

  async function save() {
    const text = words.trim();
    if (!text) return setProblem('The picture needs some words.');
    if (text.length > LIMITS.creativeText) return setProblem(`Keep the words under ${LIMITS.creativeText} characters.`);
    if (design.texts.some((t) => !t.text.trim())) return setProblem('A text on the picture is empty: write it or take it away.');
    setProblem(null);
    setBusy(true);
    let warnings: string[] | undefined;
    if (text !== variant.creative.text) {
      const saved = await saveVariantAction(variant.id, { creativeText: text, copy: variant.copy });
      if (!saved.ok) {
        setBusy(false);
        return setProblem(saved.error);
      }
      warnings = saved.value.warnings;
    }
    const next = isPlain(design) ? null : design;
    const result = await saveDesignAction(variant.id, next);
    setBusy(false);
    if (!result.ok) return setProblem(result.error);
    onSaved({ design: next, creativeText: text, ...(warnings ? { warnings } : {}) });
    toast(result.sample ? 'Saved for this session' : `Variant ${variant.label} design saved`);
  }

  return (
    <dialog
      ref={dialog}
      className={cx(video.dialog, styles.designDialog)}
      aria-labelledby="design-title"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) close();
      }}
    >
      <header className={video.dialogHead}>
        <div>
          <h2 id="design-title">Design variant {variant.label}</h2>
          <p className="muted small">Drag the words, the logo and any text you add to where they should sit. What you see is the picture that is posted.</p>
        </div>
        <button type="button" className="icon-btn icon-btn-plain" aria-label="Close" onClick={close} disabled={busy}>
          <Close size={18} aria-hidden />
        </button>
      </header>

      <div className={video.dialogBody}>
        <div className={styles.designLayout}>
          <div className={styles.designMain}>
            <div className={styles.designShapes} role="radiogroup" aria-label="Shape">
              {DESIGN_SHAPES.map((s) => (
                <button key={s} type="button" role="radio" aria-checked={shape === s} className={cx(styles.designShape, shape === s && styles.designShapeOn)} onClick={() => setShape(s)}>
                  {SHAPE_LABEL[s]}
                </button>
              ))}
            </div>
            <div className={styles.designStage}>
              <div className={styles.designCanvas}>
                <canvas ref={canvas} width={size.width} height={size.height} role="img" aria-label={`The picture, ${SHAPE_LABEL[shape]}`} />
                <DragLayer
                  hits={hits}
                  size={size}
                  labels={labels}
                  selected={chosen}
                  spotOf={spotOf}
                  onSelect={setSelected}
                  onMove={(id, spot) => history.preview(moveTo(design, shape, id, spot))}
                  onDrop={(id, spot) => history.settle(moveTo(design, shape, id, spot))}
                  disabled={locked}
                />
              </div>
            </div>
            <p className="muted small">Each shape keeps its own layout: Meta posts the square, LinkedIn the wide one. Arrow keys nudge what is picked; Shift moves it further.</p>
          </div>

          <div className={styles.designPanel}>
            {chosen && (
              <section className={styles.designPicked} aria-label={`Picked: ${labels[chosen]}`}>
                <p className={styles.designPickedTitle}>
                  Picked: <strong>{labels[chosen]}</strong>
                </p>
                <label className="field">
                  <span className="label">Size: {Math.round((spotOf(chosen)?.scale ?? 1) * 100)}%</span>
                  <input
                    type="range"
                    min={SCALE.min}
                    max={SCALE.max}
                    step={0.05}
                    value={spotOf(chosen)?.scale ?? 1}
                    disabled={locked}
                    onChange={(e) => resize(chosen, Number(e.target.value), false)}
                    onPointerUp={(e) => resize(chosen, Number(e.currentTarget.value), true)}
                    onKeyUp={(e) => resize(chosen, Number(e.currentTarget.value), true)}
                  />
                </label>
                <button type="button" className="btn btn-quiet btn-sm" disabled={locked || !spotOf(chosen)} onClick={() => history.set(putBack(design, shape, chosen))}>
                  <RotateCcw size={14} aria-hidden />
                  Put back where it was
                </button>
              </section>
            )}

            <label className="field">
              <span className="label">Words on the picture</span>
              <textarea className="textarea" rows={2} maxLength={LIMITS.creativeText} value={words} disabled={locked} onChange={(e) => setWords(e.target.value)} onFocus={() => setSelected(WORDS)} />
            </label>

            <div className={styles.designRow}>
              <Toggle checked={design.logo} label="Show the logo" disabled={locked} onChange={(on) => history.set({ ...design, logo: on })} />
              <span className="small">Show the logo</span>
            </div>

            <section className={styles.designTexts} aria-labelledby="design-texts">
              <div className={styles.designRow}>
                <h3 id="design-texts" className={styles.designTextsTitle}>
                  Texts added
                </h3>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  disabled={locked || design.texts.length >= DESIGN_LIMITS.texts}
                  onClick={() => {
                    const next = addText(design, 'Book a free consultation', variant.creative.style === 'spotlight' && !variant.imageUrl ? 'indigo' : 'white');
                    history.set(next);
                    setSelected(next.texts[next.texts.length - 1]?.id ?? null);
                  }}
                >
                  <Plus size={14} aria-hidden />
                  Add a text
                </button>
              </div>
              {design.texts.length === 0 ? (
                <p className="muted small">A line of proof or a call to action, on the picture itself. Up to {DESIGN_LIMITS.texts}.</p>
              ) : (
                <ul className={styles.designTextList}>
                  {design.texts.map((t, i) => (
                    <li key={t.id} className={cx(chosenText?.id === t.id && styles.designTextOn)}>
                      <input
                        className="input"
                        value={t.text}
                        maxLength={DESIGN_LIMITS.text}
                        aria-label={`Text ${i + 1}`}
                        disabled={locked}
                        onFocus={() => setSelected(t.id)}
                        onChange={(e) => history.preview(changeText(design, t.id, { text: e.target.value }))}
                        onBlur={() => history.settle(design)}
                      />
                      <select className="select" aria-label={`Text ${i + 1}’s look`} value={t.look} disabled={locked} onChange={(e) => history.set(changeText(design, t.id, { look: e.target.value as TextLook }))}>
                        {TEXT_LOOKS.map((l) => (
                          <option key={l} value={l}>
                            {TEXT_LOOK_LABEL[l]}
                          </option>
                        ))}
                      </select>
                      <button type="button" className="icon-btn icon-btn-plain" aria-label={`Take away text ${i + 1}`} disabled={locked} onClick={() => history.set(removeText(design, t.id))}>
                        <Trash2 size={16} aria-hidden />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>

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

            <button type="button" className="btn btn-quiet btn-sm" disabled={locked || isPlain(design)} onClick={() => history.set(PLAIN_DESIGN)}>
              <RotateCcw size={14} aria-hidden />
              Put everything back
            </button>
          </div>
        </div>
        {problem && (
          <p className="error-text" role="alert">
            {problem}
          </p>
        )}
      </div>

      <footer className={video.dialogFoot}>
        {leaving ? (
          <>
            <p className={video.footNote}>Leave without saving your changes?</p>
            <button type="button" className="btn btn-quiet" onClick={() => setLeaving(false)}>
              Keep editing
            </button>
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              Leave
            </button>
          </>
        ) : (
          <>
            <p className={video.footNote}>{waitingToPost ? 'Waiting to post: cancel the post on Posts to change its design.' : 'A new layout needs approving again before it is posted.'}</p>
            <button type="button" className="icon-btn icon-btn-plain" aria-label="Undo" disabled={!history.canUndo || locked} onClick={history.undo}>
              <Undo2 size={17} aria-hidden />
            </button>
            <button type="button" className="icon-btn icon-btn-plain" aria-label="Redo" disabled={!history.canRedo || locked} onClick={history.redo}>
              <Redo2 size={17} aria-hidden />
            </button>
            <button type="button" className="btn btn-quiet" onClick={close} disabled={busy}>
              Cancel
            </button>
            <button type="button" className="btn btn-primary" onClick={() => void save()} disabled={locked || !changed} aria-busy={busy}>
              {busy ? 'Saving…' : 'Save design'}
            </button>
          </>
        )}
      </footer>
    </dialog>
  );
}
