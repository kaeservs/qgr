# Quantum Global · AI marketing — working notes for Claude Code

## What this is

Quantum Global Residency's marketing dashboard (EB-5 / U.S. residency). Three
agents run in order: Competitor Tracker → Ad Strategist → Content Agent. A
custom run (podcast, blog post, video, text) skips the tracker and starts at
the strategist. The owner follows this as a learning project: for decisions
that matter architecturally, explain the problem, the options, the
recommendation and the trade-off before building.

## State

Front end complete on stand-in data (`lib/mock-data.ts`). Backend built: the
Supabase schema (`supabase/migrations/`) and the four n8n workflows (`n8n/`).
Apify and image generation are placeholders. Not yet joined: the pages still
read stand-in data and `/api/runs` does not call Supabase or n8n.

## How the backend connects

    browser → POST /api/runs (Next route) → start_run() in Supabase → run id
                                          → POST the n8n webhook { runId, startAt }
    n8n "QGR · Run pipeline" → Competitor Tracker → Ad Strategist → Content Agent
    each agent → agent_begin() → Claude → agent_finish_*() or agent_fail()
    pages → read Supabase through lib/data.ts (realtime later for live status)

- The browser never calls n8n. The webhook URL and its secret live only in the
  route handler's environment.
- `/api/runs` has no sign-in check yet because it only touches stand-in data.
  It must check the Supabase session before it calls `start_run` or n8n.
- `lib/data.ts` is the only data access. Swapping mock for Supabase changes
  that file and nothing that calls it; every function is already async.
- `lib/types.ts` is the contract the Supabase schema follows.

### Supabase (`supabase/migrations/`)

- Postgres functions are the only way in. An agent calls `agent_begin` (marks
  its stage running and returns the run, the brand and whatever the stage
  reads), then `agent_finish_tracker`, `agent_finish_strategist` or
  `agent_finish_content`, or `agent_fail`. Each checks its input and writes in
  one transaction, so a half-saved stage cannot exist.
- `agent_begin` keeps the order: a stage starts only when it is queued or
  failed and the one before it is done or skipped. A retry is the same call.
- RLS is on for every table with no policies yet, table privileges are revoked
  from `anon` and `authenticated`, and only `service_role` may run the
  functions. A new table or function must do the same in its own migration:
  Postgres and Supabase grant new objects to everyone by default.
- Every Claude call's `usage` goes to `agent_usage`, on failure too.

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

## Rules

1. **A run's status is derived from its stages**, never stored beside them
   (`runStatus` in `lib/pipeline.ts`, tested).
2. **Custom runs skip the Competitor Tracker** (`initialStages`, tested).
3. **No ad promises an outcome, a timeline or a return.** EB-5 is an
   investment with risk; processing times are always estimates. Strategies
   carry these as guardrails and the Content Agent must follow them.
4. **Validate on the server.** `parseNewRun` in `lib/run-input.ts` is the rule;
   the form checks the same things first only to answer faster.
5. Competitors in mock data are fictional on `.example` domains. Competitor ads
   are drawn in neutral tones so they are never mistaken for ours.

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
    pnpm dev          # http://localhost:3000
    pnpm test         # vitest, no network (includes the n8n agents' code)
    pnpm typecheck    # next typegen + tsc (TypeScript 7)
    pnpm build
    node n8n/build-workflows.mjs --ids=tracker=…,strategist=…,content=…
