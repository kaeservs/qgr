# Quantum Global · AI marketing — working notes for Claude Code

## What this is

Quantum Global Residency's marketing dashboard (EB-5 / U.S. residency). Three
agents run in order: Competitor Tracker → Ad Strategist → Content Agent. A
custom run (podcast, blog post, video, text) skips the tracker and starts at
the strategist. The owner follows this as a learning project: for decisions
that matter architecturally, explain the problem, the options, the
recommendation and the trade-off before building.

## State

Front end, backend and agents are built and joined. With `SUPABASE_URL` and
`SUPABASE_PUBLISHABLE_KEY` set (`.env.example`), the dashboard asks people to
sign in and shows what is in Supabase; without them it runs on the sample data
(`lib/mock-data.ts`) and says so ("Sample data" in the top bar). Runs start
only once the n8n webhook settings are set too. Apify and image generation are
placeholders. Not built yet: scheduled scans (the tracker runs when someone
starts a run), switching agents off, publishing to the ad platforms, a
transcript of an uploaded clip (the team writes what is said in it).

A video run can start from a link or from a clip uploaded from the computer,
cut in the browser first; in the studio every variant of such a run is a video
made from that clip, edited and exported to MP4 in the browser (Video below).

## How the pieces connect

    browser ── proxy.ts: signed in? else /sign-in
            ── pages read lib/data.ts → Supabase as the signed-in teammate (RLS)
            ── POST /api/link-check → reads a pasted link as it is typed (lib/page)
            ── POST /api/uploads → a signed upload link; the clip goes straight to Storage
            ── POST /api/runs → reads the run's link → create_run() → POST the n8n
               webhook { runId, startAt }
            ── studio and settings → server actions → save_variant(), approve_variant(),
               save_video_edit(), update_brand_profile()
    n8n "QGR · Run pipeline" → Competitor Tracker → Ad Strategist → Content Agent
    each agent → agent_begin() → Claude → agent_finish_*() or agent_fail()
    pages that show a moving run re-read it every 5 s (LiveRefresh)

- The browser never calls Supabase or n8n, with one exception: an uploaded clip
  goes from the browser straight to Storage, through a link the server signs
  as the teammate for one path in their own folder (`/api/uploads`), because a
  50 MB file cannot pass through a Vercel function (4.5 MB a request). Clips
  play and export from links the server signs too (`getClipUrl`). Every other
  Supabase call is made by the server with the person's own session and the
  publishable key; the service role key exists only in n8n. The webhook URL and
  its secret live only in the server's environment.
- The app reads a run's link once, when the run starts (`lib/page/read.ts`):
  addresses that resolve to private networks are refused, redirects are
  checked again, 8 s and 2 MB at most. What it read (title, description, main
  text, or why it could not) is stored in `runs.page`; the agents read that and
  never fetch a link themselves. A custom run whose page cannot be read is
  refused with a reason; a competitor run goes on from their ads.
- `lib/data.ts` is the only data access. It picks `lib/data/live.ts` (Supabase)
  or `lib/data/sample.ts`; both implement `DataSource` (`lib/data/source.ts`)
  and return the shapes in `lib/types.ts`. Rows become those shapes in
  `lib/data/map.ts`, which is pure and tested.
- Sign-in is email and password (Supabase Auth): Google sign-in and email links
  both need keys that do not exist yet. Accounts are made by an owner, not by
  sign-up (see Supabase below).

### Supabase (`supabase/migrations/`)

- Postgres functions are the only way in. An agent calls `agent_begin` (marks
  its stage running and returns the run, the brand and whatever the stage
  reads), then `agent_finish_tracker`, `agent_finish_strategist` or
  `agent_finish_content`, or `agent_fail`. Each checks its input and writes in
  one transaction, so a half-saved stage cannot exist.
- `agent_begin` keeps the order: a stage starts only when it is queued or
  failed and the one before it is done or skipped. A retry is the same call.
- People change things through their own functions, each `security definer`
  with a team check first (`private.require_team_member()`): `create_run`,
  `report_start_failure` (n8n could not be reached), `save_variant`,
  `approve_variant`, `save_video_edit`, `update_brand_profile`. The advisor
  warns that signed-in users can call them; that is the point, and the check
  inside is the guard.
- Clips live in the private bucket `run-media` (50 MB a file, video types
  only) at `uploads/{uploader}/{uuid}.{ext}`. Storage policies: a member reads
  any clip, uploads only into their own folder, and removes only their own
  clips that no run uses (a clip cut again or taken away). `create_run` checks
  the clip has finished uploading; any teammate's clip may start a run, so
  anyone can retry one. A clip a run uses is never replaced or removed.
- The tests run every migration in PGlite, with stand-ins for Supabase's
  roles, `auth.uid()` and storage (`test/supabase.ts`):
  `supabase/access.test.ts` checks who can read and change what, and
  `n8n/pipeline.test.ts` takes each kind of run through all three agents'
  scripts against them, with Claude's answers as fixtures.
- `team_members` decides who sees anything. Policies let a member read every
  dashboard table; anyone else, signed in or not, reads nothing, and nobody but
  the service role writes a table. Add a person: create the account
  (Authentication → Users → Add user, auto-confirm), then in the SQL editor
  `select private.add_team_member('name@example.com', 'owner');`.
- A new table or function must revoke what Postgres and Supabase grant by
  default (`anon`, `authenticated`, `public`) in its own migration, then grant
  only what it needs. The test that matters: a signed-in non-member reads 0 rows.
- Every Claude call's `usage` goes to `agent_usage`, on failure too.
- Local migration files are named by the version Supabase recorded when it
  applied them (`list_migrations`), so the CLI and the project agree.
- Name the foreign key in every embed (`runs → strategies!strategies_run_id_fkey(...)`):
  several tables link runs, strategies and competitors in more than one way.
  The typed client catches a wrong column but not a wrong hint, so check hints
  against `lib/supabase/database.types.ts`, which is regenerated after every
  migration (`generate_typescript_types`).

### n8n (`n8n/`)

- In n8n-tesserafy, folder "QGR marketing agents": Run pipeline
  (`jZPgNf2YZJddmJ7y`, webhook `POST /webhook/qgr-run`), Competitor Tracker
  (`j94ykovP9OH96SxF`), Ad Strategist (`8YaVuKkKlok2rX4K`), Content Agent
  (`iSwaVrynhCGWkqOg`).
- The agents' logic is `n8n/code/*.js`, tested by `n8n/code.test.ts`.
  `node n8n/build-workflows.mjs --ids=tracker=…,strategist=…,content=…` embeds
  it into SDK source in `n8n/workflows/`, which is what gets validated and
  saved through the n8n MCP. Change the script, test, rebuild, then update the
  workflow; an edit made only in n8n drifts from the repo.
- n8n runs Code nodes in a sandbox with the standard built-ins only: no `URL`,
  `Buffer`, `fetch` or `setTimeout`. The tests run every script the same way
  (`test/n8n.ts`), so a script that reaches for one fails here first. (The
  tracker once read a website's host with `new URL`, which failed every
  website run in n8n.)
- A workflow change is proven in n8n with `test_workflow`, pinning the
  trigger, Claude and Supabase nodes and running the code for real.
- Claude is called with the HTTP Request node: `claude-opus-5-5`, JSON held to
  a schema (`output_config.format`), effort set explicitly, no `temperature`
  (Opus 5.5 rejects it), the server-side refusal fallback on. Days running,
  versions, counts and budget shares are computed in code from the data,
  never taken from the model.
- Credentials, created in n8n and attached by hand: `Anthropic` (Anthropic
  API), `Supabase QGR` (Supabase API: project URL and service role key),
  `QGR webhook secret` (Header Auth, on the pipeline's webhook).
- Placeholders. "Apify: competitor ads (placeholder)" returns sample ads in
  the shape Apify will, and the report is marked `data_source: placeholder`.
  "Images (placeholder)" leaves `image_url` empty, so the studio draws the
  branded design. Each is replaced by a real step with the same output; the
  node's comment says what that is.

### Video (`lib/video/`, `components/video/`)

- An edit is instructions, kept per variant in `ad_variants.video_edit`
  (`lib/video/edit.ts`, pure and tested): the parts of the clip kept, the
  shape (original, 1:1, 4:5, 9:16, 16:9) with fill or fit and a focus point,
  the variant's words over it, captions, the mark, the volume, an end card and
  the cover frame. Kept parts and captions are in the clip's own seconds, so a
  caption stays with its words when the cut changes. `parseVideoEdit` is the
  app's check; `save_video_edit` checks the parts are inside the clip.
- One function draws a frame (`lib/video/draw.ts`): the studio's preview and
  the exported file are both drawn by it, so what is seen is what is exported.
- Files are made in the browser by Mediabunny over WebCodecs
  (`lib/video/render.ts`): MP4 with H.264 and AAC whenever the browser can
  (the ad platforms want MP4), Mediabunny's own AAC encoder where the browser
  has none, WebM only where H.264 cannot be made, and the editor says so.
  Pages load it with `import()` when a clip is cut or exported, never
  statically: it is 420 KB that most visits never use.
- The cutter (`ClipCutter`, `ClipField`) uploads a clip untouched when nothing
  is cut and it fits 50 MB; otherwise it renders the kept parts, at most
  1080p, at a bitrate aimed at 45 MB. A clip replaced or taken away is
  removed again (`DELETE /api/uploads`), so Free's 1 GB of storage holds
  clips that runs use. The export downloads the clip once, renders it and
  hands the file to the person; it is never stored.
- The sample data has a 15-second branded clip (`public/sample`, marked
  "Sample clip" in the picture, MP4 and a WebM for browsers that can't play
  H.264) and a video ad set made from it. A clip uploaded on sample data is
  cut but not stored, and the run page says so.
- To check this in Playwright's Chromium: it has no H.264 or AAC, so use WebM
  clips, and check what was made with ffprobe and ffmpeg.
- `mediabunny` and `@mediabunny/aac-encoder` are pinned to the same release,
  one at least two weeks old when it was taken.

## Rules

1. **A run's status is derived from its stages**, never stored beside them
   (`runStatus` in `lib/pipeline.ts`, tested).
2. **Custom runs skip the Competitor Tracker** (`initialStages`, tested).
3. **No ad promises an outcome, a timeline or a return.** EB-5 is an
   investment with risk; processing times are always estimates. Strategies
   carry these as guardrails and the Content Agent must follow them.
4. **Validate on the server.** `parseNewRun` in `lib/run-input.ts` and
   `lib/edit-input.ts` are the rules for what the app accepts; the database
   functions check again. The forms check first only to answer faster.
5. Competitors in mock data are fictional on `.example` domains. Competitor ads
   are drawn in neutral tones so they are never mistaken for ours.
6. **Flag, never rewrite.** Guardrail checks (`lib/guardrails.ts`, the same
   rules as the Content Agent's, kept in step by `n8n/code.test.ts`) flag a
   phrase for a person to judge before approving. Nothing edits words silently.
7. **The sample data says it is sample data.** The top bar says so, saves say
   "Saved for this session", and a report built from Apify's placeholder says
   its ads are examples.
8. **The agents never fetch.** A link is read by the app when its run starts
   and stored with it (`runs.page`); a clip is described by the team
   (`runs.excerpt`), because the agents cannot watch it.
9. **A clip is never changed.** Every edit is instructions on a variant; the
   clip in Storage stays as it was uploaded, and the captions and end card are
   flagged against the guardrails like any other words on an ad.

## Design

- Tokens at the top of `app/globals.css`, sampled from quantumglobalresidency.com:
  indigo `#1C1B9D`, gold `#EFB74A`, the hero arc tints. Gold on white is 1.8:1,
  so gold is a fill or an accent, never text on a light background.
- Lexend for the interface, Oswald (the site's condensed headline face) for
  titles and ad images. Both self-hosted with @fontsource.
- Plain CSS Modules on the tokens, no UI library. lucide-react for icons; Meta
  and X marks from simple-icons (CC0), LinkedIn drawn in `PlatformIcon.tsx`.
- Ad previews use the system font, as the platforms do; only the image wears
  the brand's type.
- Layout after the "glide" reference: white icon sidebar, greeting, a tabbed
  start card, recent runs, and a right panel with a calendar and agent cards.
- Dates render in UTC with a fixed locale so server and browser agree.
- Copy limits in `lib/platforms.ts` are the platforms' recommendations (X's
  280 is the hard one); check them against current ad specs.

## MCP routing

Use `n8n-tesserafy` for n8n and `Supabase-QGR` for Supabase. Any other n8n or
Supabase connector points at different infrastructure: do not use it here.

## Commands

    pnpm install
    cp .env.example .env.local   # Supabase on; leave it out for the sample data
    pnpm dev          # http://localhost:3000
    pnpm test         # vitest, no network (includes the n8n agents' code)
    pnpm typecheck    # next typegen + tsc (TypeScript 7)
    pnpm build
    node n8n/build-workflows.mjs --ids=tracker=…,strategist=…,content=…
