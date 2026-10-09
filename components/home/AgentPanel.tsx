'use client';

import { Activity, Clock, Compass, Radar, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { switchAgentAction } from '@/app/(app)/settings/actions';
import { STAGE_INFO } from '@/lib/pipeline';
import type { Agent } from '@/lib/types';
import { Toggle } from '../ui/Toggle';
import { useToast } from '../ui/Toast';
import styles from './home.module.css';

const ICON = { tracker: Radar, strategist: Compass, content: Sparkles } as const;

export function AgentPanel({ agents }: { agents: Agent[] }) {
  const toast = useToast();
  const router = useRouter();
  // Shown switched at once; put back if the save fails. The schedule and the
  // switches are the team's (Settings → Agents), saved for everyone.
  const [auto, setAuto] = useState(() => Object.fromEntries(agents.map((a) => [a.key, a.auto])) as Record<Agent['key'], boolean>);
  const [busy, setBusy] = useState<Agent['key'] | null>(null);

  async function flip(agent: Agent, next: boolean) {
    const name = STAGE_INFO[agent.key].name;
    setAuto((a) => ({ ...a, [agent.key]: next }));
    setBusy(agent.key);
    const saved = await switchAgentAction(agent.key, next);
    setBusy(null);
    if (!saved.ok) {
      setAuto((a) => ({ ...a, [agent.key]: !next }));
      return toast(saved.error, 'info');
    }
    const what = agent.key === 'tracker' ? (next ? 'Scans run on schedule' : 'Scans run when you ask') : next ? `${name} runs automatically` : `${name} waits for you`;
    toast(saved.sample ? `${what}, for this session` : what, 'info');
    router.refresh();
  }

  return (
    <div className={styles.agents}>
      <h2 className="display h2">Your agents</h2>
      <ul className={styles.agentList}>
        {agents.map((agent) => {
          const Icon = ICON[agent.key];
          const name = STAGE_INFO[agent.key].name;
          const on = auto[agent.key];
          return (
            <li key={agent.key} className={styles.agent}>
              <div className={styles.agentTop}>
                <span className={styles.agentIcon}>
                  <Icon size={20} strokeWidth={1.8} aria-hidden />
                </span>
                <div className={styles.agentText}>
                  <h3 className={styles.agentName}>{name}</h3>
                  <p className={styles.agentMeta}>
                    <Clock size={14} aria-hidden />
                    {on ? agent.autoLabel : agent.manualLabel}
                  </p>
                  <p className={styles.agentMeta}>
                    <Activity size={14} aria-hidden />
                    {agent.stat}
                  </p>
                </div>
                {agent.switchable && (
                  <Toggle
                    checked={on}
                    label={agent.key === 'tracker' ? 'Scan tracked competitors on schedule' : `Run the ${name} automatically`}
                    onChange={(next) => {
                      if (busy === null) void flip(agent, next);
                    }}
                  />
                )}
              </div>
              <div className={styles.agentActions}>
                <Link href={agent.href} className="btn btn-ghost btn-sm">
                  Open
                </Link>
                <Link href={agent.action.href} className="btn btn-primary btn-sm">
                  {agent.action.label}
                </Link>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
