'use client';

import { Compass, FileText, Radar, Search, Sparkles, Workflow } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { cx } from '@/lib/cx';
import type { SearchItem } from '@/lib/types';
import { useDismiss } from '../ui/useDismiss';
import styles from './shell.module.css';

const ICON = { competitor: Radar, run: Workflow, strategy: Compass, content: Sparkles, page: FileText } as const;

export function SearchBox({ index }: { index: SearchItem[] }) {
  const router = useRouter();
  const listId = useId();
  const wrap = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return index.filter((item) => item.label.toLowerCase().includes(q) || item.sub.toLowerCase().includes(q)).slice(0, 7);
  }, [index, query]);

  useDismiss(wrap, open, () => setOpen(false));

  // Ctrl+K / Cmd+K jumps to search from anywhere.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        input.current?.focus();
        input.current?.select();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const go = (item: SearchItem | undefined) => {
    if (!item) return;
    setOpen(false);
    setQuery('');
    input.current?.blur();
    router.push(item.href);
  };

  const showList = open && query.trim() !== '';

  return (
    <div className={styles.search} ref={wrap}>
      <Search size={18} className={styles.searchIcon} aria-hidden />
      <input
        ref={input}
        className={styles.searchInput}
        type="search"
        placeholder="Search competitors, hooks, ads…"
        aria-label="Search"
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={showList && results[active] ? `${listId}-${active}` : undefined}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActive((a) => Math.min(a + 1, results.length - 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, 0));
          } else if (e.key === 'Enter') {
            e.preventDefault();
            go(results[active]);
          }
        }}
      />
      <span className={cx('kbd', styles.searchKbd)} aria-hidden>
        Ctrl K
      </span>
      {showList && (
        <ul id={listId} role="listbox" className={styles.searchList}>
          {results.length === 0 && <li className={styles.searchEmpty}>Nothing matches “{query.trim()}”</li>}
          {results.map((item, i) => {
            const Icon = ICON[item.kind];
            return (
              <li
                key={item.href}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                className={cx(styles.searchItem, i === active && styles.searchItemActive)}
                onPointerEnter={() => setActive(i)}
                onPointerDown={(e) => {
                  e.preventDefault();
                  go(item);
                }}
              >
                <span className={styles.searchItemIcon}>
                  <Icon size={16} aria-hidden />
                </span>
                <span className={styles.searchItemText}>
                  <span>{item.label}</span>
                  <span className="muted small">{item.sub}</span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
