import { Clapperboard, Film } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { LongVideoStart } from '@/components/videos/LongVideoStart';
import { AiVideoStudio } from '@/components/videos/AiVideoStudio';
import styles from '@/components/videos/videos.module.css';
import postStyles from '@/components/posts/posts.module.css';
import { ScrollingNav } from '@/components/ui/ScrollingNav';
import { getAiVideos, getLongVideos, getVideoBudget, usingSampleData } from '@/lib/data';
import { clock } from '@/lib/long-video';
import { dayLabel } from '@/lib/schedule';
import type { LongVideo } from '@/lib/types';

export const metadata: Metadata = { title: 'Video' };

const STATUS: Record<LongVideo['status'], { label: string; tone: string }> = {
  waiting: { label: 'Waiting for the agent', tone: 'pill-quiet' },
  working: { label: 'Finding moments', tone: 'pill-quiet' },
  done: { label: 'Moments ready', tone: 'pill-gold' },
  failed: { label: 'Not found', tone: 'pill-quiet' },
};

export default async function VideoPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const view = params.view === 'ai' ? 'ai' : 'long';
  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1 className="display h1">Video</h1>
          <p className="lead">{view === 'ai' ? 'Make a video from a prompt with Higgsfield, then start a run from it: the agents write the ads over it.' : 'Turn a long recording into short ads: the agent finds the moments, you cut the ones you like.'}</p>
        </div>
        <div className={styles.viewsWrap}>
          <ScrollingNav className={postStyles.views} label="Show" current={view}>
            <Link href="/videos" aria-current={view === 'long' ? 'page' : undefined}>
              <Film size={16} aria-hidden />
              Long videos
            </Link>
            <Link href="/videos?view=ai" aria-current={view === 'ai' ? 'page' : undefined}>
              <Clapperboard size={16} aria-hidden />
              AI video
            </Link>
          </ScrollingNav>
        </div>
      </header>
      {view === 'ai' ? <AiVideoStudio videos={await getAiVideos()} budget={await getVideoBudget()} sample={usingSampleData()} /> : <LongVideos videos={await getLongVideos()} />}
    </div>
  );
}

function LongVideos({ videos }: { videos: LongVideo[] }) {
  return (
    <>
      <LongVideoStart />
      {videos.length > 0 && (
        <section aria-labelledby="long-list-title" className={styles.library}>
          <h2 id="long-list-title" className="card-title">
            Long videos
          </h2>
          <div className={styles.longList}>
            {videos.map((v) => {
              const made = v.moments.filter((m) => m.runIds.length > 0).length;
              return (
                <Link key={v.id} href={`/videos/long/${v.id}`} className={`card ${styles.longCard}`}>
                  <div className={styles.longCardTop}>
                    <h3 className={styles.longCardTitle}>{v.title}</h3>
                    <span className={`pill pill-sm ${STATUS[v.status].tone}`}>{STATUS[v.status].label}</span>
                  </div>
                  {v.description && <p className={`small ${styles.longCardAbout}`}>{v.description}</p>}
                  <p className="muted small">
                    {clock(v.file.duration)} · {dayLabel(v.createdAt.slice(0, 10))}
                    {v.sample ? ' · sample' : ''}
                  </p>
                  <p className="small">
                    {v.moments.length} moment{v.moments.length === 1 ? '' : 's'}
                    {made > 0 ? ` · ads made from ${made}` : ''}
                  </p>
                </Link>
              );
            })}
          </div>
        </section>
      )}
    </>
  );
}
