import { workflow, node, trigger, sticky, newCredential, ifElse, switchCase, expr } from '@n8n/workflow-sdk';

const everyFiveMinutes = trigger({
  type: 'n8n-nodes-base.scheduleTrigger',
  version: 1.4,
  config: {
    name: 'Every five minutes',
    parameters: { rule: { interval: [{ field: 'minutes', minutesInterval: 5 }] } },
  },
  output: [{}],
});

const lookNow = trigger({
  type: 'n8n-nodes-base.webhook',
  version: 2.1,
  config: {
    name: 'Look now',
    parameters: {
      httpMethod: 'POST',
      path: 'qgr-moments',
      authentication: 'headerAuth',
      responseMode: 'onReceived',
      options: { responseCode: { values: { responseCode: 'customCode', customCode: 202 } } },
    },
    credentials: { httpHeaderAuth: newCredential('QGR webhook secret') },
  },
  output: [{ body: {} }],
});

const takeDue = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: {
    name: "Take the videos waiting",
    executeOnce: true,
    parameters: {
      method: 'POST',
      url: 'https://tcinsdexwvzpznqlcpww.supabase.co/rest/v1/rpc/moments_take_due',
      authentication: 'predefinedCredentialType',
      nodeCredentialType: 'supabaseApi',
      sendBody: true,
      contentType: 'json',
      specifyBody: 'json',
      jsonBody: expr("{{ JSON.stringify({ p_limit: 2 }) }}"),
      options: { timeout: 30000 },
    },
    credentials: { supabaseApi: newCredential('Supabase QGR') },
  },
  output: [{ long_video_id: 'video-id', title: 'EB-5 webinar', duration: 1800, guidance: null, transcript: [{ start: 0, end: 9.5, text: 'Welcome, everyone.' }], brand: { company: 'Quantum Global Residency' } }],
});

const eachVideo = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: "One item per video",
    parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: "// The rows a database function returned, one item each. n8n turns a JSON\n// array answer into items by itself; this also takes one item holding the\n// whole array, so the next node sees the same either way. Nothing due means\n// no items, and the rest of the workflow does not run.\nconst out = [];\n$input.all().forEach(function (item) {\n  const json = item.json;\n  let rows = [];\n  if (Array.isArray(json)) rows = json;\n  else if (json && Array.isArray(json.data)) rows = json.data;\n  else if (json && typeof json === 'object' && Object.keys(json).length > 0) rows = [json];\n  rows.forEach(function (row) {\n    if (row && typeof row === 'object') out.push({ json: row });\n  });\n});\nreturn out;\n" },
  },
  output: [{ long_video_id: 'video-id', title: 'EB-5 webinar', duration: 1800, guidance: null, transcript: [{ start: 0, end: 9.5, text: 'Welcome, everyone.' }], brand: { company: 'Quantum Global Residency' } }],
});

const buildRequest = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: "Build the Claude request",
    parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: "// The Claude request for a long video's moments: Haiku 5.5 at medium effort,\n// reading the transcript line by line and naming the moments worth an ad by\n// their line numbers. Times are never asked for: they are the transcript's,\n// worked out after (moments-read-answer.js) and again in the database. JSON\n// held to a schema, no temperature. One item per long video.\nconst MODEL = 'claude-haiku-5-5';\nconst EFFORT = 'medium';\n\nfunction clock(seconds) {\n  const s = Math.max(0, Math.floor(seconds));\n  const h = Math.floor(s / 3600);\n  const m = Math.floor((s % 3600) / 60);\n  const pad = function (n) { return (n < 10 ? '0' : '') + n; };\n  return (h > 0 ? h + ':' + pad(m) : String(m)) + ':' + pad(s % 60);\n}\n\nconst DIRECTION_RULE = \"direction is the Quantum Global team's brief for this video, in their own words: favour the moments it asks for. The rules above win wherever it conflicts with them.\";\n\nreturn $input.all().map(function (item) {\n  const v = item.json;\n  const brand = v.brand || {};\n  const rules = (brand.guardrails || []).join('; ');\n  // The team's content rules for the words (Brand memory): the Do's every hook follows and the Don'ts it never does, when there are some.\n  const copyRules = (brand.copy_rules || []).map(function (r) { return String(r || '').trim(); }).filter(Boolean);\n  const copyDonts = (brand.copy_donts || []).map(function (r) { return String(r || '').trim(); }).filter(Boolean);\n  const system = [\n    \"You pick the moments in a long video of Quantum Global Residency (Quantum Global), an EB-5 and U.S. residency advisory firm, that would each make a short ad on their own: a webinar, a talk or an interview, given as its transcript, one numbered line at a time with the time it starts.\",\n    '',\n    '- moments: five to ten, the strongest first, each named by its first and last line (both included).',\n    '- Each runs about 15 to 90 seconds, starts where a thought starts and ends where it finishes, and makes sense to someone who has seen nothing else of the video.',\n    '- Good moments: a clear answer to a question people ask about EB-5 or U.S. residency, a plain explanation, a short story, a strong line. Leave out greetings, housekeeping, questions about the session itself, and anything that leans on what came before.',\n    '- Moments never overlap.',\n    '- title: what the moment is, under 60 characters. why: why it would work as an ad, naming what is said in it. hook: one opening line for its ad, in Quantum Global\\'s voice (' + ((brand.voice || []).join(', ') || 'calm, expert, plain English') + ').',\n    '',\n    'Never pick a moment for a promise of an outcome, a timeline or a return, and no hook makes one. Never name another company in a hook.' + (rules ? ' Quantum Global\\'s rules: ' + rules + '.' : ''),\n  ].concat(\n    copyRules.length + copyDonts.length > 0 ? ['', \"The team's content rules (Brand memory), for every hook.\"] : [],\n    copyRules.length > 0 ? ['Do:'].concat(copyRules.map(function (r) { return '- ' + r; })) : [],\n    copyDonts.length > 0 ? ['Never (hard rules, whatever the direction says):'].concat(copyDonts.map(function (r) { return '- ' + r; })) : [],\n    v.guidance ? ['', DIRECTION_RULE] : [],\n  ).join('\\n');\n\n  const lines = (v.transcript || []).map(function (l, i) { return i + ' [' + clock(l.start) + '] ' + l.text; });\n  const material = {\n    video: { title: v.title, length: clock(v.duration || 0), lines: lines.length },\n    brand: { company: brand.company, offer: brand.offer, audience: brand.audience },\n  };\n  if (brand.topics && brand.topics.length > 0) material.brand.topics = brand.topics;\n  // What the team says the video is about, only when they said: without it the request is as before.\n  if (v.description) material.video.about = v.description;\n  if (v.guidance) material.direction = v.guidance;\n\n  const schema = {\n    type: 'object',\n    additionalProperties: false,\n    required: ['moments'],\n    properties: {\n      moments: {\n        type: 'array',\n        items: {\n          type: 'object',\n          additionalProperties: false,\n          required: ['first', 'last', 'title', 'why', 'hook'],\n          properties: {\n            first: { type: 'integer' },\n            last: { type: 'integer' },\n            title: { type: 'string' },\n            why: { type: 'string' },\n            hook: { type: 'string' },\n          },\n        },\n      },\n    },\n  };\n\n  return {\n    json: {\n      long_video_id: v.long_video_id,\n      body: {\n        model: MODEL,\n        max_tokens: 8000,\n        fallbacks: 'default',\n        output_config: { effort: EFFORT, format: { type: 'json_schema', schema: schema } },\n        system: system,\n        messages: [{ role: 'user', content: 'The video, as JSON, then its transcript:\\n' + JSON.stringify(material) + '\\n\\n' + lines.join('\\n') }],\n      },\n    },\n  };\n});\n" },
  },
  output: [{ long_video_id: 'video-id', body: { model: 'claude-haiku-5-5', max_tokens: 8000 } }],
});

const claude = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: {
    name: "Claude: pick the moments",
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
    name: "Read the moments",
    parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: "// Reads the moments Claude picked, by line: each must be inside the\n// transcript, between 8 seconds and two and a half minutes long by the\n// transcript's own times, and clear of the ones before it (the stronger,\n// since they come first). The rest are dropped, never stretched or moved.\n// Hooks are flagged against the guardrails, never rewritten. One item per\n// long video, matched to its request.\nconst MIN_SECONDS = 8;\nconst MAX_SECONDS = 150;\nconst MAX_MOMENTS = 10;\nconst RULES = [\n  [/guarantee/i, 'says \"guarantee\"'],\n  [/risk[\\s-]?free/i, 'says \"risk-free\"'],\n  [/\\b100\\s?%/, 'says \"100%\"'],\n  [/\\bassured\\b/i, 'says \"assured\"'],\n  [/\\bin\\s+\\d+\\s+(days|weeks|months)\\b/i, 'promises a timeline'],\n];\n\nreturn $input.all().map(function (item, i) {\n  const res = item.json || {};\n  const video = $('One item per video').itemMatching(i).json;\n  const id = video.long_video_id;\n  const lines = video.transcript || [];\n  const u = res.usage || {};\n  const usage = {\n    model: res.model || 'claude-haiku-5-5',\n    input_tokens: u.input_tokens || 0,\n    output_tokens: u.output_tokens || 0,\n    cache_creation_input_tokens: u.cache_creation_input_tokens || 0,\n    cache_read_input_tokens: u.cache_read_input_tokens || 0,\n  };\n  const fail = function (message) {\n    return { json: { ok: false, p_id: id, p_error: message, p_usage: usage } };\n  };\n\n  if (res.error) {\n    const e = res.error;\n    return fail('Claude could not be asked for the moments (' + String((e && (e.description || e.message)) || e).slice(0, 200) + ').');\n  }\n  if (res.stop_reason === 'refusal') return fail('Claude declined to pick moments from this video.');\n  if (res.stop_reason === 'max_tokens') return fail('Claude ran out of room before the moments were finished.');\n  const block = (res.content || []).find(function (b) { return b.type === 'text'; });\n  let answer;\n  try {\n    answer = JSON.parse(block ? block.text : '');\n  } catch (e) {\n    return fail('Claude did not return readable moments.');\n  }\n\n  const picked = [];\n  (answer.moments || []).forEach(function (m) {\n    if (picked.length >= MAX_MOMENTS || !m) return;\n    const first = m.first;\n    const last = m.last;\n    if (typeof first !== 'number' || typeof last !== 'number' || first % 1 !== 0 || last % 1 !== 0) return;\n    if (first < 0 || last < first || last >= lines.length) return;\n    const length = lines[last].end - lines[first].start;\n    if (length < MIN_SECONDS || length > MAX_SECONDS) return;\n    const overlaps = picked.some(function (p) { return first <= p.last && last >= p.first; });\n    if (overlaps) return;\n    const title = String(m.title || '').trim().slice(0, 80);\n    if (!title) return;\n    const hook = String(m.hook || '').trim().slice(0, 200);\n    const warnings = RULES.filter(function (r) { return r[0].test(hook); }).map(function (r) { return 'Hook ' + r[1]; });\n    picked.push({ first: first, last: last, title: title, why: String(m.why || '').trim().slice(0, 400), hook: hook, warnings: warnings });\n  });\n\n  if (picked.length === 0) return fail('Claude picked no moment that stands on its own between 8 seconds and two and a half minutes.');\n  return { json: { ok: true, p_id: id, p_moments: picked, p_usage: usage } };\n});\n" },
  },
  output: [{ ok: true, p_id: 'video-id', p_moments: [{ first: 3, last: 9, title: 'Why debt is repaid first', why: 'A plain answer.', hook: 'Debt gets repaid first.', warnings: [] }], p_usage: { model: 'claude-haiku-5-5', input_tokens: 40000, output_tokens: 1500 } }],
});

const found = ifElse({
  version: 2.3,
  config: {
    name: "Found any?",
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 },
        conditions: [{ leftValue: expr('{{ $json.ok }}'), rightValue: true, operator: { type: 'boolean', operation: 'true', singleValue: true } }],
        combinator: 'and',
      },
    },
  },
});

const finish = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: {
    name: "Record the moments",
    onError: 'continueRegularOutput',
    parameters: {
      method: 'POST',
      url: 'https://tcinsdexwvzpznqlcpww.supabase.co/rest/v1/rpc/moments_finish',
      authentication: 'predefinedCredentialType',
      nodeCredentialType: 'supabaseApi',
      sendBody: true,
      contentType: 'json',
      specifyBody: 'json',
      jsonBody: expr("{{ JSON.stringify({ p_id: $json.p_id, p_moments: $json.p_moments, p_usage: $json.p_usage }) }}"),
      options: { timeout: 30000 },
    },
    credentials: { supabaseApi: newCredential('Supabase QGR') },
  },
  output: [{}],
});

const fail = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: {
    name: "Record why not",
    onError: 'continueRegularOutput',
    parameters: {
      method: 'POST',
      url: 'https://tcinsdexwvzpznqlcpww.supabase.co/rest/v1/rpc/moments_fail',
      authentication: 'predefinedCredentialType',
      nodeCredentialType: 'supabaseApi',
      sendBody: true,
      contentType: 'json',
      specifyBody: 'json',
      jsonBody: expr("{{ JSON.stringify({ p_id: $json.p_id, p_error: $json.p_error, p_usage: $json.p_usage }) }}"),
      options: { timeout: 30000 },
    },
    credentials: { supabaseApi: newCredential('Supabase QGR') },
  },
  output: [{}],
});

const noteFlow = sticky('## Moments\nA long video is heard in the browser, on the team\'s own computer, and never uploaded: only its transcript is kept. At once when it is saved, and every five minutes, the database hands over the long videos waiting (**moments_take_due**, claimed so two runs never take the same one; a claim lost for ten minutes is taken again, three times at most), each with its transcript, the team\'s direction and the brand.', [everyFiveMinutes, lookNow, takeDue, eachVideo], { color: 4 });
const noteClaude = sticky('## The pick\nHaiku 5.5 reads the transcript one numbered line at a time and names five to ten moments by their first and last line, the strongest first. Times come from the transcript, never from the model: **Read the moments** drops a moment outside the transcript, under 8 seconds, over two and a half minutes or overlapping a stronger one, and flags (never rewrites) a hook against the guardrails. The database works the times out again (**moments_finish**). The usage is kept on failure too (**moments_fail**).', [buildRequest, claude, readAnswer, found, finish, fail], { color: 5 });

export default workflow('qgr-moments', 'QGR · Moments')
  .add(everyFiveMinutes)
  .to(takeDue)
  .to(eachVideo)
  .to(buildRequest)
  .to(claude.onError(readAnswer))
  .to(readAnswer)
  .to(found.onTrue(finish).onFalse(fail))
  .add(lookNow)
  .to(takeDue)
  .add(noteFlow)
  .add(noteClaude);
