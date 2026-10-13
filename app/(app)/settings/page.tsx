import type { Metadata } from 'next';
import { AgentSettingsForm } from '@/components/settings/AgentSettingsForm';
import { PagesForm } from '@/components/settings/PagesForm';
import { SettingsForm } from '@/components/settings/SettingsForm';
import type { PostingState } from '@/components/settings/SettingsForm';
import { getPosts, getTeamSettings, usingSampleData } from '@/lib/data';
import { pipelineConfig } from '@/lib/supabase/config';
import { PLACES } from '@/lib/types';
import type { Place, Post } from '@/lib/types';

export const metadata: Metadata = { title: 'Settings' };

/** How each place last went, from the posts themselves: the dashboard can't see n8n's credentials. */
function postingStates(posts: Post[]): Record<Place, PostingState> {
  const last = (place: Place) =>
    posts
      .flatMap((p) => p.targets.filter((t) => t.place === place && t.status === 'posted' && t.postedAt))
      .sort((a, b) => (b.postedAt ?? '').localeCompare(a.postedAt ?? ''))[0];
  return Object.fromEntries(PLACES.map((place) => {
    const t = last(place);
    return [place, !t ? 'untried' : t.standIn ? 'stand-in' : 'live'];
  })) as Record<Place, PostingState>;
}

export default async function SettingsPage() {
  const [settings, posts] = await Promise.all([getTeamSettings(), getPosts()]);
  const { pages, ...agents } = settings;
  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1 className="display h1">Settings</h1>
          <p className="lead">When the agents work, where posts go, and what the dashboard runs on.</p>
        </div>
      </header>
      <SettingsForm
        connections={{ supabase: !usingSampleData(), agents: pipelineConfig() !== null, pictures: settings.pictureModel, posting: postingStates(posts) }}
      >
        <AgentSettingsForm settings={agents} />
        <PagesForm pages={pages} />
      </SettingsForm>
    </div>
  );
}
