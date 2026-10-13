import type { Metadata } from 'next';
import { AiVideoStudio } from '@/components/videos/AiVideoStudio';
import { getAiVideos } from '@/lib/data';

export const metadata: Metadata = { title: 'AI video' };

export default async function AiVideoPage() {
  const videos = await getAiVideos();
  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1 className="display h1">AI video</h1>
          <p className="lead">Make a video from a prompt with Higgsfield, then start a run from it: the agents write the ads over it.</p>
        </div>
        <span className="pill pill-gold">Preview</span>
      </header>
      <AiVideoStudio videos={videos} />
    </div>
  );
}
