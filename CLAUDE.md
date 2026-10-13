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
only once the n8n webhook settings are set too.

Placeholders until their keys are in: Apify, image generation and posting.
The tracker reads sample ads until the team switches it to Apify in Settings,
once Apify's token is in n8n; then it reads each competitor's real ads in
Meta's Ad Library (Competitor ads below). An approved variant is posted now or at a time to the Facebook Page,
Instagram and the LinkedIn Page, and the whole path runs (the file made in the
browser, the queue in Supabase, n8n's publisher), but n8n's three posting
steps are stand-ins that post nothing and say so (Posting below). An ad's
picture is asked for in the studio from a prompt, or by every new ad, and goes
through n8n's "QGR · Pictures" to the image model chosen in Settings: the
stand-in, which makes none and says so, or Cloudflare Workers AI's FLUX.1
schnell, free each day, once its token is in n8n (Pictures below). A clip's
transcript is heard in the browser, on the team's own computer (Whisper, free;
Video below). Not built: paid
ads (Meta Ads Manager, LinkedIn Campaign Manager) and posting to X, whose API
is paid; X copy is for pasting.

The tracker scans the tracked competitors on the team's schedule, and the
strategist and the Content Agent can each be switched off, so a run waits for
a person before them (Switches and scans below).

A video run can start from a link or from a clip uploaded from the computer,
cut in the browser first; in the studio every variant of such a run is a video
made from that clip, edited and exported to MP4 in the browser (Video below).

Every variant carries the short ad copy for each platform and a post in full
for each place (Facebook, Instagram, LinkedIn), and every agent reads the
team's brand memory: voice and rules, topics, format notes, picture style and
posts that work (Brand memory below).

## How the pieces connect

    browser ── proxy.ts: signed in? else /sign-in
            ── pages read lib/data.ts → Supabase as the signed-in teammate (RLS)
            ── POST /api/link-check → reads a pasted link as it is typed (lib/page)
            ── POST /api/uploads → a signed upload link; the clip goes straight to Storage
            ── a clip's words: heard in the browser (lib/speech.ts, public/speech/whisper-worker.js)
            ── POST /api/runs → reads the run's link → create_run() → set_run_guidance()
               when the team gave a direction → POST the n8n webhook { runId, startAt }
            ── POST /api/post-media → a signed upload link for the file a post goes out with
            ── GET /api/activity → what is at work now, for the top bar's Working list
            ── studio, posts, runs, competitors, settings → server actions →
               save_variant_words(), approve_variant(), save_video_edit(), update_brand_profile(),
               update_brand_memory(), add_brand_example(), remove_brand_example(), remember_post(),
               continue_run(), schedule_post(), cancel_post(), retry_post(), reschedule_post(),
               ask_for_picture(), use_picture(), stop_picture(), remove_picture(),
               update_agent_settings(), set_pictures_auto(), set_pictures_model(),
               set_ads_source(), update_publishing_settings(),
               set_competitor_tracked()
    n8n "QGR · Run pipeline" → Competitor Tracker → Ad Strategist → Content Agent,
        asking pipeline_next() before each of the last two
    n8n "QGR · Scheduled scans", hourly → start_due_scans() → each run → Run pipeline
    n8n "QGR · Publisher", every minute and on POST /webhook/qgr-publish →
        publisher_take_due() → each place → publisher_finish() or publisher_fail()
    n8n "QGR · Post results", every six hours → results_take_due() → each place →
        results_record() or results_fail()
    n8n "QGR · Pictures", every five minutes and on POST /webhook/qgr-picture →
        picture_take_due() → each ad → picture_finish() or picture_fail()
    each agent → agent_begin() → Claude → agent_finish_*() or agent_fail()
    pages that show a moving run or post re-read it every 5 s (LiveRefresh)

- The browser never calls Supabase or n8n, with one exception: a file goes
  from the browser straight to Storage, through a link the server signs as the
  teammate for one path in their own folder (a clip through `/api/uploads`,
  the file a post goes out with through `/api/post-media`), because a 50 MB
  file cannot pass through a Vercel function (4.5 MB a request). Clips play
  and export from links the server signs too (`getClipUrl`). Every other
  Supabase call is made by the server with the person's own session and the
  publishable key; the service role key exists only in n8n. The webhook URLs
  and their secret live only in the server's environment.
- The app reads a run's link once, when the run starts (`lib/page/read.ts`):
  addresses that resolve to private networks are refused, redirects are
  checked again, 8 s and 2 MB at most. What it read (title, description, main
  text, or why it could not) is stored in `runs.page`; the agents read that and
  never fetch a link themselves. A custom run whose page cannot be read is
  refused with a reason; a competitor run goes on from their ads.
- A run can carry the team's direction for the agents ("Direction for the
  agents" on the start card, up to 2,000 characters: what to focus on, the
  hooks to try, what to leave out). It is stored in `runs.guidance` by
  `set_run_guidance` before n8n is told about the run, and only while no agent
  has started; Start over carries it to the new run. Each agent's request adds
  it to the material with one rule saying how to use it (the guardrails win
  over it), and only when there is one: without it every request is exactly
  as before (`n8n/code.test.ts`).
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
  `report_start_failure` (n8n could not be reached), `set_run_guidance`,
  `save_variant_words` (`save_variant` stays for pages opened before it),
  `approve_variant`, `save_video_edit`, `update_brand_profile`,
  `update_brand_memory`, `add_brand_example`, `remove_brand_example`, `remember_post`,
  `continue_run` and `report_continue_failure`, `schedule_post`,
  `cancel_post`, `retry_post`, `reschedule_post`, `request_picture`,
  `ask_for_picture`, `use_picture`, `stop_picture`, `remove_picture`,
  `update_agent_settings`, `set_pictures_auto`, `set_pictures_model`,
  `set_ads_source`, `update_publishing_settings`, `set_competitor_tracked`.
  The advisor warns
  that signed-in users can call them; that is the point, and the check inside
  is the guard. What only n8n calls (`agent_*`, `pipeline_next`,
  `start_due_scans`, `publisher_*`, `results_*`, `picture_*`,
  `prune_pictures`) is granted to
  the service role alone.
- Clips live in the private bucket `run-media` (50 MB a file, video types
  only) at `uploads/{uploader}/{uuid}.{ext}`. Storage policies: a member reads
  any clip, uploads only into their own folder, and removes only their own
  clips that no run uses (a clip cut again or taken away). `create_run` checks
  the clip has finished uploading; any teammate's clip may start a run, so
  anyone can retry one. A clip a run uses is never replaced or removed.
- The file a post goes out with lives in the private bucket `post-media` (50 MB,
  JPEG or MP4) at `posts/{uploader}/{uuid}.{ext}`. A member uploads only into
  their own folder and removes a file only while no post waits on it; n8n
  removes it once the last place has it (`publisher_finish` returns
  `remove_media`), since each platform keeps its own copy.
- An ad's picture lives in the private bucket `ad-pictures` (10 MB, PNG, JPEG
  or WebP) at `pictures/{variant}/{uuid}.{ext}`, uploaded by n8n alone. A
  member reads any, and removes only one no variant shows and no variant keeps
  to choose again (`variant_pictures`); n8n removes those past the eight kept.
- The tests run every migration in PGlite, with stand-ins for Supabase's
  roles, `auth.uid()` and storage (`test/supabase.ts`):
  `supabase/access.test.ts` checks who can read and change what,
  `supabase/posts.test.ts`, `supabase/agents.test.ts` and
  `supabase/pictures.test.ts` the posts, the switches, the scan schedule and
  the pictures, `n8n/pipeline.test.ts` takes each kind of run through all
  three agents' scripts against them, with Claude's answers as fixtures, and
  `n8n/publisher.test.ts` a post, its results and a picture through their
  workflows.
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
- The Supabase-QGR connector holds a migration with a destructive statement
  for the owner to confirm, and gives up after 60 s: a `drop`, and a `delete`
  even inside a function's body. Migrations add and replace (`create or
  replace` with the same arguments keeps grants); a function that changes its
  arguments gets a new name, and taking a row away is a mark
  (`brand_examples.removed_at`). What has to drop waits for the owner.
- Name the foreign key in every embed (`runs → strategies!strategies_run_id_fkey(...)`):
  several tables link runs, strategies and competitors in more than one way.
  The typed client catches a wrong column but not a wrong hint, so check hints
  against `lib/supabase/database.types.ts`, which is regenerated after every
  migration (`generate_typescript_types`).

### n8n (`n8n/`)

- In n8n-tesserafy, folder "QGR marketing agents": Run pipeline
  (`jZPgNf2YZJddmJ7y`, webhook `POST /webhook/qgr-run`), Competitor Tracker
  (`j94ykovP9OH96SxF`), Ad Strategist (`8YaVuKkKlok2rX4K`), Content Agent
  (`iSwaVrynhCGWkqOg`), Publisher (`0251XoQKheUhUQEP`, every minute and webhook
  `POST /webhook/qgr-publish`), Scheduled scans (`GYflolbtsiiENms6`, hourly),
  Post results (`bpHjnEFbijGOTrBw`, every six hours), Pictures
  (`qjRr2WxZvDz1WdQO`, every five minutes and webhook `POST /webhook/qgr-picture`).
- The agents' logic is `n8n/code/*.js`, tested by `n8n/code.test.ts` and
  `n8n/publisher.test.ts`. `node n8n/build-workflows.mjs
  --ids=tracker=…,strategist=…,content=…,pipeline=…` embeds it into SDK source
  in `n8n/workflows/`, which is what gets validated and saved through the n8n
  MCP. Change the script, test, rebuild, then update the workflow; an edit made
  only in n8n drifts from the repo.
- n8n runs Code nodes in a sandbox with the standard built-ins only: no `URL`,
  `Buffer`, `fetch` or `setTimeout`. The tests run every script the same way
  (`test/n8n.ts`), so a script that reaches for one fails here first. (The
  tracker once read a website's host with `new URL`, which failed every
  website run in n8n.)
- A workflow change is proven in n8n with `test_workflow`, pinning the
  trigger, Claude and Supabase nodes and running the code for real.
- Live runs use each workflow's published version, the agents called from
  Run pipeline included: an update is a draft until that workflow is
  published again. n8n publishes a workflow only once every workflow it calls
  is published (the three agents before Run pipeline, Run pipeline before
  Scheduled scans).
- Claude is called with the HTTP Request node: `claude-haiku-5-5` for all
  three agents while the app is being built, the owner's choice on 2026-10-09
  (estimated at a cent or two a run against 25 to 60 cents on
  `claude-opus-5-5`, before either was measured; a person approves every ad
  before it posts). An agent moves up by changing `MODEL` in its
  `*-build-request.js`; Sonnet 5.5 costs half what Opus 5.5 does. JSON held
  to a schema (`output_config.format`), effort set explicitly (medium for the
  tracker, high for the strategist and the ads), no `temperature` (Haiku 5.5
  and Opus 5.5 can reject it). `fallbacks: 'default'` retries a refused
  request on another model on Sonnet and Opus; Haiku has no fallback, so
  there a refusal stands and the run says so. Days running, versions, counts
  and budget shares are computed in code from the data, never taken from the
  model.
- Credentials, created in n8n and attached by hand: `Anthropic` (Anthropic
  API), `Supabase QGR` (Supabase API: project URL and service role key, on
  every Supabase call), `QGR webhook secret` (Header Auth, on the pipeline's,
  the publisher's and the pictures' webhooks), `Apify token` (Custom Auth: JSON
  `{"headers": {"Authorization": "Bearer <token>"}}`, allowed domain
  `api.apify.com`; an existing plain Custom Auth credential is fine on the
  HTTP node, only creating one from a workflow is refused), `Cloudflare
  Workers AI` (Bearer Auth: an API token made from Cloudflare's Workers AI
  template, on "Cloudflare: FLUX.1 schnell" in Pictures; until it is attached
  that step does not run, and the studio says so). The Meta and LinkedIn tokens
  will be n8n credentials too; nothing that posts or draws is kept in Supabase
  or the app (the Cloudflare account ID is: it is an ID, not a secret).
  A node holds its credential by id, so renaming one in n8n changes nothing
  (the webhook secret is "Header Auth account 2", on all three webhooks).
- A node names its credential only once that credential exists in n8n: a
  reference to a missing one fails every run before it starts, even a test
  with pinned data ("uses invalid credential").
- Placeholders. The tracker's "Sample ads" returns the same example ads for
  every competitor, in the shape "Read Apify's ads" gives, and the report is
  marked `data_source: placeholder`; it runs while the team's ads source is
  sample. "Image model (stand-in)" in Pictures is the way taken while pictures
  are set to the stand-in: it makes nothing and answers `stand_in: true`, so
  the studio says no picture was made. "Facebook (stand-in)", "Instagram (stand-in)" and "LinkedIn
  (stand-in)" in the publisher post nothing and answer `stand_in: true`, so
  the dashboard says nothing went out; their three "results (stand-in)" twins
  in Post results read nothing. Each is replaced by real steps with the same
  output; the node's comment and the sticky beside it say what they are.

### Brand memory (`brand_profile`, `brand_examples`, `/brand`)

- The Brand memory page holds what every agent reads before it writes: the
  voice and rules (moved from Settings; `update_brand_profile`), what the team
  usually posts about (`topics`), how it formats a post on each platform
  (`post_formats`), how its pictures look (`picture_style`; these three by
  `update_brand_memory`), posts that work (`brand_examples`: pasted with
  `add_brand_example`, or marked "This worked" on a post that went out), and
  the best posts by their results (computed from the platforms' numbers, as
  `lib/results.ts` does, with "Keep in memory").
- `agent_begin` gives every stage the brand (with topics, formats and picture
  style) and the twelve newest posts that work; the strategist and the Content
  Agent also get how recent posts did, with each post's words. The tracker
  writes its insights for QGR (`our_brand`); the strategist keeps its angles
  to the topics and learns from the posts that work; the Content Agent follows
  the format notes, writes like the posts that work and the best three by
  engagement, and keeps its picture prompts to the picture style. Each part is
  sent only when there is something in it.
- Taking a post out of brand memory marks it (`removed_at`), so the agents and
  the page leave it out; marking the same post "This worked" again brings it
  back. Brand memory keeps up to 60 posts.

### The Content Agent's chain and posts

- The Content Agent reads the whole chain: the strategy (each angle's why and
  the competitor hook it answers), what it came from (the competitor report's
  insights and hooks, or the source's text, up to 12,000 characters, or a
  clip's words), the team's direction and the brand memory. It writes three
  variants, each with the ad copy for every platform the run asked for and a
  post in full for every place those platforms post to: Facebook (60 to 150
  words), Instagram (40 to 120 words, then hashtags) and LinkedIn (100 to 220
  words). Its read step fails a variant without a post for a place, or with one
  past 3,000 characters (never cut), and flags posts as it flags copy.
  `max_tokens` is 32,000 for it and 24,000 for the strategist.
- The studio shows each variant as an ad on a platform or a post on a place
  (the Ads and Posts buttons), with the chain under its name: why the angle
  should work, and the competitor hook it answers, linked to the report. A
  post is edited in place; one emptied goes back to the ad copy.

### Switches and scans (`team_settings`)

- `team_settings` is one row: the team's time zone, the two switches
  (`strategist_auto`, `content_auto`), whether every new ad asks for a picture
  (`pictures_auto`), what makes pictures (`pictures_model`: stand-in or
  cloudflare, with `cloudflare_account`), where the tracker reads ads
  (`ads_source`), the scan schedule (`scan_every` off, day or week, with
  `scan_day` and `scan_hour`) and the Pages posts go to. Settings changes it
  through `update_agent_settings`, `set_pictures_auto`, `set_pictures_model`,
  `set_ads_source` and `update_publishing_settings`; Home's agent cards flip
  the same switches.
- A switch holds what follows, never the agent a run starts at. With the
  strategist's off, every finished scan waits before the strategy; with the
  Content Agent's off, every strategy waits before the ads. The pipeline asks
  `pipeline_next(run, stage)`, which with the switch off marks the stage
  waiting (`run_stages.waiting_since`: its status stays `queued`, and
  `agent_begin` refuses it) and says so on the run. The go-ahead on the run
  page is `continue_run`, which clears it and returns the stage, and the app
  starts the pipeline from there. The same call runs a failed agent again
  where it stopped. "Waiting" is derived in `lib/data/map.ts`, like every
  status (rule 1).
- Every hour n8n asks `start_due_scans` for the scans that are due: the last
  slot of the schedule in the team's zone (`scan_slot`, daylight saving
  included), if no scan has run for it and the schedule was not changed after
  it (`scan_changed_at`, so saving Settings never starts one). It starts a run
  for each tracked competitor with a website (`competitors.tracked`, switched
  on the competitor's page; at most ten, the most recently reported first),
  with the platforms and goal of their last run and their website as the app
  last read it: a scheduled scan fetches nothing.
- Times are the team's. A scan or a scheduled post is a wall time in
  `team_settings.time_zone`, converted by the database; the app shows times
  in that zone (`lib/schedule.ts`, tested across the clock changes).

### Competitor ads (`team_settings.ads_source`, the tracker)

- The tracker reads sample ads until the team switches it to Apify (Settings,
  Agents; `set_ads_source`). `agent_begin` hands the choice to the tracker
  alone, and "Real ads?" follows it, so a switch takes effect at the next scan.
- With Apify, "Plan the scan" names the page of Meta's Ad Library to read: a
  pasted link to the library as it is; for a website or uploaded ads, a
  keyword search for the competitor's name. A link to another library
  (LinkedIn's, X's, Google's) stops the scan and says why: the actor reads
  Meta's only. "Apify: their Meta ads" runs Apify's Facebook Ads Library
  Scraper and waits for it (`run-sync-get-dataset-items`, 60 ads and 240 s at
  most).
- "Read Apify's ads" keeps a search to the competitor's own ads (from a Page
  with their name, or linking to their website), skips catalogue ads whose
  words are a template, and reads every field whichever way the actor's
  version names it (`adArchiveID` or `ad_archive_id`, a start date in seconds
  or as a date). Days running are still worked out from start dates in code.
  Its fixtures follow the field names the actor's listings show, not a real
  run: check the first real scan's items against `tracker-apify-ads.js`.
- Each ad keeps its page in Meta's Ad Library (`competitor_ads.ad_url`), shown
  as "See the ad" on the competitor page, the only link a competitor's ad is
  shown with. Nothing from Apify is stored but the report.

### Posting (`posts`, `post_targets`, "QGR · Publisher")

- A post is one approved variant going to one or more places (Facebook,
  Instagram, LinkedIn), now or at a time up to 90 days ahead, made with
  `schedule_post`. Each place is a `post_targets` row holding its own copy of
  the approved words (the variant's post for that place, in full; or, without
  one, its ad copy: Meta's for Facebook and Instagram, LinkedIn's for
  LinkedIn; `postText` in `lib/platforms.ts`) and the file it goes with: a picture drawn in the browser by
  `lib/creative/draw.ts` (1080×1080 for Meta, 1200×628 for LinkedIn, the same
  design the studio shows) or, for a run from a clip, the variant's video made
  by `components/video/makeVideo.ts` as MP4 only. The dialog shows the files
  before they go.
- A place goes scheduled → posting → posted, or failed (nothing went out; Try
  again) or unknown (it may have gone out; a person checks the Page first), or
  cancelled. `publisher_take_due` claims what is due with `skip locked`, so a
  place is never handed out twice; a place still `posting` after 15 minutes
  becomes unknown and is never sent again by itself.
- Post now pings the publisher's webhook (`N8N_PUBLISH_WEBHOOK_URL`, or the
  run webhook's address with `qgr-publish`), so it goes within seconds rather
  than at the next minute.
- An approved variant that is edited loses its approval (`save_variant_words`,
  `save_video_edit`), and one waiting to post cannot be edited until its post
  is cancelled. Saving the same words again changes nothing.
- A place that went out for real (not through a stand-in) has "This worked"
  (`remember_post`): its words become a post that works in brand memory, and
  the place shows "In brand memory".
- The Posts page lists what needs a look, what is scheduled, what went out
  and what was cancelled, in the team's time; a stand-in result says nothing
  was posted. Its Scheduled view (`?view=scheduled`) is every post still to go
  out, soonest first, a day at a time, each with Move or send now and Cancel.
  Its Calendar view (`?view=calendar`) puts each post on the day
  it goes out in the team's zone (`lib/posts.ts`), and a post none of whose
  places has started going out moves to another time or goes now
  (`reschedule_post`, which locks the places first so the publisher cannot be
  claiming them). Home's calendar shows how many runs started and how many
  posts go out each day; picking a day lists them under the calendar, and
  otherwise it lists what is coming up, with a link to the Scheduled view.
- An agent's result opens from wherever it is counted: a run card's Hooks,
  Angles and Variants open the report, the strategy and the ads, and a finished
  agent's card on the run page is one link to what it made.
- Results: once a place has gone out for real, "QGR · Post results" reads its
  numbers every six hours for four weeks (`results_take_due`) and records them
  on the place (`reach`, `views`, `reactions`, `comments`, `shares`, `clicks`,
  each a count or null where the platform does not report it; `results_record`).
  A failed read keeps the numbers before it and says why (`results_fail`). A
  stand-in post has none. Engagement is reactions, comments, shares and clicks
  per person reached (per view where there is no reach), computed in code,
  never by a model: `lib/results.ts` for the dashboard and the strategist's own
  script for its prompt, kept in step by `n8n/code.test.ts`. Posts shows each
  place's numbers and a Results view (totals, engagement by angle, every place
  measured). `agent_begin` hands the strategist the team's recent results; its
  material then carries the best five and weakest three (`our_past_posts`), and
  with none the request is exactly as before.
- Text a client component renders must be the same on the server and in the
  browser: day and month names are spelled out in code (`dayLabel`), because
  Node and Chromium disagree on Intl's short forms (`Mon 28 Sep` against
  `Mon, 28 Sept`), which is a hydration error.

### Pictures (`ad_variants.picture_*`, "QGR · Pictures")

- Every ad but a clip's carries an `image_prompt` from the Content Agent (the
  scene only: no words, the brand's colours, no identifiable people, no
  flags). The studio's Picture dialog (`PictureDialog`) shows it to edit and
  makes a picture from what is written there (`ask_for_picture`: the prompt
  becomes the variant's, up to 1,200 characters); with the team's switch on
  (Settings, Agents), every new ad asks for one as it is saved (a trigger on
  `ad_variants`). The Content Agent makes none itself: a picture takes its
  own time, and a run should neither wait for one nor fail with it.
- Every picture made for a variant is kept to choose again (`variant_pictures`,
  newest first, eight a variant): the dialog shows them, and picking one shows
  it (`use_picture`; another picture takes the approval back, and one being
  made is stopped). Stop (`stop_picture`) keeps what the variant shows; Use the
  design (`remove_picture`) goes back to the drawn design and keeps the
  picture to choose again, so no file is handed back. Past eight, the oldest
  the variant does not show is marked (`removed_at`) and its file handed back
  for n8n to remove (`prune_pictures`).
- "QGR · Pictures" takes the asks (`picture_take_due`, claimed with
  `skip locked`; a claim lost for ten minutes is taken again, three tries at
  most) at once when the app pings `qgr-picture`, otherwise within five
  minutes, each with its prompt, the brand's picture style (`look`), the
  team's image model and the path to upload to. `picture_finish` keeps every
  picture that arrives: one that answers the open ask is shown under the ad's
  words from then on and takes an approval back; one for a variant scheduled
  meanwhile, or whose ask was stopped, only joins the others (what was
  approved is what goes out). The same answer twice is kept once.
  `picture_fail` keeps the reason.
- The image model is the team's choice in Settings, Agents (`pictures_model`,
  `set_pictures_model`): the stand-in, or Cloudflare Workers AI's FLUX.1
  schnell on the account named there. "Real pictures?" sends a Cloudflare ask
  through "Write the prompt" (the scene, then the brand's picture style, then
  the rules: no text, no real or identifiable people, no flags; 2,048
  characters at most, only an agent's long scene is shortened), the call
  (Bearer credential), "Read the picture" (the kind from its first bytes, the
  path given that extension; Cloudflare's refusals in plain words: the day's
  free allowance used up, the token, the account), "To a file" and "Upload to
  Storage", then records it. Free: 10,000 neurons a day, about 170 pictures at
  1024×1024, and on Cloudflare's free plan nothing is ever charged: past that a
  picture fails and says so until 00:00 UTC. The workflow keeps no execution
  data for runs that succeed, so pictures do not pile up in n8n.
- The studio shows pictures through links the server signs as the teammate
  for an hour (one `createSignedUrls` call for the ad set, the kept pictures
  with it; only the studio reads them). A picture asked for and not made in
  ten minutes may be asked for again.
- The posted image is drawn by the same function as before
  (`lib/creative/draw.ts`): a picture covers the frame, cropped about its
  middle, under a 38% black wash (the studio's `brightness(0.62)`), and the
  words are gold on it in every style. The publish dialog loads it with CORS
  so the canvas can still be exported.
- While pictures are set to the stand-in, "Image model (stand-in)" makes
  nothing and answers `stand_in: true`: the ask ends and the studio says no
  picture was made and where to choose a model. The sample data has one
  picture (`public/sample/picture-q4.jpg`, marked "Sample picture"), and
  asking for one there says there is no image model to ask.

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
- A clip's transcript is heard in the browser, on the team's own computer, so
  it is free and the clip's sound goes nowhere (`lib/speech.ts`). Once the
  clip is ready, the page decodes the file it uploaded to 16 kHz, one channel
  (a silent clip stops there and says so), and a module worker
  (`public/speech/whisper-worker.js`) runs Whisper base
  (`onnx-community/whisper-base`, many languages) with transformers.js 4.3.0
  from jsDelivr, pinned to a release at least two weeks old: on WebGPU where
  the browser has it, WebAssembly otherwise, and once more on WebAssembly if
  WebGPU fails. The model (about 80 MB) comes from Hugging Face the first time
  and the browser keeps it; the worker ends after each clip, giving its memory
  back. Whisper's timed passages become caption-sized lines in the clip's
  seconds (`linesFromChunks` in `lib/transcribe.ts`, tested: 42 characters, a
  sentence's end, time shared by length, noise like [Music] and a line
  repeated over a silence left out, nothing past the clip's end). They fill
  the run's notes when those are empty (the team reads them over before the
  run starts), are stored with the clip in `runs.media.transcript`, and the
  editor turns the ones in the kept parts into captions ("From the clip's
  speech"). A failure says why (Try again where another try can help) and the
  team types instead. This sandbox cannot reach jsDelivr or Hugging Face: the
  browser check routes the library to a stand-in that reports what it was
  given.
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
   phrase for a person to judge before approving, in the ad copy, the image
   words and the posts, and past what X and Instagram take. Nothing edits words
   silently.
7. **The sample data says it is sample data.** The top bar says so, saves say
   "Saved for this session", and a report built from sample ads says its ads
   are examples.
8. **The agents never fetch.** A link is read by the app when its run starts
   and stored with it (`runs.page`); a clip is described in words
   (`runs.excerpt`: its transcript, read over by the team, or what they type),
   because the agents cannot watch it. A scheduled scan reuses the website as
   it was last read. Apify reads Meta's Ad Library for the tracker and nothing
   else: a pasted ad link is handed to it only when it is the library's own.
9. **A clip is never changed.** Every edit is instructions on a variant; the
   clip in Storage stays as it was uploaded, and the captions and end card are
   flagged against the guardrails like any other words on an ad.
10. **What was approved is what goes out.** A post copies the approved words
    and goes with a file made from the approved variant, shown before it is
    sent. Editing an approved variant takes its approval away, and so does a
    new picture or going back to the design; one waiting to post cannot be
    edited, or change its picture, until its post is cancelled.
11. **Never post twice by accident.** A place that may have gone out
    (`unknown`) is never sent again by itself: a person checks the Page, then
    sends it again or dismisses it.

## Design

- Tokens at the top of `app/globals.css`, sampled from quantumglobalresidency.com:
  indigo `#1C1B9D`, gold `#EFB74A`, the hero arc tints. Gold on white is 1.8:1,
  so gold is a fill or an accent, never text on a light background.
- Lexend for the interface, Oswald (the site's condensed headline face) for
  titles and ad images. Both self-hosted with @fontsource.
- Plain CSS Modules on the tokens, no UI library. lucide-react for icons; Meta
  and X marks from simple-icons (CC0); LinkedIn, Facebook and Instagram drawn
  in `PlatformIcon.tsx`.
- Ad previews use the system font, as the platforms do; only the image wears
  the brand's type.
- Layout after the "glide" reference: white icon sidebar, greeting, a tabbed
  start card, recent runs, and a right panel with a calendar and agent cards.
- Dates render in UTC with a fixed locale so server and browser agree; scan
  and post times render the same way in the team's zone (`formatInZone`).
- Copy limits in `lib/platforms.ts` are the platforms' recommendations (X's
  280 is the hard one); check them against current ad specs.
- Waiting is always shown, in one of three ways:
  - A page loading: `app/(app)/loading.tsx` stands in for it, with the
    sidebar and top bar left in place.
  - A button sending something: set `aria-busy` on it. `globals.css` turns a
    ring in place of its icon and keeps its colour, since a button at work is
    not unavailable. A `Toggle` takes `busy` and turns a ring in its knob.
  - Work going on: an agent on a run, a post going out or a picture being made
    is in the top bar's Working list on every page, and on Home the agent's
    card says what it is working on. Both read `getActivity`, which the
    layout reads with the page and `/api/activity` serves to the list: every
    5 s while something works, every 30 s while all is quiet, only in a tab in
    view. When something finishes, the page re-reads. Past `WORKING_MINUTES`
    (`lib/data/map.ts`: 30 for an agent, 15 for a post, 10 for a picture) the
    work is stuck rather than working, and is left to the page it belongs to.
  The rings keep still for anyone who asks for less motion (the rule at the
  top of `globals.css`).

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
    node n8n/build-workflows.mjs --ids=tracker=…,strategist=…,content=…,pipeline=…
