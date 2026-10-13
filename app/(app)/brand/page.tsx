import type { Metadata } from 'next';
import { BestPosts } from '@/components/brand/BestPosts';
import type { BestPost } from '@/components/brand/BestPosts';
import { BrandMemoryForm } from '@/components/brand/BrandMemoryForm';
import { BrandProfileForm } from '@/components/brand/BrandProfileForm';
import { PostsThatWork } from '@/components/brand/PostsThatWork';
import styles from '@/components/brand/brand.module.css';
import { getBrandMemory, getBrandProfile, getPosts } from '@/lib/data';
import { audience, engagementRate, measured } from '@/lib/results';

export const metadata: Metadata = { title: 'Brand memory' };

/** How many of the best posts the page shows. */
const BEST = 5;

export default async function BrandPage() {
  const [profile, { memory, examples }, posts] = await Promise.all([getBrandProfile(), getBrandMemory(), getPosts()]);
  // The places that went out for real with numbers, best engagement first: the same rate the agents are given.
  const best: BestPost[] = measured(posts)
    .flatMap(({ post, place, results }) => {
      const rate = engagementRate(results);
      const target = post.targets.find((t) => t.place === place);
      return rate === null || !target || target.standIn
        ? []
        : [{ postId: post.id, place, text: target.text, title: `${post.adSetTitle}, variant ${post.variantLabel}`, rate, reached: audience(results) ?? 0, remembered: !!target.remembered }];
    })
    .sort((a, b) => b.rate - a.rate)
    .slice(0, BEST);

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1 className="display h1">Brand memory</h1>
          <p className="lead">What every agent reads before it writes: how Quantum Global sounds, what it posts about and how, and the posts that work.</p>
        </div>
      </header>
      <div className={styles.layout}>
        <div className={styles.column}>
          <BrandProfileForm profile={profile} />
          <BrandMemoryForm memory={memory} />
        </div>
        <div className={styles.column}>
          <PostsThatWork examples={examples} />
          <BestPosts best={best} />
        </div>
      </div>
    </div>
  );
}
