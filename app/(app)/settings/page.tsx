import type { Metadata } from 'next';
import { SettingsForm } from '@/components/settings/SettingsForm';
import { getBrandProfile, usingSampleData } from '@/lib/data';
import { pipelineConfig } from '@/lib/supabase/config';

export const metadata: Metadata = { title: 'Settings' };

export default async function SettingsPage() {
  const profile = await getBrandProfile();
  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1 className="display h1">Settings</h1>
          <p className="lead">How Quantum Global sounds, and what the agents run on.</p>
        </div>
      </header>
      <SettingsForm profile={profile} connections={{ supabase: !usingSampleData(), agents: pipelineConfig() !== null }} />
    </div>
  );
}
