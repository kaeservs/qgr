'use client';

import { CircleCheck, Info } from 'lucide-react';
import { createContext, useCallback, useContext, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import styles from './ui.module.css';

interface Toast {
  id: number;
  text: string;
  tone: 'done' | 'info';
}

const ToastContext = createContext<(text: string, tone?: Toast['tone']) => void>(() => {});

export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const show = useCallback((text: string, tone: Toast['tone'] = 'done') => {
    const id = nextId.current++;
    setToasts((list) => [...list.slice(-2), { id, text, tone }]);
    window.setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), 3600);
  }, []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className={styles.toasts} role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={styles.toast}>
            {t.tone === 'done' ? <CircleCheck size={18} aria-hidden /> : <Info size={18} aria-hidden />}
            <span>{t.text}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
