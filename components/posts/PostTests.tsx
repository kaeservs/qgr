import { FlaskConical, Trophy } from 'lucide-react';
import Link from 'next/link';
import { abTests, roughCount } from '@/lib/ab-tests';
import type { ABTest, TestArm } from '@/lib/ab-tests';
import { cx } from '@/lib/cx';
import { PLACE_LABEL } from '@/lib/post-input';
import { formatCount, formatRate } from '@/lib/results';
import { dayInZone, dayLabel } from '@/lib/schedule';
import type { Post } from '@/lib/types';
import { EmptyState } from '../ui/EmptyState';
import { PlaceIcon } from '../ui/PlatformIcon';
import styles from './posts.module.css';

/**
 * A/B tests: every place two or more variants of one ad set went, or go, to
 * for real, the variants side by side. A variant is marked as leading only
 * once it is ahead of the next best by more than chance would explain at the
 * reach both have had (lib/ab-tests.ts, computed from the platforms' counts);
 * until then each test says what it is waiting for.
 */
export function PostTests({ posts, timeZone }: { posts: Post[]; timeZone: string }) {
  const tests = abTests(posts);
  if (tests.length === 0) {
    return (
      <EmptyState icon={FlaskConical} title="No tests yet">
        Post two or more variants of the same ads to the same place for real: their numbers come back every six hours and show here side by side. A variant is marked as
        leading only once it is ahead by more than chance would explain.
      </EmptyState>
    );
  }
  // One card an ad set, its places in the order of their newest post.
  const sets: { adSetId: string; adSetTitle: string; tests: ABTest[] }[] = [];
  for (const test of tests) {
    const set = sets.find((s) => s.adSetId === test.adSetId);
    if (set) set.tests.push(test);
    else sets.push({ adSetId: test.adSetId, adSetTitle: test.adSetTitle, tests: [test] });
  }
  return (
    <div className={styles.testsView}>
      <p className={cx('muted small', styles.testsIntro)}>
        Variants of the same ads posted to the same place, side by side. Engagement is reactions, comments, shares and clicks per person reached. A variant is marked as
        leading only when it is ahead of the next best by more than chance would explain at the reach both have had (95% confidence); until then, each test says how many
        people the variants need to reach.
      </p>
      {sets.map((set) => (
        <section key={set.adSetId} className="card card-pad" aria-labelledby={`tests-${set.adSetId}`}>
          <div className={styles.testHead}>
            <h2 id={`tests-${set.adSetId}`} className="card-title">
              {set.adSetTitle}
            </h2>
            <Link href={`/content/${set.adSetId}`} className="link small">
              Open the ads
            </Link>
          </div>
          {set.tests.map((test) => (
            <PlaceTest key={test.place} test={test} timeZone={timeZone} />
          ))}
        </section>
      ))}
    </div>
  );
}

/** What a test shows so far, in a sentence. */
function Verdict({ test, timeZone }: { test: ABTest; timeZone: string }) {
  const arm = (id: string) => test.arms.find((a) => a.variantId === id)!;
  const rate = (a: TestArm) => formatRate(a.rate ?? 0);
  const v = test.verdict;
  if (v.kind === 'leads') {
    const [leader, over] = [arm(v.leader), arm(v.over)];
    return (
      <p className={styles.verdict}>
        <strong>Variant {leader.label} leads</strong>: {rate(leader)} against {rate(over)} for variant {over.label}
        {test.arms.length > 2 ? ', the next best' : ''}
        {v.lift !== null ? `, ${formatCount(v.lift * 100)}% more engagement` : ''}. That is more than chance would explain (95% confidence).
      </p>
    );
  }
  if (v.kind === 'too-early') {
    const [ahead, behind] = [arm(v.ahead), arm(v.behind)];
    return (
      <p className={styles.verdict}>
        <strong>Too early to call.</strong> Variant {ahead.label} is ahead, {rate(ahead)} against {rate(behind)} for variant {behind.label}, but for a gap this size to
        count each needs to reach about {formatCount(roughCount(v.needReach))} people.
      </p>
    );
  }
  if (v.kind === 'even') {
    return (
      <p className={styles.verdict}>
        <strong>Even so far</strong>: the same engagement, so nothing to tell apart yet.
      </p>
    );
  }
  const waiting = test.arms
    .filter((a) => a.rate === null)
    .map((a) => (a.next ? `variant ${a.label} goes out ${dayLabel(dayInZone(a.next, timeZone))}` : `variant ${a.label}’s numbers come in within six hours`));
  return (
    <p className={styles.verdict}>
      <strong>Waiting for numbers</strong>
      {waiting.length > 0 ? `: ${waiting.join('; ')}.` : '.'}
    </p>
  );
}

/** One place's variants, side by side: the leader marked with a word and an icon, never colour alone. */
function PlaceTest({ test, timeZone }: { test: ABTest; timeZone: string }) {
  const max = Math.max(...test.arms.map((a) => a.rate ?? 0), Number.MIN_VALUE);
  const leader = test.verdict.kind === 'leads' ? test.verdict.leader : null;
  return (
    <div className={styles.test}>
      <h3 className={styles.testPlace}>
        <PlaceIcon place={test.place} size={18} decorative />
        {PLACE_LABEL[test.place]}
      </h3>
      <Verdict test={test} timeZone={timeZone} />
      <div className={styles.arms}>
        {test.arms.map((arm) => (
          <article key={arm.variantId} className={cx(styles.arm, arm.variantId === leader && styles.armLeader)} aria-label={`Variant ${arm.label} on ${PLACE_LABEL[test.place]}`}>
            <div className={styles.armHead}>
              <span className={styles.armLabel}>Variant {arm.label}</span>
              {arm.variantId === leader && (
                <span className={cx('pill pill-sm', styles.leadPill)}>
                  <Trophy size={13} aria-hidden />
                  Leading
                </span>
              )}
            </div>
            <span className={styles.armAngle}>{arm.angle}</span>
            {arm.thumbnail && (
              // A plain img: a small data URL the post keeps.
              <img className={styles.armThumb} src={arm.thumbnail} alt="" />
            )}
            {arm.rate !== null ? (
              <>
                <span className={styles.armRate}>
                  {formatRate(arm.rate)}
                  <span className={styles.armRateNote}> engagement</span>
                </span>
                <span className={styles.armBar} aria-hidden>
                  <span style={{ width: `${(arm.rate / max) * 100}%` }} />
                </span>
                <span className={styles.armNote}>
                  {formatCount(arm.engagements)} engagements from {formatCount(arm.reach)} reached
                </span>
              </>
            ) : (
              <span className={styles.armRate}>
                –<span className={styles.armRateNote}> no numbers yet</span>
              </span>
            )}
            {arm.awaiting > 0 && (
              <span className={styles.armNote}>
                {arm.rate === null ? 'Out: its numbers come in within six hours' : `${arm.awaiting} more post${arm.awaiting === 1 ? '' : 's'} still to be read`}
              </span>
            )}
            {arm.next && (
              <span className={styles.armNote}>
                {arm.rate === null && arm.awaiting === 0 ? 'Goes out' : 'Another post goes out'} {dayLabel(dayInZone(arm.next, timeZone))}
              </span>
            )}
            {arm.url && (
              <a href={arm.url} target="_blank" rel="noreferrer" className="link small">
                See it on {PLACE_LABEL[test.place]}
              </a>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}
