'use client';

import { useRef } from 'react';
import type { KeyboardEvent, PointerEvent } from 'react';
import { cx } from '@/lib/cx';
import { clampSpot } from '@/lib/spot';
import type { Hit, Spot } from '@/lib/spot';
import styles from './drag-layer.module.css';

/**
 * Handles over the things drawn on a canvas that a person can move: one box
 * each, where the drawing says it drew them (`hits`, in the canvas's pixels).
 * Dragging one moves its centre; the arrow keys nudge it a step (Shift for a
 * bigger one). Sits over the canvas, the same size as it shows.
 */
export function DragLayer({
  hits,
  size,
  labels,
  selected,
  spotOf,
  onSelect,
  onMove,
  onDrop,
  disabled = false,
}: {
  hits: readonly Hit[];
  /** The canvas's own size, which `hits` are measured in. */
  size: { width: number; height: number };
  /** What each thing is called, for the handle's name: "the logo", "the words". */
  labels: Record<string, string>;
  selected: string | null;
  /** Where a thing is now, if it has been placed; otherwise it is where its box is. */
  spotOf: (id: string) => Spot | undefined;
  onSelect: (id: string) => void;
  /** While dragging: the spot so far. */
  onMove: (id: string, spot: Spot) => void;
  /** Once let go (or a key pressed): the spot it stays at. */
  onDrop: (id: string, spot: Spot) => void;
  disabled?: boolean;
}) {
  const layer = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: string; x: number; y: number; from: Spot; last: Spot } | null>(null);

  const startOf = (hit: Hit): Spot =>
    spotOf(hit.id) ?? { x: (hit.x + hit.width / 2) / size.width, y: (hit.y + hit.height / 2) / size.height, scale: 1 };

  function down(e: PointerEvent<HTMLButtonElement>, hit: Hit) {
    if (disabled) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    onSelect(hit.id);
    const from = startOf(hit);
    drag.current = { id: hit.id, x: e.clientX, y: e.clientY, from, last: from };
  }

  function move(e: PointerEvent<HTMLButtonElement>) {
    const d = drag.current;
    const box = layer.current?.getBoundingClientRect();
    if (!d || !box || !e.currentTarget.hasPointerCapture(e.pointerId)) return;
    d.last = clampSpot({ ...d.from, x: d.from.x + (e.clientX - d.x) / box.width, y: d.from.y + (e.clientY - d.y) / box.height });
    onMove(d.id, d.last);
  }

  function up() {
    const d = drag.current;
    drag.current = null;
    if (d && (d.last.x !== d.from.x || d.last.y !== d.from.y)) onDrop(d.id, d.last);
  }

  function key(e: KeyboardEvent<HTMLButtonElement>, hit: Hit) {
    const step = e.shiftKey ? 0.05 : 0.01;
    const by = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
    if (!by || disabled) return;
    e.preventDefault();
    const from = startOf(hit);
    onDrop(hit.id, clampSpot({ ...from, x: from.x + by[0]!, y: from.y + by[1]! }));
  }

  return (
    <div ref={layer} className={styles.layer}>
      {hits.map((hit) => (
        <button
          key={hit.id}
          type="button"
          className={cx(styles.handle, selected === hit.id && styles.handleOn)}
          style={{
            left: `${(hit.x / size.width) * 100}%`,
            top: `${(hit.y / size.height) * 100}%`,
            width: `${(hit.width / size.width) * 100}%`,
            height: `${(hit.height / size.height) * 100}%`,
          }}
          aria-label={`Move ${labels[hit.id] ?? 'this'}: drag it, or use the arrow keys`}
          aria-pressed={selected === hit.id}
          disabled={disabled}
          onPointerDown={(e) => down(e, hit)}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
          onKeyDown={(e) => key(e, hit)}
          onFocus={() => onSelect(hit.id)}
        />
      ))}
    </div>
  );
}
