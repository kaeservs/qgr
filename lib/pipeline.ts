import type { Run, RunSource, RunStatus, Stage, StageKey } from './types';

export const STAGE_ORDER: readonly StageKey[] = ['tracker', 'strategist', 'content'];

export const STAGE_INFO: Record<StageKey, { name: string; job: string }> = {
  tracker: { name: 'Competitor Tracker', job: 'Finds the hooks that are working for a competitor and writes a report.' },
  strategist: { name: 'Ad Strategist', job: 'Turns what is working into an ad strategy for Quantum Global.' },
  content: { name: 'Content Agent', job: 'Writes three ad variants for Meta, LinkedIn and X.' },
};

export const RUN_STATUS_LABEL: Record<RunStatus, string> = {
  queued: 'Queued',
  running: 'Running',
  review: 'Ready for review',
  approved: 'Approved',
  failed: 'Failed',
};

/**
 * A custom run (podcast, blog, video or text) has no competitor to track, so
 * it starts at the Ad Strategist and the tracker is skipped, never queued.
 */
export function initialStages(source: RunSource): Record<StageKey, Stage> {
  return {
    tracker: { status: source.kind === 'custom' ? 'skipped' : 'queued' },
    strategist: { status: 'queued' },
    content: { status: 'queued' },
  };
}

/** A run's status is derived from its stages, never stored beside them. */
export function runStatus(run: Pick<Run, 'stages' | 'approvedAt'>): RunStatus {
  const stages = STAGE_ORDER.map((key) => run.stages[key]);
  if (stages.some((s) => s.status === 'failed')) return 'failed';
  if (stages.some((s) => s.status === 'running')) return 'running';
  if (stages.every((s) => s.status === 'done' || s.status === 'skipped')) {
    return run.approvedAt ? 'approved' : 'review';
  }
  // One agent has finished and the next has not picked the run up yet.
  if (stages.some((s) => s.status === 'done')) return 'running';
  return 'queued';
}
