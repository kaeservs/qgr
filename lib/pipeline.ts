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
  waiting: 'Waiting for you',
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
  // An agent's switch is off: the run goes on when a person gives the go-ahead.
  if (stages.some((s) => s.status === 'waiting')) return 'waiting';
  if (stages.every((s) => s.status === 'done' || s.status === 'skipped')) {
    return run.approvedAt ? 'approved' : 'review';
  }
  // One agent has finished and the next has not picked the run up yet.
  if (stages.some((s) => s.status === 'done')) return 'running';
  return 'queued';
}

/** What a person presses to start an agent that waits for them, or one that failed. */
export const GO_AHEAD: Record<StageKey, { start: string; again: string }> = {
  tracker: { start: 'Scan now', again: 'Scan again' },
  strategist: { start: 'Build the strategy', again: 'Build it again' },
  content: { start: 'Write the ads', again: 'Write them again' },
};
