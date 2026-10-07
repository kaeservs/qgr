# Quantum Global · AI marketing — working notes for Claude Code

## What this is

Quantum Global Residency's marketing dashboard (EB-5 / U.S. residency). Three
agents run in order: Competitor Tracker → Ad Strategist → Content Agent. A
custom run (podcast, blog post, video, text) skips the tracker and starts at
the strategist. The owner follows this as a learning project: for decisions
that matter architecturally, explain the problem, the options, the
recommendation and the trade-off before building.

## State

Front end complete on stand-in data (`lib/mock-data.ts`). Next: Supabase for
the data, n8n for the agents.

## How the backend will connect (planned)

    browser → POST /api/runs (Next route) → insert `runs` row in Supabase
                                          → call the n8n webhook with the run id
    n8n agents → write stage status and outputs back to Supabase
    pages → read Supabase through lib/data.ts (realtime later for live status)

- The browser never calls n8n. The webhook URL and its secret live only in the
  route handler's environment.
- `/api/runs` has no sign-in check yet because it only touches stand-in data.
  It must check the Supabase session before it inserts a row or calls n8n.
- `lib/data.ts` is the only data access. Swapping mock for Supabase changes
  that file and nothing that calls it; every function is already async.
- `lib/types.ts` is the contract the Supabase schema should follow.

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
    pnpm test         # vitest, no network
    pnpm typecheck    # next typegen + tsc (TypeScript 7)
    pnpm build
