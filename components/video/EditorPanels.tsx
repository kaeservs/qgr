'use client';

import { ArrowLeft, ArrowRight, Copy, Music2, Plus, Scissors, Trash2, Upload } from 'lucide-react';
import type { ReactNode } from 'react';
import { cx } from '@/lib/cx';
import { clock, length } from '@/lib/video/edit';
import type { VideoEdit } from '@/lib/video/edit';
import {
  ANIMATION_LABEL,
  ANIMATIONS,
  DEFAULT_EFFECTS,
  FILTER_LABEL,
  FILTERS,
  MOTION_LABEL,
  MOTIONS,
  OVERLAY_STYLE_LABEL,
  OVERLAY_STYLES,
  PLACES,
  SPEEDS,
  STILL_SECONDS,
  TEXT_MAX,
  TEXT_SIZES,
  TITLE_STYLES,
  TRANSITION_LABEL,
  TRANSITION_SECONDS,
  TRANSITIONS,
  filterOf,
  lookOf,
  movePiece,
  newId,
  pieceName,
  pieceSeconds,
  removePiece,
  insertPiece,
  setEffects,
  setPiece,
  setTransition,
  splitPiece,
  trimPiece,
} from '@/lib/video/timeline';
import type { Animation, Effects, Music, Overlay, Placed, Segment, TitleStyle } from '@/lib/video/timeline';
import styles from './video.module.css';

const PLACE_LABEL = { top: 'Top', middle: 'Middle', bottom: 'Bottom' } as const;
const SIZE_LABEL = { small: 'Small', medium: 'Medium', large: 'Large' } as const;
const TITLE_STYLE_LABEL: Record<TitleStyle, string> = { brand: 'Indigo', dark: 'Dark', light: 'Light', gold: 'Gold' };
const ms = (t: number) => Math.round(t * 1000) / 1000;

/** A labelled range: previews while it moves, one undo step once it is let go. */
export function Slider({
  label,
  min,
  max,
  step,
  value,
  shown,
  onPreview,
  onSettle,
  disabled = false,
}: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  shown: string;
  onPreview: (v: number) => void;
  onSettle: () => void;
  disabled?: boolean;
}) {
  return (
    <label className={styles.slider}>
      <span>{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} disabled={disabled} onChange={(e) => onPreview(Number(e.target.value))} onPointerUp={onSettle} onKeyUp={onSettle} onBlur={onSettle} />
      <output>{shown}</output>
    </label>
  );
}

export function Choices<T extends string | number>({ label, options, value, name, onPick, disabled = false }: { label: string; options: readonly T[]; value: T; name: (v: T) => ReactNode; onPick: (v: T) => void; disabled?: boolean }) {
  return (
    <div className="field">
      <span className="label">{label}</span>
      <div className={styles.choices} role="radiogroup" aria-label={label}>
        {options.map((o) => (
          <button key={String(o)} type="button" role="radio" aria-checked={value === o} disabled={disabled} className={cx(styles.choice, value === o && styles.choiceOn)} onClick={() => onPick(o)}>
            {name(o)}
          </button>
        ))}
      </div>
    </div>
  );
}

/** What the panels change the edit through: a step for undo, a preview while something moves, and the end of that move. */
export interface Changes {
  edit: VideoEdit;
  sequence: Segment[];
  placed: readonly Placed[];
  set: (next: Partial<VideoEdit>) => void;
  /** The whole edit, for taking a field away. */
  replace: (next: VideoEdit) => void;
  preview: (next: Partial<VideoEdit>) => void;
  settle: () => void;
  setSequence: (next: Segment[]) => void;
  previewSequence: (next: Segment[]) => void;
}

// ---------------------------------------------------------------- the piece

export function PiecePanel({
  c,
  piece,
  clipSeconds,
  /** The source second the playhead shows of this piece, when it is on screen. */
  sourceNow,
  /** The piece's own second under the playhead, when it is on screen. */
  localNow,
  onSelect,
  onSeek,
}: {
  c: Changes;
  piece: Placed;
  clipSeconds: number;
  sourceNow: number | null;
  localNow: number | null;
  onSelect: (id: string) => void;
  onSeek: (t: number) => void;
}) {
  const s = piece.segment;
  const seq = c.sequence;
  const index = piece.index;
  const own = (x: Segment) => x.kind === 'clip' && x.media === null;
  const lastOwn = own(s) && seq.filter(own).length <= 1;
  const sourceSeconds = s.kind === 'clip' ? (s.media?.duration ?? clipSeconds) : 0;
  const canSplit = localNow !== null && localNow >= 0.3 && pieceSeconds(s) - localNow >= 0.3 && seq.length < 40;

  return (
    <>
      <div className={styles.section}>
        <div className={styles.pieceHead}>
          <p className={styles.sectionTitle}>
            Piece {index + 1} of {seq.length} · {pieceName(s)}
          </p>
          <span className="muted small">
            {clock(piece.at)}–{clock(piece.until)} · {length(pieceSeconds(s))}
          </span>
        </div>
        <div className={styles.addRow}>
          <button type="button" className="btn btn-quiet btn-sm" disabled={index === 0} onClick={() => c.setSequence(movePiece(seq, s.id, -1))}>
            <ArrowLeft size={14} aria-hidden />
            Earlier
          </button>
          <button type="button" className="btn btn-quiet btn-sm" disabled={index === seq.length - 1} onClick={() => c.setSequence(movePiece(seq, s.id, 1))}>
            Later
            <ArrowRight size={14} aria-hidden />
          </button>
          <button type="button" className="btn btn-quiet btn-sm" disabled={!canSplit} onClick={() => localNow !== null && c.setSequence(splitPiece(seq, s.id, localNow))} aria-keyshortcuts="S">
            <Scissors size={14} aria-hidden />
            Split here
          </button>
          <button
            type="button"
            className="btn btn-quiet btn-sm"
            disabled={seq.length >= 40}
            onClick={() => {
              const copy = { ...s, id: newId() } as Segment;
              c.setSequence(insertPiece(seq, copy, s.id));
              onSelect(copy.id);
            }}
          >
            <Copy size={14} aria-hidden />
            Duplicate
          </button>
          <button type="button" className="btn btn-quiet btn-sm" disabled={lastOwn} title={lastOwn ? 'An ad from a clip keeps some of it' : undefined} onClick={() => c.setSequence(removePiece(seq, s.id))}>
            <Trash2 size={14} aria-hidden />
            Remove
          </button>
        </div>
      </div>

      {s.kind === 'clip' && (
        <div className={styles.section}>
          <p className={styles.sectionTitle}>Trim</p>
          <Slider
            label="Starts at"
            min={0}
            max={Math.max(0.3, sourceSeconds)}
            step={0.1}
            value={s.start}
            shown={clock(s.start)}
            onPreview={(v) => c.previewSequence(trimPiece(seq, s.id, 'start', v, sourceSeconds))}
            onSettle={c.settle}
          />
          <Slider
            label="Ends at"
            min={0}
            max={Math.max(0.3, sourceSeconds)}
            step={0.1}
            value={s.end}
            shown={clock(s.end)}
            onPreview={(v) => c.previewSequence(trimPiece(seq, s.id, 'end', v, sourceSeconds))}
            onSettle={c.settle}
          />
          <div className={styles.addRow}>
            <button type="button" className="btn btn-ghost btn-sm" disabled={sourceNow === null} onClick={() => sourceNow !== null && c.setSequence(trimPiece(seq, s.id, 'start', sourceNow, sourceSeconds))}>
              Start at the playhead
            </button>
            <button type="button" className="btn btn-ghost btn-sm" disabled={sourceNow === null} onClick={() => sourceNow !== null && c.setSequence(trimPiece(seq, s.id, 'end', sourceNow, sourceSeconds))}>
              End at the playhead
            </button>
            <button type="button" className="btn btn-quiet btn-sm" onClick={() => onSeek(piece.at)}>
              Go to its start
            </button>
          </div>
          <span className="muted small">
            Of {s.media ? s.media.name : 'the run’s clip'}, {length(sourceSeconds)} long.
          </span>
          <Choices label="Speed" options={SPEEDS} value={s.speed as (typeof SPEEDS)[number]} name={(v) => `${v}×`} onPick={(v) => c.setSequence(setPiece(seq, s.id, { speed: v }))} />
          <Slider
            label="Its sound"
            min={0}
            max={100}
            step={5}
            value={Math.round(s.volume * 100)}
            shown={`${Math.round(s.volume * 100)}%`}
            disabled={s.speed !== 1}
            onPreview={(v) => c.previewSequence(setPiece(seq, s.id, { volume: v / 100 }))}
            onSettle={c.settle}
          />
          {s.speed !== 1 && <span className="muted small">A sped-up or slowed piece plays without its sound; music carries on under it.</span>}
        </div>
      )}

      {s.kind === 'image' && (
        <div className={styles.section}>
          <Slider
            label="Shows for"
            min={STILL_SECONDS.min}
            max={STILL_SECONDS.max}
            step={0.5}
            value={s.seconds}
            shown={`${s.seconds} s`}
            onPreview={(v) => c.previewSequence(setPiece(seq, s.id, { seconds: v }))}
            onSettle={c.settle}
          />
          <span className="muted small">A slow zoom or pan under Effects brings a still picture to life.</span>
        </div>
      )}

      {s.kind === 'title' && (
        <div className={styles.section}>
          <label className="field">
            <span className="label">Headline</span>
            <input className="input" value={s.text} maxLength={TEXT_MAX.title} onChange={(e) => c.previewSequence(setPiece(seq, s.id, { text: e.target.value }))} onBlur={c.settle} />
          </label>
          <label className="field">
            <span className="label">Line under it (optional)</span>
            <input className="input" value={s.subtext} maxLength={TEXT_MAX.subtext} onChange={(e) => c.previewSequence(setPiece(seq, s.id, { subtext: e.target.value }))} onBlur={c.settle} />
          </label>
          <Choices label="Colours" options={TITLE_STYLES} value={s.style} name={(v) => TITLE_STYLE_LABEL[v]} onPick={(v) => c.setSequence(setPiece(seq, s.id, { style: v }))} />
          <Slider
            label="Shows for"
            min={STILL_SECONDS.min}
            max={STILL_SECONDS.max}
            step={0.5}
            value={s.seconds}
            shown={`${s.seconds} s`}
            onPreview={(v) => c.previewSequence(setPiece(seq, s.id, { seconds: v }))}
            onSettle={c.settle}
          />
          <span className="muted small">The words come in as the look says (Text, How words come in).</span>
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------- effects and the transition

export function EffectsPanel({ c, piece }: { c: Changes; piece: Placed }) {
  const s = piece.segment;
  const fx = s.effects;
  const seq = c.sequence;
  const set = (next: Partial<Effects>) => c.setSequence(setEffects(seq, s.id, next));
  const preview = (next: Partial<Effects>) => c.previewSequence(setEffects(seq, s.id, next));
  const still = s.kind !== 'clip';
  return (
    <>
      <div className={styles.section}>
        <p className={styles.sectionTitle}>Look · {pieceName(s)}</p>
        <div className={styles.swatches} role="radiogroup" aria-label="Filter">
          {FILTERS.map((f) => (
            <button key={f} type="button" role="radio" aria-checked={fx.filter === f} className={cx(styles.swatch, fx.filter === f && styles.swatchOn)} onClick={() => set({ filter: f })}>
              <span style={{ filter: filterOf({ ...DEFAULT_EFFECTS, filter: f }) }} aria-hidden />
              <span>{FILTER_LABEL[f]}</span>
            </button>
          ))}
        </div>
        <Slider label="Brightness" min={-50} max={50} step={5} value={Math.round(fx.brightness * 100)} shown={`${Math.round(fx.brightness * 100)}`} onPreview={(v) => preview({ brightness: v / 100 })} onSettle={c.settle} />
        <Slider label="Contrast" min={-50} max={50} step={5} value={Math.round(fx.contrast * 100)} shown={`${Math.round(fx.contrast * 100)}`} onPreview={(v) => preview({ contrast: v / 100 })} onSettle={c.settle} />
        <Slider label="Colour" min={-100} max={100} step={5} value={Math.round(fx.saturation * 100)} shown={`${Math.round(fx.saturation * 100)}`} onPreview={(v) => preview({ saturation: v / 100 })} onSettle={c.settle} />
      </div>

      {s.kind !== 'title' && (
        <div className={styles.section}>
          <p className={styles.sectionTitle}>Frame and movement</p>
          <Slider label="Punch in" min={100} max={200} step={5} value={Math.round(fx.zoom * 100)} shown={`${Math.round(fx.zoom * 100)}%`} onPreview={(v) => preview({ zoom: v / 100 })} onSettle={c.settle} />
          <Choices label={still ? 'Movement (Ken Burns)' : 'Movement'} options={MOTIONS} value={fx.motion} name={(v) => MOTION_LABEL[v]} onPick={(v) => set({ motion: v })} />
          <label className={styles.row}>
            <input type="checkbox" checked={fx.flip} onChange={(e) => set({ flip: e.target.checked })} />
            <span>Mirror it</span>
          </label>
          <label className={styles.row}>
            <input type="checkbox" checked={fx.blurFill} onChange={(e) => set({ blurFill: e.target.checked })} />
            <span>Fill the edges with itself, blurred (when it doesn’t fill the shape)</span>
          </label>
        </div>
      )}

      <div className={styles.section}>
        <p className={styles.sectionTitle}>Finish</p>
        <label className={styles.row}>
          <input type="checkbox" checked={fx.vignette} onChange={(e) => set({ vignette: e.target.checked })} />
          <span>Darker edges (vignette)</span>
        </label>
        <label className={styles.row}>
          <input type="checkbox" checked={fx.grain} onChange={(e) => set({ grain: e.target.checked })} />
          <span>Film grain</span>
        </label>
        <div className={styles.addRow}>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => c.setSequence(seq.map((x) => ({ ...x, effects: { ...fx } })))}>
            Use this look on every piece
          </button>
          <button type="button" className="btn btn-quiet btn-sm" onClick={() => set(DEFAULT_EFFECTS)}>
            No effects
          </button>
        </div>
      </div>

      <div className={styles.section}>
        <p className={styles.sectionTitle}>Into this piece</p>
        {piece.index === 0 ? (
          <span className="muted small">The first piece opens the video, so it has no transition into it. Pick a later one.</span>
        ) : (
          <>
            <div className={styles.choices} role="radiogroup" aria-label="Transition">
              {TRANSITIONS.map((type) => (
                <button key={type} type="button" role="radio" aria-checked={s.transition.type === type} className={cx(styles.choice, s.transition.type === type && styles.choiceOn)} onClick={() => c.setSequence(setTransition(seq, s.id, { type }))}>
                  {TRANSITION_LABEL[type]}
                </button>
              ))}
            </div>
            {s.transition.type !== 'cut' && (
              <Slider
                label="How long"
                min={TRANSITION_SECONDS.min}
                max={TRANSITION_SECONDS.max}
                step={0.1}
                value={s.transition.seconds}
                shown={`${s.transition.seconds} s`}
                onPreview={(v) => c.previewSequence(setTransition(seq, s.id, { seconds: v }))}
                onSettle={c.settle}
              />
            )}
            <div className={styles.addRow}>
              <button type="button" className="btn btn-quiet btn-sm" onClick={() => c.setSequence(seq.map((x, i) => (i === 0 ? x : { ...x, transition: { ...s.transition } })))}>
                Use it between every piece
              </button>
            </div>
          </>
        )}
      </div>
    </>
  );
}

// ---------------------------------------------------------------- texts over the video

export function OverlaysPanel({ c, total, t, selected, onSelect, onSeek }: { c: Changes; total: number; t: number; selected: string | null; onSelect: (id: string | null) => void; onSeek: (t: number) => void }) {
  const list = c.edit.overlays ?? [];
  const look = lookOf(c.edit);
  const withOverlay = (id: string, next: Partial<Overlay>) => list.map((o) => (o.id === id ? { ...o, ...next } : o));
  const at = (v: number) => ms(Math.min(Math.max(0, v), total));
  return (
    <>
      <div className={styles.section}>
        <Choices<Animation> label="How the variant’s words come in" options={ANIMATIONS} value={look.textAnimation} name={(v) => ANIMATION_LABEL[v]} onPick={(v) => c.set({ look: { ...look, textAnimation: v } })} />
      </div>
      <div className={styles.section}>
        <div className={styles.pieceHead}>
          <p className={styles.sectionTitle}>Texts on the video</p>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={list.length >= 30 || t >= total - 0.3}
            onClick={() => {
              const o: Overlay = { id: newId('o'), text: 'Your words here', start: at(t), end: at(t + 3), place: 'middle', style: 'banner', animation: 'pop', size: 'medium' };
              c.set({ overlays: [...list, o].sort((a, b) => a.start - b.start) });
              onSelect(o.id);
            }}
          >
            <Plus size={15} aria-hidden />
            Add at the playhead
          </button>
        </div>
        {list.length === 0 && <span className="muted small">A text shows for the stretch you give it, wherever and however you like: a hook, a fact, a question, the offer.</span>}
        {list.map((o, i) => (
          <div key={o.id} className={cx(styles.overlayItem, selected === o.id && styles.overlayItemOn)}>
            <div className={styles.pieceHead}>
              <input
                className="input"
                value={o.text}
                maxLength={TEXT_MAX.overlay}
                aria-label={`Text ${i + 1}`}
                onFocus={() => {
                  onSelect(o.id);
                  onSeek(o.start + 0.5 < o.end ? o.start + 0.5 : o.start);
                }}
                onChange={(e) => c.preview({ overlays: withOverlay(o.id, { text: e.target.value }) })}
                onBlur={c.settle}
              />
              <button type="button" className="icon-btn icon-btn-plain" aria-label={`Remove text ${i + 1}`} onClick={() => c.set({ overlays: list.filter((x) => x.id !== o.id) })}>
                <Trash2 size={15} aria-hidden />
              </button>
            </div>
            <span className="muted small">
              {clock(o.start)} to {clock(o.end)}
            </span>
            <div className={styles.addRow}>
              <button type="button" className="btn btn-quiet btn-sm" onClick={() => t < o.end - 0.2 && c.set({ overlays: withOverlay(o.id, { start: at(t) }) })} disabled={t >= o.end - 0.2}>
                Start at the playhead
              </button>
              <button type="button" className="btn btn-quiet btn-sm" onClick={() => t > o.start + 0.2 && c.set({ overlays: withOverlay(o.id, { end: at(t) }) })} disabled={t <= o.start + 0.2}>
                End at the playhead
              </button>
            </div>
            {selected === o.id && (
              <>
                <Choices label="Where" options={PLACES} value={o.place} name={(v) => PLACE_LABEL[v]} onPick={(v) => c.set({ overlays: withOverlay(o.id, { place: v }) })} />
                <Choices label="Style" options={OVERLAY_STYLES} value={o.style} name={(v) => OVERLAY_STYLE_LABEL[v]} onPick={(v) => c.set({ overlays: withOverlay(o.id, { style: v }) })} />
                <Choices label="Comes in" options={ANIMATIONS} value={o.animation} name={(v) => ANIMATION_LABEL[v]} onPick={(v) => c.set({ overlays: withOverlay(o.id, { animation: v }) })} />
                <Choices label="Size" options={TEXT_SIZES} value={o.size} name={(v) => SIZE_LABEL[v]} onPick={(v) => c.set({ overlays: withOverlay(o.id, { size: v }) })} />
              </>
            )}
          </div>
        ))}
      </div>
    </>
  );
}

// ---------------------------------------------------------------- sound

export function SoundPanel({ c, onPickMusic, adding }: { c: Changes; onPickMusic: () => void; adding: boolean }) {
  const { edit } = c;
  const music = edit.music ?? null;
  const setMusic = (next: Partial<Music>) => music && c.set({ music: { ...music, ...next } });
  const previewMusic = (next: Partial<Music>) => music && c.preview({ music: { ...music, ...next } });
  return (
    <>
      <div className={styles.section}>
        <p className={styles.sectionTitle}>The clips’ sound</p>
        <label className={styles.row}>
          <input type="checkbox" checked={edit.volume === 0} onChange={(e) => c.set({ volume: e.target.checked ? 0 : 1 })} />
          <span>No sound from the clips</span>
        </label>
        <Slider label="Volume" min={0} max={100} step={5} value={Math.round(edit.volume * 100)} shown={`${Math.round(edit.volume * 100)}%`} onPreview={(v) => c.preview({ volume: v / 100 })} onSettle={c.settle} />
        <span className="muted small">Each piece has its own volume too (Piece). Sound cross-fades with the pictures.</span>
      </div>
      <div className={styles.section}>
        <p className={styles.sectionTitle}>Music</p>
        {music ? (
          <>
            <div className={styles.pieceHead}>
              <span className={styles.row}>
                <Music2 size={16} aria-hidden /> {music.media.name} · {length(music.media.duration ?? 0)}
              </span>
              <button
                type="button"
                className="btn btn-quiet btn-sm"
                onClick={() => {
                  const { music: _gone, ...rest } = edit;
                  c.replace(rest);
                }}
              >
                <Trash2 size={14} aria-hidden />
                Remove
              </button>
            </div>
            <Slider label="Volume" min={0} max={100} step={5} value={Math.round(music.volume * 100)} shown={`${Math.round(music.volume * 100)}%`} onPreview={(v) => previewMusic({ volume: v / 100 })} onSettle={c.settle} />
            <Slider label="Fade in" min={0} max={5} step={0.5} value={music.fadeIn} shown={`${music.fadeIn} s`} onPreview={(v) => previewMusic({ fadeIn: v })} onSettle={c.settle} />
            <Slider label="Fade out" min={0} max={5} step={0.5} value={music.fadeOut} shown={`${music.fadeOut} s`} onPreview={(v) => previewMusic({ fadeOut: v })} onSettle={c.settle} />
            <label className={styles.row}>
              <input type="checkbox" checked={music.duck} onChange={(e) => setMusic({ duck: e.target.checked })} />
              <span>Quieter while someone speaks</span>
            </label>
            <span className="muted small">It starts with the video, plays again from the top if it runs out, and fades out at the end.</span>
          </>
        ) : (
          <>
            <button type="button" className="btn btn-ghost btn-sm" onClick={onPickMusic} disabled={adding} aria-busy={adding}>
              <Upload size={15} aria-hidden />
              Add music
            </button>
            <span className="muted small">MP3, M4A, WAV or OGG, up to 50 MB. Use music the team has the rights to: the platforms take ads down for music they don’t.</span>
          </>
        )}
      </div>
    </>
  );
}
