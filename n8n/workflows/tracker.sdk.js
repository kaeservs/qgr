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
  output: [{ stage: 'tracker', run: { id: 'run-id', kind: 'competitor', input: 'website', url: 'https://example.com/', title: 'example.com', platforms: ['meta', 'linkedin', 'x'], goal: 'consultations', excerpt: null, competitor_name: null, files: null }, brand: { company: 'Quantum Global Residency', guardrails: [], voice: [] }, report: null, strategy: null }],
});

const plan = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: "Plan the scan",
    onError: 'continueErrorOutput',
    parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: "// What to scan, from the run the database handed back.\nconst ctx = $input.first().json;\nconst run = ctx.run;\nlet domain = null;\nif (run.input === 'website' && run.url) {\n  domain = new URL(run.url).hostname.replace(/^www\\./, '').toLowerCase();\n}\nreturn [{\n  json: {\n    runId: run.id,\n    input: run.input,\n    url: run.url || null,\n    websiteUrl: run.input === 'website' ? run.url : '',\n    domain: domain,\n    competitorHint: run.competitor_name || (domain ? domain.split('.')[0] : null),\n    files: run.files || [],\n    platforms: run.platforms,\n  },\n}];\n" },
  },
  output: [{ runId: 'run-id', input: 'website', url: 'https://example.com/', websiteUrl: 'https://example.com/', domain: 'example.com', competitorHint: 'example', files: [], platforms: ['meta'] }],
});

const hasWebsite = ifElse({
  version: 2.3,
  config: {
    name: 'Has a website to read?',
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 },
        conditions: [{ leftValue: expr('{{ $json.websiteUrl }}'), rightValue: '', operator: { type: 'string', operation: 'notEmpty', singleValue: true } }],
        combinator: 'and',
      },
    },
  },
});

const readWebsite = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: {
    name: 'Read their website',
    onError: 'continueRegularOutput',
    parameters: {
      method: 'GET',
      url: expr('{{ $json.websiteUrl }}'),
      sendHeaders: true,
      headerParameters: { parameters: [{ name: 'User-Agent', value: 'QGR-Competitor-Tracker/1.0' }] },
      options: {
        timeout: 20000,
        redirect: { redirect: { followRedirects: true, maxRedirects: 5 } },
        response: { response: { responseFormat: 'text', outputPropertyName: 'data' } },
      },
    },
  },
  output: [{ data: '<html><body>Example</body></html>' }],
});

const keepWebsiteText = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: "Keep the website text",
    parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: "// The page's words without markup, capped so the prompt stays small.\n// Used after \"Read their website\" (tracker) and \"Read the source page\" (strategist).\nconst plan = $('Plan the scan').first().json;\nconst html = String($input.first().json.data || '');\nconst text = html\n  .replace(/<(script|style|noscript|svg|template)[\\s\\S]*?<\\/\\1>/gi, ' ')\n  .replace(/<!--[\\s\\S]*?-->/g, ' ')\n  .replace(/<[^>]+>/g, ' ')\n  .replace(/&nbsp;/g, ' ')\n  .replace(/&amp;/g, '&')\n  .replace(/&(rsquo|lsquo|#39);/g, \"'\")\n  .replace(/&(rdquo|ldquo|quot);/g, '\"')\n  .replace(/&[a-z]+;|&#\\d+;/gi, ' ')\n  .replace(/\\s+/g, ' ')\n  .trim()\n  .slice(0, 12000);\nreturn [{ json: Object.assign({}, plan, { websiteText: text }) }];\n" },
  },
  output: [{ runId: 'run-id', websiteText: 'Example' }],
});

const placeholderAds = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: "Apify: competitor ads (placeholder)",
    parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: "// PLACEHOLDER for Apify. Returns sample ads in the shape the Apify step will\n// produce, flagged 'placeholder' so the report says its ads were samples.\n// To connect Apify: replace this node with an HTTP Request to the actor's\n// run-sync-get-dataset-items endpoint, then a Code node that maps each item to\n// { id, platform, format, startDate, isActive, pageName, text, headline, cta,\n//   adUrl, mediaUrl } and sets dataSource: 'apify'.\nconst plan = $input.first().json;\nconst hint = plan.competitorHint || 'competitor';\nconst pageName = hint.charAt(0).toUpperCase() + hint.slice(1);\nconst day = 24 * 60 * 60 * 1000;\nconst sample = [\n  ['meta', 'video', 63, \"Your kids shouldn't age out while you wait.\", 'Plan your EB-5 timeline', 'Book now'],\n  ['meta', 'video', 58, \"Your kids shouldn't age out while you wait. Here's how families plan ahead.\", 'Talk to an advisor', 'Book now'],\n  ['meta', 'image', 41, \"The H-1B lottery isn't a plan. This is.\", 'EB-5, explained', 'Learn more'],\n  ['meta', 'image', 37, \"Still waiting on the H-1B lottery? There's another door.\", 'See your options', 'Learn more'],\n  ['linkedin', 'document', 34, 'What $800K actually buys: a timeline, not a promise.', 'The EB-5 cost guide', 'Download'],\n  ['linkedin', 'carousel', 28, '3 questions to ask before you pick an EB-5 project.', 'Pick a project wisely', 'Learn more'],\n  ['meta', 'image', 19, 'Rural or urban project? Here is what changes for you.', 'TEA projects explained', 'Learn more'],\n  ['meta', 'video', 12, 'Meet the families who moved last year.', 'Their stories', 'Watch more'],\n  ['x', 'text', 9, 'We read the visa bulletin so you do not have to.', 'This month, explained', 'Learn more'],\n  ['linkedin', 'image', 6, 'Free webinar: EB-5 for Indian families.', 'Save your seat', 'Register'],\n];\nconst ads = sample.map(function (a, i) {\n  return {\n    id: 'sample-' + (i + 1),\n    platform: a[0],\n    format: a[1],\n    startDate: new Date(Date.now() - a[2] * day).toISOString(),\n    isActive: true,\n    pageName: pageName,\n    text: a[3],\n    headline: a[4],\n    cta: a[5],\n    adUrl: null,\n    mediaUrl: null,\n  };\n});\nreturn [{ json: Object.assign({}, plan, { dataSource: 'placeholder', ads: ads }) }];\n" },
  },
  output: [{ runId: 'run-id', dataSource: 'placeholder', ads: [] }],
});

const prepareAds = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: "Prepare the ads",
    onError: 'continueErrorOutput',
    parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: "// Turns raw ads into what Claude reads. Days running are computed here from\n// each ad's start date: the model is never asked to count or estimate.\nconst src = $input.first().json;\nconst now = Date.now();\nconst day = 24 * 60 * 60 * 1000;\nconst ads = (src.ads || [])\n  .filter(function (a) { return a.isActive !== false && a.text; })\n  .slice(0, 60)\n  .map(function (a, i) {\n    const start = Date.parse(a.startDate);\n    const text = String(a.text);\n    return {\n      id: 'a' + (i + 1),\n      platform: a.platform,\n      format: a.format,\n      days_running: Number.isFinite(start) ? Math.max(0, Math.round((now - start) / day)) : 0,\n      text: text.slice(0, 600),\n      headline: a.headline || null,\n      cta: a.cta || null,\n      page_name: a.pageName || null,\n      ad_url: a.adUrl || null,\n      media_url: a.mediaUrl || null,\n      hook_line: text.split(/(?<=[.!?])\\s/)[0].slice(0, 140),\n    };\n  });\nif (ads.length === 0) {\n  throw new Error('No active ads were found for this competitor.');\n}\nreturn [{ json: Object.assign({}, src, { ads: ads }) }];\n" },
  },
  output: [{ runId: 'run-id', dataSource: 'placeholder', ads: [{ id: 'a1', platform: 'meta', format: 'video', days_running: 63, text: 'Hook', hook_line: 'Hook' }] }],
});

const buildRequest = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: "Build the Claude request",
    onError: 'continueErrorOutput',
    parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: "// The Claude request: Opus 5.5 at medium effort (reading and grouping ads is\n// not the hard part), JSON constrained by the schema below, and a server-side\n// fallback model if a safety classifier declines. No temperature: Opus 5.5\n// rejects it.\nconst MODEL = 'claude-opus-5-5';\nconst EFFORT = 'medium';\nconst p = $input.first().json;\nconst ANGLES = ['Timeline & urgency', 'Family & education', 'Due diligence', 'Investment safety', 'Career freedom', 'Process explained', 'Cost & pricing', 'Lifestyle', 'Social proof', 'Other'];\n\nconst system = [\n  \"You analyse a competitor's paid social ads for Quantum Global Residency (QGR), an EB-5 and U.S. residency advisory firm. You get the competitor's active ads, each with an id and the number of days it has been running, and sometimes text from their website.\",\n  '',\n  'Report what is working for them:',\n  '- hooks: group ads that open with the same idea and state that idea once, quoted from the ad that words it best (do not paraphrase). List every ad id in the group. At most six hooks; an ad belongs to at most one. The system works out how long each hook has run and how many versions it has from the ids, so give no numbers.',\n  '- ad_angles: one angle for every ad id, from the allowed list.',\n  '- insights: three observations a marketer could act on, one sentence each, each naming its evidence in the ads (for example \"their four longest-running ads all lead with ...\"). If the ads are few or thin, say so rather than guess.',\n  '- summary: the single most useful finding, under 90 characters.',\n  '- competitor_name: the advertiser as their ads name themselves.',\n  '- website_summary: one or two sentences on how they position themselves, from the website text; an empty string when there is none.',\n  '',\n  'Work only from the material given.',\n].join('\\n');\n\nconst material = {\n  competitor: { domain: p.domain, name_hint: p.competitorHint },\n  website_text: p.websiteText || '',\n  ads: p.ads.map(function (a) {\n    return { id: a.id, platform: a.platform, format: a.format, days_running: a.days_running, text: a.text, headline: a.headline, cta: a.cta, page_name: a.page_name };\n  }),\n};\n\nconst schema = {\n  type: 'object',\n  additionalProperties: false,\n  required: ['competitor_name', 'summary', 'website_summary', 'insights', 'hooks', 'ad_angles'],\n  properties: {\n    competitor_name: { type: 'string' },\n    summary: { type: 'string' },\n    website_summary: { type: 'string' },\n    insights: { type: 'array', items: { type: 'string' } },\n    hooks: {\n      type: 'array',\n      items: {\n        type: 'object',\n        additionalProperties: false,\n        required: ['text', 'ad_ids'],\n        properties: { text: { type: 'string' }, ad_ids: { type: 'array', items: { type: 'string' } } },\n      },\n    },\n    ad_angles: {\n      type: 'array',\n      items: {\n        type: 'object',\n        additionalProperties: false,\n        required: ['ad_id', 'angle'],\n        properties: { ad_id: { type: 'string' }, angle: { type: 'string', enum: ANGLES } },\n      },\n    },\n  },\n};\n\nreturn [{\n  json: {\n    body: {\n      model: MODEL,\n      max_tokens: 16000,\n      fallbacks: 'default',\n      output_config: { effort: EFFORT, format: { type: 'json_schema', schema: schema } },\n      system: system,\n      messages: [{ role: 'user', content: 'The competitor material, as JSON:\\n' + JSON.stringify(material) }],\n    },\n  },\n}];\n" },
  },
  output: [{ body: { model: 'claude-opus-5-5', max_tokens: 16000 } }],
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
  output: [{ model: 'claude-opus-5-5', stop_reason: 'end_turn', content: [{ type: 'text', text: '{}' }], usage: { input_tokens: 5000, output_tokens: 1500 } }],
});

const readAnswer = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: "Read Claude's answer",
    onError: 'continueErrorOutput',
    parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: "// Reads Claude's answer and builds the report. Every number here comes from\n// the ads themselves: a hook's days running is its longest-running ad's, its\n// versions are how many ads share it, an angle's count is how many ads use it.\nconst res = $input.first().json;\nconst prep = $('Prepare the ads').first().json;\nconst u = res.usage || {};\nconst usage = {\n  model: res.model || 'claude-opus-5-5',\n  input_tokens: u.input_tokens || 0,\n  output_tokens: u.output_tokens || 0,\n  cache_creation_input_tokens: u.cache_creation_input_tokens || 0,\n  cache_read_input_tokens: u.cache_read_input_tokens || 0,\n};\nfunction fail(message) {\n  return [{ json: { ok: false, p_run_id: prep.runId, p_error: message, p_usage: usage } }];\n}\n\nif (res.stop_reason === 'refusal') {\n  const category = res.stop_details && res.stop_details.category;\n  return fail('Claude declined to analyse these ads' + (category ? ' (' + category + ')' : '') + '.');\n}\nif (res.stop_reason === 'max_tokens') {\n  return fail('Claude ran out of room before the report was finished.');\n}\nconst block = (res.content || []).find(function (b) { return b.type === 'text'; });\nlet answer;\ntry {\n  answer = JSON.parse(block ? block.text : '');\n} catch (e) {\n  return fail('Claude did not return a readable report.');\n}\n\nconst byId = {};\nprep.ads.forEach(function (a) { byId[a.id] = a; });\nconst used = {};\nconst hooks = (answer.hooks || [])\n  .map(function (h) {\n    const ads = (h.ad_ids || []).filter(function (id) { return byId[id] && !used[id]; }).map(function (id) { used[id] = true; return byId[id]; });\n    if (ads.length === 0 || !h.text) return null;\n    const lead = ads.reduce(function (a, b) { return b.days_running > a.days_running ? b : a; });\n    return { text: String(h.text).trim(), platform: lead.platform, format: lead.format, days_running: lead.days_running, variations: ads.length };\n  })\n  .filter(Boolean)\n  .sort(function (a, b) { return b.days_running - a.days_running || b.variations - a.variations; })\n  .slice(0, 6);\nif (hooks.length === 0) {\n  return fail('Claude grouped none of the ads into hooks.');\n}\n\nconst counts = {};\n(answer.ad_angles || []).forEach(function (x) {\n  if (byId[x.ad_id]) counts[x.angle] = (counts[x.angle] || 0) + 1;\n});\nconst angles = Object.keys(counts)\n  .map(function (label) { return { label: label, ads: counts[label] }; })\n  .sort(function (a, b) { return b.ads - a.ads; });\n\nconst examples = prep.ads\n  .slice()\n  .sort(function (a, b) { return b.days_running - a.days_running; })\n  .slice(0, 4)\n  .map(function (a) {\n    return { platform: a.platform, format: a.format, text: a.hook_line, days_running: a.days_running, ad_url: a.ad_url, media_url: a.media_url };\n  });\n\nconst platforms = [];\nprep.ads.forEach(function (a) { if (platforms.indexOf(a.platform) === -1) platforms.push(a.platform); });\n\nconst report = {\n  competitor: { name: String(answer.competitor_name || prep.competitorHint || prep.domain || 'Competitor').trim(), domain: prep.domain },\n  data_source: prep.dataSource,\n  active_ads: prep.ads.length,\n  platforms: platforms,\n  summary: String(answer.summary || '').trim(),\n  website_summary: String(answer.website_summary || '').trim() || null,\n  insights: (answer.insights || []).map(function (s) { return String(s).trim(); }).filter(Boolean).slice(0, 5),\n  angles: angles,\n  hooks: hooks,\n  ads: examples,\n};\nif (report.insights.length === 0) {\n  return fail('Claude returned no insights.');\n}\nreturn [{ json: { ok: true, p_run_id: prep.runId, p_report: report, p_usage: usage } }];\n" },
  },
  output: [{ ok: true, p_run_id: 'run-id', p_report: { hooks: [] }, p_usage: { model: 'claude-opus-5-5' } }],
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
      options: { timeout: 30000 },
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

const noteApify = sticky('## Apify goes here\nThis node returns **sample ads** so the run works end to end, and the report is marked as sample data.\n\nTo connect Apify: replace it with an HTTP Request to your actor\'s **run-sync-get-dataset-items** endpoint (an Apify token credential), then a Code node mapping each item to { id, platform, format, startDate, isActive, pageName, text, headline, cta, adUrl, mediaUrl } with dataSource \'apify\'.', [placeholderAds], { color: 3 });
const noteNumbers = sticky('## Numbers come from the data\nClaude groups ads into hooks by id and names each ad\'s angle. Days running, versions and angle counts are computed in code from the ads, never taken from the model.', [prepareAds, readAnswer], { color: 5 });
const noteModel = sticky('## Claude\nOpus 5.5, medium effort, JSON constrained by a schema, server-side fallback on a refusal. No temperature: Opus 5.5 rejects it. Usage is saved with every result.', [buildRequest, claude], { color: 6 });

export default workflow('qgr-competitor-tracker', 'QGR · Competitor Tracker')
  .add(start)
  .to(begin.onError(couldNotStart))
  .to(plan.onError(whyFailed))
  .to(hasWebsite.onTrue(readWebsite.to(keepWebsiteText.to(placeholderAds))).onFalse(placeholderAds))
  .add(placeholderAds)
  .to(prepareAds.onError(whyFailed))
  .to(buildRequest.onError(whyFailed))
  .to(claude.onError(whyFailed))
  .to(readAnswer.onError(whyFailed))
  .to(answerOk.onTrue(save.onError(whyFailed).to(done)).onFalse(whyFailed))
  .add(whyFailed)
  .to(markFailed)
  .to(failed)
  .add(noteApify)
  .add(noteNumbers)
  .add(noteModel);
