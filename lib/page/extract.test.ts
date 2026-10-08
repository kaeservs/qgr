import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { extractPage } from './extract';

const here = dirname(fileURLToPath(import.meta.url));
const fixture = (name: string) => readFileSync(join(here, 'fixtures', name), 'utf8');

describe('extractPage', () => {
  it('reads a competitor’s home page without its menus, forms, footer or scripts', () => {
    const page = extractPage(fixture('competitor-home.html'), 'https://horizonvisa.example/');
    expect(page.title).toBe('Horizon Visa Partners | EB-5 Investor Visa Advisors');
    expect(page.siteName).toBe('Horizon Visa Partners');
    expect(page.type).toBe('website');
    expect(page.lang).toBe('en-US');
    expect(page.text).toContain('Your family’s path to a U.S. Green Card');
    expect(page.text).toContain('Independent due diligence on every EB-5 project — from first call to green card.');
    expect(page.text).toContain('they don’t.');
    expect(page.text).toContain('What $800K actually buys');
    for (const junk of ['Home', 'Contact', 'cookies', 'Get the guide', 'All rights reserved', 'dataLayer', 'color:red']) {
      expect(page.text, junk).not.toContain(junk);
    }
    // One line per block, so headings and paragraphs stay apart.
    expect(page.text.split('\n')).toContain('Why families choose us');
    expect(page.words).toBeGreaterThan(60);
  });

  it('prefers an article’s published body, and skips a broken data block', () => {
    const page = extractPage(fixture('blog-post.html'), 'https://journal.example/eb5-h1b');
    expect(page.type).toBe('article');
    expect(page.title).toBe('EB-5 for H-1B holders: what changes in 2026');
    expect(page.text).toMatch(/^If you are on an H-1B visa/);
    expect(page.text).toContain('no advisor can promise an outcome, a timeline or a return.');
    expect(page.text).not.toContain('Related posts');
    expect(page.description).toBe('A plain guide to concurrent filing for H-1B families.');
  });

  it('reads a YouTube video’s full description rather than the page around it', () => {
    const page = extractPage(fixture('youtube-watch.html'), 'https://www.youtube.com/watch?v=abc123');
    expect(page.type).toBe('video');
    expect(page.title).toBe('EB-5 explained for families in 6 minutes');
    expect(page.text).toContain('1:10 The investment & the "at risk" rule');
    expect(page.text).toContain('3:05 Concurrent filing for H-1B holders');
    expect(page.text).not.toContain('How YouTube works');
    expect(page.description).toBe(page.text.split('\n\n')[0]);
  });

  it('reads a podcast episode from what the page says about itself', () => {
    const page = extractPage(fixture('podcast-episode.html'), 'https://podcasts.example/green-card-hour/12');
    expect(page.type).toBe('podcast');
    expect(page.text).toMatch(/^Three questions to ask before you pick an EB-5 project: who audited the business plan/);
    expect(page.text).toContain('Priya Raman');
  });

  it('falls back on the description when a page is an app shell with no text', () => {
    const page = extractPage(fixture('app-shell.html'), 'https://atlasresidency.example/');
    expect(page.title).toBe('Atlas Residency Group — compare EB-5 projects');
    expect(page.text).toBe('Atlas Residency Group helps investors compare EB-5 regional centers and projects, with fees shown up front.');
    expect(page.text).not.toContain('enable JavaScript');
  });

  it('keeps the text to its cap, ending on a whole word', () => {
    const paragraphs = Array.from({ length: 400 }, (_, i) => `<p>Paragraph ${i}: plan the investment with care and read the file.</p>`).join('');
    const long = `<html><body><main>${paragraphs}</main></body></html>`;
    const page = extractPage(long, 'https://example.org/', 500);
    expect(page.text.length).toBeLessThanOrEqual(501);
    expect(page.text.endsWith('…')).toBe(true);
    expect(page.text.slice(-2, -1)).not.toBe(' ');
  });

  it('survives broken markup', () => {
    const page = extractPage('<html><body><div><p>Unclosed <b>bold <i>italic</div><p>Next', 'https://example.org/');
    expect(page.text).toContain('Unclosed bold italic');
    expect(page.text).toContain('Next');
  });
});
