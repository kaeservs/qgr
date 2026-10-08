'use client';

// Small things about video in this browser: which file of the sample clip it
// can play, and a still of a frame for a thumbnail.

const H264 = 'video/mp4; codecs="avc1.42E01E, mp4a.40.2"';

/**
 * The sample clip in a format this browser plays: the WebM beside the MP4
 * where H.264 can't play, as in Chromium built without it. Other links are
 * returned as they are.
 */
export function playableUrl(url: string): string {
  if (typeof document === 'undefined' || !url.startsWith('/sample/') || !url.endsWith('.mp4')) return url;
  return document.createElement('video').canPlayType(H264) ? url : url.replace(/\.mp4$/, '.webm');
}

/** Waits for a video to show the frame at `time`. */
export function seekTo(video: HTMLVideoElement, time: number): Promise<void> {
  return new Promise((resolve) => {
    if (Math.abs(video.currentTime - time) < 0.001 && video.readyState >= 2) return resolve();
    const done = () => {
      video.removeEventListener('seeked', done);
      resolve();
    };
    video.addEventListener('seeked', done);
    video.currentTime = time;
  });
}

/** A JPEG of the frame a video shows, `width` wide; null if it can't be drawn. */
export function still(video: HTMLVideoElement, width = 224): string | null {
  if (!video.videoWidth || !video.videoHeight) return null;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = Math.round((width * video.videoHeight) / video.videoWidth);
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  try {
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.75);
  } catch {
    return null;
  }
}
