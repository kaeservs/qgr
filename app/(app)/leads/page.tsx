import { Info, LayoutList, Megaphone, SlidersHorizontal, X } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { LeadsCampaigns } from '@/components/leads/LeadsCampaigns';
import { LeadsList } from '@/components/leads/LeadsList';
import { LeadsSetup } from '@/components/leads/LeadsSetup';
import styles from '@/components/leads/leads.module.css';
import { LiveRefresh } from '@/components/ui/LiveRefresh';
import { ScrollingNav } from '@/components/ui/ScrollingNav';
import { getLeads, getNow, getTeamSettings, usingSampleData } from '@/lib/data';
import { campaignOf, filterLeads, isLeadPlatform, LEAD_PLATFORM_LABEL, PERIODS, VERDICT_LABEL } from '@/lib/leads';
import type { LeadFilter, Period } from '@/lib/leads';
import { LEAD_PLATFORMS } from '@/lib/types';
import type { LeadVerdict } from '@/lib/types';

export const metadata: Metadata = { title: 'Leads' };

type View = 'campaigns' | 'list' | 'setup';
const VERDICTS: readonly (LeadVerdict | 'waiting')[] = ['qualified', 'not_qualified', 'unclear', 'waiting'];
const PERIOD_LABEL = (p: Period) => (p === 'all' ? 'All' : `${p} days`);

export default async function LeadsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const one = (key: string) => (typeof params[key] === 'string' ? params[key] : undefined);
  const view: View = one('view') === 'list' || one('view') === 'setup' ? (one('view') as View) : 'campaigns';
  const period: Period = one('period') === 'all' ? 'all' : (PERIODS.find((p) => String(p) === one('period')) ?? 30);
  const rawPlatform = one('platform');
  const platform = isLeadPlatform(rawPlatform) ? rawPlatform : undefined;
  const verdict = VERDICTS.find((v) => v === one('verdict'));
  const campaign = one('campaign');

  const [{ leads, settings }, team, now] = await Promise.all([getLeads(), getTeamSettings(), getNow()]);
  const sample = usingSampleData();
  const filter: LeadFilter = { period, ...(platform ? { platform } : {}) };
  const inPeriod = filterLeads(leads, filter, now);
  const listed = filterLeads(inPeriod, { ...(campaign ? { campaign } : {}), ...(verdict ? { verdict } : {}) }, now);
  const campaignName = campaign ? (leads.map(campaignOf).find((c) => c.key === campaign)?.name ?? 'That campaign') : null;
  const older = leads.filter((l) => l.ai?.olderCriteria || l.judging === 'failed').length;
  const judging = !sample && leads.some((l) => l.judging === 'waiting' || l.judging === 'working');

  /** This page's address with some of its filters changed. */
  const href = (change: Record<string, string | null>) => {
    const next = new URLSearchParams();
    const merged: Record<string, string | undefined> = { view: view === 'campaigns' ? undefined : view, period: period === 30 ? undefined : String(period), platform, verdict, campaign };
    for (const [k, v] of Object.entries(change)) merged[k] = v ?? undefined;
    for (const [k, v] of Object.entries(merged)) if (v) next.set(k, v);
    const query = next.toString();
    return query ? `/leads?${query}` : '/leads';
  };
  const platforms = LEAD_PLATFORMS.filter((p) => leads.some((l) => l.platform === p));

  return (
    <div className="page">
      <LiveRefresh active={judging} every={15_000} />
      <header className="page-head">
        <div>
          <h1 className="display h1">Leads</h1>
          <p className="lead">Who answered QGR’s ads and posts, which campaign and ad brought them, and how many qualify.</p>
        </div>
        <ScrollingNav className={styles.views} label="Show leads as" current={view}>
          <Link href={href({ view: null, verdict: null, campaign: null })} aria-current={view === 'campaigns' ? 'page' : undefined}>
            <Megaphone size={16} aria-hidden />
            Campaigns
          </Link>
          <Link href={href({ view: 'list' })} aria-current={view === 'list' ? 'page' : undefined}>
            <LayoutList size={16} aria-hidden />
            All leads
          </Link>
          <Link href={href({ view: 'setup', verdict: null, campaign: null })} aria-current={view === 'setup' ? 'page' : undefined}>
            <SlidersHorizontal size={16} aria-hidden />
            Setup
          </Link>
        </ScrollingNav>
      </header>

      {sample && (
        <p className={styles.note}>
          <Info size={16} aria-hidden />
          <span>Sample leads, with made-up names: the sample data is not connected to Zoho, and no model judged them.</span>
        </p>
      )}
      {!sample && settings.source === 'off' && view !== 'setup' && (
        <p className={styles.note}>
          <Info size={16} aria-hidden />
          <span>
            Zoho is not connected yet, so no leads come in. <Link href={href({ view: 'setup' })} className="link">Set it up</Link>.
          </span>
        </p>
      )}

      {view !== 'setup' && (
        <div className={styles.filters}>
          <div className={styles.filterGroup} role="group" aria-label="Period">
            <span className={styles.filterLabel}>Period</span>
            {[...PERIODS, 'all' as const].map((p) => (
              <Link key={p} className={styles.chip} href={href({ period: p === 30 ? null : String(p) })} aria-current={period === p ? 'true' : undefined}>
                {PERIOD_LABEL(p)}
              </Link>
            ))}
          </div>
          {platforms.length > 1 && (
            <div className={styles.filterGroup} role="group" aria-label="Where from">
              <span className={styles.filterLabel}>From</span>
              <Link className={styles.chip} href={href({ platform: null })} aria-current={!platform ? 'true' : undefined}>
                Anywhere
              </Link>
              {platforms.map((p) => (
                <Link key={p} className={styles.chip} href={href({ platform: p })} aria-current={platform === p ? 'true' : undefined}>
                  {LEAD_PLATFORM_LABEL[p]}
                </Link>
              ))}
            </div>
          )}
          {view === 'list' && (
            <div className={styles.filterGroup} role="group" aria-label="Verdict">
              <span className={styles.filterLabel}>Verdict</span>
              <Link className={styles.chip} href={href({ verdict: null })} aria-current={!verdict ? 'true' : undefined}>
                Any
              </Link>
              {VERDICTS.map((v) => (
                <Link key={v} className={styles.chip} href={href({ verdict: v })} aria-current={verdict === v ? 'true' : undefined}>
                  {VERDICT_LABEL[v]}
                </Link>
              ))}
            </div>
          )}
          {view === 'list' && campaignName && (
            <Link className={styles.chip} href={href({ campaign: null })} aria-current="true" aria-label={`Campaign: ${campaignName}. Show every campaign`}>
              {campaignName}
              <X size={14} aria-hidden />
            </Link>
          )}
        </div>
      )}

      {view === 'campaigns' && <LeadsCampaigns leads={inPeriod} listHref={(key) => href({ view: 'list', campaign: key })} />}
      {view === 'list' && <LeadsList leads={listed} timeZone={team.timeZone} sample={sample} />}
      {view === 'setup' && <LeadsSetup settings={settings} olderCount={older} timeZone={team.timeZone} sample={sample} />}
    </div>
  );
}
