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

Placeholders until their keys are in: Apify, image generation, posting and AI
video.
The tracker reads sample ads until the team switches it to Apify in Settings,
once Apify's token is in n8n; then it reads each competitor's real ads in
Meta's Ad Library (Competitor ads below). An approved variant is posted now or at a time to the Facebook Page,
Instagram and the LinkedIn Page, and the whole path runs (the file made in the
browser, the queue in Supabase, n8n's publisher). Each place posts through a
stand-in that posts nothing and says so until the team switches it to post for
real (Settings, Where posts go); then n8n's real steps publish it and "QGR ·
Post results" reads its numbers, once the Facebook and LinkedIn credentials
are attached in n8n (Posting below). An ad's
picture is asked for in the studio from a prompt, or by every new ad, and goes
through n8n's "QGR · Pictures" to the image model chosen in Settings: the
stand-in, which makes none and says so, Cloudflare Workers AI's FLUX.1
schnell, free each day, once its token is in n8n, or Higgsfield's GPT Image
2.5 on the team's plan, for credits held to the same monthly limit as AI
video (Pictures below). A clip's
transcript is heard in the browser, on the team's own computer (Whisper, free;
Video below). A video is made from a prompt by Higgsfield, through n8n's "QGR ·
AI video" and Higgsfield's MCP signed in to the team's own plan: Generate goes
through a stand-in that makes nothing and says so until the team switches AI
video on in Settings, and a monthly limit in credits holds what it spends (AI
video below). Not built: paid
ads (Meta Ads Manager, LinkedIn Campaign Manager) and posting to X, whose API
is paid; X copy is for pasting.

The tracker scans the tracked competitors on the team's schedule, and the
strategist and the Content Agent can each be switched off, so a run waits for
a person before them (Switches and scans below). A run can also ask, once
Start run is pressed, to wait for the team's picks: the report's ads the
strategy answers, then the strategy's angles the ads are written from, or
"Use all" (Picking inside a run below). The same question asks what the ads
are made of: the drawn design, an AI picture for each ad or an AI video for
each, with Higgsfield's price for the three, and up to four reference
pictures Higgsfield keeps to (What the ads are made of below).

A competitor run can also start from screenshots of their ads, which Claude
reads; and any few of a report's ads, ticked on the competitor page, start a
run of their own at the strategist (Screenshots and chosen ads below).

A video run can start from a link or from a clip uploaded from the computer,
cut in the browser first; in the studio every variant of such a run is a video
made from that clip, edited and exported to MP4 in the browser (Video below).

A picture ad's words, its logo and texts a person adds can be dragged where
they should sit and sized ("Design…" in the studio), and so can a video's
words, logo and texts in the video editor (Movable words and logo below).

Every variant carries the short ad copy for each platform and a post in full
for each place (Facebook, Instagram, LinkedIn), and every agent reads the
team's brand memory: voice and rules, topics, format notes, picture style and
posts that work (Brand memory below).

Leads come from Zoho CRM once the team connects it (Leads, Setup; the login
is an n8n credential): each is judged by Claude against what the team says
makes a lead qualified, quoting what the lead said, and tied to the campaign
and ad it came from, a Meta lead form's or a QGR post's tagged link. The Leads
page counts each campaign's and ad's qualified leads, and suggests making
more like an ad whose leads qualify more often than the rest of its
campaign's (or rethinking one whose qualify less), which a person approves
into a run (Leads below). Not built: reading spend from Meta's, LinkedIn's or
X's ads APIs, which each need their own access.

## How the pieces connect

    browser ── proxy.ts: signed in? else /sign-in
            ── pages read lib/data.ts → Supabase as the signed-in teammate (RLS)
            ── POST /api/link-check → reads a pasted link as it is typed (lib/page)
            ── POST /api/uploads → a signed upload link; the clip goes straight to Storage
            ── POST /api/competitor-shots → a signed upload link for a screenshot of a competitor's ad
            ── a clip's words: heard in the browser (lib/speech.ts, public/speech/whisper-worker.js)
            ── POST /api/run-refs → a signed upload link for a reference picture for Higgsfield
            ── Start run → a question in the browser (RunQuestions, MediaChoice) → POST /api/runs →
               reads the run's link → Higgsfield's price for a video run, asked again →
               create_run() → set_run_guidance() when the team gave a direction →
               set_run_pick_first() when it picks first → set_run_media() →
               POST the n8n webhook { runId, startAt }
            ── POST /api/post-media → a signed upload link for the file a post goes out with
            ── leads → server actions → update_lead_criteria(), set_leads_source(), set_lead_verdict(),
               judge_leads_again(), set_post_link(), a suggestion approved → create_run()
            ── POST /api/edit-media → a signed upload link for a file added to a video edit;
               POST /api/edit-media/links → links to read them
            ── POST /api/video-refs → a signed upload link for an AI video's first picture
            ── AI video → server actions → Higgsfield's price from n8n's Price webhook,
               ask_for_video() then the Make now webhook, remove_ai_video(), set_video_settings()
            ── the video editor's AI video tab → the same price and ask, the edit's AI videos
               as they stand (getAiVideosById), Claude's prompt from n8n's Prompt webhook;
               a long video's whole edit → save_long_video_edit()
            ── GET /api/activity → what is at work now, for the top bar's Working list
            ── studio, posts, runs, competitors, settings → server actions →
               save_variant_words(), approve_variant(), save_video_edit(), save_variant_design(),
               update_brand_profile(),
               update_brand_memory(), add_brand_example(), remove_brand_example(), remember_post(),
               continue_run(), continue_with_ads(), continue_with_angles(), schedule_post(), cancel_post(), retry_post(), reschedule_post(),
               ask_for_picture(), use_picture(), stop_picture(), remove_picture(),
               update_agent_settings(), set_pictures_auto(), set_pictures_model(),
               set_pictures_quality(), Higgsfield's price for a picture from n8n's
               Pictures Price webhook, set_ads_source(), update_publishing_settings(), set_post_for_real(),
               set_competitor_tracked(), start_run_from_ads() then set_run_guidance() and
               the n8n webhook at the strategist
    n8n "QGR · Run pipeline" → Competitor Tracker → Ad Strategist → Content Agent,
        asking pipeline_next() before each of the last two
    n8n "QGR · Scheduled scans", hourly → start_due_scans() → each run → Run pipeline
    n8n "QGR · Publisher", every minute and on POST /webhook/qgr-publish →
        publisher_take_due() → each place, through its stand-in or for real →
        publisher_finish() or publisher_fail()
    n8n "QGR · Post results", every six hours → results_take_due() → each place's
        numbers from Meta or LinkedIn → results_record() or results_fail()
    n8n "QGR · Pictures", every minute and on POST /webhook/qgr-picture →
        reference_take_due() → each run's reference picture → Higgsfield's
        media_import_url → reference_ready(), reference_failed() or reference_release();
        picture_take_due() → each ad → picture_finish() or picture_fail(); on
        Higgsfield: its price → picture_higgsfield_begin() → sent once →
        picture_higgsfield_started(), _release(), _unknown() or _fail();
        picture_take_making() → each job → its file into ad-pictures →
        picture_higgsfield_finish(); and POST /webhook/qgr-picture-price →
        what one picture costs (get_cost: nothing is made)
    n8n "QGR · Moments", every five minutes and on POST /webhook/qgr-moments →
        moments_take_due() → each long video → Claude → moments_finish() or moments_fail()
    n8n "QGR · Leads", every fifteen minutes and on POST /webhook/qgr-leads →
        leads_sync_plan() → Zoho's lead fields, then its leads changed since → leads_record()
        or leads_sync_fail(); leads_take_due() → each lead → Claude → lead_judged() or lead_judge_fail()
    n8n "QGR · AI video", every minute and on POST /webhook/qgr-video →
        video_take_due() → each ask, through its stand-in or Higgsfield's MCP → video_started(),
        video_release(), video_unknown() or video_fail(); video_take_making() → each job →
        its file into ai-videos → video_finish() or video_fail();
        and POST /webhook/qgr-video-price → Higgsfield's price (get_cost: nothing is made);
        POST /webhook/qgr-video-prompt → Claude drafts an AI video's prompt from the
        transcript around a point → video_prompt_used()
    each agent → agent_begin() → Claude → agent_finish_*() or agent_fail()
    pages that show a moving run or post re-read it every 5 s (LiveRefresh)

- The browser never calls Supabase or n8n, with one exception: a file goes
  from the browser straight to Storage, through a link the server signs as the
  teammate for one path in their own folder (a clip through `/api/uploads`,
  the file a post goes out with through `/api/post-media`, a video, picture or
  music added to an edit through `/api/edit-media`, an AI video's first
  picture through `/api/video-refs`), because a 50 MB
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
- Each teammate's Profile (`/profile`, from the sidebar's name or its menu) is
  theirs alone, through Supabase Auth with their own session: the name
  (`user_metadata.full_name`), a photo (a 256-pixel square JPEG made in the
  browser, uploaded by the server as them to the private bucket
  `profile-photos` at `photos/{user}/{uuid}.jpg`, its path in
  `user_metadata.photo_path`, shown through a link signed for an hour), the
  email and the password, and Sign out everywhere. A new email or password
  asks for the current password first (checked by signing in with it). A new
  email changes only once the link Supabase sends is followed, which lands on
  `/auth/confirm` (open to the signed-out; it exchanges the link's code or
  token); that needs Supabase's emails to reach the address, and the site's
  `/auth/confirm` in Authentication → URL Configuration. Rules in
  `lib/profile-input.ts`, tested.

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
  `approve_variant`, `save_video_edit`, `save_variant_design`, `update_brand_profile`,
  `update_brand_memory`, `add_brand_example`, `remove_brand_example`, `remember_post`,
  `continue_run` and `report_continue_failure`, `set_run_pick_first`, `set_run_media`,
  `continue_with_ads`, `continue_with_angles`, `schedule_post`,
  `cancel_post`, `retry_post`, `reschedule_post`, `request_picture`,
  `ask_for_picture`, `use_picture`, `stop_picture`, `remove_picture`,
  `update_agent_settings`, `set_pictures_auto`, `set_pictures_model`,
  `set_ads_source`, `update_publishing_settings`, `set_post_for_real`,
  `set_competitor_tracked`, `create_long_video`, `ask_moments_again`,
  `remove_long_video`, `record_moment_run`, `start_run_from_ads`,
  `update_lead_criteria`, `set_leads_source`, `set_lead_verdict`,
  `judge_leads_again`, `set_post_link`, `video_budget`, `set_video_settings`,
  `ask_for_video`, `remove_ai_video`, `set_pictures_quality`, `save_long_video_edit`.
  The advisor warns
  that signed-in users can call them; that is the point, and the check inside
  is the guard. What only n8n calls (`agent_*`, `pipeline_next`,
  `start_due_scans`, `publisher_*`, `results_*`, `picture_*`,
  `prune_pictures`, `moments_*`, `leads_*`, `lead_judged`, `lead_judge_fail`,
  `video_take_due`, `video_started`, `video_release`, `video_unknown`,
  `video_fail`, `video_take_making`, `video_finish`, `video_prompt_used`, `reference_*`; the picture ones include
  `picture_release`, `picture_in_flight`, `picture_not_made`,
  `picture_higgsfield_*` and `picture_take_making`) is granted to the service
  role alone. The service role has no use of the private schema, so a helper
  n8n's functions call lives in public, granted to it alone, and one that
  needs a private function (`picture_higgsfield_begin`, for the month's
  spending) runs as its owner (`security definer`).
- Clips live in the private bucket `run-media` (50 MB a file, video types
  only) at `uploads/{uploader}/{uuid}.{ext}`. Storage policies: a member reads
  any clip, uploads only into their own folder, and removes only their own
  clips that no run uses (a clip cut again or taken away). `create_run` checks
  the clip has finished uploading; any teammate's clip may start a run, so
  anyone can retry one. A clip a run uses is never replaced or removed.
- Screenshots of competitors' ads live in the private bucket `competitor-shots`
  (10 MB; PNG, JPEG or WebP) at `shots/{uploader}/{uuid}.{ext}`. A member reads
  any and uploads only into their own folder; the uploader removes one only
  while no run names it (`runs.files`). `create_run` checks a screenshot run's
  files are there.
- The file a post goes out with lives in the private bucket `post-media` (50 MB,
  JPEG or MP4) at `posts/{uploader}/{uuid}.{ext}`. A member uploads only into
  their own folder and removes a file only while no post waits on it; n8n
  removes it once the last place has it (`publisher_finish` returns
  `remove_media`), since each platform keeps its own copy.
- A file added to a video edit (another video, a picture, music) lives in the
  private bucket `edit-media` (50 MB; MP4, WebM, MOV, JPEG, PNG, WebP, MP3,
  M4A, AAC, WAV, OGG) at `media/{uploader}/{uuid}.{ext}`. A member reads any
  and uploads only into their own folder; the uploader removes one only while
  no saved edit names it (the editor takes back what it uploaded and the
  saved edit left out). `save_video_edit` refuses an edit naming a file not
  in the bucket.
- An ad's picture lives in the private bucket `ad-pictures` (10 MB, PNG, JPEG
  or WebP) at `pictures/{variant}/{uuid}.{ext}`, uploaded by n8n alone. A
  member reads any, and removes only one no variant shows and no variant keeps
  to choose again (`variant_pictures`); n8n removes those past the eight kept.
- An AI video lives in the private bucket `ai-videos` (200 MB, MP4) at
  `videos/{id}.mp4`, uploaded by n8n alone; a member reads any. Its first
  picture lives in `video-refs` (10 MB; PNG, JPEG or WebP) at
  `refs/{uploader}/{uuid}.{ext}`: a member reads any, uploads only into their
  own folder, and removes their own only while no video was asked from it.
  `ask_for_video` checks the picture is there.
- A run's reference pictures for Higgsfield live in the private bucket
  `run-refs` (10 MB; PNG, JPEG or WebP) at `refs/{uploader}/{uuid}.{ext}`: a
  member reads any and uploads only into their own folder; the uploader
  removes one only while no run names it (`run_references`). `set_run_media`
  checks each is there.
- The tests run every migration in PGlite, with stand-ins for Supabase's
  roles, `auth.uid()` and storage (`test/supabase.ts`):
  `supabase/access.test.ts` checks who can read and change what,
  `supabase/posts.test.ts`, `supabase/agents.test.ts` and
  `supabase/pictures.test.ts` the posts, the switches, the scan schedule and
  the pictures, `supabase/ai-videos.test.ts` AI video's asks, limit and
  retries, `supabase/higgsfield-pictures.test.ts` Higgsfield's pictures and
  the limit they share with videos, `supabase/run-media.test.ts` what a run's ads are made of, its
  references and its per-ad videos, `n8n/pipeline.test.ts` takes each kind of run through all three
  agents' scripts against them, with Claude's answers as fixtures,
  `n8n/publisher.test.ts` a post, its results and a picture through their
  workflows, and `n8n/ai-video.test.ts` and `n8n/pictures-higgsfield.test.ts`
  AI video's and Higgsfield pictures' scripts against Higgsfield's answers.
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
  (`qjRr2WxZvDz1WdQO`, every minute and webhooks `POST /webhook/qgr-picture` and
  `POST /webhook/qgr-picture-price`),
  Moments (`V0z80vJq8ZJ7YLXE`, every five minutes and webhook `POST /webhook/qgr-moments`),
  Leads (`bE0n6UONyx22rYxs`, every fifteen minutes and webhook `POST /webhook/qgr-leads`),
  AI video (`tsZjQUQ0TEajMs3h`, every minute and webhooks `POST /webhook/qgr-video`,
  `POST /webhook/qgr-video-price` and `POST /webhook/qgr-video-prompt`).
- The agents' logic is `n8n/code/*.js`, tested by `n8n/code.test.ts` and
  `n8n/publisher.test.ts`. `node n8n/build-workflows.mjs
  --ids=tracker=…,strategist=…,content=…,pipeline=…` embeds it into SDK source
  in `n8n/workflows/`, which is what gets validated and saved through the n8n
  MCP. Change the script, test, rebuild, then update the workflow; an edit made
  only in n8n drifts from the repo. The MCP's parser refused a new workflow
  whose Code nodes held the scripts (Leads, 2026-10-20): it was created with
  stub code, then each node's `jsCode` was set with `setNodeParameter` from
  the script's JSON string, which is also how a script change is easiest
  applied.
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
  that step does not run, and the studio says so), `Facebook Graph API` (the
  Page's access token: it posts to the Page and its Instagram account and reads
  their numbers; on "Facebook: post", the four Instagram steps and "Meta: its
  numbers"), `LinkedIn Community Management` (LinkedIn Community Management
  OAuth2 API, from an app LinkedIn has approved for its Community Management
  API, connected by an admin of the Page; on every LinkedIn step and
  "LinkedIn: its numbers") and `Zoho` (Zoho OAuth2 API, for the region the
  team's Zoho is in, connected by a Zoho admin; on "Zoho: the lead fields" and
  "Zoho: the leads" in Leads) and `Higgsfield` (MCP OAuth2 API, signed in to
  the team's Higgsfield account; on every "Higgsfield:" step in AI video and
  Pictures).
  Until a platform's credential is attached, its
  steps do not run and each post or read says so. Nothing that posts or draws
  is kept in Supabase or the app (the Cloudflare account ID is: it is an ID,
  not a secret).
  A node holds its credential by id, so renaming one in n8n changes nothing
  (the webhook secret is "Header Auth account 2", on every webhook).
- A node names its credential only once that credential exists in n8n: a
  reference to a missing one fails every run before it starts, even a test
  with pinned data ("uses invalid credential").
- Placeholders. The tracker's "Sample ads" returns the same example ads for
  every competitor, in the shape "Read Apify's ads" gives, and the report is
  marked `data_source: placeholder`; it runs while the team's ads source is
  sample. "Image model (stand-in)" in Pictures is the way taken while pictures
  are set to the stand-in: it makes nothing and answers `stand_in: true`, so
  the studio says no picture was made. The publisher's "Facebook (stand-in)",
  "Instagram (stand-in)" and "LinkedIn (stand-in)" are the way taken while a
  place is not switched to post for real: they post nothing and answer
  `stand_in: true`, so the dashboard says nothing went out, and nothing is read
  for their results. "Higgsfield (stand-in)" in AI video is the way taken
  while AI video is off: nothing is sent or spent, and the ask is recorded as
  nothing made. The node's comment and the note beside it say what they are.

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
  (`pictures_auto`), what makes pictures (`pictures_model`: stand-in,
  cloudflare, with `cloudflare_account`, or higgsfield, with
  `pictures_quality`), where the tracker reads ads
  (`ads_source`), the scan schedule (`scan_every` off, day or week, with
  `scan_day` and `scan_hour`), the Pages posts go to and whether each posts
  for real (`facebook_live`, `instagram_live`, `linkedin_live`). Settings
  changes it through `update_agent_settings`, `set_pictures_auto`,
  `set_pictures_model`, `set_pictures_quality`, `set_ads_source`,
  `update_publishing_settings` and `set_post_for_real`; Home's agent cards flip the same switches.
- A switch holds what follows, never the agent a run starts at. With the
  strategist's off, every finished scan waits before the strategy; with the
  Content Agent's off, every strategy waits before the ads. The pipeline asks
  `pipeline_next(run, stage)`, which with the switch off marks the stage
  waiting (`run_stages.waiting_since`: its status stays `queued`, and
  `agent_begin` refuses it) and says so on the run. The go-ahead on the run
  page is `continue_run`, which clears it and returns the stage, and the app
  starts the pipeline from there. The same call runs a failed agent again
  where it stopped. "Waiting" is derived in `lib/data/map.ts`, like every
  status (rule 1). A waiting stage with something to pick from shows the
  same pickers a run that picks first does (below); "Use all" is the
  go-ahead as before.
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
  pasted link to the library as it is; for a website (or a run from the
  uploaded ads the start card once took, which were only ever file names), a
  keyword search for the competitor's name. A run from screenshots reads those
  whichever source is chosen (below). A link to another library
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
- The report keeps every ad the tracker read (`competitor_ads`, up to 60, in
  its order: longest-running first), with its headline, call to action, the
  angle Claude gave it and, from screenshots, the screenshot. Reports from
  before kept four examples.

### Screenshots and chosen ads (`competitor-shots`, `start_run_from_ads`)

- A competitor run can start from screenshots of their ads (the start card's
  "Screenshots of their ads": pasted, dropped or picked, up to ten, each
  uploaded at once to `competitor-shots` through `/api/competitor-shots`). The
  run's input is `upload`, its files the screenshots and its competitor the
  name the team typed. In the tracker, "Screenshots?" sends it past the ad
  sources: "Sign the screenshots" signs them for 15 minutes, and the request
  hands Claude each one by its link after its number, asking it first to read
  every ad out of them (`ads_read`: the words as written, headline, button,
  platform, format) and then to report as on any ads. Nothing is guessed:
  words cut off are left out, and an ad's days running are counted in code
  only from a start date the screenshot shows (Meta's Ad Library's "Started
  running on"); otherwise they are not known (`days_known`), and the
  dashboard and the agents say nothing in their place. The report says it was
  read from screenshots (`data_source: upload`). A competitor known only from
  screenshots has no website to scan: "Add screenshots" starts another run.
- On the competitor page, any few of the latest report's ads (up to 20) can be
  ticked and made into a run ("Make ads from these"): `start_run_from_ads`
  records it with the report it came from (`runs.source_report_id`) and the
  ads chosen (`runs.chosen_ad_ids`), the tracker skipped, and the app starts
  the pipeline at the strategist. `agent_begin` hands that report and the
  chosen ads, in the order chosen, to the strategist and the Content Agent;
  the strategist builds its angles on them first (`competitor_report.
  chosen_ads`, with one rule), the Content Agent reads their words. Without
  chosen ads both requests are exactly as before (`n8n/code.test.ts`).
- The same choice is in "Make ads from these": the run can wait after the
  strategy for the angles (Picking inside a run below).
- Tested in `supabase/competitors.test.ts` and end to end in
  `n8n/pipeline.test.ts`; the screenshots' signing answer follows Storage's
  batch signing endpoint (`[{ path, signedURL, error }]`): check the first
  real run's against `tracker-screenshot-ads.js`.

### Picking inside a run (`runs.pick_first`, the run page)

- Start run asks before anything is saved (`RunQuestions`, a dialog; Back
  keeps the form): straight through, or "Let me pick the ads and angles"
  ("the angles" on a custom run or one from chosen ads, which have no report
  of their own); and what the ads are made of (below). Picking is kept as `runs.pick_first`, set by
  `set_run_pick_first` right after the run is created and only while no agent
  has started; Start over carries it.
- `pipeline_next` holds such a run before the strategist when its own report
  has ads and none were chosen, and before the Content Agent, as a switch
  that is off does (`waiting_since`, with its own event). The switches still
  hold everything else as before.
- The run page shows what the waiting agent can be given (`getRunPicks`: the
  run's own report's ads, signed screenshots included, or its strategy's
  angles): ticks, then "Build the strategy from these" or "Write the ads from
  these", and "Use all". `continue_with_ads` keeps the ads picked, in the
  order ticked, as `runs.chosen_ad_ids` (up to 20; all or none is null), which
  `agent_begin` already hands the strategist and the Content Agent;
  `continue_with_angles` keeps the angles picked as `runs.chosen_angle_ids`
  (all three or none is null). Each clears the wait and returns the stage,
  and the app starts the pipeline there, as `continue_run` does.
- The Content Agent always writes three variants. With angles picked,
  `agent_begin` hands their positions (`chosen_angles`) and both its scripts
  spread A, B and C over them, `Math.floor(i * n / 3)`: one angle gets three
  takes on it, two get two and one (the first picked in strategy order gets
  two). The request sends only the angles picked; each variant is named after
  its angle, which is how the studio finds its chain. Without picks the
  request is exactly as before (`n8n/code.test.ts`). The run page says what
  the picks come to before they go (`angleSpreadSaid` in `lib/pipeline.ts`).
- A run built on chosen ads (`source_report_id`) says so as before
  (`chosenAds`); ads picked while a run waited are `picked.ads` instead, and
  each stage card says what it worked from.
- Tested in `supabase/agents.test.ts` and end to end in
  `n8n/pipeline.test.ts`.

### What the ads are made of (`runs.ai_media`, `run_references`)

- The same question (`MediaChoice`, also in "Make ads from these") asks what
  the ads are made of: the drawn design (the words on QGR's own artwork,
  free), an AI picture for each ad, or an AI video for each ad. It starts on
  what the team's picture switch would do. A run from a clip is not asked,
  and `set_run_media` refuses it anything but the design: its ads are the
  clip. A run nobody asked (a scheduled scan, a run from before) has no
  answer (`ai_media` null) and follows the switch as before.
- Up to four reference pictures, each uploaded at once to `run-refs`
  through `/api/run-refs`, with a line on what it shows (120 characters):
  the office, a project site, a brochure, a look. They are for pictures and
  video only. The card keeps the answer and its uploads (`MediaDraft`), so
  Back and a start that fails keep them; Start over carries them, pricing a
  video again (`answerOf`).
- The question shows Higgsfield's price for the three ads, asked as Settings
  asks it (nothing is made), with what this month's limit still allows and
  what is left on the plan; the sample data prices nothing. Pictures: GPT
  Image 2.5 at the team's quality whenever the run has references (the other
  models take none, `picturesBy`), else the team's model (Cloudflare's free,
  or the stand-in, which makes none and says so). Video: Seedance 2.0 Mini,
  silent, from no first picture, at a length (4, 5, 8, 10 or 15 s), 480p or
  720p and a shape the team picks; only while AI video is on. References do
  not change either price (measured 2026-10-20).
- The server asks a video run's price again before the run is recorded, and
  refuses one that would take the month past the limit; `set_run_media`
  keeps the answer, the references and the price (`runs.ai_video`) and
  holds the limit again. It is set right after the run is created, only
  while no agent has started, and the pictures workflow is pinged so the
  references reach Higgsfield at once.
- "QGR · Pictures" imports each reference into Higgsfield once
  (`reference_take_due`, `media_import_url`, free; `reference_ready` keeps
  its media id), through a link Storage signs for 15 minutes. One Higgsfield
  could not be reached for is taken again, three tries at most; one it
  refused is marked failed, and the run goes on without it. Pictures and
  videos of a run wait while any of its references is still waiting, then
  every one is sent with the ready ones as `image_references`; a picture
  ask then goes to Higgsfield whatever the team's model.
- The Content Agent is told the references by number and what each shows,
  and names them in its prompts ("reference 1"). On a video run it also
  writes each ad's `video_prompt` (one continuous shot, for the run's length
  and shape), and as each ad is saved a trigger asks Higgsfield for its video
  (`ai_videos.variant_id`), held to the month's limit: one that would pass it
  is recorded as not asked, and the run says so. A video run asks for no
  pictures. Without references or a video run every request is as before
  (`n8n/code.test.ts`).
- The run page says what the ads are made of and shows the references with
  where each stands. In the studio each ad of a video run says while its
  video is being made (the page re-reads), or why it was not, and stays the
  drawn design meanwhile; once made, the video is the ad's clip
  (`clipOfVideo`): it previews, edits (`save_video_edit` holds the edit to
  its length) and posts as a clip run's do.
- Tested in `lib/run-media.test.ts`, `supabase/run-media.test.ts` and the
  n8n tests above; the sample data has a video run with a reference
  (`r-1046`), its ads' videos ready, being made and refused.

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
- A post can end with the team's link (Leads, Setup: `team_settings.post_link`),
  tagged with its run, variant and place (`utm_campaign=qgr-<run>`,
  `utm_content=<label>-<place>`), so a lead who follows it is tied back to
  that variant. The publish dialog asks per post and shows the words with the
  link; `schedule_post` adds it (a place with `"link": true`, never Instagram,
  whose words take no link anyone can follow) through `private.tagged_link`,
  which `taggedLink` in `lib/leads.ts` matches.
- Post now pings the publisher's webhook (`N8N_PUBLISH_WEBHOOK_URL`, or the
  run webhook's address with `qgr-publish`), so it goes within seconds rather
  than at the next minute.
- Posting for real is switched per place (Settings, Where posts go:
  `team_settings.facebook_live`, `instagram_live` and `linkedin_live`, through
  `set_post_for_real`, which needs the place's Page or account first; the
  switch says what the place needs in n8n and asks once more before it turns
  on). `publisher_take_due` hands each place its switch (`live`), and "Post for
  real?" sends it to its stand-in or to its real steps. For real, the file is
  signed for an hour (`object/sign/post-media`, "With its link") so the
  platform, or n8n for LinkedIn, can fetch it, then:
  - Facebook: one request to the Page (Graph API v25.0, pinned): a picture to
    `/photos`, a video to `/videos` on graph-video, words alone to `/feed`.
  - Instagram: a container from the file (a picture, or a video as a Reel),
    checked after 10 s (60 s for a video) and then once a minute for five
    minutes at most, as Meta asks ("Publish, wait or stop?" loops back to the
    wait), published once FINISHED, and its link read after.
  - LinkedIn (`LinkedIn-Version` 202609, pinned; LinkedIn keeps a version a
    year): the picture or the video is uploaded first (a video in the parts
    LinkedIn asks for, each read from Storage with a Range request, then
    checked once a minute until AVAILABLE, since a post whose video then fails
    is never shown), then `/rest/posts` names it, as the Page. The words are
    escaped for LinkedIn's little text format, so they read as written.
  Every answer is read in code (`n8n/code/publisher-*.js`, tested in
  `n8n/publisher.test.ts` with the platforms' answers as fixtures): posted with
  its link, failed (nothing went out, and why: Try again), or unknown when the
  request went and its answer was lost (rule 11; Instagram's PUBLISHED too). A
  step whose credential is not attached hands its input on, which reads as
  "not asked". The publish dialog marks each place "Goes out for real" or
  "Stand-in", and Settings shows each as posting for real, for real but not
  tried yet, or a stand-in.
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
  One request a post ("Plan the read", `n8n/code/results-plan.js`): on
  Facebook a post's shares, comments, reactions and insights (`post_media_view`,
  `post_total_media_view_unique`, `post_clicks`: Meta's impressions metrics
  went in 2025) or a video's `video_insights`; on Instagram the media's
  insights (reach, views, likes, comments, shares); on LinkedIn the post's
  `organizationalEntityShareStatistics`. "Read the numbers" takes each by its
  name, so one a platform drops leaves the others. A failed read keeps the
  numbers before it and says why (`results_fail`). A stand-in post has none. Engagement is reactions, comments, shares and clicks
  per person reached (per view where there is no reach), computed in code,
  never by a model: `lib/results.ts` for the dashboard and the strategist's own
  script for its prompt, kept in step by `n8n/code.test.ts`. Posts shows each
  place's numbers and a Results view (totals, engagement by angle, every place
  measured). `agent_begin` hands the strategist the team's recent results; its
  material then carries the best five and weakest three (`our_past_posts`), and
  with none the request is exactly as before.
- Tests (`?view=tests`, `lib/ab-tests.ts`, pure and tested): every place two
  or more variants of one ad set went, or go, to for real, the variants side
  by side with their engagement there (their posts there added up). A variant
  is marked as leading only when it is ahead of the next best by more than
  chance would explain at the reach both have had: a two-proportion z-test at
  95% on engagements per person reached, each having reached at least 100
  people (`MIN_REACH`). Until then a test says how many people each needs to
  reach for the gap it shows to count if the rates held (2·1.96²·p(1−p)/(p₁−p₂)²,
  rounded), or what it waits for (numbers, or a variant still to go out).
  Computed from the platforms' counts, never by a model; a place that went
  through a stand-in, failed or was cancelled is no part of a test. On a phone
  the Posts views scroll within their switch, the current one kept in sight
  (`ScrollingNav`).
- Text a client component renders must be the same on the server and in the
  browser: day and month names are spelled out in code (`dayLabel`), because
  Node and Chromium disagree on Intl's short forms (`Mon 28 Sep` against
  `Mon, 28 Sept`), which is a hydration error.

### Pictures (`ad_variants.picture_*`, "QGR · Pictures")

- Every ad but a clip's carries an `image_prompt` from the Content Agent (the
  scene only: no words, the brand's colours, no identifiable people, no
  flags). The studio's Picture dialog (`PictureDialog`) shows it to edit and
  makes a picture from what is written there (`ask_for_picture`: the prompt
  becomes the variant's, up to 1,200 characters). Every new ad asks for one as
  it is saved (a trigger on `ad_variants`) when its run asked for AI pictures
  at Start run, or, on a run nobody asked, while the team's switch is on
  (Settings, Agents). The Content Agent makes none itself: a picture takes its
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
  most) at once when the app pings `qgr-picture`, otherwise within the
  minute, each with its prompt, the brand's picture style (`look`), the
  team's image model and quality, and the path to upload to. `picture_finish` keeps every
  picture that arrives: one that answers the open ask is shown under the ad's
  words from then on and takes an approval back; one for a variant scheduled
  meanwhile, or whose ask was stopped, only joins the others (what was
  approved is what goes out). The same answer twice is kept once.
  `picture_fail` keeps the reason.
- The image model is the team's choice in Settings, Agents (`pictures_model`,
  `set_pictures_model`): the stand-in, Cloudflare Workers AI's FLUX.1
  schnell on the account named there, or Higgsfield (below); a run with
  reference pictures has Higgsfield make its pictures whatever the choice. "Real pictures?" sends a Cloudflare ask
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
- Higgsfield draws with GPT Image 2.5 through its MCP, signed in with the
  team's own account (as AI video does), square at 1k and the team's quality
  (`pictures_quality`: low, 0.25 credits a picture on 2026-10-20; medium;
  high): one picture serves Meta's square and LinkedIn's wide frame, as
  Cloudflare's does. Settings and the Picture dialog show what one costs and
  the credits left on the plan ("Price", `qgr-picture-price`, get_cost:
  nothing is made), and Settings what a run costs when every new ad asks.
  For each ask "QGR · Pictures" writes the same prompt Cloudflare gets
  (`pictures-prompt.js`), asks the price, records the send against the
  month's one Higgsfield limit (`picture_higgsfield_begin`, a row in
  `higgsfield_pictures`; past the limit nothing is sent and the ad says why),
  then sends it once:
  - Answered with a job: `picture_higgsfield_started`.
  - Refused: `picture_higgsfield_fail`, nothing was made.
  - Not reached at all: `picture_higgsfield_release`, and the ad is taken
    again at the next run, three tries at most (`picture_release` does the
    same when the price could not be asked).
  - Any other trouble after sending: `picture_higgsfield_unknown`, never sent
    again by itself; a send with no answer for ten minutes, or a job not done
    in thirty, becomes unknown too (`picture_take_making`). The ad says to
    check Higgsfield's history before asking again.
  - Jobs are checked every minute, each at most every 20 s
    (`picture_take_making`, `job_status`). A finished picture is fetched,
    typed by its file's type (else its link's ending: PNG, JPEG or WebP
    only), stored in ad-pictures with that extension and recorded as any
    picture is (`picture_higgsfield_finish` → `picture_finish`).
  - An ad whose picture Higgsfield has is never taken again
    (`picture_in_flight`), whatever its claim says. A picture stopped or asked
    again meanwhile is kept with the ad's others when it arrives.
  - A preset Higgsfield offers in place of the prompt (as it does for videos,
    AI video below) is read as nothing made, with the reason; pictures have
    never been offered one, so they are not asked again as written.
  - Checked with the first real picture (2026-10-20, 0.25 credits, the plan
    charged exactly that): the send answers `results[0].id` as the job;
    `job_status` answers `generation.status` (queued for about six minutes,
    then completed) with `results.rawUrl`, the full PNG (1.1 MB), and
    `minUrl`, a small WebP preview, which is never taken. With a reference
    (2026-10-21, three pictures, about a minute each), `generation.params`
    echoes the request, the reference's link among its `medias`: links are
    read from what was made only (`madeLinks`), since the first run took the
    reference for the picture and stored it three times. These answers are the
    fixtures in `n8n/pictures-higgsfield.test.ts`.
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
- The timeline (`lib/video/timeline.ts`, pure and tested) makes an edit a
  sequence of pieces played one after another: parts of the run's clip (in
  any order, any speed from 0.5× to 2×, each its own volume), other videos,
  pictures and title cards. Each piece has its effects (ten filters,
  brightness, contrast, colour, a punch-in, a slow zoom or pan, mirror, a
  blurred fill, vignette, grain) and the transition into it (cut, cross-fade,
  through black or white, four slides, two wipes, zoom, circle, blur). Over
  the video: texts with a place, a style, a size and how they come in, a
  caption style (boxed, bold, word by word, minimal), a progress bar; under
  it, music, faded and quieter while a clip speaks. Up to 40 pieces, 30 texts
  and ten minutes. Without a sequence, `keep` is the sequence, so every edit
  from before reads as it did; with one, `keep` is derived from it for the
  database, and `compactEdit` saves a plain cut as `keep` alone. Captions show
  wherever a piece of the run's clip plays, never over another video or a
  picture. Overlays, the words' `until` and the cover are in the edited
  video's seconds. A sped-up or slowed piece plays silent.
- The editor opens before a run too: on the start card once an uploaded clip
  is ready, and on a long video's moment ("Edit video", which cuts the moment
  on this computer first and reuses that cut for Make ads). It plays the
  clip from the browser's own copy, so it works on the sample data as well,
  and shows "Each ad's words show here" where the agents' words will go.
  "Use this edit" hands the edit back rather than saving it: it goes with the
  clip into the run (`Clip.edit`, kept in `runs.media.edit`, checked by
  `parseClip` and, in live mode, every file it names checked in edit-media).
  Every ad without an edit of its own starts from it (`toAdSet`, `editOf`);
  an ad's own edit, saved in the studio, takes its place, and "Whole clip,
  no edits" is then saved as such rather than as nothing.
- One function draws a frame (`lib/video/compose.ts`, from the pieces in
  `lib/video/draw.ts`): the studio's preview (`useEditedVideo`, a <video> per
  file, two per file so the next piece waits ready) and the exported file
  (`renderTimeline`: a decoder per piece, opened as it comes on screen, the
  sound mixed ten seconds at a time in an OfflineAudioContext) are both drawn
  by it, so what is seen is what is exported. Its sound rules (`pieceGainAt`,
  `musicGainAt`) drive both too. Filters are the canvas's own (`ctx.filter`):
  a browser without them shows and exports the pieces unfiltered, so the
  filtered look is checked in Chrome or Edge.
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

### Movable words and logo (`lib/creative/design.ts`, `lib/spot.ts`)

- A spot is where a thing sits: its centre as a share of the frame's width
  and height, and its size against its usual one (0.4 to 3), so it holds on a
  preview and on the full-size file alike (`lib/spot.ts`, `clampSpot`).
- A picture ad's own layout (`ad_variants.design`, `CreativeDesign`): whether
  its logo shows, up to six texts a person adds (120 characters each; gold,
  white, indigo or on a band) and the spots of the words, the logo and each
  text, kept per shape (Meta's square, LinkedIn's wide), since a place that
  suits one rarely suits the other. Anything without a spot sits where the
  style puts it, so a plain design (saved as null) draws exactly as before.
  `parseDesign` is the app's check, `save_variant_design` the database's; a
  new layout takes an approval back and waits while a post waits (rule 10).
  The texts added are flagged like any words (`designWarnings`).
- `drawCreative` draws the layout and returns where it drew each thing (`Hit`).
  The studio's "Design…" (`DesignEditor`) draws with it, so what is moved is
  what is posted; a variant with a layout shows in the studio's previews as
  that drawing (`CreativeCanvas`) rather than the CSS design, and its words
  are changed there. The publish dialog draws the posted file with the same
  layout.
- The video editor: the variant's words (`text.spot`), the logo (`logoSpot`,
  only while the logo shows) and each text over the video (`overlay.spot`)
  take a spot when dragged on the paused preview; picking a place or a corner
  puts them back there. `drawTimelineFrame` returns where it drew them, which
  `useEditedVideo` keeps while paused for the handles; the export draws the
  same frame. The logo dragged away from its corner no longer pushes the
  words down.
- The handles are one component (`components/ui/DragLayer.tsx`): a button over
  each thing drawn, dragged with the pointer or nudged with the arrow keys
  (Shift for further), with the picked thing's size and "back in its place"
  beside the picture.

### AI videos in an edit (`ai:<id>`, cutaways, the editor's AI video tab)

- Any video edit (an ad's, a clip's before its run, a moment's, a long video
  whole) can take an AI video from the library, named `ai:<id>` in the edit
  and linked, never copied: inserted at the playhead (`insertAt`: the piece
  under it splits, what follows plays later) or over the video for a stretch
  (a cutaway, `edit.cutaways`, up to 20, never overlapping: silent, the
  sequence's sound goes on under it, B-roll over a talk; `addCutaway`,
  `moveCutaway` in `lib/video/timeline.ts`, tested). Its length and size are
  known before it is made (`aiMediaOf`), so it goes in while Higgsfield makes
  it: the preview shows it as on its way, the strip has a lane for cutaways,
  and the editor asks how the edit's AI videos stand every 15 s while one is
  being made (`aiStates` in `lib/video/ai-pieces.ts`, tested). One not made
  is named with why and a way to take it out. Nothing is exported, and no run
  starts from an edit (`createRun`), until every AI video in it is made.
- The tab (`AiVideoPanel`) puts one in from the library or makes one there,
  in the edit's shape near enough (`shapeForEdit`), silent, priced by
  Higgsfield first and held to the month's limit, made only on Generate
  (rule 12). "Write it from what's said here" sends the transcript lines
  within 45 s of the playhead (`linesAround` in `lib/video-prompt.ts`) and the
  person's idea to n8n's Prompt webhook: Haiku 5.5 at low effort drafts one
  shot (no face shown, no words or flags, no promised outcome), the person
  edits it; nothing goes to Higgsfield, and what the call cost is kept
  (`video_prompt_usage`, on failure too). Checked with one real call
  (2026-10-21: 797 tokens in, 224 out).
- `private.check_video_edit` holds every saved edit (`save_video_edit`,
  `save_long_video_edit`): an `ai:` file must be in the library and asked,
  being made or made. The library keeps a video any edit uses
  (`remove_ai_video`, `private.edit_uses`), and edit-media keeps a file a
  long video's or a run's edit uses. Links to made AI videos are signed in
  `ai-videos` by `signEditMedia`.
- Tested in `supabase/edits.test.ts`, `lib/video/timeline.test.ts`,
  `lib/video/ai-pieces.test.ts`, `lib/video-prompt.test.ts` and
  `n8n/ai-video.test.ts`.

### Long videos (`/videos`, `long_videos`, "QGR · Moments")

- A long recording (a webinar, a talk: up to three hours) is turned into
  short ads without ever being uploaded. The browser reads its sound five
  minutes at a time with Mediabunny (only the bytes it needs, never the whole
  file in memory), mixes it to 16 kHz mono and hands each piece to one
  Whisper worker, which keeps the model loaded (`lib/speech-long.ts`); lines
  come back as each piece is heard. Only the transcript is kept
  (`create_long_video` through `POST /api/long-videos`, a route because three
  hours of transcript is past a server action's 1 MB). Rules in
  `lib/long-video.ts`, tested.
- "QGR · Moments" (Haiku 5.5, medium effort) reads the transcript one
  numbered line at a time and names five to ten moments by their first and
  last line, with a title, why and a hook. Times are never asked of the
  model: they are the lines' (`moments-read-answer.js` drops one outside the
  transcript, under 8 s, over 150 s or overlapping a stronger one, and flags a
  hook; `moments_finish` works the times out again). Usage goes to
  `long_video_usage`, on failure too. The app pings `qgr-moments` when a video
  is kept, so the moments come within a minute or two; the page re-reads
  while it waits.
- The moments page (`/videos/long/[id]`) plays the file from the computer
  (kept in the tab, `lib/video/local-files.ts`, or picked again and known by
  its size and length), lets the team nudge a moment a line at either end,
  add one of their own from the transcript, and tick them. "Make ads" cuts
  each ticked moment in the browser (`render`, aimed under 45 MB), uploads it
  as an ordinary clip and starts an ordinary custom video run (notes: what is
  said; captions: the moment's lines in the clip's seconds; direction: the
  team's plus the moment's hook), then `record_moment_run` keeps the run on
  its moment (a nudged one becomes the team's own). Re-asking keeps the
  moments ads were made from and the team's own.
- "The whole video, edited" (`WholeVideoCard`): the editor opened on the
  whole file on this computer, to cut it down and put AI videos in; only the
  edit is kept (`long_videos.edit`, `save_long_video_edit`, held to the
  video's length), so the work survives a reload while its AI videos are
  made. From it the finished video is made in the browser: downloaded at any
  length, or, up to ten minutes, made under 50 MB (1280 on its long side,
  `bitrate` aimed at 45 MB) and uploaded as a clip that starts an ordinary
  run, its transcript carried through the edit (`transcriptThroughEdit` in
  `lib/long-video.ts`, tested) for the captions and notes.
- The sample data has one long video (a 40-minute webinar transcript) and
  picks moments by their place in the video (`sampleMoments`), saying so.
  Its example has no file, so the whole-video edit shows on a long video
  started on the sample data; the prompt writer gives an example there and
  says so, and the sample AI video can be put in.

### AI video (`/videos?view=ai`, `ai_videos`, "QGR · AI video")

- A video is made by Higgsfield from a prompt, a model, a length, a shape, a
  quality, sound or not, and for two models a first picture (its first frame).
  The models, and what each takes, are Higgsfield's own as its MCP gave them
  (`models_explore`, 2026-10-20), in `VIDEO_MODELS`: Seedance 2.0 Mini (4 to
  15 s, 480p or 720p, a picture: the cheap one, for tries), Kling 3.0 (3 to
  15 s, Standard or Pro, a picture) and Seedance 2.5 (5 to 15 s, up to 1080p,
  the prompt alone). `parseVideoRequest` is the app's rule, tested;
  `ask_for_video` and the table's check hold it again. The page starts on the
  cheapest: Seedance 2.0 Mini, 4 s, 480p, no sound.
- n8n asks Higgsfield through its MCP (`mcp.higgsfield.ai`), signed in with
  the team's own Higgsfield account: not the API, which bills separately. The
  MCP always spends the plan's credits, Unlimited or not (Higgsfield's
  Unlimited applies on its own site only), so every video costs. A video is
  made only when a person asks: Generate here, or AI video chosen at Start
  run, priced there, one for each of the run's ads (What the ads are made of
  above).
- Higgsfield's price shows before Generate. The page asks for it a moment
  after each change (`priceVideoAction` → "Price", `generate_video` with
  `get_cost`, which makes nothing and spends nothing, measured: 280 credits
  before and after), with the credits left on the plan (`balance`). A price
  is shown only for the settings it was asked for. The words of the prompt do
  not change it, so they do not ask again.
- Higgsfield may answer a video's price or its ask with one of its presets in
  place of the prompt ("looks like the Higgsfield preset IN THE DARK … generate
  literally"), and then nothing is priced or made: on 2026-10-20 it did for
  every video prompt tried, never for a picture. The team asked for its own
  prompt, so "Decline a preset" asks the same request once more with
  `declined_preset_id` (`video-as-written.js`, after each `generate_video`
  step); offered again, nothing was made and the page says so. A preset's id
  is never read as a job (`presetNotice` in `video-mcp.js`).
- AI video is off until the team switches it on (Settings, AI video:
  `team_settings.videos_live`, through `set_video_settings`, which asks once
  more first). Off, Generate goes through "Higgsfield (stand-in)": nothing is sent
  to Higgsfield or spent, and the library says nothing was made. On, the
  server asks Higgsfield's price again rather than take the page's, and
  `ask_for_video` refuses an ask that would take the month past the team's
  limit (`videos_cap`, 100 credits to start). It is the team's one Higgsfield
  limit: pictures made by Higgsfield count against it too (Settings,
  Higgsfield, which shows how much went on pictures). The month counts in the
  team's time zone (`private.videos_spent`, videos and pictures): every ask
  waiting, being made, made or unknown counts; one that failed or was stopped
  does not. Four wait at once
  at most.
- "QGR · AI video" sends each ask once (`video_take_due`, `skip locked`).
  - A first picture is signed for 15 minutes and imported first
    (`media_import_url`).
  - Answered with a job: `video_started`.
  - Refused: `video_fail`, nothing was made.
  - Not reached at all (the MCP step handed its input on): `video_release`,
    and it waits for the next minute, three tries at most.
  - Any other trouble after sending: `video_unknown`, never sent again by
    itself, because Higgsfield says a submission whose answer was lost may have
    gone through. A person checks Higgsfield's history. An ask claimed and
    never answered in ten minutes becomes unknown too.
  - Jobs being made are checked every 45 s (`video_take_making`,
    `job_status`). A finished one's file is fetched, stored in `ai-videos` and
    recorded (`video_finish`); a failed one says why (Higgsfield's refusals of
    a prompt or a picture in plain words). Still making after two hours, it is
    unknown.
  - Every Higgsfield step reads its answer in code
    (`n8n/code/video-*.js`), tested in `n8n/ai-video.test.ts`. The workflow
    keeps no execution data for runs that succeed.
  - Checked with the first real video (2026-10-20: Seedance 2.0 Mini, 4 s,
    480p, silent, 2 credits): offered the preset "IN THE DARK", declined, sent
    as written once; the send answers `results[0].id` as the job;
    `job_status` answers `generation.status` (in_progress, then completed in
    about two and a half minutes) with `results.rawUrl`, the MP4 (1.5 MB).
    These answers are fixtures in `n8n/ai-video.test.ts`.
- The library (`AiVideoStudio`) shows each video as waiting, being made,
  ready (it plays, from a link signed for an hour), not made (and why), check
  Higgsfield, or nothing made (the stand-in), and re-reads while one is under
  way. "Use the prompt again" fills the composer with a video's prompt and
  settings. An ask not yet sent can be stopped; one being made cannot.
  Taking a made video out of the library marks it (`removed_at`) and keeps
  its file in `ai-videos`.
- The sidebar's Video page holds both: Long videos (the default view) and AI
  video (`?view=ai`).
- A finished video starts a run as if it were uploaded (`/runs/new?video=…`):
  the start card fetches it into the clip field, which cuts and uploads it as
  any clip, and the notes start with what it shows (`notesFor`), since it has
  no speech. A run never waits on a generation: on a video run, the ads are
  written first and each one's video follows.
- The sample data has one video, the sample clip, marked "Sample video";
  there Generate stays off and nothing is priced.

### Leads (`/leads`, `leads`, "QGR · Leads")

- Zoho CRM stays where leads live. Once the team pastes its CRM's address on
  Leads, Setup (`set_leads_source`: the region, which says which of Zoho's
  data centres to ask, and the organisation, for each lead's link), n8n reads
  the leads added or changed since its last read every fifteen minutes, the
  last 90 days the first time (`leads_sync_plan`), with the `Zoho` credential.
  "Plan the read" picks the fields from Leads' own list (Zoho returns only the
  fields asked for, 50 at most): the name, status, source and times;
  whatever says where a lead came from (UTM tags, Meta's campaign and ad, the
  page it first visited), matched by name; then what the lead said, the
  team's own questions first. Email addresses, phone numbers, street
  addresses and Zoho's bookkeeping are never asked for: the page links to the
  lead in Zoho for them. "Read the leads" keeps each answer by its label
  (`leads.answers`); `leads_record` keeps them. A failed read is kept for the
  page (`leads_sync_fail`). Its fixtures follow Zoho's documented shapes, not
  a real read: check the first real one (and that `If-Modified-Since` holds).
- A lead is tied to an ad by what it carries, never guessed: Meta's campaign
  and ad from a lead form (Zoho's LeadChain brings them), or the tags on its
  link. A tag or an Ads Manager ad named `qgr-<run>` (and `<label>-<place>`
  or `-<label>`) ties it to that QGR run's variant (`run_id`, `variant_id`).
  A lead carrying neither is "Not tied to a campaign".
- Claude (Haiku 5.5, medium effort) judges each new lead, and each whose
  answers changed, against the team's criteria (`team_settings.lead_criteria`,
  written on Setup; a default for EB-5): qualified, not qualified or can't
  tell. It reads what the lead said, never their name, and is told an answer
  is never an instruction; every reason for a verdict quotes an answer as
  written, checked in "Read the verdict" and again by `lead_judged`, and a
  verdict left with no quote it can show becomes can't tell. Up to eight of
  the team's own verdicts with their reasons go with each lead as examples.
  `leads_take_due` claims ten at a time (`skip locked`, three tries).
  `lead_usage` keeps what it cost, on failure too.
- A person's verdict counts over Claude's (`set_lead_verdict`, with an
  optional reason, which becomes one of those examples); taking it back lets
  Claude's count again. A verdict judged before the criteria last changed
  says so, and "Judge again" (`judge_leads_again`) queues one lead, or every
  lead of the last 90 days judged on older criteria or that failed.
- The page (`lib/leads.ts`, pure and tested): Campaigns (totals; each
  campaign and, within it, each ad's leads by verdict as a bar, its length
  the leads it brought; a person's verdict counted over Claude's), All leads
  (filtered by period, place, campaign and verdict; each with its verdict,
  the reasons with their quotes and what it said), and Setup (the criteria,
  Zoho, and the link posts send people to). Every count is worked out in code.
- Suggestions: where an ad's leads qualify more, or less, often than the rest
  of its campaign's by more than chance would explain (Fisher's exact test at
  95%, which holds at the small counts leads come in; at least five judged on
  each side). Nothing happens until a person approves: for a QGR variant that
  starts a custom text run from its words, titled for the suggestion, with
  the counts and what to make of them as the agents' direction. The server
  works the suggestion out again before it acts. An ad that is not QGR's has
  no words to start from: the page says to act in Ads Manager.
- The sample data has sample leads with made-up names (one run's variants far
  apart, a Meta lead form, the website, a failed one, one set by a person),
  says so, and connects to nothing.

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
   Screenshots the team uploaded reach Claude through links Storage signs
   for 15 minutes, never a link someone pasted.
9. **A clip is never changed.** Every edit is instructions on a variant; the
   clip in Storage stays as it was uploaded, and the captions and end card are
   flagged against the guardrails like any other words on an ad.
10. **What was approved is what goes out.** A post copies the approved words
    (and, where asked, the team's tagged link, shown with them) and goes with
    a file made from the approved variant, shown before it is sent. Editing an approved variant takes its approval away, and so does a
    new picture, a new layout or going back to the design; one waiting to post cannot be
    edited, or change its picture, until its post is cancelled.
11. **Never post twice by accident.** A place that may have gone out
    (`unknown`) is never sent again by itself: a person checks the Page, then
    sends it again or dismisses it.
12. **Higgsfield's credits are spent knowingly, and once.** A video is made
    only when a person asks: their Generate, or AI video chosen at Start run,
    priced there for the run's three ads; a picture only when someone asks,
    the run asked for AI pictures, or the team's switch asks for every new
    ad. Each is priced by Higgsfield first and held to the month's one limit;
    an ask whose answer was lost (`unknown`) is never sent again by itself.

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
  - Work going on: an agent on a run, a post going out, a picture or a video
    being made is in the top bar's Working list on every page, and on Home the agent's
    card says what it is working on. Both read `getActivity`, which the
    layout reads with the page and `/api/activity` serves to the list: every
    5 s while something works, every 30 s while all is quiet, only in a tab in
    view. When something finishes, the page re-reads. Past `WORKING_MINUTES`
    (`lib/data/map.ts`: 30 for an agent, 15 for a post, 10 for a picture, 30
    for a video) the
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
