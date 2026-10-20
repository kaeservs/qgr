import { Megaphone } from 'lucide-react';
import Link from 'next/link';
import { cx } from '@/lib/cx';
import { CAMPAIGN_KIND_LABEL, countsOf, groupLeads, judged, qualifiedShare, suggestionsOf } from '@/lib/leads';
import type { Lead } from '@/lib/types';
import { EmptyState } from '../ui/EmptyState';
import { LeadPlatformIcon, qualifiedLine, ShareBar, ShareLegend } from './LeadBits';
import { Suggestions } from './Suggestions';
import styles from './leads.module.css';

/**
 * The leads by campaign and, within each, by ad: how many, and how many of
 * those judged are qualified. Counted here from the leads, never by a model.
 */
export function LeadsCampaigns({ leads, listHref }: { leads: Lead[]; listHref: (campaign: string) => string }) {
  if (leads.length === 0) {
    return (
      <EmptyState icon={Megaphone} title="No leads in this period">
        Leads come from Zoho every fifteen minutes once it is connected (Setup). Each is judged against what makes a lead qualified, and tied to the campaign and the ad it came from.
      </EmptyState>
    );
  }
  const groups = groupLeads(leads);
  const all = countsOf(leads);
  const share = qualifiedShare(all);
  const loose = groups.find((g) => g.kind === 'none')?.counts.leads ?? 0;

  return (
    <div className={styles.view}>
      <section className={styles.kpis} aria-label="Totals">
        <div className={cx('card', styles.kpi)}>
          <span className={styles.kpiLabel}>Leads</span>
          <span className={styles.kpiValue}>{all.leads}</span>
          <span className={styles.kpiNote}>
            from {groups.filter((g) => g.kind !== 'none').length} campaign{groups.filter((g) => g.kind !== 'none').length === 1 ? '' : 's'}
          </span>
        </div>
        <div className={cx('card', styles.kpi)}>
          <span className={styles.kpiLabel}>Qualified</span>
          <span className={styles.kpiValue}>{all.qualified}</span>
          <span className={styles.kpiNote}>{share === null ? 'none judged yet' : `${Math.round(share * 100)}% of the ${judged(all)} judged`}</span>
        </div>
        <div className={cx('card', styles.kpi)}>
          <span className={styles.kpiLabel}>Can’t tell or not judged</span>
          <span className={styles.kpiValue}>{all.unclear + all.waiting}</span>
          <span className={styles.kpiNote}>for a person to look at</span>
        </div>
        <div className={cx('card', styles.kpi)}>
          <span className={styles.kpiLabel}>Not tied to a campaign</span>
          <span className={styles.kpiValue}>{loose}</span>
          <span className={styles.kpiNote}>no lead form or tagged link</span>
        </div>
      </section>

      <Suggestions suggestions={suggestionsOf(groups)} />

      <section className={styles.campaigns} aria-labelledby="campaigns-title">
        <div>
          <h2 id="campaigns-title" className="card-title">
            By campaign and ad
          </h2>
          <p className="muted small">The share qualified is of the leads judged; an ad’s bar is as long as the leads it brought. A person’s verdict counts over Claude’s.</p>
        </div>
        <ShareLegend />
        {groups.map((g) => (
          <article key={g.key} className={cx('card', styles.campaign)}>
            <div className={styles.campaignHead}>
              <div>
                <h3 className={styles.campaignName}>
                  {g.runId ? (
                    <Link href={`/runs/${g.runId}`} className="link">
                      {g.name}
                    </Link>
                  ) : (
                    g.name
                  )}
                </h3>
                <div className={styles.campaignMeta}>
                  {g.kind !== 'none' && <span>{CAMPAIGN_KIND_LABEL[g.kind]}</span>}
                  <span className={styles.platforms} aria-label={`From ${g.platforms.length} place${g.platforms.length === 1 ? '' : 's'}`}>
                    {g.platforms.map((p) => (
                      <LeadPlatformIcon key={p} platform={p} />
                    ))}
                  </span>
                  <Link href={listHref(g.key)} className="link">
                    See its {g.counts.leads} lead{g.counts.leads === 1 ? '' : 's'}
                  </Link>
                </div>
              </div>
            </div>
            <div className={styles.share}>
              <div className={styles.shareLine}>
                <span>
                  <strong>{g.counts.leads}</strong> lead{g.counts.leads === 1 ? '' : 's'}
                </span>
                <span>{qualifiedLine(g.counts)}</span>
              </div>
              <ShareBar counts={g.counts} />
            </div>
            {g.kind !== 'none' && (
              <ul className={styles.ads} aria-label={`Ads in ${g.name}`}>
                {g.ads.map((ad) => (
                  <li key={ad.key} className={styles.ad}>
                    <span className={styles.adName}>
                      {ad.name}
                      {ad.angle && <span className={styles.adAngle}>{ad.angle}</span>}
                    </span>
                    <span className={styles.adBar}>
                      <ShareBar counts={ad.counts} scale={ad.counts.leads / Math.max(...g.ads.map((a) => a.counts.leads))} />
                    </span>
                    <span className={styles.adCount}>
                      {ad.counts.leads} · {qualifiedLine(ad.counts)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </article>
        ))}
      </section>
    </div>
  );
}
