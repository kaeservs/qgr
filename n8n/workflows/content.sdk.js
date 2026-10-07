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
      jsonBody: expr("{{ JSON.stringify({ p_run_id: $json.runId, p_stage: \"content\" }) }}"),
      options: { timeout: 30000 },
    },
    credentials: { supabaseApi: newCredential('Supabase QGR') },
  },
  output: [{ stage: 'content', run: { id: 'run-id', kind: 'competitor', input: 'website', url: 'https://example.com/', title: 'example.com', platforms: ['meta', 'linkedin', 'x'], goal: 'consultations', excerpt: null, competitor_name: null, files: null }, brand: { company: 'Quantum Global Residency', guardrails: [], voice: [] }, report: null, strategy: null }],
});

const buildRequest = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: "Build the Claude request",
    onError: 'continueErrorOutput',
    parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: "// The Claude request: Opus 5.5 at high effort, because this copy goes out in\n// QGR's name. The schema asks only for the platforms this run selected, with\n// each platform's own call-to-action buttons. Lengths are in the prompt; the\n// editor flags anything long. No temperature.\nconst MODEL = 'claude-opus-5-5';\nconst EFFORT = 'high';\nconst ctx = $input.first().json;\nconst run = ctx.run;\nconst brand = ctx.brand;\nconst strategy = ctx.strategy;\nif (!strategy || !strategy.angles || strategy.angles.length !== 3) {\n  throw new Error('The strategy is missing its three angles.');\n}\n\nconst NAMES = { meta: 'Meta', linkedin: 'LinkedIn', x: 'X' };\nconst LIMITS = {\n  meta: 'primary text up to 125 characters, headline up to 40, description up to 30',\n  linkedin: 'introductory text up to 150 characters, headline up to 70',\n  x: 'post up to 280 characters (a hard limit), card title up to 70',\n};\nconst CTAS = {\n  meta: ['Book now', 'Learn more', 'Sign up', 'Contact us', 'Get quote', 'Download'],\n  linkedin: ['Learn more', 'Register', 'Sign up', 'Request demo', 'Download', 'Apply'],\n};\nconst GOALS = {\n  consultations: 'booking a free consultation',\n  webinar: 'registering for the webinar',\n  awareness: 'finding out more',\n  guide: 'downloading the guide',\n};\n\nconst copyProps = {};\nrun.platforms.forEach(function (p) {\n  if (p === 'meta') {\n    copyProps.meta = {\n      type: 'object', additionalProperties: false, required: ['text', 'headline', 'description', 'cta'],\n      properties: { text: { type: 'string' }, headline: { type: 'string' }, description: { type: 'string' }, cta: { type: 'string', enum: CTAS.meta } },\n    };\n  } else if (p === 'linkedin') {\n    copyProps.linkedin = {\n      type: 'object', additionalProperties: false, required: ['text', 'headline', 'cta'],\n      properties: { text: { type: 'string' }, headline: { type: 'string' }, cta: { type: 'string', enum: CTAS.linkedin } },\n    };\n  } else if (p === 'x') {\n    copyProps.x = {\n      type: 'object', additionalProperties: false, required: ['text', 'headline'],\n      properties: { text: { type: 'string' }, headline: { type: 'string' } },\n    };\n  }\n});\n\nconst schema = {\n  type: 'object',\n  additionalProperties: false,\n  required: ['variants'],\n  properties: {\n    variants: {\n      type: 'array',\n      items: {\n        type: 'object',\n        additionalProperties: false,\n        required: ['label', 'creative_text', 'creative_style', 'image_prompt', 'copy'],\n        properties: {\n          label: { type: 'string', enum: ['A', 'B', 'C'] },\n          creative_text: { type: 'string' },\n          creative_style: { type: 'string', enum: ['arcs', 'split', 'spotlight'] },\n          image_prompt: { type: 'string' },\n          copy: { type: 'object', additionalProperties: false, required: run.platforms, properties: copyProps },\n        },\n      },\n    },\n  },\n};\n\nconst lengths = run.platforms.map(function (p) { return '  ' + NAMES[p] + ': ' + LIMITS[p]; }).join('\\n');\nconst system = [\n  'You write paid social ads for Quantum Global Residency (QGR), an EB-5 and U.S. residency advisory firm. Write three variants: A follows the strategy\\'s first angle, B the second, C the third.',\n  '',\n  'For each variant:',\n  '- copy for each of these platforms, written for that platform rather than one text cut down, within these lengths:',\n  lengths,\n  '- creative_text: the words on the image, eight words at most.',\n  '- creative_style: arcs, split or spotlight, each used once across the three variants.',\n  '- image_prompt: a prompt for an image model describing the scene only: no words in the image, QGR indigo (#1C1B9D) and gold (#EFB74A), no real or identifiable people, no flags.',\n  '',\n  'Voice: ' + (brand.voice || []).join(', ') + '. Every ad leads to ' + GOALS[run.goal] + '.',\n  'Rules every ad follows: ' + strategy.guardrails.join('; ') + '.',\n  'Never say guaranteed, never promise approval, a timeline or a return, and never name a competitor. Processing times are estimates.',\n].join('\\n');\n\nconst material = {\n  brand: { company: brand.company, website: brand.website, offer: brand.offer, audience: brand.audience },\n  strategy: { title: strategy.title, positioning: strategy.positioning, audiences: strategy.audiences, angles: strategy.angles, channels: strategy.channels },\n};\n\nreturn [{\n  json: {\n    body: {\n      model: MODEL,\n      max_tokens: 16000,\n      fallbacks: 'default',\n      output_config: { effort: EFFORT, format: { type: 'json_schema', schema: schema } },\n      system: system,\n      messages: [{ role: 'user', content: 'The brand and the strategy, as JSON:\\n' + JSON.stringify(material) }],\n    },\n  },\n}];\n" },
  },
  output: [{ body: { model: 'claude-opus-5-5', max_tokens: 16000 } }],
});

const claude = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: {
    name: "Claude: write the ads",
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
    parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: "// Reads Claude's three variants, names each after its strategy angle, and\n// flags (never silently fixes) anything that breaks a guardrail or X's hard\n// 280-character limit, so a person sees it before approving.\nconst res = $input.first().json;\nconst ctx = $('Begin: load the run').first().json;\nconst run = ctx.run;\nconst angles = ctx.strategy.angles;\nconst u = res.usage || {};\nconst usage = {\n  model: res.model || 'claude-opus-5-5',\n  input_tokens: u.input_tokens || 0,\n  output_tokens: u.output_tokens || 0,\n  cache_creation_input_tokens: u.cache_creation_input_tokens || 0,\n  cache_read_input_tokens: u.cache_read_input_tokens || 0,\n};\nfunction fail(message) {\n  return [{ json: { ok: false, p_run_id: run.id, p_error: message, p_usage: usage } }];\n}\n\nif (res.stop_reason === 'refusal') {\n  const category = res.stop_details && res.stop_details.category;\n  return fail('Claude declined to write these ads' + (category ? ' (' + category + ')' : '') + '.');\n}\nif (res.stop_reason === 'max_tokens') {\n  return fail('Claude ran out of room before the ads were finished.');\n}\nconst block = (res.content || []).find(function (b) { return b.type === 'text'; });\nlet answer;\ntry {\n  answer = JSON.parse(block ? block.text : '');\n} catch (e) {\n  return fail('Claude did not return readable ads.');\n}\n\nconst RULES = [\n  [/guarantee/i, 'says \"guarantee\"'],\n  [/risk[\\s-]?free/i, 'says \"risk-free\"'],\n  [/\\b100\\s?%/, 'says \"100%\"'],\n  [/\\bassured\\b/i, 'says \"assured\"'],\n  [/\\bin\\s+\\d+\\s+(days|weeks|months)\\b/i, 'promises a timeline'],\n];\nconst byLabel = {};\n(answer.variants || []).forEach(function (v) { if (!byLabel[v.label]) byLabel[v.label] = v; });\n\nconst variants = [];\nconst labels = ['A', 'B', 'C'];\nfor (let i = 0; i < labels.length; i += 1) {\n  const v = byLabel[labels[i]];\n  if (!v) return fail('Claude did not write variant ' + labels[i] + '.');\n  const warnings = [];\n  run.platforms.forEach(function (p) {\n    const copy = v.copy && v.copy[p];\n    if (!copy) return;\n    ['text', 'headline', 'description'].forEach(function (field) {\n      const value = copy[field];\n      if (!value) return;\n      RULES.forEach(function (rule) {\n        if (rule[0].test(value)) warnings.push(p + ' ' + field + ' ' + rule[1]);\n      });\n    });\n    if (p === 'x' && copy.text && copy.text.length > 280) {\n      warnings.push('x text is ' + copy.text.length + ' characters; X allows 280');\n    }\n  });\n  RULES.forEach(function (rule) {\n    if (rule[0].test(v.creative_text || '')) warnings.push('image text ' + rule[1]);\n  });\n  variants.push({\n    label: labels[i],\n    angle: angles[i].name,\n    creative_text: String(v.creative_text || '').trim(),\n    creative_style: v.creative_style,\n    image_prompt: String(v.image_prompt || '').trim(),\n    image_url: null,\n    copy: v.copy,\n    warnings: warnings,\n  });\n}\nreturn [{ json: { ok: true, p_run_id: run.id, p_ad_set: { title: ctx.strategy.title, variants: variants }, p_usage: usage } }];\n" },
  },
  output: [{ ok: true, p_run_id: 'run-id', p_ad_set: { title: 'Q4', variants: [] }, p_usage: { model: 'claude-opus-5-5' } }],
});

const answerOk = ifElse({
  version: 2.3,
  config: {
    name: "Ads ready?",
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 },
        conditions: [{ leftValue: expr('{{ $json.ok }}'), rightValue: true, operator: { type: 'boolean', operation: 'true', singleValue: true } }],
        combinator: 'and',
      },
    },
  },
});

const images = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: "Images (placeholder)",
    parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: "// PLACEHOLDER for image generation (ChatGPT or Higgsfield). Every variant\n// already carries an image_prompt. To connect: send each prompt to the image\n// model, upload the result to Supabase Storage, and set image_url to its\n// address. Until then image_url stays empty and the dashboard draws the\n// branded text-on-indigo design instead.\nconst item = $input.first().json;\nconst variants = item.p_ad_set.variants.map(function (v) {\n  return Object.assign({}, v, { image_url: null });\n});\nreturn [{ json: Object.assign({}, item, { p_ad_set: Object.assign({}, item.p_ad_set, { variants: variants }) }) }];\n" },
  },
  output: [{ ok: true, p_run_id: 'run-id', p_ad_set: { title: 'Q4', variants: [] }, p_usage: { model: 'claude-opus-5-5' } }],
});

const save = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: {
    name: "Save the ads",
    onError: 'continueErrorOutput',
    parameters: {
      method: 'POST',
      url: 'https://tcinsdexwvzpznqlcpww.supabase.co/rest/v1/rpc/agent_finish_content',
      authentication: 'predefinedCredentialType',
      nodeCredentialType: 'supabaseApi',
      sendBody: true,
      contentType: 'json',
      specifyBody: 'json',
      jsonBody: expr("{{ JSON.stringify({ p_run_id: $json.p_run_id, p_ad_set: $json.p_ad_set, p_usage: $json.p_usage }) }}"),
      options: { timeout: 30000 },
    },
    credentials: { supabaseApi: newCredential('Supabase QGR') },
  },
  output: [{ data: 'ad-set-id' }],
});


const whyFailed = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: "Why it failed",
    parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: "// Why the agent stopped, from whichever step failed: a step that reports\n// { ok: false, p_error } or a node's error output ({ error }).\nconst item = $input.first().json;\nconst ctx = $('Begin: load the run').first().json;\nlet message = item.p_error;\nif (!message) {\n  const e = item.error;\n  message = typeof e === 'string' ? e : (e && (e.description || e.message)) || 'Unknown error';\n}\nreturn [{\n  json: {\n    p_run_id: ctx.run.id,\n    p_stage: 'content',\n    p_error: String(message).slice(0, 500),\n    p_usage: item.p_usage || null,\n  },\n}];\n" },
  },
  output: [{ p_run_id: 'run-id', p_stage: 'content', p_error: 'Claude declined', p_usage: null }],
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

const noteImages = sticky('## Images go here (ChatGPT or Higgsfield)\nEvery variant already has an **image_prompt**. To connect: send each prompt to the image model, upload the result to Supabase Storage and set **image_url**. Until then the dashboard draws the branded text-on-indigo design.', [images], { color: 3 });
const noteGuardrails = sticky('## Guardrails\nThe prompt carries the brand rules. This step also flags, never silently fixes, any "guarantee", "risk-free", promised timeline or X post over 280 characters, so a person sees it before approving.', [readAnswer], { color: 5 });

export default workflow('qgr-content-agent', 'QGR · Content Agent')
  .add(start)
  .to(begin.onError(couldNotStart))
  .to(buildRequest.onError(whyFailed))
  .to(claude.onError(whyFailed))
  .to(readAnswer.onError(whyFailed))
  .to(answerOk.onTrue(images.to(save.onError(whyFailed).to(done))).onFalse(whyFailed))
  .add(whyFailed)
  .to(markFailed)
  .to(failed)
  .add(noteImages)
  .add(noteGuardrails);
