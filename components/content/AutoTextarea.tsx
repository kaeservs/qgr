'use client';

import { useCallback, useLayoutEffect, useRef } from 'react';
import type { TextareaHTMLAttributes } from 'react';

type Props = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange'> & {
  value: string;
  onChange: (value: string) => void;
  /** Single-line fields wrap like text but refuse a line break. */
  singleLine?: boolean;
};

/** A textarea that grows with its text, so an editable field takes the same space as the text it replaces. */
export function AutoTextarea({ value, onChange, singleLine = false, onKeyDown, ...rest }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);

  const fit = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = '0px';
    el.style.height = `${el.scrollHeight}px`;
  }, []);

  // Refit as the text changes…
  useLayoutEffect(fit, [value, fit]);

  // …and when the field's width changes (a platform switch, a resized window).
  // Only width: reacting to height would answer our own resize.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    let width = el.clientWidth;
    const observer = new ResizeObserver(() => {
      if (el.clientWidth !== width) {
        width = el.clientWidth;
        fit();
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [fit]);

  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      onChange={(e) => onChange(singleLine ? e.target.value.replace(/\s*\n\s*/g, ' ') : e.target.value)}
      onKeyDown={(e) => {
        if (singleLine && e.key === 'Enter') e.preventDefault();
        onKeyDown?.(e);
      }}
      {...rest}
    />
  );
}
