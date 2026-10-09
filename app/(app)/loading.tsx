import { LoaderCircle } from 'lucide-react';
import { cx } from '@/lib/cx';
import ui from '@/components/ui/ui.module.css';

/**
 * In place of a page while it loads. The sidebar and the top bar stay, so the
 * team sees where they are going and that it is on its way; the page takes
 * this place as soon as its data has arrived.
 */
export default function Loading() {
  return (
    <div className="page" aria-busy="true">
      <div className={ui.skeletonHead}>
        <p className={ui.loading} role="status">
          <LoaderCircle size={20} strokeWidth={2.2} className="spin" aria-hidden />
          Loading…
        </p>
        <span className={cx(ui.skeleton, ui.skeletonTitle)} aria-hidden />
        <span className={ui.skeleton} style={{ width: 'min(520px, 90%)' }} aria-hidden />
      </div>
      <div className={ui.skeletonGrid} aria-hidden>
        {[0, 1, 2].map((i) => (
          <div key={i} className={cx('card', ui.skeletonCard)}>
            <span className={ui.skeleton} style={{ width: '45%', height: 16 }} />
            <span className={ui.skeleton} style={{ width: '90%' }} />
            <span className={ui.skeleton} style={{ width: '75%' }} />
            <span className={ui.skeleton} style={{ width: '60%' }} />
          </div>
        ))}
      </div>
      <div className={cx('card', ui.skeletonCard)} aria-hidden>
        <span className={ui.skeleton} style={{ width: '30%', height: 16 }} />
        <span className={ui.skeleton} style={{ width: '95%' }} />
        <span className={ui.skeleton} style={{ width: '85%' }} />
      </div>
    </div>
  );
}
