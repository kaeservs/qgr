import { workflow, node, trigger, sticky, newCredential, ifElse, switchCase, expr } from '@n8n/workflow-sdk';

const start = trigger({
  type: 'n8n-nodes-base.executeWorkflowTrigger',
  version: 1.2,
  config: {
    name: 'When the pipeline calls',
    parameters: { inputSource: 'workflowInputs', workflowInputs: { values: [{ name: 'runId', type: 'string' }] } },
  },
  output: [{ runId: '00000000-0000-0000-0000-000000000000' }],
});

const begin = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: {
    name: "Begin: load the run",
    onError: 'continueErrorOutput',
    parameters: {
      method: 'POST',
      url: 'https://tcinsdexwvzpznqlcpww.supabase.co/rest/v1/rpc/agent_begin',
      authentication: 'predefinedCredentialType',
      nodeCredentialType: 'supabaseApi',
      sendBody: true,
      contentType: 'json',
      specifyBody: 'json',
      jsonBody: expr("{{ JSON.stringify({ p_run_id: $json.runId, p_stage: \"tracker\" }) }}"),
      options: { timeout: 30000 },
    },
    credentials: { supabaseApi: newCredential('Supabase QGR') },
  },
  output: [{ stage: 'tracker', run: { id: 'run-id', kind: 'competitor', input: 'website', url: 'https://example.com/', title: 'example.com', platforms: ['meta', 'linkedin', 'x'], goal: 'consultations', excerpt: null, competitor_name: null, files: null, page: { ok: true, url: 'https://example.com/', title: 'Example', text: 'Example', words: 1 }, media_path: null, media: null }, brand: { company: 'Quantum Global Residency', guardrails: [], voice: [] }, report: null, strategy: null }],
});

const plan = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: "Plan the scan",
    onError: 'continueErrorOutput',
    parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: "// What to scan, from the run the database handed back. The app read the\n// competitor's website when the run started and stored it with the run\n// (run.page): the agents never fetch a link themselves. With the team's ads\n// switched to Apify (Settings, Agents), it also says which page of Meta's Ad\n// Library Apify reads: the library link pasted, or else a search for the\n// competitor's name, kept afterwards to their own ads. A run from screenshots\n// of their ads (files in competitor-shots, uploaded by the team) reads those\n// instead, whichever source the team chose. The team's direction for the\n// run, if they gave one, and who QGR is (its brand memory) go along to the\n// request.\nconst ctx = $input.first().json;\nconst run = ctx.run;\n// Runs from before screenshots carried bare file names, with nothing to read.\nconst SHOT = /^shots\\/[0-9a-f-]{36}\\/[0-9a-f-]{36}\\.(jpg|png|webp)$/;\nconst screenshots = run.input === 'upload' && Array.isArray(run.files) && run.files.length > 0 && run.files.every(function (f) { return SHOT.test(f); })\n  ? run.files.slice(0, 10)\n  : [];\nconst page = run.page && run.page.ok ? run.page : null;\n// n8n's Code node has no URL class, so the host is read with a pattern.\nlet domain = null;\nconst host = run.input === 'website' && run.url ? /^https?:\\/\\/([^/:?#]+)/i.exec(run.url) : null;\nif (host && host[1]) domain = host[1].replace(/^www\\./, '').toLowerCase();\nconst competitorHint = run.competitor_name || (page && page.siteName) || (domain ? domain.split('.')[0] : null);\nconst adsSource = ctx.ads_source === 'apify' ? 'apify' : 'sample';\n\nlet library = null;\nif (adsSource === 'apify' && screenshots.length === 0) {\n  if (run.input === 'ad_link') {\n    if (!/^https?:\\/\\/(www\\.|m\\.)?facebook\\.com\\/ads\\/library\\b/i.test(run.url || '')) {\n      throw new Error(\"Apify reads Meta's Ad Library, and this link is to another one. Start the run from their website or a link to their ads in Meta's Ad Library.\");\n    }\n    library = { url: run.url, keep: null };\n  } else {\n    const query = competitorHint || domain;\n    if (!query) throw new Error('There is no name to look this competitor up by in Meta\\'s Ad Library.');\n    library = {\n      url: 'https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=ALL&media_type=all&search_type=keyword_unordered&q=' + encodeURIComponent(query),\n      query: query,\n      keep: { name: competitorHint, domain: domain },\n    };\n  }\n}\n\nreturn [{\n  json: {\n    runId: run.id,\n    input: run.input,\n    url: run.url || null,\n    domain: domain,\n    competitorHint: competitorHint,\n    websiteText: page ? [page.title, page.description, page.text].filter(Boolean).join('\\n\\n') : '',\n    files: run.files || [],\n    screenshots: screenshots,\n    platforms: run.platforms,\n    adsSource: adsSource,\n    library: library,\n    guidance: run.guidance || null,\n    brand: ctx.brand ? { company: ctx.brand.company, offer: ctx.brand.offer, audience: ctx.brand.audience, topics: ctx.brand.topics || [] } : null,\n  },\n}];\n" },
  },
  output: [{ runId: 'run-id', input: 'website', url: 'https://example.com/', domain: 'example.com', competitorHint: 'example', websiteText: 'Example', files: [], platforms: ['meta'], adsSource: 'sample', library: null, guidance: null, brand: null }],
});

const fromShots = ifElse({
  version: 2.3,
  config: {
    name: "Screenshots?",
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 2 },
        conditions: [{ leftValue: expr("{{ $json.screenshots.length > 0 }}"), rightValue: true, operator: { type: 'boolean', operation: 'true', singleValue: true } }],
        combinator: 'and',
      },
    },
  },
});

// The team's screenshots, signed for a quarter of an hour so Claude can fetch
// them from the private bucket.
const signShots = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: {
    name: 'Sign the screenshots',
    onError: 'continueRegularOutput',
    parameters: {
      method: 'POST',
      url: 'https://tcinsdexwvzpznqlcpww.supabase.co/storage/v1/object/sign/competitor-shots',
      authentication: 'predefinedCredentialType',
      nodeCredentialType: 'supabaseApi',
      sendBody: true,
      contentType: 'json',
      specifyBody: 'json',
      jsonBody: expr('{{ JSON.stringify({ expiresIn: 900, paths: $json.screenshots }) }}'),
      options: { timeout: 30000, response: { response: { fullResponse: true, neverError: true } } },
    },
    credentials: { supabaseApi: newCredential('Supabase QGR') },
  },
  output: [{ statusCode: 200, body: [{ path: 'shots/user/file.png', signedURL: '/object/sign/competitor-shots/shots/user/file.png?token=token', error: null }] }],
});

const shotAds = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: "Screenshot ads",
    onError: 'continueErrorOutput',
    parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: "// The team's screenshots of the competitor's ads, signed by Storage for a\n// quarter of an hour so Claude can fetch them from the private bucket\n// without a key. There are no ads to read yet: Claude reads them out of the\n// pictures, and \"Read Claude's answer\" makes them the report's ads. Days\n// running are known only for an ad whose screenshot shows the day it started.\nconst STORAGE = 'https://tcinsdexwvzpznqlcpww.supabase.co/storage/v1';\nconst plan = $('Plan the scan').first().json;\nconst res = $input.first().json || {};\nconst signed = Array.isArray(res.body) ? res.body : [];\nconst byPath = {};\nsigned.forEach(function (s) {\n  const link = s && (s.signedURL || s.signedUrl);\n  if (s && s.path && typeof link === 'string' && !s.error) byPath[s.path] = link;\n});\nif (res.statusCode !== 200 || plan.screenshots.some(function (path) { return !byPath[path]; })) {\n  throw new Error('The screenshots could not be read from storage (' + (res.statusCode || 'no answer') + '). Try the run again.');\n}\nconst shots = plan.screenshots.map(function (path, i) {\n  const link = byPath[path];\n  return { n: i + 1, path: path, url: /^https?:\\/\\//.test(link) ? link : STORAGE + (link.charAt(0) === '/' ? '' : '/') + link };\n});\nreturn [{ json: Object.assign({}, plan, { dataSource: 'upload', ads: [], shots: shots }) }];\n" },
  },
  output: [{ runId: 'run-id', dataSource: 'upload', ads: [], shots: [{ n: 1, path: 'shots/user/file.png', url: 'https://tcinsdexwvzpznqlcpww.supabase.co/storage/v1/object/sign/competitor-shots/shots/user/file.png?token=token' }] }],
});

const realAds = ifElse({
  version: 2.3,
  config: {
    name: "Real ads?",
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 2 },
        conditions: [{ leftValue: expr("{{ $json.adsSource === \"apify\" }}"), rightValue: true, operator: { type: 'boolean', operation: 'true', singleValue: true } }],
        combinator: 'and',
      },
    },
  },
});

const apify = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: {
    name: 'Apify: their Meta ads',
    onError: 'continueErrorOutput',
    alwaysOutputData: true,
    parameters: {
      method: 'POST',
      url: 'https://api.apify.com/v2/acts/apify~facebook-ads-scraper/run-sync-get-dataset-items',
      authentication: 'genericCredentialType',
      genericAuthType: 'httpCustomAuth',
      sendQuery: true,
      queryParameters: { parameters: [{ name: 'timeout', value: '240' }, { name: 'maxItems', value: '60' }] },
      sendBody: true,
      contentType: 'json',
      specifyBody: 'json',
      jsonBody: expr('{{ JSON.stringify({ startUrls: [{ url: $json.library.url }], resultsLimit: 60, activeStatus: "active" }) }}'),
      options: { timeout: 300000 },
    },
    credentials: { httpCustomAuth: newCredential('Apify token') },
  },
  output: [{ adArchiveID: '1234567890', pageName: 'Example Visa Partners', isActive: true, startDate: 1754000000, snapshot: { body: { text: 'Hook' }, ctaText: 'Book now', displayFormat: 'VIDEO' } }],
});

const apifyAds = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: "Read Apify's ads",
    onError: 'continueErrorOutput',
    parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: "// Apify's answer: the competitor's ads from Meta's Ad Library, one item each,\n// as the Facebook Ads Library Scraper gives them, turned into the shape the\n// sample ads have. The actor's versions name fields differently (adArchiveID\n// or ad_archive_id, ctaText or cta_text, a start date in seconds or as a\n// date), so each is read whichever way it comes. A search is kept to the\n// competitor's own ads: from a Page with their name, or linking to their\n// website. An ad whose words are a template (a catalogue ad) has nothing to\n// read and is left out.\nconst plan = $('Plan the scan').first().json;\nconst keep = plan.library && plan.library.keep;\n\nfunction pick(obj, names) {\n  if (!obj || typeof obj !== 'object') return undefined;\n  for (let i = 0; i < names.length; i += 1) {\n    const v = obj[names[i]];\n    if (v !== undefined && v !== null && v !== '') return v;\n  }\n  return undefined;\n}\nfunction words(v) {\n  if (typeof v === 'string') return v;\n  if (v && typeof v === 'object') {\n    if (typeof v.text === 'string') return v.text;\n    if (v.markup && typeof v.markup.__html === 'string') return v.markup.__html.replace(/<[^>]*>/g, ' ');\n  }\n  return '';\n}\nfunction clean(v) {\n  return String(v || '').replace(/\\s+/g, ' ').trim();\n}\nfunction isoDate(v) {\n  if (typeof v === 'number' && isFinite(v)) return new Date(v < 1e12 ? v * 1000 : v).toISOString();\n  if (typeof v === 'string' && /^\\d+$/.test(v)) return isoDate(Number(v));\n  if (typeof v === 'string') {\n    const t = Date.parse(v);\n    return isFinite(t) ? new Date(t).toISOString() : null;\n  }\n  return null;\n}\nfunction hostOf(url) {\n  const m = /^https?:\\/\\/([^/:?#]+)/i.exec(String(url || ''));\n  return m ? m[1].replace(/^www\\./, '').toLowerCase() : null;\n}\n// Meta sends outbound links through l.facebook.com/l.php?u=<the link>.\nfunction unwrap(url) {\n  const m = /[?&]u=([^&#]+)/.exec(String(url || ''));\n  if (!m || !/(^|\\.)facebook\\.com$/.test(hostOf(url) || '')) return url;\n  try {\n    return decodeURIComponent(m[1]);\n  } catch (e) {\n    return url;\n  }\n}\nfunction squash(v) {\n  return String(v || '').toLowerCase().replace(/[^a-z0-9]/g, '');\n}\n// \"Horizon Visa\" is \"Horizon Visa Partners\"; short names must match whole.\nfunction sameName(a, b) {\n  const x = squash(a);\n  const y = squash(b);\n  if (!x || !y) return false;\n  if (x.length < 5 || y.length < 5) return x === y;\n  return x.indexOf(y) !== -1 || y.indexOf(x) !== -1;\n}\nfunction theirs(pageName, link) {\n  if (!keep) return true;\n  if (keep.name && sameName(pageName, keep.name)) return true;\n  const h = hostOf(link);\n  return !!(keep.domain && h && (h === keep.domain || h.slice(-keep.domain.length - 1) === '.' + keep.domain));\n}\n// A catalogue ad's headline can be its unfilled template ({{product.name}}).\nfunction untemplated(text) {\n  return text && text.indexOf('{{') === -1 ? text : null;\n}\nfunction first(list) {\n  return Array.isArray(list) && list.length > 0 && list[0] && typeof list[0] === 'object' ? list[0] : {};\n}\nconst FORMATS = { VIDEO: 'video', IMAGE: 'image', CAROUSEL: 'carousel', MULTI_IMAGES: 'carousel', DCO: 'carousel', DPA: 'carousel', TEXT: 'text' };\n\nlet returned = 0;\nconst seen = {};\nconst ads = [];\n$input.all().forEach(function (item) {\n  const a = item.json;\n  const archiveId = pick(a, ['adArchiveID', 'adArchiveId', 'ad_archive_id']);\n  const id = archiveId || pick(a, ['adId', 'ad_id', 'id']);\n  // An empty answer comes through as one empty item: no ads.\n  if (!id) return;\n  returned += 1;\n  if (seen[id]) return;\n  seen[id] = true;\n\n  const snap = a.snapshot && typeof a.snapshot === 'object' ? a.snapshot : {};\n  const cards = Array.isArray(snap.cards) ? snap.cards : [];\n  const card = first(cards);\n  let text = clean(words(pick(snap, ['body'])) || words(pick(a, ['body', 'adCreativeBody', 'ad_creative_body', 'text'])));\n  if (!text || text.indexOf('{{') !== -1) text = clean(words(pick(card, ['body'])));\n  if (!text || text.indexOf('{{') !== -1) return;\n\n  const pageName = clean(pick(a, ['pageName', 'page_name']) || pick(snap, ['pageName', 'page_name']));\n  const link = unwrap(pick(snap, ['linkUrl', 'link_url']) || pick(card, ['linkUrl', 'link_url']) || pick(a, ['linkUrl', 'link_url']));\n  if (!theirs(pageName, link)) return;\n\n  const display = String(pick(snap, ['displayFormat', 'display_format']) || pick(a, ['displayFormat', 'display_format']) || '').toUpperCase();\n  const videos = Array.isArray(snap.videos) ? snap.videos : [];\n  const images = Array.isArray(snap.images) ? snap.images : [];\n  const format = FORMATS[display] || (videos.length > 0 ? 'video' : cards.length > 1 ? 'carousel' : images.length > 0 ? 'image' : 'text');\n  const video = first(videos);\n  const image = first(images);\n  const media =\n    pick(video, ['videoPreviewImageUrl', 'video_preview_image_url']) ||\n    pick(image, ['originalImageUrl', 'original_image_url', 'resizedImageUrl', 'resized_image_url']) ||\n    pick(card, ['originalImageUrl', 'original_image_url', 'resizedImageUrl', 'resized_image_url', 'videoPreviewImageUrl', 'video_preview_image_url']);\n\n  ads.push({\n    id: String(id),\n    platform: 'meta',\n    format: format,\n    startDate: isoDate(pick(a, ['startDate', 'start_date', 'adDeliveryStartTime', 'ad_delivery_start_time'])),\n    isActive: pick(a, ['isActive', 'is_active']) !== false,\n    pageName: pageName || null,\n    text: text,\n    headline: untemplated(clean(words(pick(snap, ['title'])))) || untemplated(clean(words(pick(card, ['title'])))),\n    cta: clean(pick(snap, ['ctaText', 'cta_text']) || pick(card, ['ctaText', 'cta_text'])) || null,\n    adUrl: archiveId && /^\\d+$/.test(String(archiveId)) ? 'https://www.facebook.com/ads/library/?id=' + archiveId : null,\n    mediaUrl: typeof media === 'string' && /^https:\\/\\//.test(media) ? media : null,\n  });\n});\n\nconst where = plan.library && plan.library.query ? 'for \"' + plan.library.query + '\"' : 'at that link';\nif (returned === 0) {\n  throw new Error(\"Meta's Ad Library has no active ads \" + where + '.');\n}\nif (ads.length === 0) {\n  throw new Error(\n    keep\n      ? \"Meta's Ad Library has ads \" + where + ', but none from ' + (keep.name || keep.domain) + \"'s Page or linking to their website. Start the run from a link to their ads in Meta's Ad Library.\"\n      : 'Apify gave back ads with no words to read.',\n  );\n}\nreturn [{ json: Object.assign({}, plan, { dataSource: 'apify', ads: ads }) }];\n" },
  },
  output: [{ runId: 'run-id', dataSource: 'apify', ads: [] }],
});

const sampleAds = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: "Sample ads",
    parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: "// SAMPLE ADS, read while the team's competitor ads are set to sample (Settings,\n// Agents), as they are until Apify's token is in n8n. They come in the shape\n// \"Read Apify's ads\" gives ({ id, platform, format, startDate, isActive,\n// pageName, text, headline, cta, adUrl, mediaUrl }), flagged 'placeholder' so\n// the report says its ads were samples, not this competitor's.\nconst plan = $input.first().json;\nconst hint = plan.competitorHint || 'competitor';\nconst pageName = hint.charAt(0).toUpperCase() + hint.slice(1);\nconst day = 24 * 60 * 60 * 1000;\nconst sample = [\n  ['meta', 'video', 63, \"Your kids shouldn't age out while you wait.\", 'Plan your EB-5 timeline', 'Book now'],\n  ['meta', 'video', 58, \"Your kids shouldn't age out while you wait. Here's how families plan ahead.\", 'Talk to an advisor', 'Book now'],\n  ['meta', 'image', 41, \"The H-1B lottery isn't a plan. This is.\", 'EB-5, explained', 'Learn more'],\n  ['meta', 'image', 37, \"Still waiting on the H-1B lottery? There's another door.\", 'See your options', 'Learn more'],\n  ['linkedin', 'document', 34, 'What $800K actually buys: a timeline, not a promise.', 'The EB-5 cost guide', 'Download'],\n  ['linkedin', 'carousel', 28, '3 questions to ask before you pick an EB-5 project.', 'Pick a project wisely', 'Learn more'],\n  ['meta', 'image', 19, 'Rural or urban project? Here is what changes for you.', 'TEA projects explained', 'Learn more'],\n  ['meta', 'video', 12, 'Meet the families who moved last year.', 'Their stories', 'Watch more'],\n  ['x', 'text', 9, 'We read the visa bulletin so you do not have to.', 'This month, explained', 'Learn more'],\n  ['linkedin', 'image', 6, 'Free webinar: EB-5 for Indian families.', 'Save your seat', 'Register'],\n];\nconst ads = sample.map(function (a, i) {\n  return {\n    id: 'sample-' + (i + 1),\n    platform: a[0],\n    format: a[1],\n    startDate: new Date(Date.now() - a[2] * day).toISOString(),\n    isActive: true,\n    pageName: pageName,\n    text: a[3],\n    headline: a[4],\n    cta: a[5],\n    adUrl: null,\n    mediaUrl: null,\n  };\n});\nreturn [{ json: Object.assign({}, plan, { dataSource: 'placeholder', ads: ads }) }];\n" },
  },
  output: [{ runId: 'run-id', dataSource: 'placeholder', ads: [] }],
});

const prepareAds = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: "Prepare the ads",
    onError: 'continueErrorOutput',
    parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: "// Turns raw ads into what Claude reads. Days running are computed here from\n// each ad's start date: the model is never asked to count or estimate.\n// Screenshots go on as they are: their ads are read out of the pictures.\nconst src = $input.first().json;\nif (Array.isArray(src.shots) && src.shots.length > 0) {\n  return [{ json: src }];\n}\nconst now = Date.now();\nconst day = 24 * 60 * 60 * 1000;\nconst ads = (src.ads || [])\n  .filter(function (a) { return a.isActive !== false && a.text; })\n  .slice(0, 60)\n  .map(function (a, i) {\n    const start = Date.parse(a.startDate);\n    const text = String(a.text);\n    return {\n      id: 'a' + (i + 1),\n      platform: a.platform,\n      format: a.format,\n      days_running: Number.isFinite(start) ? Math.max(0, Math.round((now - start) / day)) : 0,\n      text: text.slice(0, 600),\n      headline: a.headline || null,\n      cta: a.cta || null,\n      page_name: a.pageName || null,\n      ad_url: a.adUrl || null,\n      media_url: a.mediaUrl || null,\n      hook_line: text.split(/(?<=[.!?])\\s/)[0].slice(0, 140),\n    };\n  });\nif (ads.length === 0) {\n  throw new Error('No active ads were found for this competitor.');\n}\nreturn [{ json: Object.assign({}, src, { ads: ads }) }];\n" },
  },
  output: [{ runId: 'run-id', dataSource: 'placeholder', ads: [{ id: 'a1', platform: 'meta', format: 'video', days_running: 63, text: 'Hook', hook_line: 'Hook' }] }],
});

const buildRequest = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: "Build the Claude request",
    onError: 'continueErrorOutput',
    parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: "// The Claude request: Haiku 5.5 at medium effort (reading and grouping ads is\n// not the hard part), JSON constrained by the schema below. Haiku while the\n// app is being built (CLAUDE.md, n8n). fallbacks retries a request a safety\n// classifier declines on another model, on Sonnet and Opus; on Haiku a\n// refusal stands and the run says so. No temperature: Haiku 5.5 can reject it.\nconst MODEL = 'claude-haiku-5-5';\nconst EFFORT = 'medium';\nconst p = $input.first().json;\n// A run from the team's screenshots: Claude reads the ads out of the pictures\n// first (ads_read), then reports on them as on any others.\nconst shots = Array.isArray(p.shots) ? p.shots : [];\nconst ANGLES = ['Timeline & urgency', 'Family & education', 'Due diligence', 'Investment safety', 'Career freedom', 'Process explained', 'Cost & pricing', 'Lifestyle', 'Social proof', 'Other'];\n\nconst READ = [\n  'First read every ad in the screenshots into ads_read, in order: one entry per ad (a screenshot can show more than one).',\n  '- id: a1, a2, a3 and so on, in the order read. shot: the number of the screenshot it is in.',\n  '- platform: meta for Facebook and Instagram, linkedin or x. format: video, image, carousel, document or text.',\n  \"- page_name: the advertiser's name as the ad shows it. text: the ad's main text exactly as written, without its headline or button; where it is cut off (\\\"See more\\\"), up to the cut. headline and cta: as written, or an empty string.\",\n  \"- started_on: the day it started running as YYYY-MM-DD, only when the screenshot shows it (Meta's Ad Library says \\\"Started running on\\\"); otherwise an empty string.\",\n  'Never guess words that are cut off or cannot be read, and leave out anything that is not an ad.',\n  '',\n];\nconst system = [\n  shots.length > 0\n    ? \"You analyse a competitor's paid social ads for Quantum Global Residency (QGR), an EB-5 and U.S. residency advisory firm. You get screenshots of the competitor's ads that the QGR team saved, numbered, and sometimes text from their website.\"\n    : \"You analyse a competitor's paid social ads for Quantum Global Residency (QGR), an EB-5 and U.S. residency advisory firm. You get the competitor's active ads, each with an id and the number of days it has been running, and sometimes text from their website.\",\n  '',\n].concat(shots.length > 0 ? READ : [], [\n  'Report what is working for them:',\n  '- hooks: group ads that open with the same idea and state that idea once, quoted from the ad that words it best (do not paraphrase). List every ad id in the group. At most six hooks; an ad belongs to at most one. The system works out how long each hook has run and how many versions it has from the ids, so give no numbers.',\n  '- ad_angles: one angle for every ad id, from the allowed list.',\n  '- insights: three observations a marketer could act on, one sentence each, each naming its evidence in the ads (for example \"their four longest-running ads all lead with ...\"). If the ads are few or thin, say so rather than guess.',\n  '- summary: the single most useful finding, under 90 characters.',\n  '- competitor_name: the advertiser as their ads name themselves.',\n  '- website_summary: one or two sentences on how they position themselves, from the website text; an empty string when there is none.',\n  '',\n  'Work only from the material given.',\n]).join('\\n');\n\n// Who reads the report: QGR, as its brand memory has it. The insights are for it to act on.\nconst BRAND_RULE = 'our_brand is QGR, who reads this report: make the insights ones QGR can act on with what it offers and posts about, never claims the ads do not show.';\n\n// The team's direction for the run, in their words: what to look for. Only when\n// they gave one; without it the request is exactly as before.\nconst DIRECTION_RULE = \"direction is the QGR team's note on what to look for in these ads. Let it decide which hooks and insights come first, but report only what the ads show.\";\n\nconst material = {\n  competitor: { domain: p.domain, name_hint: p.competitorHint },\n  website_text: p.websiteText || '',\n};\nif (shots.length > 0) {\n  material.screenshots = shots.length;\n} else {\n  material.ads = p.ads.map(function (a) {\n    return { id: a.id, platform: a.platform, format: a.format, days_running: a.days_running, text: a.text, headline: a.headline, cta: a.cta, page_name: a.page_name };\n  });\n}\nif (p.brand) material.our_brand = p.brand;\nif (p.guidance) material.direction = p.guidance;\n\nconst schema = {\n  type: 'object',\n  additionalProperties: false,\n  required: ['competitor_name', 'summary', 'website_summary', 'insights', 'hooks', 'ad_angles'],\n  properties: {\n    competitor_name: { type: 'string' },\n    summary: { type: 'string' },\n    website_summary: { type: 'string' },\n    insights: { type: 'array', items: { type: 'string' } },\n    hooks: {\n      type: 'array',\n      items: {\n        type: 'object',\n        additionalProperties: false,\n        required: ['text', 'ad_ids'],\n        properties: { text: { type: 'string' }, ad_ids: { type: 'array', items: { type: 'string' } } },\n      },\n    },\n    ad_angles: {\n      type: 'array',\n      items: {\n        type: 'object',\n        additionalProperties: false,\n        required: ['ad_id', 'angle'],\n        properties: { ad_id: { type: 'string' }, angle: { type: 'string', enum: ANGLES } },\n      },\n    },\n  },\n};\nif (shots.length > 0) {\n  const READ_FIELDS = ['id', 'shot', 'platform', 'format', 'page_name', 'text', 'headline', 'cta', 'started_on'];\n  schema.required = ['ads_read'].concat(schema.required);\n  schema.properties = Object.assign({\n    ads_read: {\n      type: 'array',\n      items: {\n        type: 'object',\n        additionalProperties: false,\n        required: READ_FIELDS,\n        properties: {\n          id: { type: 'string' },\n          shot: { type: 'integer' },\n          platform: { type: 'string', enum: ['meta', 'linkedin', 'x'] },\n          format: { type: 'string', enum: ['video', 'image', 'carousel', 'document', 'text'] },\n          page_name: { type: 'string' },\n          text: { type: 'string' },\n          headline: { type: 'string' },\n          cta: { type: 'string' },\n          started_on: { type: 'string' },\n        },\n      },\n    },\n  }, schema.properties);\n}\n\n// The material as JSON, then each screenshot after its number.\nconst intro = 'The competitor material, as JSON:\\n' + JSON.stringify(material);\nconst content = shots.length > 0\n  ? [{ type: 'text', text: intro }].concat(...shots.map(function (shot) {\n      return [{ type: 'text', text: 'Screenshot ' + shot.n + ':' }, { type: 'image', source: { type: 'url', url: shot.url } }];\n    }))\n  : intro;\n\nreturn [{\n  json: {\n    body: {\n      model: MODEL,\n      max_tokens: 16000,\n      fallbacks: 'default',\n      output_config: { effort: EFFORT, format: { type: 'json_schema', schema: schema } },\n      system: [system].concat(p.brand ? [BRAND_RULE] : [], p.guidance ? [DIRECTION_RULE] : []).join('\\n\\n'),\n      messages: [{ role: 'user', content: content }],\n    },\n  },\n}];\n" },
  },
  output: [{ body: { model: 'claude-haiku-5-5', max_tokens: 16000 } }],
});

const claude = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: {
    name: "Claude: read the ads",
    onError: 'continueErrorOutput',
    parameters: {
      method: 'POST',
      url: 'https://api.anthropic.com/v1/messages',
      authentication: 'predefinedCredentialType',
      nodeCredentialType: 'anthropicApi',
      sendHeaders: true,
      headerParameters: {
        parameters: [
          { name: 'anthropic-version', value: '2023-06-01' },
          { name: 'anthropic-beta', value: 'server-side-fallback-2026-07-01' },
        ],
      },
      sendBody: true,
      contentType: 'json',
      specifyBody: 'json',
      jsonBody: expr('{{ JSON.stringify($json.body) }}'),
      options: { timeout: 600000 },
    },
    credentials: { anthropicApi: newCredential('Anthropic') },
  },
  output: [{ model: 'claude-haiku-5-5', stop_reason: 'end_turn', content: [{ type: 'text', text: '{}' }], usage: { input_tokens: 5000, output_tokens: 1500 } }],
});

const readAnswer = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: "Read Claude's answer",
    onError: 'continueErrorOutput',
    parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: "// Reads Claude's answer and builds the report. Every number here comes from\n// the ads themselves: a hook's days running is its longest-running ad's, its\n// versions are how many ads share it, an angle's count is how many ads use it.\n// From screenshots, the ads are what Claude read out of them, and an ad's days\n// running are counted here from the day it started, when the screenshot shows\n// one; otherwise they are not known, and the report says nothing in their place.\n// The report keeps every ad, longest-running first, for a person to choose from.\nconst res = $input.first().json;\nconst prep = $('Prepare the ads').first().json;\nconst u = res.usage || {};\nconst usage = {\n  model: res.model || 'claude-haiku-5-5',\n  input_tokens: u.input_tokens || 0,\n  output_tokens: u.output_tokens || 0,\n  cache_creation_input_tokens: u.cache_creation_input_tokens || 0,\n  cache_read_input_tokens: u.cache_read_input_tokens || 0,\n};\nfunction fail(message) {\n  return [{ json: { ok: false, p_run_id: prep.runId, p_error: message, p_usage: usage } }];\n}\n\nif (res.stop_reason === 'refusal') {\n  const category = res.stop_details && res.stop_details.category;\n  return fail('Claude declined to analyse these ads' + (category ? ' (' + category + ')' : '') + '.');\n}\nif (res.stop_reason === 'max_tokens') {\n  return fail('Claude ran out of room before the report was finished.');\n}\nconst block = (res.content || []).find(function (b) { return b.type === 'text'; });\nlet answer;\ntry {\n  answer = JSON.parse(block ? block.text : '');\n} catch (e) {\n  return fail('Claude did not return a readable report.');\n}\n\nconst DAY = 24 * 60 * 60 * 1000;\nconst shots = Array.isArray(prep.shots) ? prep.shots : [];\nlet ads = prep.ads;\nif (shots.length > 0) {\n  const seen = {};\n  ads = (answer.ads_read || [])\n    .map(function (a) {\n      const shot = shots[Number(a.shot) - 1];\n      const text = String(a.text || '').replace(/\\s+/g, ' ').trim();\n      const id = String(a.id || '');\n      if (!shot || !text || !id || seen[id]) return null;\n      seen[id] = true;\n      const day = /^\\d{4}-\\d{2}-\\d{2}$/.test(a.started_on || '') ? Date.parse(a.started_on + 'T00:00:00Z') : NaN;\n      const known = Number.isFinite(day) && day <= Date.now() && day >= Date.parse('2010-01-01T00:00:00Z');\n      return {\n        id: id,\n        platform: a.platform,\n        format: a.format,\n        days_running: known ? Math.max(0, Math.floor((Date.now() - day) / DAY)) : 0,\n        days_known: known,\n        text: text.slice(0, 600),\n        headline: String(a.headline || '').trim() || null,\n        cta: String(a.cta || '').trim() || null,\n        page_name: String(a.page_name || '').trim() || null,\n        ad_url: null,\n        media_url: null,\n        screenshot_path: shot.path,\n      };\n    })\n    .filter(Boolean)\n    .slice(0, 60);\n  if (ads.length === 0) {\n    return fail('Claude found no ads it could read in the screenshots.');\n  }\n}\n\nconst byId = {};\nads.forEach(function (a) { byId[a.id] = a; });\nconst known = function (a) { return a.days_known !== false; };\nconst used = {};\nconst hooks = (answer.hooks || [])\n  .map(function (h) {\n    const group = (h.ad_ids || []).filter(function (id) { return byId[id] && !used[id]; }).map(function (id) { used[id] = true; return byId[id]; });\n    if (group.length === 0 || !h.text) return null;\n    const lead = group.reduce(function (a, b) { return b.days_running > a.days_running ? b : a; });\n    const hook = { text: String(h.text).trim(), platform: lead.platform, format: lead.format, days_running: lead.days_running, variations: group.length };\n    if (!known(lead)) hook.days_known = false;\n    return hook;\n  })\n  .filter(Boolean)\n  .sort(function (a, b) { return b.days_running - a.days_running || b.variations - a.variations; })\n  .slice(0, 6);\nif (hooks.length === 0) {\n  return fail('Claude grouped none of the ads into hooks.');\n}\n\nconst counts = {};\nconst angleOf = {};\n(answer.ad_angles || []).forEach(function (x) {\n  if (byId[x.ad_id] && !angleOf[x.ad_id]) {\n    angleOf[x.ad_id] = x.angle;\n    counts[x.angle] = (counts[x.angle] || 0) + 1;\n  }\n});\nconst angles = Object.keys(counts)\n  .map(function (label) { return { label: label, ads: counts[label] }; })\n  .sort(function (a, b) { return b.ads - a.ads; });\n\nconst kept = ads\n  .slice()\n  .sort(function (a, b) { return b.days_running - a.days_running; })\n  .map(function (a) {\n    const ad = {\n      platform: a.platform,\n      format: a.format,\n      text: a.text,\n      days_running: a.days_running,\n      ad_url: a.ad_url,\n      media_url: a.media_url,\n      headline: a.headline || null,\n      cta: a.cta || null,\n      page_name: a.page_name || null,\n      angle: angleOf[a.id] || null,\n    };\n    if (!known(a)) ad.days_known = false;\n    if (a.screenshot_path) ad.screenshot_path = a.screenshot_path;\n    return ad;\n  });\n\nconst platforms = [];\nads.forEach(function (a) { if (platforms.indexOf(a.platform) === -1) platforms.push(a.platform); });\n\nconst report = {\n  // From screenshots, the competitor is who the team named.\n  competitor: { name: String((shots.length > 0 && prep.competitorHint) || answer.competitor_name || prep.competitorHint || prep.domain || 'Competitor').trim(), domain: prep.domain },\n  data_source: prep.dataSource,\n  active_ads: ads.length,\n  platforms: platforms,\n  summary: String(answer.summary || '').trim(),\n  website_summary: String(answer.website_summary || '').trim() || null,\n  insights: (answer.insights || []).map(function (s) { return String(s).trim(); }).filter(Boolean).slice(0, 5),\n  angles: angles,\n  hooks: hooks,\n  ads: kept,\n};\nif (report.insights.length === 0) {\n  return fail('Claude returned no insights.');\n}\nreturn [{ json: { ok: true, p_run_id: prep.runId, p_report: report, p_usage: usage } }];\n" },
  },
  output: [{ ok: true, p_run_id: 'run-id', p_report: { hooks: [] }, p_usage: { model: 'claude-haiku-5-5' } }],
});

const answerOk = ifElse({
  version: 2.3,
  config: {
    name: "Report ready?",
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 },
        conditions: [{ leftValue: expr('{{ $json.ok }}'), rightValue: true, operator: { type: 'boolean', operation: 'true', singleValue: true } }],
        combinator: 'and',
      },
    },
  },
});

const save = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: {
    name: "Save the report",
    onError: 'continueErrorOutput',
    parameters: {
      method: 'POST',
      url: 'https://tcinsdexwvzpznqlcpww.supabase.co/rest/v1/rpc/agent_finish_tracker',
      authentication: 'predefinedCredentialType',
      nodeCredentialType: 'supabaseApi',
      sendBody: true,
      contentType: 'json',
      specifyBody: 'json',
      jsonBody: expr("{{ JSON.stringify({ p_run_id: $json.p_run_id, p_report: $json.p_report, p_usage: $json.p_usage }) }}"),
      options: { timeout: 30000, response: { response: { responseFormat: 'text', outputPropertyName: 'data' } } },
    },
    credentials: { supabaseApi: newCredential('Supabase QGR') },
  },
  output: [{ data: 'report-id' }],
});


const whyFailed = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: "Why it failed",
    parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: "// Why the agent stopped, from whichever step failed: a step that reports\n// { ok: false, p_error } or a node's error output ({ error }).\nconst item = $input.first().json;\nconst ctx = $('Begin: load the run').first().json;\nlet message = item.p_error;\nif (!message) {\n  const e = item.error;\n  message = typeof e === 'string' ? e : (e && (e.description || e.message)) || 'Unknown error';\n}\nreturn [{\n  json: {\n    p_run_id: ctx.run.id,\n    p_stage: 'tracker',\n    p_error: String(message).slice(0, 500),\n    p_usage: item.p_usage || null,\n  },\n}];\n" },
  },
  output: [{ p_run_id: 'run-id', p_stage: 'tracker', p_error: 'Claude declined', p_usage: null }],
});

const markFailed = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: {
    name: "Record the failure",
    onError: 'continueRegularOutput',
    parameters: {
      method: 'POST',
      url: 'https://tcinsdexwvzpznqlcpww.supabase.co/rest/v1/rpc/agent_fail',
      authentication: 'predefinedCredentialType',
      nodeCredentialType: 'supabaseApi',
      sendBody: true,
      contentType: 'json',
      specifyBody: 'json',
      jsonBody: expr("{{ JSON.stringify({ p_run_id: $json.p_run_id, p_stage: $json.p_stage, p_error: $json.p_error, p_usage: $json.p_usage }) }}"),
      options: { timeout: 30000 },
    },
    credentials: { supabaseApi: newCredential('Supabase QGR') },
  },
  output: [{}],
});

const failed = node({
  type: 'n8n-nodes-base.set',
  version: 3.4,
  config: {
    name: "Failed",
    parameters: {
      mode: 'manual',
      includeOtherFields: false,
      assignments: {
        assignments: [
          { id: 'ok', name: 'ok', value: false, type: 'boolean' },
          { id: 'error', name: 'error', value: expr('{{ $("Why it failed").first().json.p_error }}'), type: 'string' },
        ],
      },
    },
  },
  output: [{ ok: false, error: 'Claude declined' }],
});

const couldNotStart = node({
  type: 'n8n-nodes-base.set',
  version: 3.4,
  config: {
    name: "Could not start",
    parameters: {
      mode: 'manual',
      includeOtherFields: false,
      assignments: {
        assignments: [
          { id: 'ok', name: 'ok', value: false, type: 'boolean' },
          { id: 'error', name: 'error', value: expr('{{ "Could not start: " + ($json.error?.description ?? $json.error?.message ?? $json.error ?? "unknown error") }}'), type: 'string' },
        ],
      },
    },
  },
  output: [{ ok: false, error: 'Could not start: the stage is already running' }],
});

const done = node({
  type: 'n8n-nodes-base.set',
  version: 3.4,
  config: {
    name: "Done",
    parameters: {
      mode: 'manual',
      includeOtherFields: false,
      assignments: {
        assignments: [
          { id: 'ok', name: 'ok', value: true, type: 'boolean' },
          { id: 'run', name: 'runId', value: expr('{{ $("Begin: load the run").first().json.run.id }}'), type: 'string' },
        ],
      },
    },
  },
  output: [{ ok: true, runId: 'run-id' }],
});

const noteWebsite = sticky('## Their website\nThe app read it when the run started (it checks the link is a public site, on every redirect) and stored it with the run. **Plan the scan** takes the page\'s words from there: n8n never fetches a link someone pasted.', [plan], { color: 4 });
const noteApify = sticky('## Their ads: sample, or Apify\n**Real ads?** follows the team\'s choice in Settings, Agents. **Sample ads** are the same examples for every competitor, and the report says so.\n\nWith Apify on, Apify\'s Facebook Ads Library Scraper reads the page of Meta\'s Ad Library the plan names: the link pasted, or a search for the competitor\'s name. **Read Apify\'s ads** keeps their own ads and reads each field whichever way the actor names it. It needs the **Apify token** credential (Custom Auth, JSON {"headers": {"Authorization": "Bearer <token>"}}, allowed domain api.apify.com); without it a scan stops and says why.', [realAds, apify, apifyAds, sampleAds], { color: 3 });
const noteNumbers = sticky('## Numbers come from the data\nClaude groups ads into hooks by id and names each ad\'s angle. Days running, versions and angle counts are computed in code from the ads, never taken from the model.', [prepareAds, readAnswer], { color: 5 });
const noteShots = sticky('## Screenshots of their ads\nA run the team started from screenshots (a feed, Meta\'s Ad Library, LinkedIn) skips the ad sources: Storage signs the pictures for 15 minutes and Claude reads each ad out of them first. A screenshot rarely shows how long an ad has run, so days running are counted only from a start date the screenshot shows.', [fromShots, signShots, shotAds], { color: 4 });
const noteModel = sticky('## Claude\nHaiku 5.5 while the app is being built (about a cent a run), medium effort, JSON constrained by a schema. A refusal stands: Haiku has no fallback model. No temperature. Usage is saved with every result.', [buildRequest, claude], { color: 6 });

export default workflow('qgr-competitor-tracker', 'QGR · Competitor Tracker')
  .add(start)
  .to(begin.onError(couldNotStart))
  .to(plan.onError(whyFailed))
  .to(fromShots.onTrue(signShots).onFalse(realAds.onTrue(apify.onError(whyFailed)).onFalse(sampleAds)))
  .add(apify)
  .to(apifyAds.onError(whyFailed))
  .to(prepareAds.onError(whyFailed))
  .to(buildRequest.onError(whyFailed))
  .to(claude.onError(whyFailed))
  .to(readAnswer.onError(whyFailed))
  .to(answerOk.onTrue(save.onError(whyFailed).to(done)).onFalse(whyFailed))
  .add(sampleAds)
  .to(prepareAds)
  .add(signShots)
  .to(shotAds.onError(whyFailed))
  .to(prepareAds)
  .add(whyFailed)
  .to(markFailed)
  .to(failed)
  .add(noteWebsite)
  .add(noteApify)
  .add(noteNumbers)
  .add(noteShots)
  .add(noteModel);
