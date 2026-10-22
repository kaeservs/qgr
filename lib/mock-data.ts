// The sample data, shown when Supabase is not configured (lib/data/sample.ts). Competitors are fictional and use
// `.example` domains so nothing here reads as a claim about a real company.
// Ad copy follows the guardrails a real strategy carries: no promised outcome,
// timeline or return, because EB-5 is an investment with risk.

import { sampleMoments } from './long-video';
import type { AdSet, AiVideo, LongVideoWithTranscript, TranscriptLine, BrandExample, BrandMemory, Clip, Competitor, Lead, LeadReason, LeadSettings, LeadVerdict, Notice, Post, Run, Strategy, TeamSettings, User } from './types';
import type { VideoEdit } from './video/edit';

/** The moment the mock world is set at. */
export const NOW = '2026-10-07T09:30:00Z';

export const user: User = {
  name: 'Alex Morgan',
  firstName: 'Alex',
  role: 'Marketing lead',
  initials: 'AM',
};

export const competitors: Competitor[] = [
  {
    id: 'c-horizon',
    reportId: 'cr-horizon',
    tracked: true,
    name: 'Horizon Visa Partners',
    domain: 'horizonvisa.example',
    platforms: ['meta', 'linkedin'],
    activeAds: 38,
    lastScanAt: '2026-10-06T09:31:00Z',
    insights: [
      'Age-out urgency runs their longest ads. They talk to parents, not investors.',
      'Short testimonial videos outlast their static images about three to one.',
      'Every winning ad ends on the same offer: a free, no-obligation call.',
    ],
    hooks: [
      { id: 'h-1', text: "Your kids shouldn't age out while you wait.", platform: 'meta', format: 'video', daysRunning: 63, variations: 5 },
      { id: 'h-2', text: "The H-1B lottery isn't a plan. This is.", platform: 'meta', format: 'image', daysRunning: 41, variations: 3 },
      { id: 'h-3', text: 'What $800K actually buys: a timeline, not a promise.', platform: 'linkedin', format: 'document', daysRunning: 34, variations: 2 },
      { id: 'h-4', text: '3 questions to ask before you pick an EB-5 project.', platform: 'linkedin', format: 'carousel', daysRunning: 28, variations: 4 },
      { id: 'h-5', text: 'Rural or urban project? Here is what changes for you.', platform: 'meta', format: 'image', daysRunning: 19, variations: 2 },
      { id: 'h-6', text: 'Meet the families who moved last year.', platform: 'meta', format: 'video', daysRunning: 12, variations: 3 },
    ],
    angles: [
      { label: 'Timeline & urgency', ads: 13 },
      { label: 'Family & education', ads: 10 },
      { label: 'Due diligence', ads: 7 },
      { label: 'Investment safety', ads: 5 },
      { label: 'Lifestyle', ads: 3 },
    ],
    examples: [
      { id: 'e-1', platform: 'meta', format: 'video', text: "Your kids shouldn't age out while you wait.", daysRunning: 63, tone: 'slate', versions: 6, placements: ['facebook', 'instagram'], active: true },
      { id: 'e-2', platform: 'meta', format: 'image', text: "The H-1B lottery isn't a plan.", daysRunning: 41, tone: 'teal', versions: 3, placements: ['facebook', 'instagram', 'messenger'], active: true },
      { id: 'e-3', platform: 'linkedin', format: 'document', text: 'What $800K actually buys.', daysRunning: 34, tone: 'sand' },
      { id: 'e-4', platform: 'linkedin', format: 'carousel', text: '3 questions before you pick a project.', daysRunning: 28, tone: 'plum' },
      { id: 'e-5', platform: 'meta', format: 'image', text: 'Book a free EB-5 call this week.', daysRunning: 4, tone: 'slate', versions: 1, placements: ['facebook'], active: true },
    ],
  },
  {
    id: 'c-atlas',
    reportId: 'cr-atlas',
    tracked: true,
    name: 'Atlas Residency Group',
    domain: 'atlasresidency.example',
    platforms: ['meta', 'x'],
    activeAds: 24,
    lastScanAt: '2026-10-07T09:02:00Z',
    insights: [
      'Speaks straight to H-1B holders stuck in the queue.',
      'Threads on X that explain the process get the most replies.',
      'Side-by-side visa comparisons are their newest test.',
    ],
    hooks: [
      { id: 'h-7', text: "Stuck in the H-1B queue? There's another door.", platform: 'meta', format: 'image', daysRunning: 52, variations: 4 },
      { id: 'h-8', text: 'EB-5 vs O-1 vs H-1B, in 60 seconds.', platform: 'x', format: 'video', daysRunning: 30, variations: 2 },
      { id: 'h-9', text: "Your green card shouldn't depend on your employer.", platform: 'meta', format: 'video', daysRunning: 27, variations: 3 },
      { id: 'h-10', text: "We read the visa bulletin so you don't have to.", platform: 'x', format: 'text', daysRunning: 15, variations: 1 },
    ],
    angles: [
      { label: 'Timeline & urgency', ads: 9 },
      { label: 'Career freedom', ads: 8 },
      { label: 'Process explained', ads: 5 },
      { label: 'Lifestyle', ads: 2 },
    ],
    examples: [
      { id: 'e-5', platform: 'meta', format: 'image', text: 'Stuck in the H-1B queue?', daysRunning: 52, tone: 'plum' },
      { id: 'e-6', platform: 'x', format: 'video', text: 'EB-5 vs O-1 vs H-1B', daysRunning: 30, tone: 'slate' },
      { id: 'e-7', platform: 'meta', format: 'video', text: 'Your green card, not your employer’s.', daysRunning: 27, tone: 'teal' },
    ],
  },
  {
    id: 'c-meridian',
    reportId: 'cr-meridian',
    tracked: true,
    name: 'Meridian EB-5 Advisors',
    domain: 'meridianeb5.example',
    platforms: ['linkedin'],
    activeAds: 15,
    lastScanAt: '2026-09-22T10:00:00Z',
    insights: [
      'Leads with transparency: it publishes due-diligence summaries.',
      'Document ads on LinkedIn pull most of their engagement.',
      'Rarely mentions timelines at all.',
    ],
    hooks: [
      { id: 'h-11', text: "We publish every project's due-diligence file. Ask others to do the same.", platform: 'linkedin', format: 'document', daysRunning: 71, variations: 2 },
      { id: 'h-12', text: 'Rural or urban: what changes for your $800K.', platform: 'linkedin', format: 'carousel', daysRunning: 22, variations: 2 },
      { id: 'h-13', text: 'The 5 documents your source-of-funds review needs.', platform: 'linkedin', format: 'document', daysRunning: 18, variations: 1 },
    ],
    angles: [
      { label: 'Due diligence', ads: 7 },
      { label: 'Investment safety', ads: 4 },
      { label: 'Process explained', ads: 3 },
      { label: 'Timeline & urgency', ads: 1 },
    ],
    examples: [
      { id: 'e-8', platform: 'linkedin', format: 'document', text: 'Read the due-diligence file.', daysRunning: 71, tone: 'sand' },
      { id: 'e-9', platform: 'linkedin', format: 'carousel', text: 'Rural or urban?', daysRunning: 22, tone: 'slate' },
    ],
  },
  {
    id: 'c-northstar',
    reportId: 'cr-northstar',
    tracked: false,
    name: 'Northstar Global',
    domain: 'northstarglobal.example',
    platforms: ['meta', 'linkedin', 'x'],
    activeAds: 52,
    lastScanAt: '2026-09-26T09:20:00Z',
    insights: [
      'Plain-English process videos are their engine.',
      'Webinar sign-ups, not calls, are the main offer.',
      'High volume, short lives: they test a lot and cut fast.',
    ],
    hooks: [
      { id: 'h-14', text: 'From application to green card: the 6 steps, in plain English.', platform: 'meta', format: 'video', daysRunning: 45, variations: 6 },
      { id: 'h-15', text: 'Free webinar: EB-5 for Indian families.', platform: 'meta', format: 'image', daysRunning: 33, variations: 5 },
      { id: 'h-16', text: 'What nobody tells you about EB-5 costs.', platform: 'linkedin', format: 'document', daysRunning: 21, variations: 2 },
      { id: 'h-17', text: 'Is EB-5 still worth it this year?', platform: 'x', format: 'text', daysRunning: 12, variations: 3 },
    ],
    angles: [
      { label: 'Process explained', ads: 18 },
      { label: 'Family & education', ads: 14 },
      { label: 'Timeline & urgency', ads: 11 },
      { label: 'Lifestyle', ads: 9 },
    ],
    examples: [
      { id: 'e-10', platform: 'meta', format: 'video', text: 'The 6 steps, in plain English.', daysRunning: 45, tone: 'teal' },
      { id: 'e-11', platform: 'meta', format: 'image', text: 'Free webinar for Indian families.', daysRunning: 33, tone: 'plum' },
      { id: 'e-12', platform: 'linkedin', format: 'document', text: 'What nobody tells you about costs.', daysRunning: 21, tone: 'sand' },
    ],
  },
];

const GUARDRAILS = [
  'Never promise an outcome, a timeline or a return',
  'Present processing times as estimates',
  'Positive marketing only: never knock other advisors or sell by fear',
  'Write U.S., never US',
  'End on the free consultation',
];

/**
 * The sample run's clip: a 15-second branded explainer in public/sample, marked
 * "Sample clip" in the picture. Its path has the shape of a real upload, so a
 * retry passes the same checks; lib/data/sample.ts serves it from public.
 */
export const SAMPLE_CLIP: Clip = {
  path: 'uploads/00000000-0000-4000-8000-000000000000/7d4b6a2e-0f1c-4c8e-9b3a-2e5f8c1d4a60.mp4',
  name: 'eb5-explainer.mp4',
  duration: 15,
  width: 1280,
  height: 720,
  size: 671397,
};
export const SAMPLE_CLIP_URL = '/sample/eb5-explainer.mp4';
/**
 * The AI video page's one example: the sample clip, standing in for a video
 * Higgsfield made (it says so on the page). Starting a run from it works as
 * uploading the clip does.
 */
export const SAMPLE_AI_VIDEO: AiVideo = {
  id: 'v-sample',
  title: 'Family planning, golden hour',
  prompt:
    'A calm explainer opening: soft indigo and gold light over a city skyline at dusk, the camera drifting slowly forward, space at the top for a headline. No people, no flags, no text.',
  model: 'seedance_2_5',
  seconds: 15,
  aspect: '16:9',
  quality: '720p',
  sound: false,
  picture: null,
  credits: 0,
  status: 'ready',
  url: SAMPLE_CLIP_URL,
  createdAt: '2026-10-12T15:20:00Z',
  sample: true,
};
/** A picture standing in for one an image model made, marked "Sample picture" in the image. */
export const SAMPLE_PICTURE_URL = '/sample/picture-q4.jpg';

const clipEdit = (edit: Partial<VideoEdit>): VideoEdit => ({
  keep: [{ start: 0, end: SAMPLE_CLIP.duration }],
  aspect: 'original',
  fit: 'fill',
  focus: { x: 0.5, y: 0.5 },
  text: { show: false, place: 'top', until: null },
  captions: [],
  logo: null,
  volume: 1,
  endCard: null,
  cover: 0,
  ...edit,
});

export const strategies: Strategy[] = [
  {
    id: 's-site',
    title: 'See where the money goes',
    createdAt: '2026-10-08T09:14:00Z',
    status: 'draft',
    runId: 'r-1046',
    competitorIds: [],
    sourceLabel: 'Text · project visits',
    goal: 'consultations',
    audiences: ['Investors comparing EB-5 projects', 'Families who want to see a project before they commit'],
    positioning: 'The advisor that shows the projects it checks, and answers every question.',
    angles: [
      { id: 'sa-21', name: 'See the site', why: 'The text’s point: investors can visit the projects we review.', hook: 'Visit the project before you invest.' },
      { id: 'sa-22', name: 'Diligence you can read', why: 'Every project comes with its file, which few advisors share.', hook: 'Ask for the project’s file.' },
      { id: 'sa-23', name: 'Every question answered', why: 'Investors bring the same questions before they commit, and the text answers them.', hook: 'Bring your questions. We answer every one.' },
    ],
    channels: [
      { platform: 'meta', share: 70, role: 'Reach investors comparing projects', format: 'Video' },
      { platform: 'linkedin', share: 30, role: 'Reach professionals at work', format: 'Video' },
    ],
    guardrails: GUARDRAILS,
  },
  {
    id: 's-filing',
    title: 'Stay while you file',
    createdAt: '2026-10-07T10:12:00Z',
    status: 'draft',
    runId: 'r-1045',
    competitorIds: [],
    sourceLabel: 'Text · concurrent filing',
    goal: 'consultations',
    audiences: ['H-1B professionals in the U.S.', 'Families who cannot leave work to wait abroad'],
    positioning: 'The advisor that explains concurrent filing plainly, with estimates rather than promises.',
    angles: [
      { id: 'sa-16', name: 'Stay and work', why: 'The text’s main point: families can file without leaving their jobs.', hook: 'File for a green card. Keep your job.' },
      { id: 'sa-17', name: 'One family, one file', why: 'Spouses and children under 21 file together, which few ads say.', hook: 'One filing for the whole family.' },
      { id: 'sa-18', name: 'Questions first', why: 'Readers want the conditions spelled out before they call.', hook: 'Three questions before you file.' },
    ],
    channels: [
      { platform: 'meta', share: 60, role: 'Reach H-1B households', format: 'Single image' },
      { platform: 'linkedin', share: 40, role: 'Reach professionals at work', format: 'Single image' },
    ],
    guardrails: GUARDRAILS,
  },
  {
    id: 's-clip',
    title: 'EB-5, explained',
    createdAt: '2026-10-07T07:20:00Z',
    status: 'draft',
    runId: 'r-1043',
    competitorIds: [],
    sourceLabel: 'Uploaded clip · eb5-explainer',
    goal: 'consultations',
    audiences: ['H-1B professionals weighing permanent residency', 'Families comparing EB-5 advisors'],
    positioning: 'The advisor that explains each step plainly, with estimates rather than promises.',
    angles: [
      { id: 'sa-13', name: 'One step at a time', why: 'The clip walks through the process in four plain steps.', hook: 'EB-5, one plain step at a time.' },
      { id: 'sa-14', name: 'Diligence first', why: 'The clip’s second step is checking the project, a gap in the market.', hook: 'Pick the project. Then check it.' },
      { id: 'sa-15', name: 'Plan with estimates', why: 'The clip calls timelines estimates, which earns trust.', hook: 'Plan around estimates, not promises.' },
    ],
    channels: [
      { platform: 'meta', share: 50, role: 'Reach H-1B households', format: 'Short video, 1:1 and 9:16' },
      { platform: 'linkedin', share: 30, role: 'Reach professionals at work', format: 'Video, 16:9' },
      { platform: 'x', share: 20, role: 'Join the H-1B conversation', format: 'Short video' },
    ],
    guardrails: GUARDRAILS,
    adSetId: 'a-clip',
  },
  {
    id: 's-q4',
    title: 'Q4 consultation push',
    createdAt: '2026-10-06T09:41:00Z',
    status: 'draft',
    runId: 'r-1042',
    competitorIds: ['c-horizon'],
    goal: 'consultations',
    audiences: ['H-1B professionals in the U.S., 28 to 45', 'Indian founders and families planning a move'],
    positioning: 'The EB-5 advisor that shows its homework: independent due diligence, plain timelines, no hype.',
    angles: [
      {
        id: 'sa-1',
        name: 'Clarity over hype',
        why: 'Competitors lean on urgency. Few explain the steps.',
        hook: 'Your EB-5 path, in 6 plain steps.',
        basedOn: { competitorId: 'c-horizon', hook: "The H-1B lottery isn't a plan. This is." },
      },
      {
        id: 'sa-2',
        name: 'Family first',
        why: 'Age-out ads run longest across the market. Parents are listening.',
        hook: "Plan the move before your kids' deadlines do.",
        basedOn: { competitorId: 'c-horizon', hook: "Your kids shouldn't age out while you wait." },
      },
      {
        id: 'sa-3',
        name: 'Diligence you can verify',
        why: 'Only one competitor shows its homework. Quantum Global already does.',
        hook: "Ask for the due-diligence file. We'll send ours.",
        basedOn: { competitorId: 'c-horizon', hook: 'What $800K actually buys: a timeline, not a promise.' },
      },
    ],
    channels: [
      { platform: 'meta', share: 50, role: 'Reach parents planning a move', format: 'Short video, single image' },
      { platform: 'linkedin', share: 35, role: 'Earn trust with professionals', format: 'Document ad, single image' },
      { platform: 'x', share: 15, role: 'Join the H-1B conversation', format: 'Short posts with a link card' },
    ],
    guardrails: GUARDRAILS,
    adSetId: 'a-q4',
  },
  {
    id: 's-blog',
    title: 'Rural vs urban projects',
    createdAt: '2026-10-07T09:05:00Z',
    status: 'draft',
    runId: 'r-1039',
    competitorIds: [],
    sourceLabel: 'Blog post · Rural vs urban TEA projects',
    goal: 'awareness',
    audiences: ['First-time EB-5 investors comparing projects'],
    positioning: 'The advisor that explains the trade-offs before you invest.',
    angles: [
      { id: 'sa-4', name: 'Two amounts, one decision', why: 'The post’s most-read section compares the two investment levels.', hook: '$800K or $1.05M: what actually decides it.' },
      { id: 'sa-5', name: 'Rural, explained', why: 'Readers asked most about rural set-asides.', hook: 'What a rural project changes, and what it doesn’t.' },
      { id: 'sa-6', name: 'Project first', why: 'The post ends on judging the project, not the price.', hook: 'Pick the project, not the price tag.' },
    ],
    channels: [
      { platform: 'meta', share: 40, role: 'Reach first-time investors', format: 'Carousel, single image' },
      { platform: 'linkedin', share: 40, role: 'Reach professionals researching options', format: 'Document ad' },
      { platform: 'x', share: 20, role: 'Share the explainer', format: 'Short posts with a link card' },
    ],
    guardrails: GUARDRAILS,
    adSetId: 'a-blog',
  },
  {
    id: 's-podcast',
    title: 'From H-1B to EB-5',
    createdAt: '2026-10-05T15:10:00Z',
    status: 'approved',
    runId: 'r-1041',
    competitorIds: [],
    sourceLabel: 'Podcast · Ep. 12: From H-1B to EB-5',
    goal: 'consultations',
    audiences: ['H-1B professionals worried about layoffs', 'Couples planning to raise children in the U.S.'],
    positioning: 'A calm, clear route off the employer-sponsored treadmill.',
    angles: [
      { id: 'sa-7', name: 'Off the treadmill', why: 'Guests kept coming back to job insecurity.', hook: 'Your green card, not your employer’s.' },
      { id: 'sa-8', name: 'The 60-day question', why: 'The grace-period moment drew the most reaction.', hook: '60 days is not a plan.' },
      { id: 'sa-9', name: 'Straight answers', why: 'Listeners want plain answers, not pitches.', hook: '5 straight answers on EB-5.' },
    ],
    channels: [
      { platform: 'meta', share: 60, role: 'Reach H-1B households', format: 'Short video clip, single image' },
      { platform: 'linkedin', share: 40, role: 'Reach professionals at work', format: 'Single image' },
    ],
    guardrails: GUARDRAILS,
    adSetId: 'a-podcast',
  },
  {
    id: 's-northstar',
    title: 'Webinar season',
    createdAt: '2026-09-26T10:00:00Z',
    status: 'approved',
    runId: 'r-1037',
    competitorIds: ['c-northstar'],
    goal: 'webinar',
    audiences: ['Indian families exploring U.S. residency', 'Professionals comparing EB-5 advisors'],
    positioning: 'Live, plain-English answers from people who do the diligence.',
    angles: [
      {
        id: 'sa-10',
        name: 'Live Q&A',
        why: 'Their webinar ads keep running: the format works.',
        hook: 'EB-5, live. Ask us anything.',
        basedOn: { competitorId: 'c-northstar', hook: 'Free webinar: EB-5 for Indian families.' },
      },
      {
        id: 'sa-11',
        name: 'Costs, plainly',
        why: 'Cost questions get the most comments on their posts.',
        hook: 'What EB-5 really costs.',
        basedOn: { competitorId: 'c-northstar', hook: 'What nobody tells you about EB-5 costs.' },
      },
      {
        id: 'sa-12',
        name: 'Judge a project',
        why: 'Nobody in the market teaches how to judge a project.',
        hook: 'How to judge an EB-5 project.',
      },
    ],
    channels: [
      { platform: 'meta', share: 45, role: 'Fill seats with families', format: 'Single image, short video' },
      { platform: 'linkedin', share: 40, role: 'Fill seats with professionals', format: 'Event ad, single image' },
      { platform: 'x', share: 15, role: 'Remind and recap', format: 'Short posts' },
    ],
    guardrails: GUARDRAILS,
    adSetId: 'a-northstar',
  },
];

/** A sample run's ad with its own AI video: the sample clip stands in for what Higgsfield made (it says so in the picture). */
const sampleAdVideo = (id: string, status: 'ready' | 'making' | 'failed', error?: string) => ({
  id,
  status,
  seconds: SAMPLE_CLIP.duration,
  aspect: '16:9' as const,
  quality: '720p',
  ...(status === 'ready' ? { path: `videos/${id}.mp4`, url: SAMPLE_CLIP_URL } : {}),
  ...(error ? { error } : {}),
});

export const adSets: AdSet[] = [
  {
    id: 'a-site',
    title: 'See where the money goes',
    createdAt: '2026-10-08T09:31:00Z',
    runId: 'r-1046',
    strategyId: 's-site',
    status: 'review',
    variants: [
      {
        id: 'v-site-a',
        label: 'A',
        angle: 'See the site',
        creative: { text: 'Visit the project before you invest.', style: 'arcs' },
        aiVideo: sampleAdVideo('v-sample-site-a', 'ready'),
        copy: {
          meta: { text: 'We take investors to the EB-5 projects we review. See the site, ask your questions, then decide.', headline: 'See the project first', description: 'Free consultation', cta: 'Book now' },
          linkedin: { text: 'Before you invest in an EB-5 project, visit it. We arrange site visits for the projects we review.', headline: 'Visit before you invest', cta: 'Learn more' },
        },
      },
      {
        id: 'v-site-b',
        label: 'B',
        angle: 'Diligence you can read',
        creative: { text: 'Ask for the project’s file.', style: 'split' },
        aiVideo: sampleAdVideo('v-sample-site-b', 'making'),
        copy: {
          meta: { text: 'Every EB-5 project we recommend comes with its due-diligence file. Ask us for it.', headline: 'Read the file first', description: 'Free consultation', cta: 'Book now' },
          linkedin: { text: 'We share the due-diligence file for every EB-5 project we recommend. Read it before you decide.', headline: 'Diligence you can read', cta: 'Learn more' },
        },
      },
      {
        id: 'v-site-c',
        label: 'C',
        angle: 'Every question answered',
        creative: { text: 'Bring your questions.', style: 'spotlight' },
        aiVideo: sampleAdVideo('v-sample-site-c', 'failed', 'Higgsfield turned the prompt down. Nothing was made or spent.'),
        copy: {
          meta: { text: 'Bring every question you have about EB-5. We walk you through each project, plainly, before you commit.', headline: 'Every question answered', description: 'Free consultation', cta: 'Book now' },
          linkedin: { text: 'Bring your EB-5 questions. We answer them for every project we review, before you commit.', headline: 'Your questions, answered', cta: 'Learn more' },
        },
      },
    ],
  },
  {
    id: 'a-clip',
    title: 'EB-5, explained',
    createdAt: '2026-10-07T07:41:00Z',
    runId: 'r-1043',
    strategyId: 's-clip',
    status: 'review',
    clip: SAMPLE_CLIP,
    variants: [
      {
        id: 'v-clip-a',
        label: 'A',
        angle: 'One step at a time',
        creative: { text: 'EB-5, one plain step at a time.', style: 'arcs' },
        videoEdit: clipEdit({ aspect: '1:1', fit: 'fit', cover: 1.8 }),
        copy: {
          meta: {
            text: 'EB-5 has four plain steps. We walk you through each one, with independent due diligence on every project.',
            headline: 'EB-5, step by step',
            description: 'Free consultation',
            cta: 'Book now',
          },
          linkedin: {
            text: 'Considering EB-5? We explain each step plainly, from choosing a project to filing, with due diligence at every stage.',
            headline: 'EB-5, explained step by step',
            cta: 'Learn more',
          },
          x: {
            text: 'EB-5 in four plain steps, with due diligence on every project. Watch, then book a free consultation.',
            headline: 'EB-5, step by step',
          },
        },
      },
      {
        id: 'v-clip-b',
        label: 'B',
        angle: 'Diligence first',
        creative: { text: 'Pick the project. Then check it.', style: 'split' },
        videoEdit: clipEdit({
          aspect: '9:16',
          fit: 'fit',
          captions: [
            { start: 0.2, end: 3.4, text: 'Most families ask us the same first question.' },
            { start: 3.9, end: 7.2, text: 'Start with the project, and ask for its diligence file.' },
            { start: 7.7, end: 11, text: 'Processing times are estimates, so plan around them.' },
            { start: 11.5, end: 14.8, text: 'We answer your questions in a free consultation.' },
          ],
          endCard: { text: 'Book your free consultation', seconds: 3 },
          cover: 5.6,
        }),
        copy: {
          meta: {
            text: 'Before you invest, ask for the project’s due-diligence file. We review every project we recommend.',
            headline: 'Check the project first',
            description: 'Free consultation',
            cta: 'Book now',
          },
          linkedin: {
            text: 'The project matters more than the paperwork. See how we check every EB-5 project before we recommend it.',
            headline: 'How we check EB-5 projects',
            cta: 'Learn more',
          },
          x: {
            text: 'Pick the project, then check it. Ask us for the due-diligence file in a free consultation.',
            headline: 'Check the project first',
          },
        },
      },
      {
        id: 'v-clip-c',
        label: 'C',
        angle: 'Plan with estimates',
        creative: { text: 'Plan around estimates, not promises.', style: 'spotlight' },
        videoEdit: clipEdit({
          keep: [
            { start: 0, end: 3.6 },
            { start: 7.6, end: 15 },
          ],
          aspect: '16:9',
          text: { show: true, place: 'bottom', until: 3.5 },
          logo: 'top-right',
          volume: 0.6,
          endCard: { text: 'Questions? Book a free call', seconds: 2.5 },
          cover: 5.3,
        }),
        copy: {
          meta: {
            text: 'EB-5 processing times are estimates, and plans should be too. We help you plan around them, plainly.',
            headline: 'Plan around estimates',
            description: 'Free consultation',
            cta: 'Book now',
          },
          linkedin: {
            text: 'Timelines in EB-5 are estimates. Plan your move around them with an advisor who says so plainly.',
            headline: 'Plan around EB-5 estimates',
            cta: 'Learn more',
          },
          x: {
            text: 'EB-5 timelines are estimates, so plan around them. Questions? Book a free consultation.',
            headline: 'Plan around estimates',
          },
        },
      },
    ],
  },
  {
    id: 'a-q4',
    title: 'Q4 consultation push',
    createdAt: '2026-10-06T09:58:00Z',
    runId: 'r-1042',
    strategyId: 's-q4',
    status: 'review',
    variants: [
      {
        id: 'v-q4-a',
        label: 'A',
        angle: 'Clarity over hype',
        creative: { text: 'Your Green Card path, mapped out.', style: 'arcs' },
        picturePrompt: 'A city skyline at sunset across still water, the sun low and gold between the towers, the sky deep indigo above. No words, no people, no flags.',
        // Drawn for the sample data and marked so: there is no image model to ask.
        imageUrl: SAMPLE_PICTURE_URL,
        pictures: [
          {
            id: 'pic-q4-a',
            url: SAMPLE_PICTURE_URL,
            prompt: 'A city skyline at sunset across still water, the sun low and gold between the towers, the sky deep indigo above. No words, no people, no flags.',
            shown: true,
            createdAt: '2026-10-06T10:02:00Z',
          },
        ],
        copy: {
          meta: {
            text: "EB-5 shouldn't feel like a maze. See the six steps to a U.S. Green Card, with independent due diligence at each one.",
            headline: 'Your EB-5 path in 6 steps',
            description: 'Free consultation',
            cta: 'Book now',
          },
          linkedin: {
            text: 'EB-5 is a big decision. We walk you through the six steps to a U.S. Green Card and show the due diligence behind every project we suggest.',
            headline: 'The EB-5 path, in plain English',
            cta: 'Learn more',
          },
          x: {
            text: 'EB-5 in six plain steps. No jargon, no hype: just the path to a U.S. Green Card and the diligence behind it. Free consultation below.',
            headline: 'Your EB-5 path, mapped out',
          },
        },
        posts: {
          facebook:
            "EB-5 shouldn't feel like a maze.\n\nMost families we meet start with the same question: where do we even begin? The path to a U.S. Green Card through EB-5 comes down to six steps, from choosing a project to filing, and each one has a clear job.\n\nWe walk you through all six in plain English, with an independent due-diligence file on every project we suggest. Processing times are estimates, so we plan around them together.\n\nBook a free consultation and see your path mapped out.",
          instagram:
            "Your Green Card path, mapped out. 🗺️\n\nSix steps. Plain English. No hype.\n\nFrom choosing a project to filing, we show you what each step is for, and the independent due diligence behind every project we suggest.\n\nProcessing times are estimates: we plan around them with you.\n\nBook a free consultation (link in bio).\n\n#EB5 #GreenCard #USImmigration #InvestorVisa #FamilyMove",
          linkedin:
            "EB-5 is a big decision, and it deserves a clear map.\n\nWhen professionals ask us where to start, we lay out the six steps to a U.S. Green Card through EB-5: choosing a project, checking it, investing, filing, waiting on processing, and the conditional residence that follows.\n\nEvery project we suggest comes with an independent due-diligence report you can read first. Processing times are estimates, and we plan around them with you, not around promises.\n\nIf you are weighing EB-5 for your family, a free consultation is the simplest first step.\n\n#EB5 #Immigration #H1B",
        },
      },
      {
        id: 'v-q4-b',
        label: 'B',
        angle: 'Family first',
        creative: { text: 'Move together. Plan early.', style: 'split' },
        picturePrompt: 'A quiet suburban street at golden hour, a porch light glowing and long soft shadows under an indigo evening sky. No words, no people, no flags.',
        copy: {
          meta: {
            text: "Your children's ages can shape your EB-5 options. Plan early and keep the whole family on one path.",
            headline: 'Plan before deadlines do',
            description: 'Talk to an advisor, free',
            cta: 'Book now',
          },
          linkedin: {
            text: "For families, EB-5 timing matters: a child's age can change what is possible. A free call maps your family's timeline early.",
            headline: 'EB-5 timing for families',
            cta: 'Learn more',
          },
          x: {
            text: 'If your kids are close to 21, EB-5 timing matters. Plan early and move together. A free call maps your timeline.',
            headline: 'EB-5 timing for families',
          },
        },
        posts: {
          facebook:
            "Your children's ages can shape your EB-5 options.\n\nIf a child is close to 21, timing matters. Families who plan early keep everyone on one path, and we help you see where your family stands today.\n\nA free call maps your family's timeline. Processing times are estimates, so we build in room for them.\n\nBook a free consultation.",
          instagram:
            "Move together. Plan early. 👨‍👩‍👧\n\nIf your kids are close to 21, EB-5 timing matters.\n\nWe map your family's timeline in one free call, with room for the estimates every process has.\n\nBook now (link in bio).\n\n#EB5 #FamilyImmigration #GreenCard #IndianFamilies",
          linkedin:
            "For families, EB-5 timing matters.\n\nA child's age can change what is possible, and the families we work with often wish they had started a year earlier. We look at your family's timeline first, then the projects that fit it.\n\nProcessing times are estimates, so the plan leaves room for them.\n\nA free consultation maps your family's timeline early.\n\n#EB5 #Family #Immigration",
        },
      },
      {
        id: 'v-q4-c',
        label: 'C',
        angle: 'Diligence you can verify',
        creative: { text: "Ask for the file. We'll send ours.", style: 'spotlight' },
        picturePrompt: 'A neat stack of bound reports on a wooden desk under a warm gold desk lamp, a deep indigo wall behind. No words, no people, no flags.',
        copy: {
          meta: {
            text: 'Every EB-5 project we suggest comes with an independent due-diligence file. Ask any advisor for theirs, then compare.',
            headline: 'See the diligence first',
            description: 'Free consultation',
            cta: 'Learn more',
          },
          linkedin: {
            text: "Choosing an EB-5 project is an investment decision, with risk. That's why each project we suggest comes with an independent due-diligence report you can read first.",
            headline: 'Independent EB-5 due diligence',
            cta: 'Learn more',
          },
          x: {
            text: "Before you pick an EB-5 project, ask for the due-diligence file. We'll send ours, independently prepared, before you commit.",
            headline: 'Independent due diligence',
          },
        },
        posts: {
          facebook:
            "Ask for the file. We'll send ours.\n\nEvery EB-5 project we suggest comes with an independent due-diligence report. Ask any advisor for theirs, then compare. See the work before you commit.\n\nBook a free consultation and we'll send ours.",
          instagram:
            "Ask for the file. 📁\n\nEvery EB-5 project we suggest comes with an independent due-diligence report.\n\nAsk any advisor for theirs. Then compare.\n\nRead the work before you commit.\n\n#EB5 #DueDiligence #InvestorVisa #GreenCard",
          linkedin:
            "Choosing an EB-5 project is an investment decision, with risk.\n\nThat is why each project we suggest comes with an independent due-diligence report you can read before you commit: who is building it, how the money is used, and what could go wrong.\n\nAsk any advisor for their file, then compare. We will send ours.\n\n#EB5 #DueDiligence #Investing",
        },
      },
    ],
  },
  {
    id: 'a-blog',
    title: 'Rural vs urban projects',
    createdAt: '2026-10-07T09:20:00Z',
    runId: 'r-1039',
    strategyId: 's-blog',
    status: 'generating',
    variants: [],
  },
  {
    id: 'a-podcast',
    title: 'From H-1B to EB-5',
    createdAt: '2026-10-05T15:40:00Z',
    runId: 'r-1041',
    strategyId: 's-podcast',
    status: 'approved',
    variants: [
      {
        id: 'v-pod-a',
        label: 'A',
        angle: 'Off the treadmill',
        approved: true,
        creative: { text: 'Your green card, not your employer’s.', style: 'arcs' },
        picturePrompt: 'An open road leading out of a city toward a gold horizon at dawn, the sky indigo overhead. No words, no people, no flags.',
        copy: {
          meta: {
            text: "Layoffs shouldn't decide where your family lives. Episode 12 unpacks how H-1B holders use EB-5 to plan their own path.",
            headline: 'From H-1B to EB-5',
            description: 'Listen, then book a call',
            cta: 'Learn more',
          },
          linkedin: {
            text: 'In episode 12, our advisors explain how H-1B professionals use EB-5 to stop tying their future to one employer.',
            headline: 'Podcast: From H-1B to EB-5',
            cta: 'Learn more',
          },
          x: {
            text: 'H-1B and worried about layoffs? Episode 12 explains how EB-5 puts your green card in your own hands.',
            headline: 'From H-1B to EB-5',
          },
        },
      },
      {
        id: 'v-pod-b',
        label: 'B',
        angle: 'The 60-day question',
        creative: { text: '60 days is not a plan.', style: 'split' },
        picturePrompt: 'An hourglass on a desk by a window at dusk, its gold sand catching the light, indigo shadows around it. No words, no people, no flags.',
        copy: {
          meta: {
            text: 'Lose an H-1B job and the clock starts. Hear how families plan ahead with EB-5 instead of racing it.',
            headline: 'Plan before the clock starts',
            description: 'Free consultation',
            cta: 'Book now',
          },
          linkedin: {
            text: "H-1B holders have a short grace period after a layoff. Episode 12 covers how to plan ahead so you're never racing it.",
            headline: 'Plan ahead of the grace period',
            cta: 'Learn more',
          },
          x: {
            text: '60 days is not a plan. Episode 12: how H-1B families plan ahead with EB-5.',
            headline: '60 days is not a plan',
          },
        },
      },
      {
        id: 'v-pod-c',
        label: 'C',
        angle: 'Straight answers',
        creative: { text: 'Straight answers on EB-5.', style: 'spotlight' },
        picturePrompt: 'A studio microphone on a desk, lit warm gold against a deep indigo backdrop. No words, no people, no flags.',
        copy: {
          meta: {
            text: 'What does EB-5 really involve for an H-1B holder? Our advisors answer the five questions we hear most.',
            headline: '5 straight answers on EB-5',
            description: 'Listen free',
            cta: 'Learn more',
          },
          linkedin: {
            text: 'Five questions H-1B professionals ask us about EB-5, answered plainly in episode 12 of our podcast.',
            headline: 'EB-5 questions, answered',
            cta: 'Learn more',
          },
          x: {
            text: 'The 5 EB-5 questions H-1B holders ask us most, answered plainly. Episode 12 is out.',
            headline: 'EB-5 questions, answered',
          },
        },
      },
    ],
  },
  {
    id: 'a-northstar',
    title: 'Webinar season',
    createdAt: '2026-09-26T10:30:00Z',
    runId: 'r-1037',
    strategyId: 's-northstar',
    status: 'approved',
    variants: [
      {
        id: 'v-ns-a',
        label: 'A',
        angle: 'Live Q&A',
        approved: true,
        creative: { text: 'EB-5, live. Ask us anything.', style: 'arcs' },
        picturePrompt: 'An empty seminar room with rows of chairs facing a softly lit stage, gold stage light and indigo walls. No words, no people, no flags.',
        copy: {
          meta: {
            text: 'Join our free live session on EB-5 for Indian families: how it works, what it costs, and the questions to ask.',
            headline: 'Free EB-5 webinar',
            description: 'Save your seat',
            cta: 'Sign up',
          },
          linkedin: {
            text: 'A free live session on EB-5 for Indian professionals and families: the process, the costs, and how to judge a project.',
            headline: 'Free webinar: EB-5, explained',
            cta: 'Register',
          },
          x: {
            text: 'Free live session: EB-5 for Indian families. The process, the costs, the questions to ask. Save a seat.',
            headline: 'Free EB-5 webinar',
          },
        },
      },
      {
        id: 'v-ns-b',
        label: 'B',
        angle: 'Costs, plainly',
        approved: true,
        creative: { text: 'What EB-5 really costs.', style: 'split' },
        picturePrompt: 'A calculator and a fountain pen on a blank ledger page in warm gold light, a deep indigo background. No words or figures, no people, no flags.',
        copy: {
          meta: {
            text: 'Investment, fees, timelines: we lay out what EB-5 really costs in a free live session.',
            headline: 'What EB-5 really costs',
            description: 'Free webinar',
            cta: 'Sign up',
          },
          linkedin: {
            text: 'EB-5 costs more than the investment amount. Our free webinar walks through every line so nothing surprises you.',
            headline: 'EB-5 costs, line by line',
            cta: 'Register',
          },
          x: {
            text: 'EB-5 costs more than the investment. Our free webinar walks through every line.',
            headline: 'EB-5 costs, line by line',
          },
        },
      },
      {
        id: 'v-ns-c',
        label: 'C',
        angle: 'Judge a project',
        creative: { text: 'How to judge an EB-5 project.', style: 'spotlight' },
        picturePrompt: 'A mid-rise building under construction at dusk, a crane against an indigo sky and the site lights glowing gold. No words, no people, no flags.',
        copy: {
          meta: {
            text: 'Not every EB-5 project is equal. Learn the checks we run on every one, live and free.',
            headline: 'How to judge a project',
            description: 'Free webinar',
            cta: 'Sign up',
          },
          linkedin: {
            text: 'Learn the due-diligence checks we run on every EB-5 project, in a free live session.',
            headline: 'Judge an EB-5 project',
            cta: 'Register',
          },
          x: {
            text: 'Not every EB-5 project is equal. See the checks we run, live and free.',
            headline: 'Judge an EB-5 project',
          },
        },
      },
    ],
  },
];

export const runs: Run[] = [
  {
    id: 'r-1046',
    title: 'Text: Visiting the projects we review',
    source: {
      kind: 'custom',
      type: 'text',
      excerpt:
        'We take investors to see the EB-5 projects we review before they commit: the site, the developer, the due-diligence file. Seeing the project is part of judging it. Processing times are estimates.',
    },
    platforms: ['meta', 'linkedin'],
    goal: 'consultations',
    createdAt: '2026-10-08T09:10:00Z',
    summary: 'Three ads, each with its own AI video.',
    media: {
      kind: 'video',
      video: { seconds: 15, quality: '720p', aspect: '16:9', credits: null },
      references: [{ path: 'refs/00000000-0000-4000-8000-000000000000/3f2a9c4e-6b1d-4e8a-9c7f-1a2b3c4d5e6f.jpg', note: 'The project site at dusk', status: 'ready', url: SAMPLE_PICTURE_URL }],
    },
    stages: {
      tracker: { status: 'skipped' },
      strategist: { status: 'done', summary: 'Built a strategy with 3 angles from the text.' },
      content: { status: 'done', summary: 'Wrote 3 ad variants for Meta and LinkedIn, each with a video prompt.' },
    },
    output: { strategyId: 's-site', adSetId: 'a-site' },
    counts: { angles: 3, variants: 3 },
    activity: [
      { at: '2026-10-08T09:10:00Z', text: 'Run started from pasted text' },
      { at: '2026-10-08T09:10:00Z', text: 'Every ad gets an AI video (15 s, 720p, 16:9), with one reference picture for Higgsfield' },
      { at: '2026-10-08T09:10:00Z', text: 'Competitor Tracker skipped: custom runs start at the strategy' },
      { at: '2026-10-08T09:14:00Z', text: 'Built a strategy with 3 angles' },
      { at: '2026-10-08T09:31:00Z', text: 'Wrote 3 ad variants for Meta and LinkedIn' },
      { at: '2026-10-08T09:31:00Z', text: "Asked Higgsfield for variant A's video" },
    ],
  },
  {
    id: 'r-1045',
    title: 'Text: What concurrent filing means for H-1B families',
    source: {
      kind: 'custom',
      type: 'text',
      excerpt:
        'Concurrent filing lets an EB-5 investor already in the U.S. on an H-1B file for a green card at the same time as the I-526E petition, so the family can stay and keep working while both are processed. Spouses and unmarried children under 21 file with them. Processing times are estimates.',
    },
    platforms: ['meta', 'linkedin'],
    goal: 'consultations',
    createdAt: '2026-10-07T10:10:00Z',
    pickFirst: true,
    stages: {
      tracker: { status: 'skipped' },
      strategist: { status: 'done', summary: 'Built a strategy with 3 angles from the text.' },
      content: { status: 'waiting' },
    },
    output: { strategyId: 's-filing' },
    counts: { angles: 3 },
    activity: [
      { at: '2026-10-07T10:10:00Z', text: 'Run started from pasted text' },
      { at: '2026-10-07T10:10:00Z', text: 'Competitor Tracker skipped: custom runs start at the strategy' },
      { at: '2026-10-07T10:12:00Z', text: 'Built a strategy with 3 angles' },
      { at: '2026-10-07T10:12:00Z', text: 'The Content Agent waits for you to pick the angles it writes from' },
    ],
  },
  {
    id: 'r-1044',
    title: 'Horizon Visa Partners · scheduled scan',
    source: { kind: 'competitor', input: 'website', url: 'https://horizonvisa.example' },
    platforms: ['meta', 'linkedin'],
    goal: 'consultations',
    createdAt: '2026-10-05T13:00:00Z',
    summary: 'Age-out urgency still runs their longest ads.',
    stages: {
      tracker: { status: 'done', summary: 'Scanned 31 active ads and found 5 winning hooks.' },
      strategist: { status: 'waiting' },
      content: { status: 'queued' },
    },
    output: { competitorId: 'c-horizon' },
    counts: { hooks: 5 },
    activity: [
      { at: '2026-10-05T13:00:00Z', text: 'Run started' },
      { at: '2026-10-05T13:00:00Z', text: 'Scheduled scan, with their website as the app last read it (28 Sep 2026)' },
      { at: '2026-10-05T13:00:00Z', text: 'Competitor Tracker started' },
      { at: '2026-10-05T13:01:00Z', text: 'Used sample ads: Apify is not connected yet' },
      { at: '2026-10-05T13:03:00Z', text: 'Scanned 31 active ads and found 5 winning hooks.' },
      { at: '2026-10-05T13:03:00Z', text: 'The Ad Strategist waits for you: it does not start by itself after a scan' },
    ],
  },
  {
    id: 'r-1043',
    title: 'Video · eb5-explainer',
    source: {
      kind: 'custom',
      type: 'video',
      clip: SAMPLE_CLIP,
      notes:
        'A 15-second explainer in four cards: the first question families ask about EB-5; pick a project, then check its diligence; file, then plan around estimated timelines; questions answered in a free consultation.',
    },
    platforms: ['meta', 'linkedin', 'x'],
    goal: 'consultations',
    createdAt: '2026-10-07T07:05:00Z',
    summary: 'Three video variants made from the explainer clip.',
    stages: {
      tracker: { status: 'skipped' },
      strategist: { status: 'done', summary: 'Built a strategy with 3 angles from the clip.' },
      content: { status: 'done', summary: 'Wrote 3 video variants for Meta, LinkedIn and X.' },
    },
    output: { strategyId: 's-clip', adSetId: 'a-clip' },
    counts: { angles: 3, variants: 3 },
    activity: [
      { at: '2026-10-07T07:05:00Z', text: 'Run started from a video' },
      { at: '2026-10-07T07:05:00Z', text: 'Competitor Tracker skipped: custom runs start at the strategy' },
      { at: '2026-10-07T07:05:00Z', text: 'Clip uploaded: 0:15' },
      { at: '2026-10-07T07:20:00Z', text: 'Built a strategy with 3 angles' },
      { at: '2026-10-07T07:41:00Z', text: 'Wrote 3 ad variants for Meta, LinkedIn and X' },
    ],
  },
  {
    id: 'r-1040',
    title: 'Atlas Residency Group',
    source: { kind: 'competitor', input: 'ad_link', url: 'https://adlibrary.example/atlas-residency' },
    platforms: ['meta', 'x'],
    goal: 'consultations',
    createdAt: '2026-10-07T08:41:00Z',
    summary: 'H-1B queue frustration is their strongest hook.',
    stages: {
      tracker: { status: 'done', summary: 'Scanned 24 active ads and found 4 winning hooks.' },
      strategist: { status: 'running', summary: 'Choosing angles from the 4 hooks.' },
      content: { status: 'queued' },
    },
    output: { competitorId: 'c-atlas' },
    counts: { hooks: 4 },
    activity: [
      { at: '2026-10-07T08:41:00Z', text: 'Run started from an ad library link' },
      { at: '2026-10-07T09:02:00Z', text: 'Scanned 24 active ads on Meta and X' },
      { at: '2026-10-07T09:03:00Z', text: 'Ranked 4 winning hooks and wrote the report' },
      { at: '2026-10-07T09:04:00Z', text: 'Ad Strategist started' },
    ],
  },
  {
    id: 'r-1039',
    title: 'Blog: Rural vs urban TEA projects',
    source: { kind: 'custom', type: 'blog', url: 'https://blog.example/rural-vs-urban-tea-projects' },
    platforms: ['meta', 'linkedin', 'x'],
    goal: 'awareness',
    createdAt: '2026-10-07T08:55:00Z',
    summary: 'Explainer angles for first-time investors.',
    stages: {
      tracker: { status: 'skipped' },
      strategist: { status: 'done', summary: 'Built a strategy with 3 angles from the post.' },
      content: { status: 'running', summary: 'Writing 3 variants.' },
    },
    output: { strategyId: 's-blog', adSetId: 'a-blog' },
    counts: { angles: 3 },
    activity: [
      { at: '2026-10-07T08:55:00Z', text: 'Run started from a blog post' },
      { at: '2026-10-07T08:55:00Z', text: 'Competitor Tracker skipped: custom runs start at the strategy' },
      { at: '2026-10-07T09:05:00Z', text: 'Built a strategy with 3 angles' },
      { at: '2026-10-07T09:06:00Z', text: 'Content Agent started' },
    ],
  },
  {
    id: 'r-1042',
    title: 'Horizon Visa Partners',
    source: { kind: 'competitor', input: 'website', url: 'https://horizonvisa.example/' },
    platforms: ['meta', 'linkedin', 'x'],
    goal: 'consultations',
    createdAt: '2026-10-06T09:12:00Z',
    summary: 'Age-out urgency drives their longest-running ads.',
    stages: {
      tracker: { status: 'done', summary: 'Scanned 38 active ads and found 6 winning hooks.' },
      strategist: { status: 'done', summary: 'Built a strategy with 3 angles, led by due diligence.' },
      content: { status: 'done', summary: 'Wrote 3 variants for Meta, LinkedIn and X.' },
    },
    output: { competitorId: 'c-horizon', strategyId: 's-q4', adSetId: 'a-q4' },
    counts: { hooks: 6, angles: 3, variants: 3 },
    activity: [
      { at: '2026-10-06T09:12:00Z', text: 'Run started from horizonvisa.example' },
      { at: '2026-10-06T09:31:00Z', text: 'Scanned 38 active ads on Meta and LinkedIn' },
      { at: '2026-10-06T09:33:00Z', text: 'Ranked 6 winning hooks and wrote the report' },
      { at: '2026-10-06T09:41:00Z', text: 'Built a strategy with 3 angles' },
      { at: '2026-10-06T09:58:00Z', text: 'Wrote 3 ad variants for Meta, LinkedIn and X' },
    ],
  },
  {
    id: 'r-1041',
    title: 'Podcast ep. 12: From H-1B to EB-5',
    source: { kind: 'custom', type: 'podcast', url: 'https://podcasts.example/quantum-global/ep-12' },
    platforms: ['meta', 'linkedin'],
    goal: 'consultations',
    createdAt: '2026-10-05T14:30:00Z',
    approvedAt: '2026-10-05T16:05:00Z',
    summary: 'Three angles from the episode’s strongest moments.',
    stages: {
      tracker: { status: 'skipped' },
      strategist: { status: 'done', summary: 'Transcribed the episode and built 3 angles.' },
      content: { status: 'done', summary: 'Wrote 3 variants for Meta and LinkedIn.' },
    },
    output: { strategyId: 's-podcast', adSetId: 'a-podcast' },
    counts: { angles: 3, variants: 3 },
    activity: [
      { at: '2026-10-05T14:30:00Z', text: 'Run started from a podcast episode' },
      { at: '2026-10-05T14:30:00Z', text: 'Competitor Tracker skipped: custom runs start at the strategy' },
      { at: '2026-10-05T15:10:00Z', text: 'Built a strategy with 3 angles' },
      { at: '2026-10-05T15:40:00Z', text: 'Wrote 3 ad variants for Meta and LinkedIn' },
      { at: '2026-10-05T16:05:00Z', text: 'Variant A approved by Alex Morgan' },
    ],
  },
  {
    id: 'r-1038',
    title: 'Meridian EB-5 Advisors',
    source: { kind: 'competitor', input: 'upload', name: 'Meridian EB-5 Advisors', files: ['meridian-linkedin-1.png', 'meridian-linkedin-2.png', 'meridian-doc-ad.mp4'] },
    platforms: ['linkedin'],
    goal: 'consultations',
    createdAt: '2026-09-29T10:20:00Z',
    summary: 'One upload could not be read.',
    stages: {
      tracker: { status: 'failed', error: 'meridian-doc-ad.mp4 is over the 50 MB upload limit. The other 2 files were read.' },
      strategist: { status: 'queued' },
      content: { status: 'queued' },
    },
    output: {},
    counts: {},
    activity: [
      { at: '2026-09-29T10:20:00Z', text: 'Run started from 3 uploaded ads' },
      { at: '2026-09-29T10:24:00Z', text: 'Stopped: 1 of 3 files could not be read' },
    ],
  },
  {
    id: 'r-1037',
    title: 'Northstar Global',
    source: { kind: 'competitor', input: 'website', url: 'https://northstarglobal.example/' },
    platforms: ['meta', 'linkedin', 'x'],
    goal: 'webinar',
    createdAt: '2026-09-26T09:00:00Z',
    approvedAt: '2026-09-27T08:15:00Z',
    summary: 'Plain-English process videos are their engine.',
    stages: {
      tracker: { status: 'done', summary: 'Scanned 52 active ads and found 7 winning hooks.' },
      strategist: { status: 'done', summary: 'Built a webinar strategy with 3 angles.' },
      content: { status: 'done', summary: 'Wrote 3 variants for Meta, LinkedIn and X.' },
    },
    output: { competitorId: 'c-northstar', strategyId: 's-northstar', adSetId: 'a-northstar' },
    counts: { hooks: 7, angles: 3, variants: 3 },
    activity: [
      { at: '2026-09-26T09:00:00Z', text: 'Run started from northstarglobal.example' },
      { at: '2026-09-26T09:20:00Z', text: 'Scanned 52 active ads on Meta, LinkedIn and X' },
      { at: '2026-09-26T10:00:00Z', text: 'Built a strategy with 3 angles' },
      { at: '2026-09-26T10:30:00Z', text: 'Wrote 3 ad variants' },
      { at: '2026-09-27T08:15:00Z', text: 'Variant A approved by Alex Morgan' },
    ],
  },
];

/** The team's settings: scans every Monday at 9:00 in New York, and the strategist waits for a person after one. */
export const settings: TeamSettings = {
  timeZone: 'America/New_York',
  strategistAuto: false,
  contentAuto: true,
  picturesAuto: false,
  adsSource: 'sample',
  pictureModel: 'stand-in',
  picturesQuality: 'low',
  cloudflareAccount: '',
  scanEvery: 'week',
  scanDay: 1,
  scanHour: 9,
  pages: {
    facebook: { id: '104000000000001', name: 'Quantum Global Residency' },
    instagram: { id: '17841400000000001', username: 'quantumglobalresidency' },
    linkedin: null,
  },
  // The sample data never posts anywhere.
  postForReal: { facebook: false, instagram: false, linkedin: false },
  postLink: null,
};

const NS_A_META = 'Join our free live session on EB-5 for Indian families: how it works, what it costs, and the questions to ask.';

/**
 * Posts of approved variants: three went out in the past fortnight and have
 * their numbers back, one went through the stand-in, one waits for Thursday
 * morning.
 */
export const posts: Post[] = [
  {
    id: 'p-2',
    variantId: 'v-ns-a',
    variantLabel: 'A',
    adSetId: 'a-northstar',
    adSetTitle: 'Webinar season',
    angle: 'Live Q&A',
    scheduledFor: '2026-10-08T13:00:00Z',
    createdAt: '2026-10-07T08:15:00Z',
    targets: [
      { place: 'facebook', text: NS_A_META, media: 'image', status: 'scheduled', standIn: false },
      { place: 'instagram', text: NS_A_META, media: 'image', status: 'scheduled', standIn: false },
    ],
  },
  {
    id: 'p-1',
    variantId: 'v-pod-a',
    variantLabel: 'A',
    adSetId: 'a-podcast',
    adSetTitle: 'From H-1B to EB-5',
    angle: 'Off the treadmill',
    scheduledFor: '2026-10-06T14:00:00Z',
    createdAt: '2026-10-06T11:20:00Z',
    targets: [
      {
        place: 'facebook',
        text: "Layoffs shouldn't decide where your family lives. Episode 12 unpacks how H-1B holders use EB-5 to plan their own path.",
        media: 'image',
        status: 'posted',
        postedAt: '2026-10-06T14:00:20Z',
        standIn: true,
      },
    ],
  },
  {
    id: 'p-5',
    variantId: 'v-pod-a',
    variantLabel: 'A',
    adSetId: 'a-podcast',
    adSetTitle: 'From H-1B to EB-5',
    angle: 'Off the treadmill',
    scheduledFor: '2026-10-05T13:30:00Z',
    createdAt: '2026-10-05T16:20:00Z',
    targets: [
      {
        place: 'linkedin',
        text: 'In episode 12, our advisors explain how H-1B professionals use EB-5 to stop tying their future to one employer.',
        media: 'image',
        status: 'posted',
        postedAt: '2026-10-05T13:30:15Z',
        standIn: false,
        results: { reach: 1510, views: 2380, reactions: 64, comments: 12, shares: 9, clicks: 57, at: '2026-10-07T06:00:00Z' },
      },
    ],
  },
  {
    // B on LinkedIn too, where A went first: with p-3 an A/B test on LinkedIn.
    id: 'p-6',
    variantId: 'v-ns-b',
    variantLabel: 'B',
    adSetId: 'a-northstar',
    adSetTitle: 'Webinar season',
    angle: 'Costs, plainly',
    scheduledFor: '2026-10-02T14:00:00Z',
    createdAt: '2026-10-01T09:20:00Z',
    targets: [
      {
        place: 'linkedin',
        text: 'What EB-5 really costs, line by line: the investment, the fees and the timelines, in a free live session.',
        media: 'image',
        status: 'posted',
        postedAt: '2026-10-02T14:00:15Z',
        standIn: false,
        results: { reach: 2600, views: 3400, reactions: 41, comments: 9, shares: 6, clicks: 22, at: '2026-10-07T06:00:00Z' },
      },
    ],
  },
  {
    id: 'p-4',
    variantId: 'v-ns-b',
    variantLabel: 'B',
    adSetId: 'a-northstar',
    adSetTitle: 'Webinar season',
    angle: 'Costs, plainly',
    scheduledFor: '2026-09-30T14:00:00Z',
    createdAt: '2026-09-29T10:05:00Z',
    targets: [
      {
        place: 'facebook',
        text: 'Investment, fees, timelines: we lay out what EB-5 really costs in a free live session.',
        media: 'image',
        status: 'posted',
        postedAt: '2026-09-30T14:00:12Z',
        standIn: false,
        results: { reach: 2240, views: 3010, reactions: 58, comments: 21, shares: 11, clicks: 66, at: '2026-10-07T06:00:00Z' },
      },
      {
        place: 'instagram',
        text: 'Investment, fees, timelines: we lay out what EB-5 really costs in a free live session.',
        media: 'image',
        status: 'posted',
        postedAt: '2026-09-30T14:00:31Z',
        standIn: false,
        // Instagram gives no clicks for a feed post.
        results: { reach: 3120, views: 4050, reactions: 140, comments: 18, shares: 25, clicks: null, at: '2026-10-07T06:00:00Z' },
      },
    ],
  },
  {
    id: 'p-3',
    variantId: 'v-ns-a',
    variantLabel: 'A',
    adSetId: 'a-northstar',
    adSetTitle: 'Webinar season',
    angle: 'Live Q&A',
    scheduledFor: '2026-09-28T15:00:00Z',
    createdAt: '2026-09-27T08:40:00Z',
    targets: [
      {
        place: 'facebook',
        text: NS_A_META,
        media: 'image',
        status: 'posted',
        postedAt: '2026-09-28T15:00:09Z',
        standIn: false,
        results: { reach: 1860, views: 2410, reactions: 71, comments: 9, shares: 6, clicks: 48, at: '2026-10-07T06:00:00Z' },
      },
      {
        place: 'linkedin',
        text: 'A free live session on EB-5 for Indian professionals and families: the process, the costs, and how to judge a project.',
        media: 'image',
        status: 'posted',
        postedAt: '2026-09-28T15:00:24Z',
        standIn: false,
        results: { reach: 940, views: 1320, reactions: 38, comments: 7, shares: 3, clicks: 29, at: '2026-10-07T06:00:00Z' },
        resultsError: 'LinkedIn did not answer (timeout).',
      },
    ],
  },
];

export const notices: Notice[] = [
  { id: 'n-5', text: 'Ad Strategist waits for you: Horizon Visa Partners · scheduled scan', at: '2026-10-05T13:03:00Z', href: '/runs/r-1044', tone: 'review' },
  { id: 'n-2', text: 'Atlas Residency Group scanned: 4 winning hooks', at: '2026-10-07T09:03:00Z', href: '/competitors/c-atlas', tone: 'done' },
  { id: 'n-4', text: 'Video ads ready for review: EB-5, explained', at: '2026-10-07T07:41:00Z', href: '/content/a-clip', tone: 'review' },
  { id: 'n-1', text: 'Ads ready for review: Q4 consultation push', at: '2026-10-06T09:58:00Z', href: '/content/a-q4', tone: 'review' },
  { id: 'n-3', text: 'Upload failed: Meridian EB-5 Advisors', at: '2026-09-29T10:24:00Z', href: '/runs/r-1038', tone: 'failed' },
];

/** The tracker's next scheduled scan: the Monday after NOW, 9:00 in New York. */
export const NEXT_SCAN = '2026-10-12T13:00:00Z';

/** What the agents read beside the brand profile: what the team posts about, how, and how its pictures look. */
export const brandMemory: BrandMemory = {
  topics: ['EB-5 basics', 'Rural (TEA) projects', 'Families with children near 21', 'From H-1B to a Green Card', 'Checking a project before investing'],
  postFormats: {
    facebook: 'Two or three short paragraphs. Open with the question families ask us, end with one clear next step.',
    instagram: 'A first line that stops the scroll, short lines with a blank line between, one emoji at most, then 4 to 6 hashtags on the last line.',
    linkedin: 'A strong first line, then short paragraphs written for professionals on H-1B visas. At most three hashtags.',
    x: 'One idea in plain words. No hashtags.',
  },
  pictureStyle: 'Real families and students in warm natural light: at home, on campus, arriving somewhere new. Candid and emotional, never posed. QGR indigo and gold only as small touches. A U.S. flag or passports may sit in the room, with no writing. No money.',
};

/** Posts that work for the team: one pasted, one marked "This worked" on a post that went out. */
export const brandExamples: BrandExample[] = [
  {
    id: 'e-2',
    place: 'linkedin',
    text: 'In episode 12, our advisors explain how H-1B professionals use EB-5 to stop tying their future to one employer.',
    note: 'Best engagement this month: a clear promise of what the episode explains, no hype.',
    source: 'marked',
    postId: 'p-5',
    createdAt: '2026-10-07T09:00:00Z',
  },
  {
    id: 'e-1',
    place: 'instagram',
    text: 'Three questions to ask before you pick an EB-5 project:\n\n1. Who checked it, and can I read their report?\n2. Where does the money go, step by step?\n3. What happens if the project is late?\n\nSave this for your first call. 📌\n\n#EB5 #DueDiligence #GreenCard #InvestorVisa',
    note: 'Saved and shared more than anything we posted this year. Lists work.',
    source: 'pasted',
    createdAt: '2026-09-30T15:00:00Z',
  },
];

// ---------------------------------------------------------------- long videos

/** What a webinar's speaker says, a line every ten seconds or so: the sample long video's transcript. */
const WEBINAR_LINES = [
  'Welcome, everyone, and thank you for joining tonight’s session on EB-5.',
  'Before we start, a quick note: this is general information, not advice for your case.',
  'Let’s begin with the question we hear most: what does EB-5 actually involve?',
  'EB-5 is an investment in a U.S. business that creates jobs, in return for a path to a green card.',
  'The investment is at risk. That is the first thing anyone considering it should understand.',
  'Most families we speak to are on H-1B visas and want a plan that does not depend on a lottery.',
  'So the real question is not whether EB-5 is fast. It is whether it fits your family’s plan.',
  'Processing times change, and anyone quoting you a fixed date is guessing.',
  'What you can control is how carefully the project is chosen before you invest.',
  'That is why we look at every project independently before we discuss it with a client.',
  'We read the loan documents, the developer’s track record and how the jobs are counted.',
  'Debt projects are repaid before equity, which is why many investors prefer them.',
  'Equity means owning a share of the project, with more risk and possibly more return.',
  'Neither is right for everyone. It depends on what you need from the investment.',
  'Now, a question from the chat: what happens to children who turn twenty-one?',
  'This is one of the most important parts of planning, and it is worth starting early.',
  'The age-out rules are complex, and the right timing depends on your family’s situation.',
  'This is exactly the kind of detail we go through on a free consultation.',
  'Another question: can I keep working on my H-1B while the petition is pending?',
  'In many cases, yes, and concurrent filing can matter here if you are already in the U.S.',
];
const webinarTranscript = (): TranscriptLine[] => {
  const lines: TranscriptLine[] = [];
  for (let i = 0; i < 240; i++) lines.push({ start: i * 10, end: i * 10 + 9.2, text: WEBINAR_LINES[i % WEBINAR_LINES.length]! });
  return lines;
};

/** The sample data's long video: a 40-minute webinar, its moments picked by place, not by an agent (lib/long-video.ts). */
export const sampleLongVideo = (): LongVideoWithTranscript => {
  const transcript = webinarTranscript();
  return {
    id: 'lv-sample',
    title: 'EB-5 investor webinar (sample)',
    description: 'A 40-minute webinar for families weighing EB-5: how the investment works, the risks, and what the process asks of them.',
    file: { name: 'eb5-webinar-sample.mp4', size: 1_204_224_000, duration: 2400, width: 1920, height: 1080 },
    guidance: null,
    status: 'done',
    error: null,
    moments: sampleMoments(transcript),
    lines: transcript.length,
    createdAt: '2026-10-12T16:00:00Z',
    sample: true,
    example: true,
    transcript,
    edit: null,
  };
};

// ---------------------------------------------------------------- leads

/** How the sample's leads came in: none from Zoho, since the sample data is not connected to anything. */
export const leadSettings: LeadSettings = {
  criteria:
    'A qualified lead:\n- is looking at U.S. residency through investment (EB-5), for themselves or their family;\n- says they can invest at least US$800,000, the EB-5 minimum in a targeted employment area, from funds they can show the source of;\n- wants to start within the next 12 months.\n\nNot qualified: looking only for work, study or a visit; says they cannot invest that much; a vendor, a test or spam.\n\nCan\'t tell: the lead does not say enough about their budget or their plans.',
  criteriaAt: '2026-09-20T08:00:00Z',
  source: 'off',
  zoho: null,
  syncedAt: null,
  checkedAt: null,
  syncError: null,
  postLink: 'https://quantumglobalresidency.com/consultation',
};

const BUDGET = { high: 'Over $1M', fit: '$800,000 to $1M', low: '$500,000 to $800,000', none: 'Under $500,000' } as const;
const WHEN = { soon: 'Within 6 months', year: '6 to 12 months', later: 'Just researching' } as const;

type LeadSpec = {
  name: string;
  /** Hours before NOW. */
  ago: number;
  budget?: keyof typeof BUDGET;
  when?: keyof typeof WHEN;
  visa?: string;
  message?: string;
  verdict: LeadVerdict | null;
};

/** Claude's reasons, quoting the lead's own answers: only the ones that bear out its verdict. */
function reasonsFor(spec: LeadSpec, verdict: LeadVerdict): LeadReason[] {
  const budget = spec.budget ? BUDGET[spec.budget] : null;
  const when = spec.when ? WHEN[spec.when] : null;
  const low = spec.budget === 'low' || spec.budget === 'none';
  if (verdict === 'unclear') return [{ text: budget ? 'Says nothing of when they want to start.' : 'Says nothing of how much they could invest.', field: null, quote: null }];
  const out: LeadReason[] = [];
  if (verdict === 'qualified') {
    if (budget) out.push({ text: 'Can invest at least the EB-5 minimum.', field: 'Investment budget', quote: budget });
    if (when) out.push({ text: 'Wants to start within a year.', field: 'When do you want to start?', quote: when });
    return out;
  }
  if (budget && low) out.push({ text: 'Cannot invest the EB-5 minimum.', field: 'Investment budget', quote: budget });
  if (when && spec.when === 'later') out.push({ text: 'Is not planning to start within a year.', field: 'When do you want to start?', quote: when });
  if (out.length === 0 && spec.message) out.push({ text: 'Is not asking about investing.', field: 'Message', quote: spec.message.split(/[.?,]/)[0]! });
  return out;
}

function sampleLead(id: number, spec: LeadSpec, where: Pick<Lead, 'platform' | 'campaign'> & Partial<Pick<Lead, 'from' | 'zohoSource'>>): Lead {
  const createdAt = new Date(Date.parse(NOW) - spec.ago * 3_600_000).toISOString();
  const answers = [
    ...(spec.budget ? [{ field: 'Investment budget', value: BUDGET[spec.budget] }] : []),
    ...(spec.when ? [{ field: 'When do you want to start?', value: WHEN[spec.when] }] : []),
    ...(spec.visa ? [{ field: 'Current visa', value: spec.visa }] : []),
    ...(spec.message ? [{ field: 'Message', value: spec.message }] : []),
  ];
  return {
    id: `lead-${id}`,
    name: spec.name,
    createdAt,
    zohoStatus: spec.ago > 72 ? 'Contacted' : 'Not Contacted',
    ...(where.zohoSource ? { zohoSource: where.zohoSource } : {}),
    platform: where.platform,
    campaign: where.campaign,
    ...(where.from ? { from: where.from } : {}),
    answers,
    judging: spec.verdict ? 'done' : 'waiting',
    ...(spec.verdict ? { ai: { verdict: spec.verdict, reasons: reasonsFor(spec, spec.verdict), at: new Date(Date.parse(createdAt) + 4 * 60_000).toISOString(), olderCriteria: false } } : {}),
  };
}

const podcast = (label: 'A' | 'B' | 'C', place: 'facebook' | 'linkedin') => ({
  platform: place,
  zohoSource: place === 'facebook' ? 'Facebook' : 'LinkedIn',
  campaign: { utm: { source: place, medium: 'social', campaign: 'qgr-r1041000', content: `${label.toLowerCase()}-${place}` } },
  from: {
    runId: 'r-1041',
    runTitle: 'Podcast ep. 12: From H-1B to EB-5',
    adSetId: 'a-podcast',
    variantId: `v-pod-${label.toLowerCase()}`,
    label,
    angle: { A: 'Off the treadmill', B: 'The 60-day question', C: 'Straight answers' }[label],
    place,
  },
});
const webinarForm = (ad: 'family' | 'diligence', platform: 'meta' | 'instagram' | 'facebook') => ({
  platform,
  zohoSource: 'Facebook Lead Ads',
  campaign: {
    id: '120210000000001',
    name: 'EB-5 webinar · lead form',
    adId: ad === 'family' ? '120210000000101' : '120210000000102',
    adName: ad === 'family' ? 'Family planning, golden hour' : 'Due diligence, explained',
    form: 'Webinar sign-up',
  },
});
const website = { platform: 'website' as const, zohoSource: 'Web Download', campaign: {} };

/**
 * Sample leads, with fictional names: a QGR run's posts tied by their tagged
 * links (one variant clearly ahead of another), a Meta lead form, the website,
 * and a few that show what can go wrong.
 */
export const leads = (): Lead[] => {
  let id = 0;
  const list: Lead[] = [];
  const add = (spec: LeadSpec, where: Parameters<typeof sampleLead>[2]) => list.push(sampleLead(++id, spec, where));
  // Variant B on Facebook: most of its leads qualify.
  const b: [string, keyof typeof BUDGET, keyof typeof WHEN, string][] = [
    ['Ananya Iyer', 'fit', 'soon', 'H-1B'],
    ['Rohan Mehta', 'high', 'year', 'H-1B'],
    ['Kavya Nair', 'fit', 'soon', 'H-1B'],
    ['Arjun Rao', 'high', 'soon', 'L-1'],
    ['Meera Pillai', 'fit', 'year', 'H-1B'],
    ['Vikram Shah', 'fit', 'soon', 'H-1B'],
    ['Priya Menon', 'high', 'year', 'H-1B'],
    ['Siddharth Jain', 'fit', 'year', 'O-1'],
    ['Neha Kulkarni', 'high', 'soon', 'H-1B'],
    ['Aisha Khan', 'fit', 'year', 'H-1B'],
    ['Sanjay Kumar', 'high', 'soon', 'L-1'],
  ];
  b.forEach(([name, budget, when, visa], i) => add({ name, ago: 20 + i * 13, budget, when, visa, verdict: 'qualified' }, podcast('B', 'facebook')));
  add({ name: 'Aditya Bose', ago: 70, budget: 'low', when: 'soon', visa: 'H-1B', verdict: 'not_qualified' }, podcast('B', 'facebook'));
  add({ name: 'Ishaan Gupta', ago: 95, budget: 'none', when: 'later', verdict: 'not_qualified' }, podcast('B', 'facebook'));
  add({ name: 'Diya Reddy', ago: 130, budget: 'fit', when: 'later', verdict: 'not_qualified' }, podcast('B', 'facebook'));
  // Variant A on Facebook: most of its leads do not.
  const a: [string, keyof typeof BUDGET, keyof typeof WHEN][] = [
    ['Karan Malhotra', 'low', 'later'],
    ['Sneha Joshi', 'none', 'later'],
    ['Rahul Verma', 'low', 'soon'],
    ['Pooja Desai', 'none', 'year'],
    ['Nikhil Saxena', 'low', 'later'],
    ['Tanvi Kapoor', 'none', 'soon'],
    ['Manish Agarwal', 'low', 'year'],
    ['Riya Banerjee', 'none', 'later'],
    ['Sameer Khanna', 'low', 'later'],
  ];
  a.forEach(([name, budget, when], i) => add({ name, ago: 26 + i * 17, budget, when, visa: 'F-1 student', verdict: 'not_qualified' }, podcast('A', 'facebook')));
  add({ name: 'Varun Chopra', ago: 50, budget: 'fit', when: 'soon', visa: 'H-1B', verdict: 'qualified' }, podcast('A', 'facebook'));
  add({ name: 'Anjali Sinha', ago: 110, budget: 'high', when: 'year', verdict: 'qualified' }, podcast('A', 'facebook'));
  add({ name: 'Harsh Patel', ago: 140, budget: 'fit', when: 'soon', verdict: 'qualified' }, podcast('B', 'facebook'));
  add({ name: 'Lakshmi Krishnan', ago: 34, budget: 'fit', visa: 'H-1B', verdict: 'unclear' }, podcast('A', 'facebook'));
  // Variant C on LinkedIn: too few to tell anything yet.
  add({ name: 'Gaurav Bhatt', ago: 44, budget: 'high', when: 'soon', visa: 'H-1B', verdict: 'qualified' }, podcast('C', 'linkedin'));
  add({ name: 'Shreya Ghosh', ago: 88, budget: 'fit', when: 'year', verdict: 'qualified' }, podcast('C', 'linkedin'));
  add({ name: 'Amit Tiwari', ago: 3, message: 'Is EB-5 still open for Indian investors this year?', verdict: 'unclear' }, podcast('C', 'linkedin'));
  // The webinar's Meta lead form.
  add({ name: 'Farah Siddiqui', ago: 12, budget: 'high', when: 'soon', verdict: 'qualified' }, webinarForm('family', 'instagram'));
  add({ name: 'Deepak Murthy', ago: 30, budget: 'fit', when: 'year', verdict: 'qualified' }, webinarForm('family', 'meta'));
  add({ name: 'Swati Rao', ago: 60, budget: 'low', when: 'soon', verdict: 'not_qualified' }, webinarForm('diligence', 'facebook'));
  add({ name: 'Imran Qureshi', ago: 2, budget: 'fit', when: 'soon', verdict: null }, webinarForm('diligence', 'instagram'));
  // The website, and a lead tied to nothing.
  add({ name: 'Nandini Pillai', ago: 18, budget: 'fit', when: 'year', message: 'We run a business in Pune and want to plan for our children’s education.', verdict: 'qualified' }, website);
  add({ name: 'Test Lead', ago: 5, message: 'testing the form, please ignore', verdict: 'not_qualified' }, { platform: 'other', campaign: {} });

  // A person set this one: Claude read the budget, the team knew more.
  const corrected = list.find((l) => l.name === 'Meera Pillai')!;
  corrected.person = { verdict: 'not_qualified', note: 'Funds are a loan against property; we confirm the source of funds on the first call.', at: '2026-10-06T11:00:00Z' };
  // This one was judged before the criteria last changed.
  list.find((l) => l.name === 'Diya Reddy')!.ai!.olderCriteria = true;
  // And this one could not be judged.
  const failed = list.find((l) => l.name === 'Test Lead')!;
  delete failed.ai;
  failed.judging = 'failed';
  failed.judgeError = 'Claude declined to judge this lead.';
  return list.sort((x, y) => y.createdAt.localeCompare(x.createdAt));
};
