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
      jsonBody: expr("{{ JSON.stringify({ p_run_id: $json.runId, p_stage: \"strategist\" }) }}"),
      options: { timeout: 30000 },
    },
    credentials: { supabaseApi: newCredential('Supabase QGR') },
  },
  output: [{ stage: 'strategist', run: { id: 'run-id', kind: 'competitor', input: 'website', url: 'https://example.com/', title: 'example.com', platforms: ['meta', 'linkedin', 'x'], goal: 'consultations', excerpt: null, competitor_name: null, files: null }, brand: { company: 'Quantum Global Residency', guardrails: [], voice: [] }, report: null, strategy: null }],
});

const plan = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: "Gather the material",
    onError: 'continueErrorOutput',
    parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: "// What the strategy is built from: the tracker's report on a competitor run,\n// or QGR's own content on a custom run.\nconst ctx = $input.first().json;\nconst run = ctx.run;\nconst KIND = { podcast: 'Podcast', blog: 'Blog post', video: 'Video', text: 'Text' };\nconst custom = run.kind === 'custom';\nconst needsSource = custom && run.input !== 'text';\nreturn [{\n  json: {\n    runId: run.id,\n    run: run,\n    brand: ctx.brand,\n    report: ctx.report,\n    needsSource: needsSource,\n    sourceUrl: needsSource ? run.url : '',\n    sourceText: run.input === 'text' ? run.excerpt : '',\n    sourceLabel: custom ? KIND[run.input] + ' · ' + run.title : null,\n  },\n}];\n" },
  },
  output: [{ runId: 'run-id', run: { id: 'run-id', kind: 'competitor', input: 'website', url: 'https://example.com/', title: 'example.com', platforms: ['meta', 'linkedin', 'x'], goal: 'consultations' }, brand: { guardrails: [] }, report: null, needsSource: true, sourceUrl: 'https://example.com/ep-1', sourceText: '', sourceLabel: 'Podcast · Ep. 1' }],
});

const needsSource = ifElse({
  version: 2.3,
  config: {
    name: 'Read the source first?',
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 },
        conditions: [{ leftValue: expr('{{ $json.needsSource }}'), rightValue: true, operator: { type: 'boolean', operation: 'true', singleValue: true } }],
        combinator: 'and',
      },
    },
  },
});

const readSource = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: {
    name: 'Read the source page',
    onError: 'continueRegularOutput',
    parameters: {
      method: 'GET',
      url: expr('{{ $json.sourceUrl }}'),
      sendHeaders: true,
      headerParameters: { parameters: [{ name: 'User-Agent', value: 'QGR-Ad-Strategist/1.0' }] },
      options: {
        timeout: 20000,
        redirect: { redirect: { followRedirects: true, maxRedirects: 5 } },
        response: { response: { responseFormat: 'text', outputPropertyName: 'data' } },
      },
    },
  },
  output: [{ data: '<html><body>Episode notes</body></html>' }],
});

const keepSourceText = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: "Keep the source text",
    parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: "// The page's words without markup, capped so the prompt stays small.\n// Used after \"Read their website\" (tracker) and \"Read the source page\" (strategist).\nconst plan = $('Gather the material').first().json;\nconst html = String($input.first().json.data || '');\nconst text = html\n  .replace(/<(script|style|noscript|svg|template)[\\s\\S]*?<\\/\\1>/gi, ' ')\n  .replace(/<!--[\\s\\S]*?-->/g, ' ')\n  .replace(/<[^>]+>/g, ' ')\n  .replace(/&nbsp;/g, ' ')\n  .replace(/&amp;/g, '&')\n  .replace(/&(rsquo|lsquo|#39);/g, \"'\")\n  .replace(/&(rdquo|ldquo|quot);/g, '\"')\n  .replace(/&[a-z]+;|&#\\d+;/gi, ' ')\n  .replace(/\\s+/g, ' ')\n  .trim()\n  .slice(0, 12000);\nreturn [{ json: Object.assign({}, plan, { sourceText: text }) }];\n" },
  },
  output: [{ runId: 'run-id', sourceText: 'Episode notes' }],
});

const buildRequest = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: "Build the Claude request",
    onError: 'continueErrorOutput',
    parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: "// The Claude request: Opus 5.5 at high effort, because the strategy is the\n// judgement the rest of the run depends on. JSON constrained by the schema;\n// server-side fallback if a classifier declines; no temperature.\nconst MODEL = 'claude-opus-5-5';\nconst EFFORT = 'high';\nconst p = $input.first().json;\nconst run = p.run;\nconst GOALS = {\n  consultations: 'Book free consultations',\n  webinar: 'Webinar sign-ups',\n  awareness: 'Brand awareness',\n  guide: 'Guide downloads',\n};\n\nconst system = [\n  \"You are the ad strategist for Quantum Global Residency (QGR), an EB-5 and U.S. residency advisory firm. From the material given (a report on a competitor's ads, or QGR's own content), write the strategy QGR's next ads follow.\",\n  '',\n  \"- positioning: one sentence QGR can own, built on its real strengths in the brand profile. Never borrow a competitor's claim.\",\n  \"- angles: exactly three, strongest first. For each: a short name; why it should work, naming the evidence (a competitor hook that keeps running, a gap no one covers, or a moment in the source); and one hook to test, in QGR's voice. With a competitor report, set based_on_hook to the competitor hook the angle answers, word for word, or null when the angle exploits a gap. Without one, based_on_hook is null.\",\n  '- audiences: one to three, specific enough to target.',\n  \"- channels: one for each platform in the run, with its share of the budget, its role and the formats to use.\",\n  \"- guardrails: at most two rules specific to this strategy; the brand's own guardrails always apply on top.\",\n  '- title: a short name for this push. summary: the strategy in under 90 characters.',\n  '',\n  'EB-5 is an investment with risk: nothing may promise an outcome, a timeline or a return.',\n].join('\\n');\n\nconst material = { brand: p.brand, goal: GOALS[run.goal], platforms: run.platforms };\nif (p.report) {\n  material.competitor_report = {\n    competitor: p.report.competitor,\n    summary: p.report.summary,\n    insights: p.report.insights,\n    angles_in_their_ads: p.report.angles,\n    winning_hooks: p.report.hooks,\n    website_summary: p.report.website_summary,\n  };\n} else {\n  material.source = { type: run.input, title: run.title, url: run.url, text: p.sourceText || '' };\n  if (run.input === 'podcast' || run.input === 'video') {\n    material.source.note = 'No transcript yet: this is the text of the episode or video page.';\n  }\n}\n\nconst schema = {\n  type: 'object',\n  additionalProperties: false,\n  required: ['title', 'summary', 'positioning', 'audiences', 'angles', 'channels', 'guardrails'],\n  properties: {\n    title: { type: 'string' },\n    summary: { type: 'string' },\n    positioning: { type: 'string' },\n    audiences: { type: 'array', items: { type: 'string' } },\n    angles: {\n      type: 'array',\n      items: {\n        type: 'object',\n        additionalProperties: false,\n        required: ['name', 'why', 'hook', 'based_on_hook'],\n        properties: {\n          name: { type: 'string' },\n          why: { type: 'string' },\n          hook: { type: 'string' },\n          based_on_hook: { anyOf: [{ type: 'string' }, { type: 'null' }] },\n        },\n      },\n    },\n    channels: {\n      type: 'array',\n      items: {\n        type: 'object',\n        additionalProperties: false,\n        required: ['platform', 'share', 'role', 'format'],\n        properties: {\n          platform: { type: 'string', enum: run.platforms },\n          share: { type: 'integer' },\n          role: { type: 'string' },\n          format: { type: 'string' },\n        },\n      },\n    },\n    guardrails: { type: 'array', items: { type: 'string' } },\n  },\n};\n\nreturn [{\n  json: {\n    body: {\n      model: MODEL,\n      max_tokens: 16000,\n      fallbacks: 'default',\n      output_config: { effort: EFFORT, format: { type: 'json_schema', schema: schema } },\n      system: system,\n      messages: [{ role: 'user', content: 'The material, as JSON:\\n' + JSON.stringify(material) }],\n    },\n  },\n}];\n" },
  },
  output: [{ body: { model: 'claude-opus-5-5', max_tokens: 16000 } }],
});

const claude = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: {
    name: "Claude: write the strategy",
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
    parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: "// Reads Claude's strategy and tidies what code can decide better than prose:\n// one channel per requested platform with shares that add up to 100, and the\n// brand's guardrails always first.\nconst res = $input.first().json;\nconst plan = $('Gather the material').first().json;\nconst run = plan.run;\nconst u = res.usage || {};\nconst usage = {\n  model: res.model || 'claude-opus-5-5',\n  input_tokens: u.input_tokens || 0,\n  output_tokens: u.output_tokens || 0,\n  cache_creation_input_tokens: u.cache_creation_input_tokens || 0,\n  cache_read_input_tokens: u.cache_read_input_tokens || 0,\n};\nfunction fail(message) {\n  return [{ json: { ok: false, p_run_id: run.id, p_error: message, p_usage: usage } }];\n}\n\nif (res.stop_reason === 'refusal') {\n  const category = res.stop_details && res.stop_details.category;\n  return fail('Claude declined to write this strategy' + (category ? ' (' + category + ')' : '') + '.');\n}\nif (res.stop_reason === 'max_tokens') {\n  return fail('Claude ran out of room before the strategy was finished.');\n}\nconst block = (res.content || []).find(function (b) { return b.type === 'text'; });\nlet s;\ntry {\n  s = JSON.parse(block ? block.text : '');\n} catch (e) {\n  return fail('Claude did not return a readable strategy.');\n}\n\nconst angles = (s.angles || []).slice(0, 3).map(function (a) {\n  return {\n    name: String(a.name || '').trim(),\n    why: String(a.why || '').trim(),\n    hook: String(a.hook || '').trim(),\n    based_on_hook: a.based_on_hook ? String(a.based_on_hook).trim() : null,\n  };\n});\nif (angles.length !== 3 || angles.some(function (a) { return !a.name || !a.hook; })) {\n  return fail('Claude did not return three complete angles.');\n}\n\n// One channel per requested platform, in the run's order.\nconst given = {};\n(s.channels || []).forEach(function (c) { if (run.platforms.indexOf(c.platform) !== -1 && !given[c.platform]) given[c.platform] = c; });\nconst channels = run.platforms.map(function (platform) {\n  const c = given[platform] || {};\n  return { platform: platform, share: Math.max(0, Number(c.share) || 0), role: String(c.role || '').trim(), format: String(c.format || '').trim() };\n});\nconst total = channels.reduce(function (sum, c) { return sum + c.share; }, 0);\nchannels.forEach(function (c) { c.share = total > 0 ? Math.round((c.share * 100) / total) : Math.round(100 / channels.length); });\nconst drift = 100 - channels.reduce(function (sum, c) { return sum + c.share; }, 0);\nif (drift !== 0) {\n  const biggest = channels.reduce(function (a, b) { return b.share > a.share ? b : a; });\n  biggest.share += drift;\n}\n\n// The brand's guardrails, then at most two of the strategy's own.\nconst guardrails = (plan.brand.guardrails || []).slice();\n(s.guardrails || []).slice(0, 2).forEach(function (g) {\n  const rule = String(g).trim();\n  const known = guardrails.some(function (x) { return x.toLowerCase() === rule.toLowerCase(); });\n  if (rule && !known) guardrails.push(rule);\n});\n\nconst strategy = {\n  title: String(s.title || run.title).trim(),\n  summary: String(s.summary || '').trim(),\n  positioning: String(s.positioning || '').trim(),\n  audiences: (s.audiences || []).map(function (a) { return String(a).trim(); }).filter(Boolean).slice(0, 3),\n  angles: angles,\n  channels: channels,\n  guardrails: guardrails,\n  source_label: plan.sourceLabel,\n};\nif (!strategy.positioning || strategy.audiences.length === 0) {\n  return fail('Claude did not return a positioning and an audience.');\n}\nreturn [{ json: { ok: true, p_run_id: run.id, p_strategy: strategy, p_usage: usage } }];\n" },
  },
  output: [{ ok: true, p_run_id: 'run-id', p_strategy: { angles: [] }, p_usage: { model: 'claude-opus-5-5' } }],
});

const answerOk = ifElse({
  version: 2.3,
  config: {
    name: "Strategy ready?",
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
    name: "Save the strategy",
    onError: 'continueErrorOutput',
    parameters: {
      method: 'POST',
      url: 'https://tcinsdexwvzpznqlcpww.supabase.co/rest/v1/rpc/agent_finish_strategist',
      authentication: 'predefinedCredentialType',
      nodeCredentialType: 'supabaseApi',
      sendBody: true,
      contentType: 'json',
      specifyBody: 'json',
      jsonBody: expr("{{ JSON.stringify({ p_run_id: $json.p_run_id, p_strategy: $json.p_strategy, p_usage: $json.p_usage }) }}"),
      options: { timeout: 30000 },
    },
    credentials: { supabaseApi: newCredential('Supabase QGR') },
  },
  output: [{ data: 'strategy-id' }],
});


const whyFailed = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: "Why it failed",
    parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: "// Why the agent stopped, from whichever step failed: a step that reports\n// { ok: false, p_error } or a node's error output ({ error }).\nconst item = $input.first().json;\nconst ctx = $('Begin: load the run').first().json;\nlet message = item.p_error;\nif (!message) {\n  const e = item.error;\n  message = typeof e === 'string' ? e : (e && (e.description || e.message)) || 'Unknown error';\n}\nreturn [{\n  json: {\n    p_run_id: ctx.run.id,\n    p_stage: 'strategist',\n    p_error: String(message).slice(0, 500),\n    p_usage: item.p_usage || null,\n  },\n}];\n" },
  },
  output: [{ p_run_id: 'run-id', p_stage: 'strategist', p_error: 'Claude declined', p_usage: null }],
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

const noteSource = sticky('## Custom runs\nA blog post is read from its page. A podcast or video has **no transcript yet**: the strategist reads the episode page and is told so. Pasted text is used as it is.', [needsSource, readSource, keepSourceText], { color: 3 });
const noteModel = sticky('## Claude\nOpus 5.5, high effort: the strategy is the judgement the rest of the run depends on. Budget shares are made to add up to 100 in code, and the brand guardrails always lead.', [buildRequest, claude, readAnswer], { color: 6 });

export default workflow('qgr-ad-strategist', 'QGR · Ad Strategist')
  .add(start)
  .to(begin.onError(couldNotStart))
  .to(plan.onError(whyFailed))
  .to(needsSource.onTrue(readSource.to(keepSourceText.to(buildRequest))).onFalse(buildRequest))
  .add(buildRequest.onError(whyFailed))
  .to(claude.onError(whyFailed))
  .to(readAnswer.onError(whyFailed))
  .to(answerOk.onTrue(save.onError(whyFailed).to(done)).onFalse(whyFailed))
  .add(whyFailed)
  .to(markFailed)
  .to(failed)
  .add(noteSource)
  .add(noteModel);
