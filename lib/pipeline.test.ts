import { describe, expect, it } from 'vitest';
import { initialStages, runStatus } from './pipeline';
import type { Run, Stage, StageKey } from './types';

const stages = (tracker: Stage['status'], strategist: Stage['status'], content: Stage['status']): Record<StageKey, Stage> => ({
  tracker: { status: tracker },
  strategist: { status: strategist },
  content: { status: content },
});

describe('initialStages', () => {
  it('queues all three agents for a competitor run', () => {
    const s = initialStages({ kind: 'competitor', input: 'website', url: 'https://a.example/' });
    expect([s.tracker.status, s.strategist.status, s.content.status]).toEqual(['queued', 'queued', 'queued']);
  });

  it('skips the Competitor Tracker for every custom source', () => {
    for (const source of [
      { kind: 'custom', type: 'podcast', url: 'https://p.example/1' },
      { kind: 'custom', type: 'blog', url: 'https://b.example/1' },
      { kind: 'custom', type: 'video', url: 'https://v.example/1' },
      { kind: 'custom', type: 'text', excerpt: 'x'.repeat(60) },
    ] as const) {
      const s = initialStages(source);
      expect(s.tracker.status).toBe('skipped');
      expect(s.strategist.status).toBe('queued');
      expect(s.content.status).toBe('queued');
    }
  });
});

describe('runStatus', () => {
  const run = (s: Record<StageKey, Stage>, approvedAt?: string): Pick<Run, 'stages' | 'approvedAt'> => (approvedAt ? { stages: s, approvedAt } : { stages: s });

  it('is queued before any agent starts', () => {
    expect(runStatus(run(stages('queued', 'queued', 'queued')))).toBe('queued');
    expect(runStatus(run(stages('skipped', 'queued', 'queued')))).toBe('queued');
  });

  it('is running while an agent works, and between agents', () => {
    expect(runStatus(run(stages('running', 'queued', 'queued')))).toBe('running');
    expect(runStatus(run(stages('done', 'queued', 'queued')))).toBe('running');
    expect(runStatus(run(stages('skipped', 'done', 'running')))).toBe('running');
  });

  it('waits for review once every agent is done, and a custom run counts the skipped tracker as done', () => {
    expect(runStatus(run(stages('done', 'done', 'done')))).toBe('review');
    expect(runStatus(run(stages('skipped', 'done', 'done')))).toBe('review');
  });

  it('is approved only once someone approved it', () => {
    expect(runStatus(run(stages('done', 'done', 'done'), '2026-10-07T10:00:00Z'))).toBe('approved');
  });

  it('reports a failure over anything else', () => {
    expect(runStatus(run(stages('failed', 'queued', 'queued')))).toBe('failed');
    expect(runStatus(run(stages('done', 'running', 'failed')))).toBe('failed');
  });
});
