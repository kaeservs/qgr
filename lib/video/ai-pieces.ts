// AI videos as the editor puts them into an edit: the shape one is asked for
// in (the edit's own, near enough), the file it stands for in the timeline,
// and which of an edit's AI videos are still on their way or were not made.
// Pure, and tested (ai-pieces.test.ts).

import type { VideoAspect } from '../ai-video';
import { videoSize } from '../run-media';
import type { AiVideo } from '../types';
import type { Aspect, Size } from './edit';
import { aiPath, aiVideoOf, mediaOf } from './timeline';
import type { Cutaway, MediaRef, Music, Segment } from './timeline';

/** The shape to ask Higgsfield for: the edit's, or the nearest it makes (4:5 is nearest 9:16; the clip's own shape for "original"). */
export function shapeForEdit(aspect: Aspect, clip: Size): VideoAspect {
  if (aspect === '1:1' || aspect === '16:9' || aspect === '9:16') return aspect;
  if (aspect === '4:5') return '9:16';
  const ratio = clip.width / Math.max(1, clip.height);
  return ratio > 1.2 ? '16:9' : ratio < 0.8 ? '9:16' : '1:1';
}

/** An AI video as a file of the edit: its length and size known before it is made. */
export function aiMediaOf(video: Pick<AiVideo, 'id' | 'title' | 'seconds' | 'aspect' | 'quality'>): MediaRef {
  return { path: aiPath(video.id), name: video.title, ...videoSize(video.aspect, video.quality), duration: video.seconds };
}

export interface AiStates {
  /** Paths of the AI videos still being made: shown as on their way, and nothing is exported meanwhile. */
  waiting: Set<string>;
  /** The edit's AI videos that were not made (refused, stopped, unknown, or gone from the library): to take out. */
  lost: { path: string; name: string; why: string }[];
}

/**
 * How the edit's AI videos stand, from what the server said of them. One the
 * server has not answered for yet counts as waiting.
 */
export function aiStates(edit: { sequence?: Segment[] | undefined; cutaways?: Cutaway[] | undefined; music?: Music | null | undefined }, known: ReadonlyMap<string, AiVideo> | null): AiStates {
  const waiting = new Set<string>();
  const lost: AiStates['lost'] = [];
  for (const m of mediaOf(edit)) {
    const id = aiVideoOf(m.path);
    if (id === null) continue;
    if (known === null) {
      waiting.add(m.path);
      continue;
    }
    const video = known.get(id);
    if (!video) lost.push({ path: m.path, name: m.name, why: 'It is no longer in the library.' });
    else if (video.status === 'asked' || video.status === 'making') waiting.add(m.path);
    else if (video.status !== 'ready') {
      const why = video.status === 'stand_in' ? 'Nothing was made: AI video is off in Settings.' : video.status === 'unknown' ? 'Higgsfield may or may not have made it: check its history.' : (video.error ?? 'Higgsfield did not make it.');
      lost.push({ path: m.path, name: m.name, why });
    }
  }
  return { waiting, lost };
}

/** The edit without one file: the pieces and cutaways it was in taken out (never the run's own clip). */
export function withoutFile<E extends { sequence?: Segment[] | undefined; cutaways?: Cutaway[] | undefined }>(edit: E, path: string): E {
  const sequence = edit.sequence?.filter((s) => !((s.kind === 'clip' || s.kind === 'image') && s.media?.path === path));
  const cutaways = edit.cutaways?.filter((c) => c.media.path !== path);
  return { ...edit, ...(sequence ? { sequence } : {}), ...(cutaways ? { cutaways } : {}) };
}
