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
starts a run), switching agents off, publishing to the ad platforms.

## How the pieces connect

    browser ── proxy.ts: signed in? else /sign-in
            ── pages read lib/data.ts → Supabase as the signed-in teammate (RLS)
            ── POST /api/runs → create_run() → POST the n8n webhook { runId, startAt }
            ── studio and settings → server actions → save_variant(), approve_variant(),
               update_brand_profile()
    n8n "QGR · Run pipeline" → Competitor Tracker → Ad Strategist → Content Agent
    each agent → agent_begin() → Claude → agent_finish_*() or agent_fail()
    pages that show a moving run re-read it every 5 s (LiveRefresh)

- The browser never calls Supabase or n8n. Every Supabase call is made by the
  server with the person's own session and the publishable key; the service
  role key exists only in n8n. The webhook URL and its secret live only in the
  server's environment.
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
  `approve_variant`, `update_brand_profile`. The advisor warns that signed-in
  users can call them; that is the point, and the check inside is the guard.
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
