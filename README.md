# Quantum Global · AI marketing

A dashboard where three agents turn what competitors are doing into ads for
Quantum Global Residency.

1. **Competitor Tracker**: give it a competitor's website, an ad library link
   or their ads. It finds the hooks that keep running and writes a report.
2. **Ad Strategist**: turns that report into a strategy: positioning, three
   angles, a channel plan and guardrails.
3. **Content Agent**: writes three ad variants, previewed as real Meta,
   LinkedIn and X posts. Pick one to highlight it and edit it in place.

Approve a variant and post it to the Facebook Page, Instagram and the LinkedIn
Page, now or at a time you pick; the Posts page shows how each one went. The
tracker scans the competitors you track on a schedule (Settings, Agents), and
the strategist and the Content Agent can be switched off so a run waits for
your go-ahead before them.

A **custom run** starts from your own podcast episode, blog post, video or
text. It has no competitor, so it skips the tracker and starts at the strategy.
A video can be a link, or a clip uploaded from your computer: cut it first
(split, remove parts, trim), and only what you keep is uploaded. Every variant
of a run from a clip is a video, which the studio's editor cuts, frames for a
platform (1:1, 4:5, 9:16, 16:9), puts the words, captions, logo and an end card
on, and exports to MP4, all in the browser. With a Deepgram key, what is said
in an uploaded clip is transcribed for you to read over, and becomes captions.

## Status

Built end to end: the dashboard, the Supabase database and six n8n workflows
(the pipeline, its three agents, the publisher and scheduled scans). The app
reads a run's link itself when the run starts (a competitor's site, or a
podcast, blog or video page) and the agents work from what it read.

Placeholders for now, each to be swapped for the real thing with the same
output: competitor ads (Apify), ad images (ChatGPT or Higgsfield), and the
posting itself. Until the Meta and LinkedIn keys are in n8n, a post goes all
the way through the publisher to a stand-in that posts nothing, and the Posts
page says so. Not built: paid ads, and posting to X (its API is paid).

## Run it

    pnpm install
    cp .env.example .env.local   # leave this out to run on the sample data
    pnpm dev          # http://localhost:3000
    pnpm test         # unit tests, no network
    pnpm typecheck
    pnpm build

With `.env.local` the dashboard asks you to sign in. To give someone access,
create their account in Supabase (Authentication → Users → Add user) and add
them to the team in the SQL editor:

    select private.add_team_member('name@example.com', 'owner');

Runs start once `N8N_RUN_WEBHOOK_SECRET` is set and the same secret is in
n8n's "QGR webhook secret" credential. Posts and scans need the "QGR ·
Publisher" and "QGR · Scheduled scans" workflows published in n8n; a clip's
transcript needs `DEEPGRAM_API_KEY`.

To post for real, in n8n: a Meta app whose Page access token can publish to
the Facebook Page and its Instagram professional account (`pages_manage_posts`,
`pages_read_engagement`, `instagram_basic`, `instagram_content_publish`), and a
LinkedIn app with the Community Management API (`w_organization_social`) for
the LinkedIn Page. Then replace each stand-in in "QGR · Publisher" with the
steps its note lists, and put the Pages' IDs in Settings, Where posts go.

The database is `supabase/migrations/`. Apply a new migration to the project
before deploying the code that needs it.

## Where things are

    app/(app)/           the dashboard's pages, behind sign-in
    app/(auth)/          sign-in and no-access
    app/api/runs/        starts a run: reads its link, Supabase, then n8n
    app/api/link-check/  reads a pasted link as it is typed
    app/api/uploads/     signs a link for uploading a clip straight to Storage
    app/api/transcribe/  what is said in an uploaded clip (Deepgram)
    app/api/post-media/  signs a link for uploading the file a post goes out with
    proxy.ts             sends anyone signed out to /sign-in
    components/          shell, home, runs, competitors, strategy, content, posts, settings, ui
    lib/types.ts         the domain model every page and the backend share
    lib/data.ts          the only place pages read data from: Supabase or the sample data
    lib/data/            the two sources, and the mapping from rows to lib/types.ts
    lib/mock-data.ts     the sample data
    lib/pipeline.ts      the agents' order and how a run's status is derived
    lib/schedule.ts      the team's time zone: scan times, post times, wall clock to UTC
    lib/creative/        draws an ad's picture for posting, as the studio shows it
    lib/page/            reads a link: safe fetching, and the page's main text
    lib/video/           video edits, drawing a frame, making the file, uploading
    components/video/    the cutter, the timeline, the studio's video editor
    public/sample/       the sample data's clip
    test/                PGlite with Supabase's roles and storage; n8n's sandbox
    app/globals.css      design tokens: every colour, radius and shadow
    supabase/migrations/ the database: tables, and the functions agents write through
    n8n/code/            each agent step's code, tested by n8n/code.test.ts
    n8n/workflows/       the n8n workflows, generated by n8n/build-workflows.mjs
