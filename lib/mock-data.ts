// The sample data, shown when Supabase is not configured (lib/data/sample.ts). Competitors are fictional and use
// `.example` domains so nothing here reads as a claim about a real company.
// Ad copy follows the guardrails a real strategy carries: no promised outcome,
// timeline or return, because EB-5 is an investment with risk.

import type { AdSet, Agent, Clip, Competitor, Notice, Run, Strategy, User } from './types';
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
      { id: 'e-1', platform: 'meta', format: 'video', text: "Your kids shouldn't age out while you wait.", daysRunning: 63, tone: 'slate' },
      { id: 'e-2', platform: 'meta', format: 'image', text: "The H-1B lottery isn't a plan.", daysRunning: 41, tone: 'teal' },
      { id: 'e-3', platform: 'linkedin', format: 'document', text: 'What $800K actually buys.', daysRunning: 34, tone: 'sand' },
      { id: 'e-4', platform: 'linkedin', format: 'carousel', text: '3 questions before you pick a project.', daysRunning: 28, tone: 'plum' },
    ],
  },
  {
    id: 'c-atlas',
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
  'Say plainly that EB-5 is an investment with risk',
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

const clipEdit = (edit: Partial<VideoEdit>): VideoEdit => ({
  keep: [{ start: 0, end: SAMPLE_CLIP.duration }],
  aspect: 'original',
  fit: 'fill',
  focus: { x: 0.5, y: 0.5 },
  text: { show: true, place: 'top', until: null },
  captions: [],
  logo: 'top-left',
  volume: 1,
  endCard: null,
  cover: 0,
  ...edit,
});

export const strategies: Strategy[] = [
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

export const adSets: AdSet[] = [
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
      },
      {
        id: 'v-q4-b',
        label: 'B',
        angle: 'Family first',
        creative: { text: 'Move together. Plan early.', style: 'split' },
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
      },
      {
        id: 'v-q4-c',
        label: 'C',
        angle: 'Diligence you can verify',
        creative: { text: "Ask for the file. We'll send ours.", style: 'spotlight' },
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
        creative: { text: 'What EB-5 really costs.', style: 'split' },
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

export const agents: Agent[] = [
  {
    key: 'tracker',
    auto: true,
    switchable: true,
    autoLabel: 'Scans every Monday, 9:00',
    manualLabel: 'Scans when you ask',
    stat: '4 competitors tracked',
    href: '/competitors',
    action: { label: 'New scan', href: '/runs/new' },
  },
  {
    key: 'strategist',
    auto: true,
    switchable: true,
    autoLabel: 'Runs after every scan',
    manualLabel: 'Waits for you',
    stat: '5 strategies',
    href: '/strategy',
    action: { label: 'Custom run', href: '/runs/new?type=custom' },
  },
  {
    key: 'content',
    auto: false,
    switchable: true,
    autoLabel: 'Writes ads from every strategy',
    manualLabel: 'Waits for your go-ahead',
    stat: '2 sets to review',
    href: '/content',
    action: { label: 'Review', href: '/content/a-q4' },
  },
];

export const notices: Notice[] = [
  { id: 'n-2', text: 'Atlas Residency Group scanned: 4 winning hooks', at: '2026-10-07T09:03:00Z', href: '/competitors/c-atlas', tone: 'done' },
  { id: 'n-4', text: 'Video ads ready for review: EB-5, explained', at: '2026-10-07T07:41:00Z', href: '/content/a-clip', tone: 'review' },
  { id: 'n-1', text: 'Ads ready for review: Q4 consultation push', at: '2026-10-06T09:58:00Z', href: '/content/a-q4', tone: 'review' },
  { id: 'n-3', text: 'Upload failed: Meridian EB-5 Advisors', at: '2026-09-29T10:24:00Z', href: '/runs/r-1038', tone: 'failed' },
];

/** The tracker's next scheduled scan: the Monday after NOW. */
export const NEXT_SCAN = '2026-10-12T09:00:00Z';
