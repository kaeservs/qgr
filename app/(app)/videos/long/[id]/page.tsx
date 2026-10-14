import { ArrowLeft } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { MomentsBoard } from '@/components/videos/MomentsBoard';
import { getLongVideo } from '@/lib/data';

export const metadata: Metadata = { title: 'Long video' };

export default async function LongVideoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const video = await getLongVideo(id);
  if (!video) notFound();
  return (
    <div className="page">
      <Link href="/videos" className="back">
        <ArrowLeft size={16} aria-hidden />
        Video
      </Link>
      <header className="page-head">
        <div>
          <h1 className="display h1">{video.title}</h1>
          <p className="lead">Tick the moments worth an ad, watch and adjust them, then make ads: each is cut on this computer and becomes a run.</p>
        </div>
      </header>
      <MomentsBoard video={video} />
    </div>
  );
}
