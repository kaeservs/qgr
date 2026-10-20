import { Users } from 'lucide-react';
import type { Lead } from '@/lib/types';
import { EmptyState } from '../ui/EmptyState';
import { LeadCard } from './LeadCard';
import styles from './leads.module.css';

/** The newest leads shown at once; filters narrow the rest. */
const SHOWN = 100;

/** Every lead the filters let through, newest first. */
export function LeadsList({ leads, timeZone, sample }: { leads: Lead[]; timeZone: string; sample: boolean }) {
  if (leads.length === 0) {
    return (
      <EmptyState icon={Users} title="No leads here">
        None of the leads in this period match. Widen the period or take a filter off.
      </EmptyState>
    );
  }
  return (
    <div className={styles.view}>
      {leads.length > SHOWN && (
        <p className="muted small">
          The newest {SHOWN} of {leads.length}. Pick a campaign or a shorter period to see the rest.
        </p>
      )}
      <ul className={styles.list}>
        {leads.slice(0, SHOWN).map((lead) => (
          <li key={lead.id}>
            <LeadCard lead={lead} timeZone={timeZone} sample={sample} />
          </li>
        ))}
      </ul>
    </div>
  );
}
