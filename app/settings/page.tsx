import type { Metadata } from 'next';
import { SettingsForm } from '@/components/settings/SettingsForm';
import { getStrategy } from '@/lib/data';

export const metadata: Metadata = { title: 'Settings' };

export default async function SettingsPage() {
  const strategy = await getStrategy('s-q4');
  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1 className="display h1">Settings</h1>
          <p className="lead">How Quantum Global sounds, and what the agents run on.</p>
        </div>
      </header>
      <SettingsForm guardrails={strategy?.guardrails ?? []} />
    </div>
  );
}
