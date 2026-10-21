import { workflow, node, trigger, sticky, newCredential, ifElse, switchCase, expr } from '@n8n/workflow-sdk';

const everyMinute = trigger({
  type: 'n8n-nodes-base.scheduleTrigger',
  version: 1.4,
  config: {
    name: 'Every minute',
    parameters: { rule: { interval: [{ field: 'minutes', minutesInterval: 1 }] } },
  },
  output: [{}],
});

const makeNow = trigger({
  type: 'n8n-nodes-base.webhook',
  version: 2.1,
  config: {
    name: 'Make now',
    parameters: {
      httpMethod: 'POST',
      path: 'qgr-video',
      authentication: 'headerAuth',
      responseMode: 'onReceived',
      options: { responseCode: { values: { responseCode: 'customCode', customCode: 202 } } },
    },
    credentials: { httpHeaderAuth: newCredential('QGR webhook secret') },
  },
  output: [{ body: {} }],
});

const priceIt = trigger({
  type: 'n8n-nodes-base.webhook',
  version: 2.1,
  config: {
    name: 'Price',
    parameters: {
      httpMethod: 'POST',
      path: 'qgr-video-price',
      authentication: 'headerAuth',
      responseMode: 'responseNode',
      options: {},
    },
    credentials: { httpHeaderAuth: newCredential('QGR webhook secret') },
  },
  output: [{ body: { model: 'seedance_2_0_mini', seconds: 4, aspect: '9:16', quality: '480p', sound: false } }],
});

// ---- the price, asked before anyone presses Generate

const priceRequest = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: "Price request",
    parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: "// Shared by the AI video scripts that write what Higgsfield is asked for\n// (joined in front of each): generate_video's params, in Higgsfield's own\n// words for each model, as its catalogue gave them on 2026-10-20.\n\n/** What Higgsfield is asked to make, in its own words for each model. */\nconst MODEL_PARAMS = {\n  seedance_2_0_mini: function (ask) {\n    return { resolution: ask.quality, generate_audio: ask.sound === true };\n  },\n  kling3_0: function (ask) {\n    return { mode: ask.quality, sound: ask.sound === true ? 'on' : 'off' };\n  },\n  seedance_2_5: function (ask) {\n    return { mode: 't2v', resolution: ask.quality, generate_audio: ask.sound === true };\n  },\n};\n\n/** The rules every video keeps to, as the ads' pictures do. */\nconst VIDEO_RULES = 'No words, captions or logos in the picture (the ad\\'s words go over it later). No real or identifiable people. No flags.';\n\n/** What the run's reference pictures are for, when Higgsfield is given some. */\nconst VIDEO_REFERENCES = ' Use the reference pictures given for what they show: the real place, product or look to keep to.';\n\n/** The prompt Higgsfield gets: the team's, the brand's picture style, the references' line, then the rules. */\nfunction videoPrompt(ask) {\n  const look = typeof ask.look === 'string' && ask.look.trim() ? ' Style: ' + ask.look.trim().replace(/\\s+/g, ' ').slice(0, 400) + '.' : '';\n  const references = Array.isArray(ask.references) && ask.references.length > 0 ? VIDEO_REFERENCES : '';\n  const room = 2000 - look.length - references.length - VIDEO_RULES.length - 2;\n  const prompt = String(ask.prompt || '').replace(/\\s+/g, ' ').trim().slice(0, Math.max(200, room));\n  return (prompt + look + references + ' ' + VIDEO_RULES).replace(/\\.\\./g, '.').trim();\n}\n\n/**\n * generate_video's params for one ask, with its first picture's media id when\n * it has one, and the reference pictures of the run it was asked for (an ad's\n * video) as image_references, which do not change its price.\n */\nfunction videoParams(ask, mediaId) {\n  const own = MODEL_PARAMS[ask.model];\n  if (!own) throw new Error('Higgsfield is not asked for ' + ask.model + ' videos');\n  const params = Object.assign({ model: ask.model, prompt: videoPrompt(ask), aspect_ratio: ask.aspect, duration: Number(ask.seconds) }, own(ask));\n  const medias = mediaId ? [{ role: 'start_image', value: mediaId }] : [];\n  (Array.isArray(ask.references) ? ask.references : []).forEach(function (id) {\n    if (typeof id === 'string' && id) medias.push({ role: 'image_references', value: id });\n  });\n  if (medias.length > 0) params.medias = medias;\n  return params;\n}\n\n// Higgsfield's price for a video, asked by the AI video page before anyone\n// presses Generate. get_cost:true asks for the price alone (\"No job\n// submitted\"): it is sent both beside params and inside them, so whichever\n// Higgsfield reads, nothing is made (checked on 2026-10-20: the balance stood\n// at 280 credits before and after five prices). The prompt does not change the\n// price; a short one stands in until the team has written theirs.\nconst STAND_IN_PROMPT = 'A quiet street at golden hour, the camera moving slowly forward.';\nreturn $input.all().map(function (item) {\n  const body = (item.json && item.json.body) || item.json || {};\n  const prompt = typeof body.prompt === 'string' && body.prompt.trim().length >= 20 ? body.prompt : STAND_IN_PROMPT;\n  const params = videoParams({ model: body.model, prompt: prompt, aspect: body.aspect, seconds: body.seconds, quality: body.quality, sound: body.sound === true, look: null });\n  params.get_cost = true;\n  return { json: { quote_input: JSON.stringify({ params: params, get_cost: true }) } };\n});\n" },
  },
  output: [{ quote_input: '{"params":{"model":"seedance_2_0_mini","get_cost":true},"get_cost":true}' }],
});

const higgsPrice = node({
  type: '@n8n/n8n-nodes-langchain.mcpClient',
  version: 1.1,
  config: {
    name: "Higgsfield: price",
    onError: 'continueRegularOutput',
    parameters: {
      serverTransport: 'httpStreamable',
      endpointUrl: 'https://mcp.higgsfield.ai/mcp',
      authentication: 'mcpOAuth2Api',
      tool: { __rl: true, mode: 'id', value: 'generate_video' },
      inputMode: 'json',
      jsonInput: expr("{{ $json.quote_input }}"),
      options: { convertToBinary: false, timeout: 120000 },
    },
    credentials: { mcpOAuth2Api: newCredential('Higgsfield') },
  },
  output: [{ structuredContent: { cost: { credits: 2, credits_exact: 2 } }, content: [{ type: 'text', text: 'Cost preflight for seedance_2_0_mini: 2 credits (2 exact). No job submitted.' }] }],
});


const priceDecline = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: "Decline a preset (price)",
    parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: "// Shared by the scripts that read Higgsfield's answers, for AI video and for\n// pictures (joined in front of each). Higgsfield is asked through its MCP,\n// signed in with the team's own account, so every video and every picture\n// spends the plan's credits.\n//\n// An MCP step answers in one of three ways, and each script must tell them\n// apart:\n//   - Higgsfield answered: { structuredContent, content: [{ type: 'text', text }] }\n//   - Higgsfield refused the call: { error: { message } } (bad input, a model\n//     it does not know, not enough credits). Nothing was made.\n//   - n8n could not reach Higgsfield at all: the step hands on the item it was\n//     given, unchanged. Nothing was sent.\n\n/** What Higgsfield's answer carries: its structured content, else its text read as JSON, else {}. */\nfunction answerOf(json) {\n  if (!json || typeof json !== 'object') return {};\n  if (json.structuredContent && typeof json.structuredContent === 'object') return json.structuredContent;\n  const parts = Array.isArray(json.content) ? json.content : [];\n  for (let i = 0; i < parts.length; i++) {\n    const text = parts[i] && parts[i].text;\n    if (text && typeof text === 'object') return text;\n    if (typeof text === 'string' && /^\\s*[{[]/.test(text)) {\n      try {\n        return JSON.parse(text);\n      } catch (e) {\n        // Not JSON: read as words below.\n      }\n    }\n  }\n  return {};\n}\n\n/** Higgsfield's words, for a reason shown to the team. */\nfunction wordsOf(json) {\n  const parts = json && Array.isArray(json.content) ? json.content : [];\n  return parts\n    .map(function (p) { return p && typeof p.text === 'string' ? p.text : ''; })\n    .join(' ')\n    .replace(/\\s+/g, ' ')\n    .trim();\n}\n\n/** The error Higgsfield or the MCP step gave, as text, or ''. */\nfunction errorOf(json) {\n  if (!json || typeof json !== 'object' || !json.error) return '';\n  const e = json.error;\n  const message = typeof e === 'string' ? e : e.message || e.description || JSON.stringify(e);\n  return String(message).replace(/\\s+/g, ' ').trim().slice(0, 400);\n}\n\n/** n8n could not reach Higgsfield: the step handed on what it was given. */\nfunction notReached(json, own) {\n  if (!json || typeof json !== 'object') return true;\n  if (json.structuredContent || json.content || json.error) return false;\n  return Object.prototype.hasOwnProperty.call(json, own);\n}\n\n/**\n * Higgsfield's offer of one of its presets in place of the prompt (\"This\n * prompt looks like the Higgsfield preset … generate literally\"), which comes\n * instead of a price or a job: nothing was priced or made. Its id and name,\n * or null. Seen on every video prompt tried on 2026-10-20, never on a picture.\n */\nfunction presetNotice(json) {\n  const answer = answerOf(json);\n  const notice = answer && answer.notice;\n  if (notice && typeof notice === 'object' && notice.type === 'preset_recommendation') {\n    const data = notice.data && typeof notice.data === 'object' ? notice.data : {};\n    const preset = data.preset && typeof data.preset === 'object' ? data.preset : {};\n    const id = (data.retry_literal_with && data.retry_literal_with.declined_preset_id) || preset.id || '';\n    return { id: String(id), name: typeof preset.name === 'string' ? preset.name : '' };\n  }\n  const words = wordsOf(json);\n  const said = words.match(/declined_preset_id:?\\s*\"?([A-Za-z0-9-]{8,})/);\n  if (!said) return null;\n  const name = words.match(/preset \"([^\"]+)\"/);\n  return { id: said[1], name: name ? name[1] : '' };\n}\n\n/** What the team is told when Higgsfield offered a preset again after it was declined. */\nfunction presetSaid(preset) {\n  return 'Higgsfield offered its preset' + (preset.name ? ' \"' + preset.name + '\"' : '') + ' in place of the prompt as written';\n}\n\n/** A refusal that means nothing was made (the request, the model, the credits, the content). */\nfunction isRefusal(message) {\n  return /input validation error|invalid request|invalid arguments|unknown model|not enough credits|insufficient|top up|balance is|out of credits|nsfw|moderation|content policy|not allowed|prohibited|rejected/i.test(message);\n}\n\n/** The first string found under any of these keys, at any depth. */\nfunction findString(value, keys, depth) {\n  if (depth > 5 || value === null || typeof value !== 'object') return '';\n  const list = Array.isArray(value) ? value : [value];\n  for (let i = 0; i < list.length; i++) {\n    const v = list[i];\n    if (!v || typeof v !== 'object') continue;\n    if (!Array.isArray(v)) {\n      for (let k = 0; k < keys.length; k++) {\n        const found = v[keys[k]];\n        if (typeof found === 'string' && found.trim()) return found.trim();\n        if (typeof found === 'number') return String(found);\n      }\n    }\n    const inner = Array.isArray(v) ? v : Object.keys(v).map(function (key) { return v[key]; });\n    for (let j = 0; j < inner.length; j++) {\n      const got = findString(inner[j], keys, depth + 1);\n      if (got) return got;\n    }\n  }\n  return '';\n}\n\n/**\n * Credits in an answer: { cost: { credits, credits_exact } }, { credits } or\n * { cost }. Higgsfield can quote two figures that differ (a picture at\n * \"1 credit (0.5 exact)\"), and which one the plan is charged is not said, so\n * the higher counts: the month's limit is never under-counted.\n */\nfunction creditsOf(answer) {\n  const cost = answer && answer.cost;\n  const read = function (n) {\n    const value = typeof n === 'string' ? parseFloat(n) : n;\n    return typeof value === 'number' && isFinite(value) && value >= 0 ? value : null;\n  };\n  const figures = (cost && typeof cost === 'object' ? [cost.credits, cost.credits_exact] : [cost != null ? cost : answer && answer.credits]).map(read).filter(function (n) {\n    return n !== null;\n  });\n  return figures.length ? Math.max.apply(null, figures) : null;\n}\n\n/** How a job stands, by Higgsfield's own words for it. */\nconst JOB_DONE = /^(completed|complete|succeeded|success|done|finished|ready)$/;\nconst JOB_FAILED = /^(failed|failure|error|errored|canceled|cancelled|nsfw|rejected|expired|ip_detected|blocked|moderated|submission_failed)$/;\n\n/** A job's status, lower case, or ''. */\nfunction jobStatus(answer) {\n  return (findString(answer, ['status', 'state'], 0) || '').toLowerCase();\n}\n\n/** Every https link in an answer, at any depth. */\nfunction allLinks(value, out, depth) {\n  out = out || [];\n  depth = depth || 0;\n  if (depth > 6 || value === null || value === undefined) return out;\n  if (typeof value === 'string') {\n    if (/^https:\\/\\/\\S+$/.test(value)) out.push(value);\n    return out;\n  }\n  if (typeof value === 'object') {\n    const inner = Array.isArray(value) ? value : Object.keys(value).map(function (k) { return value[k]; });\n    inner.forEach(function (v) { allLinks(v, out, depth + 1); });\n  }\n  return out;\n}\n\n/** Why a job failed, as plainly as Higgsfield says it. */\nfunction jobReason(status, answer, json) {\n  if (status === 'ip_detected') return 'Higgsfield held it back: it may show protected material. If the team has the rights, reveal it on Higgsfield.';\n  if (status === 'nsfw' || status === 'moderated' || status === 'blocked') return 'Higgsfield\\'s safety check stopped it: change the prompt and ask again.';\n  const said = findString(answer, ['error', 'message', 'reason', 'detail'], 0) || wordsOf(json);\n  return 'Higgsfield could not make it (' + status + ')' + (said ? ': ' + said.slice(0, 200) : '.');\n}\n\n// Higgsfield sometimes answers with one of its presets in place of the\n// prompt (\"Ask the user whether to use that preset or generate literally\"),\n// and then nothing is priced or made. The team asked for its own prompt, so\n// the preset is declined and the same request is asked once more as written:\n// declined_preset_id, beside the params and inside them as get_cost is\n// (checked on 2026-10-20: declined, the price came back). Every other answer\n// goes on as it came. A preset offered again after that is read as nothing\n// made, with the reason.\nconst KEY = 'quote_input';\nreturn $input.all().map(function (item, i) {\n  const notice = presetNotice(item.json);\n  let input = null;\n  try {\n    input = JSON.parse($('Price request').itemMatching(i).json[KEY]);\n  } catch (e) {\n    input = null;\n  }\n  if (!notice || !notice.id || !input || typeof input !== 'object' || input.declined_preset_id) {\n    return { json: Object.assign({}, item.json, { as_written: false }), pairedItem: { item: i } };\n  }\n  input.declined_preset_id = notice.id;\n  if (input.params && typeof input.params === 'object') input.params.declined_preset_id = notice.id;\n  const out = { as_written: true };\n  out[KEY] = JSON.stringify(input);\n  return { json: out, pairedItem: { item: i } };\n});\n" },
  },
  output: [{ as_written: true, quote_input: '{"params":{"declined_preset_id":"preset-id"}}' }],
});

const priceAsWritten = ifElse({
  version: 2.3,
  config: {
    name: "As written? (price)",
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 2 },
        conditions: [{ leftValue: expr("{{ $json.as_written === true }}"), rightValue: true, operator: { type: 'boolean', operation: 'true', singleValue: true } }],
        combinator: 'and',
      },
    },
  },
});

const priceAgain = node({
  type: '@n8n/n8n-nodes-langchain.mcpClient',
  version: 1.1,
  config: {
    name: "Higgsfield: price, as written",
    onError: 'continueRegularOutput',
    parameters: {
      serverTransport: 'httpStreamable',
      endpointUrl: 'https://mcp.higgsfield.ai/mcp',
      authentication: 'mcpOAuth2Api',
      tool: { __rl: true, mode: 'id', value: 'generate_video' },
      inputMode: 'json',
      jsonInput: expr("{{ $json.quote_input }}"),
      options: { convertToBinary: false, timeout: 120000 },
    },
    credentials: { mcpOAuth2Api: newCredential('Higgsfield') },
  },
  output: [{ structuredContent: { cost: { credits: 2, credits_exact: 2 } }, content: [{ type: 'text', text: 'Cost preflight for seedance_2_0_mini: 2 credits (2 exact). No job submitted.' }] }],
});

const readPrice = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: "Read the price",
    parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: "// Shared by the scripts that read Higgsfield's answers, for AI video and for\n// pictures (joined in front of each). Higgsfield is asked through its MCP,\n// signed in with the team's own account, so every video and every picture\n// spends the plan's credits.\n//\n// An MCP step answers in one of three ways, and each script must tell them\n// apart:\n//   - Higgsfield answered: { structuredContent, content: [{ type: 'text', text }] }\n//   - Higgsfield refused the call: { error: { message } } (bad input, a model\n//     it does not know, not enough credits). Nothing was made.\n//   - n8n could not reach Higgsfield at all: the step hands on the item it was\n//     given, unchanged. Nothing was sent.\n\n/** What Higgsfield's answer carries: its structured content, else its text read as JSON, else {}. */\nfunction answerOf(json) {\n  if (!json || typeof json !== 'object') return {};\n  if (json.structuredContent && typeof json.structuredContent === 'object') return json.structuredContent;\n  const parts = Array.isArray(json.content) ? json.content : [];\n  for (let i = 0; i < parts.length; i++) {\n    const text = parts[i] && parts[i].text;\n    if (text && typeof text === 'object') return text;\n    if (typeof text === 'string' && /^\\s*[{[]/.test(text)) {\n      try {\n        return JSON.parse(text);\n      } catch (e) {\n        // Not JSON: read as words below.\n      }\n    }\n  }\n  return {};\n}\n\n/** Higgsfield's words, for a reason shown to the team. */\nfunction wordsOf(json) {\n  const parts = json && Array.isArray(json.content) ? json.content : [];\n  return parts\n    .map(function (p) { return p && typeof p.text === 'string' ? p.text : ''; })\n    .join(' ')\n    .replace(/\\s+/g, ' ')\n    .trim();\n}\n\n/** The error Higgsfield or the MCP step gave, as text, or ''. */\nfunction errorOf(json) {\n  if (!json || typeof json !== 'object' || !json.error) return '';\n  const e = json.error;\n  const message = typeof e === 'string' ? e : e.message || e.description || JSON.stringify(e);\n  return String(message).replace(/\\s+/g, ' ').trim().slice(0, 400);\n}\n\n/** n8n could not reach Higgsfield: the step handed on what it was given. */\nfunction notReached(json, own) {\n  if (!json || typeof json !== 'object') return true;\n  if (json.structuredContent || json.content || json.error) return false;\n  return Object.prototype.hasOwnProperty.call(json, own);\n}\n\n/**\n * Higgsfield's offer of one of its presets in place of the prompt (\"This\n * prompt looks like the Higgsfield preset … generate literally\"), which comes\n * instead of a price or a job: nothing was priced or made. Its id and name,\n * or null. Seen on every video prompt tried on 2026-10-20, never on a picture.\n */\nfunction presetNotice(json) {\n  const answer = answerOf(json);\n  const notice = answer && answer.notice;\n  if (notice && typeof notice === 'object' && notice.type === 'preset_recommendation') {\n    const data = notice.data && typeof notice.data === 'object' ? notice.data : {};\n    const preset = data.preset && typeof data.preset === 'object' ? data.preset : {};\n    const id = (data.retry_literal_with && data.retry_literal_with.declined_preset_id) || preset.id || '';\n    return { id: String(id), name: typeof preset.name === 'string' ? preset.name : '' };\n  }\n  const words = wordsOf(json);\n  const said = words.match(/declined_preset_id:?\\s*\"?([A-Za-z0-9-]{8,})/);\n  if (!said) return null;\n  const name = words.match(/preset \"([^\"]+)\"/);\n  return { id: said[1], name: name ? name[1] : '' };\n}\n\n/** What the team is told when Higgsfield offered a preset again after it was declined. */\nfunction presetSaid(preset) {\n  return 'Higgsfield offered its preset' + (preset.name ? ' \"' + preset.name + '\"' : '') + ' in place of the prompt as written';\n}\n\n/** A refusal that means nothing was made (the request, the model, the credits, the content). */\nfunction isRefusal(message) {\n  return /input validation error|invalid request|invalid arguments|unknown model|not enough credits|insufficient|top up|balance is|out of credits|nsfw|moderation|content policy|not allowed|prohibited|rejected/i.test(message);\n}\n\n/** The first string found under any of these keys, at any depth. */\nfunction findString(value, keys, depth) {\n  if (depth > 5 || value === null || typeof value !== 'object') return '';\n  const list = Array.isArray(value) ? value : [value];\n  for (let i = 0; i < list.length; i++) {\n    const v = list[i];\n    if (!v || typeof v !== 'object') continue;\n    if (!Array.isArray(v)) {\n      for (let k = 0; k < keys.length; k++) {\n        const found = v[keys[k]];\n        if (typeof found === 'string' && found.trim()) return found.trim();\n        if (typeof found === 'number') return String(found);\n      }\n    }\n    const inner = Array.isArray(v) ? v : Object.keys(v).map(function (key) { return v[key]; });\n    for (let j = 0; j < inner.length; j++) {\n      const got = findString(inner[j], keys, depth + 1);\n      if (got) return got;\n    }\n  }\n  return '';\n}\n\n/**\n * Credits in an answer: { cost: { credits, credits_exact } }, { credits } or\n * { cost }. Higgsfield can quote two figures that differ (a picture at\n * \"1 credit (0.5 exact)\"), and which one the plan is charged is not said, so\n * the higher counts: the month's limit is never under-counted.\n */\nfunction creditsOf(answer) {\n  const cost = answer && answer.cost;\n  const read = function (n) {\n    const value = typeof n === 'string' ? parseFloat(n) : n;\n    return typeof value === 'number' && isFinite(value) && value >= 0 ? value : null;\n  };\n  const figures = (cost && typeof cost === 'object' ? [cost.credits, cost.credits_exact] : [cost != null ? cost : answer && answer.credits]).map(read).filter(function (n) {\n    return n !== null;\n  });\n  return figures.length ? Math.max.apply(null, figures) : null;\n}\n\n/** How a job stands, by Higgsfield's own words for it. */\nconst JOB_DONE = /^(completed|complete|succeeded|success|done|finished|ready)$/;\nconst JOB_FAILED = /^(failed|failure|error|errored|canceled|cancelled|nsfw|rejected|expired|ip_detected|blocked|moderated|submission_failed)$/;\n\n/** A job's status, lower case, or ''. */\nfunction jobStatus(answer) {\n  return (findString(answer, ['status', 'state'], 0) || '').toLowerCase();\n}\n\n/** Every https link in an answer, at any depth. */\nfunction allLinks(value, out, depth) {\n  out = out || [];\n  depth = depth || 0;\n  if (depth > 6 || value === null || value === undefined) return out;\n  if (typeof value === 'string') {\n    if (/^https:\\/\\/\\S+$/.test(value)) out.push(value);\n    return out;\n  }\n  if (typeof value === 'object') {\n    const inner = Array.isArray(value) ? value : Object.keys(value).map(function (k) { return value[k]; });\n    inner.forEach(function (v) { allLinks(v, out, depth + 1); });\n  }\n  return out;\n}\n\n/** Why a job failed, as plainly as Higgsfield says it. */\nfunction jobReason(status, answer, json) {\n  if (status === 'ip_detected') return 'Higgsfield held it back: it may show protected material. If the team has the rights, reveal it on Higgsfield.';\n  if (status === 'nsfw' || status === 'moderated' || status === 'blocked') return 'Higgsfield\\'s safety check stopped it: change the prompt and ask again.';\n  const said = findString(answer, ['error', 'message', 'reason', 'detail'], 0) || wordsOf(json);\n  return 'Higgsfield could not make it (' + status + ')' + (said ? ': ' + said.slice(0, 200) : '.');\n}\n\n// Higgsfield's price, read: credits, or why there is none. A price that came\n// back with a job means Higgsfield made a video when it was only asked its\n// price: said plainly, so a person checks. A preset offered in place of the\n// prompt was declined once already (\"Decline a preset\"): offered again, there\n// is no price.\nreturn $input.all().map(function (item) {\n  const json = item.json;\n  if (notReached(json, 'quote_input')) return { json: { ok: false, error: 'Higgsfield could not be reached just now: try again in a minute.' } };\n  const error = errorOf(json);\n  if (error) return { json: { ok: false, error: 'Higgsfield would not price it: ' + error } };\n  const preset = presetNotice(json);\n  if (preset) return { json: { ok: false, error: presetSaid(preset) + ': change the prompt a little and ask again.' } };\n  const answer = answerOf(json);\n  if (findString(answer, ['job_id', 'jobId'], 0)) return { json: { ok: false, error: 'Higgsfield started a video when asked only its price: check its history.' } };\n  const credits = creditsOf(answer);\n  if (credits === null) {\n    const words = wordsOf(json);\n    return { json: { ok: false, error: 'Higgsfield gave no price' + (words ? ': ' + words.slice(0, 200) : '.') } };\n  }\n  return { json: { ok: true, credits: credits } };\n});\n" },
  },
  output: [{ ok: true, credits: 2 }],
});

const higgsBalance = node({
  type: '@n8n/n8n-nodes-langchain.mcpClient',
  version: 1.1,
  config: {
    name: "Higgsfield: credits left",
    onError: 'continueRegularOutput',
    executeOnce: true,
    parameters: {
      serverTransport: 'httpStreamable',
      endpointUrl: 'https://mcp.higgsfield.ai/mcp',
      authentication: 'mcpOAuth2Api',
      tool: { __rl: true, mode: 'id', value: 'balance' },
      inputMode: 'json',
      jsonInput: expr("{}"),
      options: { convertToBinary: false, timeout: 120000 },
    },
    credentials: { mcpOAuth2Api: newCredential('Higgsfield') },
  },
  output: [{ structuredContent: { credits: 280, subscription_plan_type: 'starter' }, content: [{ type: 'text', text: 'Credits: 280 | Plan: starter' }] }],
});

const answer = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: "The answer",
    parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: "// Shared by the scripts that read Higgsfield's answers, for AI video and for\n// pictures (joined in front of each). Higgsfield is asked through its MCP,\n// signed in with the team's own account, so every video and every picture\n// spends the plan's credits.\n//\n// An MCP step answers in one of three ways, and each script must tell them\n// apart:\n//   - Higgsfield answered: { structuredContent, content: [{ type: 'text', text }] }\n//   - Higgsfield refused the call: { error: { message } } (bad input, a model\n//     it does not know, not enough credits). Nothing was made.\n//   - n8n could not reach Higgsfield at all: the step hands on the item it was\n//     given, unchanged. Nothing was sent.\n\n/** What Higgsfield's answer carries: its structured content, else its text read as JSON, else {}. */\nfunction answerOf(json) {\n  if (!json || typeof json !== 'object') return {};\n  if (json.structuredContent && typeof json.structuredContent === 'object') return json.structuredContent;\n  const parts = Array.isArray(json.content) ? json.content : [];\n  for (let i = 0; i < parts.length; i++) {\n    const text = parts[i] && parts[i].text;\n    if (text && typeof text === 'object') return text;\n    if (typeof text === 'string' && /^\\s*[{[]/.test(text)) {\n      try {\n        return JSON.parse(text);\n      } catch (e) {\n        // Not JSON: read as words below.\n      }\n    }\n  }\n  return {};\n}\n\n/** Higgsfield's words, for a reason shown to the team. */\nfunction wordsOf(json) {\n  const parts = json && Array.isArray(json.content) ? json.content : [];\n  return parts\n    .map(function (p) { return p && typeof p.text === 'string' ? p.text : ''; })\n    .join(' ')\n    .replace(/\\s+/g, ' ')\n    .trim();\n}\n\n/** The error Higgsfield or the MCP step gave, as text, or ''. */\nfunction errorOf(json) {\n  if (!json || typeof json !== 'object' || !json.error) return '';\n  const e = json.error;\n  const message = typeof e === 'string' ? e : e.message || e.description || JSON.stringify(e);\n  return String(message).replace(/\\s+/g, ' ').trim().slice(0, 400);\n}\n\n/** n8n could not reach Higgsfield: the step handed on what it was given. */\nfunction notReached(json, own) {\n  if (!json || typeof json !== 'object') return true;\n  if (json.structuredContent || json.content || json.error) return false;\n  return Object.prototype.hasOwnProperty.call(json, own);\n}\n\n/**\n * Higgsfield's offer of one of its presets in place of the prompt (\"This\n * prompt looks like the Higgsfield preset … generate literally\"), which comes\n * instead of a price or a job: nothing was priced or made. Its id and name,\n * or null. Seen on every video prompt tried on 2026-10-20, never on a picture.\n */\nfunction presetNotice(json) {\n  const answer = answerOf(json);\n  const notice = answer && answer.notice;\n  if (notice && typeof notice === 'object' && notice.type === 'preset_recommendation') {\n    const data = notice.data && typeof notice.data === 'object' ? notice.data : {};\n    const preset = data.preset && typeof data.preset === 'object' ? data.preset : {};\n    const id = (data.retry_literal_with && data.retry_literal_with.declined_preset_id) || preset.id || '';\n    return { id: String(id), name: typeof preset.name === 'string' ? preset.name : '' };\n  }\n  const words = wordsOf(json);\n  const said = words.match(/declined_preset_id:?\\s*\"?([A-Za-z0-9-]{8,})/);\n  if (!said) return null;\n  const name = words.match(/preset \"([^\"]+)\"/);\n  return { id: said[1], name: name ? name[1] : '' };\n}\n\n/** What the team is told when Higgsfield offered a preset again after it was declined. */\nfunction presetSaid(preset) {\n  return 'Higgsfield offered its preset' + (preset.name ? ' \"' + preset.name + '\"' : '') + ' in place of the prompt as written';\n}\n\n/** A refusal that means nothing was made (the request, the model, the credits, the content). */\nfunction isRefusal(message) {\n  return /input validation error|invalid request|invalid arguments|unknown model|not enough credits|insufficient|top up|balance is|out of credits|nsfw|moderation|content policy|not allowed|prohibited|rejected/i.test(message);\n}\n\n/** The first string found under any of these keys, at any depth. */\nfunction findString(value, keys, depth) {\n  if (depth > 5 || value === null || typeof value !== 'object') return '';\n  const list = Array.isArray(value) ? value : [value];\n  for (let i = 0; i < list.length; i++) {\n    const v = list[i];\n    if (!v || typeof v !== 'object') continue;\n    if (!Array.isArray(v)) {\n      for (let k = 0; k < keys.length; k++) {\n        const found = v[keys[k]];\n        if (typeof found === 'string' && found.trim()) return found.trim();\n        if (typeof found === 'number') return String(found);\n      }\n    }\n    const inner = Array.isArray(v) ? v : Object.keys(v).map(function (key) { return v[key]; });\n    for (let j = 0; j < inner.length; j++) {\n      const got = findString(inner[j], keys, depth + 1);\n      if (got) return got;\n    }\n  }\n  return '';\n}\n\n/**\n * Credits in an answer: { cost: { credits, credits_exact } }, { credits } or\n * { cost }. Higgsfield can quote two figures that differ (a picture at\n * \"1 credit (0.5 exact)\"), and which one the plan is charged is not said, so\n * the higher counts: the month's limit is never under-counted.\n */\nfunction creditsOf(answer) {\n  const cost = answer && answer.cost;\n  const read = function (n) {\n    const value = typeof n === 'string' ? parseFloat(n) : n;\n    return typeof value === 'number' && isFinite(value) && value >= 0 ? value : null;\n  };\n  const figures = (cost && typeof cost === 'object' ? [cost.credits, cost.credits_exact] : [cost != null ? cost : answer && answer.credits]).map(read).filter(function (n) {\n    return n !== null;\n  });\n  return figures.length ? Math.max.apply(null, figures) : null;\n}\n\n/** How a job stands, by Higgsfield's own words for it. */\nconst JOB_DONE = /^(completed|complete|succeeded|success|done|finished|ready)$/;\nconst JOB_FAILED = /^(failed|failure|error|errored|canceled|cancelled|nsfw|rejected|expired|ip_detected|blocked|moderated|submission_failed)$/;\n\n/** A job's status, lower case, or ''. */\nfunction jobStatus(answer) {\n  return (findString(answer, ['status', 'state'], 0) || '').toLowerCase();\n}\n\n/** Every https link in an answer, at any depth. */\nfunction allLinks(value, out, depth) {\n  out = out || [];\n  depth = depth || 0;\n  if (depth > 6 || value === null || value === undefined) return out;\n  if (typeof value === 'string') {\n    if (/^https:\\/\\/\\S+$/.test(value)) out.push(value);\n    return out;\n  }\n  if (typeof value === 'object') {\n    const inner = Array.isArray(value) ? value : Object.keys(value).map(function (k) { return value[k]; });\n    inner.forEach(function (v) { allLinks(v, out, depth + 1); });\n  }\n  return out;\n}\n\n/** Why a job failed, as plainly as Higgsfield says it. */\nfunction jobReason(status, answer, json) {\n  if (status === 'ip_detected') return 'Higgsfield held it back: it may show protected material. If the team has the rights, reveal it on Higgsfield.';\n  if (status === 'nsfw' || status === 'moderated' || status === 'blocked') return 'Higgsfield\\'s safety check stopped it: change the prompt and ask again.';\n  const said = findString(answer, ['error', 'message', 'reason', 'detail'], 0) || wordsOf(json);\n  return 'Higgsfield could not make it (' + status + ')' + (said ? ': ' + said.slice(0, 200) : '.');\n}\n\n// What the page asking is told (AI video, or Settings and the studio for a\n// picture): the price, and the credits left on the team's Higgsfield plan\n// when it was read (null when Higgsfield did not say).\nconst price = $('Read the price').first().json;\nconst balance = creditsOf({ credits: answerOf($input.first().json).credits });\nreturn [{ json: Object.assign({}, price, { balance: balance }) }];\n" },
  },
  output: [{ ok: true, credits: 2, balance: 280 }],
});

const respond = node({
  type: 'n8n-nodes-base.respondToWebhook',
  version: 1.5,
  config: {
    name: 'Answer the page',
    parameters: { respondWith: 'json', responseBody: expr('{{ JSON.stringify($json) }}'), options: {} },
  },
  output: [{}],
});

// ---- the asks: sent once

const takeDue = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: {
    name: "Take the videos asked for",
    executeOnce: true,
    parameters: {
      method: 'POST',
      url: 'https://tcinsdexwvzpznqlcpww.supabase.co/rest/v1/rpc/video_take_due',
      authentication: 'predefinedCredentialType',
      nodeCredentialType: 'supabaseApi',
      sendBody: true,
      contentType: 'json',
      specifyBody: 'json',
      jsonBody: expr("{{ JSON.stringify({ p_limit: 3 }) }}"),
      options: { timeout: 30000 },
    },
    credentials: { supabaseApi: newCredential('Supabase QGR') },
  },
  output: [{ id: 'video-id', prompt: 'A slow drone shot over a quiet suburb at golden hour.', model: 'seedance_2_0_mini', seconds: 4, aspect: '9:16', quality: '480p', sound: false, picture_path: null, look: null, live: false, path: 'videos/video-id.mp4' }],
});

const eachAsk = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: "One item per video",
    parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: "// The rows a database function returned, one item each. n8n turns a JSON\n// array answer into items by itself; this also takes one item holding the\n// whole array, so the next node sees the same either way. Nothing due means\n// no items, and the rest of the workflow does not run.\nconst out = [];\n$input.all().forEach(function (item) {\n  const json = item.json;\n  let rows = [];\n  if (Array.isArray(json)) rows = json;\n  else if (json && Array.isArray(json.data)) rows = json.data;\n  else if (json && typeof json === 'object' && Object.keys(json).length > 0) rows = [json];\n  rows.forEach(function (row) {\n    if (row && typeof row === 'object') out.push({ json: row });\n  });\n});\nreturn out;\n" },
  },
  output: [{ id: 'video-id', prompt: 'A slow drone shot over a quiet suburb at golden hour.', model: 'seedance_2_0_mini', seconds: 4, aspect: '9:16', quality: '480p', sound: false, picture_path: null, look: null, live: false, path: 'videos/video-id.mp4' }],
});

const forReal = ifElse({
  version: 2.3,
  config: {
    name: "Make it for real?",
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 2 },
        conditions: [{ leftValue: expr("{{ $json.live === true }}"), rightValue: true, operator: { type: 'boolean', operation: 'true', singleValue: true } }],
        combinator: 'and',
      },
    },
  },
});

const standIn = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: "Higgsfield (stand-in)",
    parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: "// STAND-IN for Higgsfield: the way taken while AI video is not switched on\n// (Settings, AI video). Nothing is sent and nothing is spent: the ask ends,\n// and the page says no video was made and where to switch it on.\n//\n// The real way (\"Make it for real?\" true) sends the ask to Higgsfield through\n// its MCP (generate_video), with its first picture imported first when it has\n// one, and records what happened in the shape every reader answers in:\n//   { kind: 'started', id, job_id, credits }   Higgsfield took it\n//   { kind: 'refused', id, error }             nothing was made\n//   { kind: 'retry', id, error }               Higgsfield was not reached: sent again next minute\n//   { kind: 'unknown', id, error }             it may have been made: never sent again by itself\nreturn $input.all().map(function (item) {\n  return { json: { kind: 'stand_in', id: item.json.id } };\n});\n" },
  },
  output: [{ kind: 'stand_in', id: 'video-id' }],
});

const recordStandIn = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: {
    name: "Record: nothing made",
    onError: 'continueRegularOutput',
    parameters: {
      method: 'POST',
      url: 'https://tcinsdexwvzpznqlcpww.supabase.co/rest/v1/rpc/video_finish',
      authentication: 'predefinedCredentialType',
      nodeCredentialType: 'supabaseApi',
      sendBody: true,
      contentType: 'json',
      specifyBody: 'json',
      jsonBody: expr("{{ JSON.stringify({ p_id: $json.id, p_path: null, p_stand_in: true }) }}"),
      options: { timeout: 30000 },
    },
    credentials: { supabaseApi: newCredential('Supabase QGR') },
  },
  output: [{}],
});

const firstPicture = ifElse({
  version: 2.3,
  config: {
    name: "A first picture?",
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 2 },
        conditions: [{ leftValue: expr("{{ typeof $json.picture_path === \"string\" && $json.picture_path.length > 0 }}"), rightValue: true, operator: { type: 'boolean', operation: 'true', singleValue: true } }],
        combinator: 'and',
      },
    },
  },
});

const signPicture = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: {
    name: "Sign the first picture",
    onError: 'continueRegularOutput',
    parameters: {
      method: 'POST',
      url: expr('https://tcinsdexwvzpznqlcpww.supabase.co/storage/v1/object/sign/video-refs/{{ $json.picture_path }}'),
      authentication: 'predefinedCredentialType',
      nodeCredentialType: 'supabaseApi',
      sendBody: true,
      contentType: 'json',
      specifyBody: 'json',
      jsonBody: expr("{{ JSON.stringify({ expiresIn: 900 }) }}"),
      options: { timeout: 30000, response: { response: { fullResponse: true, neverError: true } } },
    },
    credentials: { supabaseApi: newCredential('Supabase QGR') },
  },
  output: [{ statusCode: 200, body: { signedURL: '/object/sign/video-refs/refs/user-id/picture-id.jpg?token=t' } }],
});

const pictureLink = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: "Picture link",
    parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: "// A link Higgsfield can fetch the first picture from: Storage signs it for\n// 15 minutes, as the screenshots of competitors' ads are. Higgsfield copies it\n// into its own storage (media_import_url) before the video is asked for.\nconst STORAGE = 'https://tcinsdexwvzpznqlcpww.supabase.co/storage/v1';\nreturn $input.all().map(function (item, i) {\n  const ask = $('A first picture?').itemMatching(i).json;\n  const res = item.json || {};\n  const body = res.body && typeof res.body === 'object' ? res.body : {};\n  const signed = body.signedURL || body.signedUrl;\n  if (res.statusCode >= 200 && res.statusCode < 300 && typeof signed === 'string') {\n    return { json: Object.assign({}, ask, { url: STORAGE + (signed.charAt(0) === '/' ? '' : '/') + signed }) };\n  }\n  const said = String(body.message || body.error || res.error || 'no answer').slice(0, 200);\n  return { json: { kind: 'refused', id: ask.id, error: 'The first picture could not be read from Storage (' + (res.statusCode || 'no answer') + '): ' + said } };\n});\n" },
  },
  output: [{ id: 'video-id', url: 'https://tcinsdexwvzpznqlcpww.supabase.co/storage/v1/object/sign/video-refs/refs/user-id/picture-id.jpg?token=t' }],
});

const linkMade = ifElse({
  version: 2.3,
  config: {
    name: "Link made?",
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 2 },
        conditions: [{ leftValue: expr("{{ typeof $json.url === \"string\" && $json.url.length > 0 }}"), rightValue: true, operator: { type: 'boolean', operation: 'true', singleValue: true } }],
        combinator: 'and',
      },
    },
  },
});

const importPicture = node({
  type: '@n8n/n8n-nodes-langchain.mcpClient',
  version: 1.1,
  config: {
    name: "Higgsfield: take the picture",
    onError: 'continueRegularOutput',
    parameters: {
      serverTransport: 'httpStreamable',
      endpointUrl: 'https://mcp.higgsfield.ai/mcp',
      authentication: 'mcpOAuth2Api',
      tool: { __rl: true, mode: 'id', value: 'media_import_url' },
      inputMode: 'json',
      jsonInput: expr("{{ JSON.stringify({ url: $json.url }) }}"),
      options: { convertToBinary: false, timeout: 120000 },
    },
    credentials: { mcpOAuth2Api: newCredential('Higgsfield') },
  },
  output: [{ structuredContent: { media_id: 'media-id' } }],
});

const readMedia = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: "Read the picture's id",
    parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: "// Shared by the scripts that read Higgsfield's answers, for AI video and for\n// pictures (joined in front of each). Higgsfield is asked through its MCP,\n// signed in with the team's own account, so every video and every picture\n// spends the plan's credits.\n//\n// An MCP step answers in one of three ways, and each script must tell them\n// apart:\n//   - Higgsfield answered: { structuredContent, content: [{ type: 'text', text }] }\n//   - Higgsfield refused the call: { error: { message } } (bad input, a model\n//     it does not know, not enough credits). Nothing was made.\n//   - n8n could not reach Higgsfield at all: the step hands on the item it was\n//     given, unchanged. Nothing was sent.\n\n/** What Higgsfield's answer carries: its structured content, else its text read as JSON, else {}. */\nfunction answerOf(json) {\n  if (!json || typeof json !== 'object') return {};\n  if (json.structuredContent && typeof json.structuredContent === 'object') return json.structuredContent;\n  const parts = Array.isArray(json.content) ? json.content : [];\n  for (let i = 0; i < parts.length; i++) {\n    const text = parts[i] && parts[i].text;\n    if (text && typeof text === 'object') return text;\n    if (typeof text === 'string' && /^\\s*[{[]/.test(text)) {\n      try {\n        return JSON.parse(text);\n      } catch (e) {\n        // Not JSON: read as words below.\n      }\n    }\n  }\n  return {};\n}\n\n/** Higgsfield's words, for a reason shown to the team. */\nfunction wordsOf(json) {\n  const parts = json && Array.isArray(json.content) ? json.content : [];\n  return parts\n    .map(function (p) { return p && typeof p.text === 'string' ? p.text : ''; })\n    .join(' ')\n    .replace(/\\s+/g, ' ')\n    .trim();\n}\n\n/** The error Higgsfield or the MCP step gave, as text, or ''. */\nfunction errorOf(json) {\n  if (!json || typeof json !== 'object' || !json.error) return '';\n  const e = json.error;\n  const message = typeof e === 'string' ? e : e.message || e.description || JSON.stringify(e);\n  return String(message).replace(/\\s+/g, ' ').trim().slice(0, 400);\n}\n\n/** n8n could not reach Higgsfield: the step handed on what it was given. */\nfunction notReached(json, own) {\n  if (!json || typeof json !== 'object') return true;\n  if (json.structuredContent || json.content || json.error) return false;\n  return Object.prototype.hasOwnProperty.call(json, own);\n}\n\n/**\n * Higgsfield's offer of one of its presets in place of the prompt (\"This\n * prompt looks like the Higgsfield preset … generate literally\"), which comes\n * instead of a price or a job: nothing was priced or made. Its id and name,\n * or null. Seen on every video prompt tried on 2026-10-20, never on a picture.\n */\nfunction presetNotice(json) {\n  const answer = answerOf(json);\n  const notice = answer && answer.notice;\n  if (notice && typeof notice === 'object' && notice.type === 'preset_recommendation') {\n    const data = notice.data && typeof notice.data === 'object' ? notice.data : {};\n    const preset = data.preset && typeof data.preset === 'object' ? data.preset : {};\n    const id = (data.retry_literal_with && data.retry_literal_with.declined_preset_id) || preset.id || '';\n    return { id: String(id), name: typeof preset.name === 'string' ? preset.name : '' };\n  }\n  const words = wordsOf(json);\n  const said = words.match(/declined_preset_id:?\\s*\"?([A-Za-z0-9-]{8,})/);\n  if (!said) return null;\n  const name = words.match(/preset \"([^\"]+)\"/);\n  return { id: said[1], name: name ? name[1] : '' };\n}\n\n/** What the team is told when Higgsfield offered a preset again after it was declined. */\nfunction presetSaid(preset) {\n  return 'Higgsfield offered its preset' + (preset.name ? ' \"' + preset.name + '\"' : '') + ' in place of the prompt as written';\n}\n\n/** A refusal that means nothing was made (the request, the model, the credits, the content). */\nfunction isRefusal(message) {\n  return /input validation error|invalid request|invalid arguments|unknown model|not enough credits|insufficient|top up|balance is|out of credits|nsfw|moderation|content policy|not allowed|prohibited|rejected/i.test(message);\n}\n\n/** The first string found under any of these keys, at any depth. */\nfunction findString(value, keys, depth) {\n  if (depth > 5 || value === null || typeof value !== 'object') return '';\n  const list = Array.isArray(value) ? value : [value];\n  for (let i = 0; i < list.length; i++) {\n    const v = list[i];\n    if (!v || typeof v !== 'object') continue;\n    if (!Array.isArray(v)) {\n      for (let k = 0; k < keys.length; k++) {\n        const found = v[keys[k]];\n        if (typeof found === 'string' && found.trim()) return found.trim();\n        if (typeof found === 'number') return String(found);\n      }\n    }\n    const inner = Array.isArray(v) ? v : Object.keys(v).map(function (key) { return v[key]; });\n    for (let j = 0; j < inner.length; j++) {\n      const got = findString(inner[j], keys, depth + 1);\n      if (got) return got;\n    }\n  }\n  return '';\n}\n\n/**\n * Credits in an answer: { cost: { credits, credits_exact } }, { credits } or\n * { cost }. Higgsfield can quote two figures that differ (a picture at\n * \"1 credit (0.5 exact)\"), and which one the plan is charged is not said, so\n * the higher counts: the month's limit is never under-counted.\n */\nfunction creditsOf(answer) {\n  const cost = answer && answer.cost;\n  const read = function (n) {\n    const value = typeof n === 'string' ? parseFloat(n) : n;\n    return typeof value === 'number' && isFinite(value) && value >= 0 ? value : null;\n  };\n  const figures = (cost && typeof cost === 'object' ? [cost.credits, cost.credits_exact] : [cost != null ? cost : answer && answer.credits]).map(read).filter(function (n) {\n    return n !== null;\n  });\n  return figures.length ? Math.max.apply(null, figures) : null;\n}\n\n/** How a job stands, by Higgsfield's own words for it. */\nconst JOB_DONE = /^(completed|complete|succeeded|success|done|finished|ready)$/;\nconst JOB_FAILED = /^(failed|failure|error|errored|canceled|cancelled|nsfw|rejected|expired|ip_detected|blocked|moderated|submission_failed)$/;\n\n/** A job's status, lower case, or ''. */\nfunction jobStatus(answer) {\n  return (findString(answer, ['status', 'state'], 0) || '').toLowerCase();\n}\n\n/** Every https link in an answer, at any depth. */\nfunction allLinks(value, out, depth) {\n  out = out || [];\n  depth = depth || 0;\n  if (depth > 6 || value === null || value === undefined) return out;\n  if (typeof value === 'string') {\n    if (/^https:\\/\\/\\S+$/.test(value)) out.push(value);\n    return out;\n  }\n  if (typeof value === 'object') {\n    const inner = Array.isArray(value) ? value : Object.keys(value).map(function (k) { return value[k]; });\n    inner.forEach(function (v) { allLinks(v, out, depth + 1); });\n  }\n  return out;\n}\n\n/** Why a job failed, as plainly as Higgsfield says it. */\nfunction jobReason(status, answer, json) {\n  if (status === 'ip_detected') return 'Higgsfield held it back: it may show protected material. If the team has the rights, reveal it on Higgsfield.';\n  if (status === 'nsfw' || status === 'moderated' || status === 'blocked') return 'Higgsfield\\'s safety check stopped it: change the prompt and ask again.';\n  const said = findString(answer, ['error', 'message', 'reason', 'detail'], 0) || wordsOf(json);\n  return 'Higgsfield could not make it (' + status + ')' + (said ? ': ' + said.slice(0, 200) : '.');\n}\n\n// The first picture, as Higgsfield keeps it: its media id goes with the ask.\n// Not reached, the ask waits for the next minute; refused, nothing is made.\nreturn $input.all().map(function (item, i) {\n  const ask = $('Picture link').itemMatching(i).json;\n  const json = item.json;\n  if (notReached(json, 'url')) return { json: { kind: 'retry', id: ask.id, error: 'Higgsfield could not be reached to take the first picture' } };\n  const error = errorOf(json);\n  if (error) return { json: { kind: 'refused', id: ask.id, error: 'Higgsfield could not take the first picture: ' + error } };\n  const mediaId = findString(answerOf(json), ['media_id', 'mediaId', 'id'], 0);\n  if (!mediaId) return { json: { kind: 'refused', id: ask.id, error: 'Higgsfield took the first picture but gave no id for it.' } };\n  const out = Object.assign({}, ask, { kind: 'go', media_id: mediaId });\n  delete out.url;\n  return { json: out };\n});\n" },
  },
  output: [{ kind: 'go', id: 'video-id', media_id: 'media-id' }],
});

const pictureTaken = ifElse({
  version: 2.3,
  config: {
    name: "Picture taken?",
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 2 },
        conditions: [{ leftValue: expr("{{ $json.kind === \"go\" }}"), rightValue: true, operator: { type: 'boolean', operation: 'true', singleValue: true } }],
        combinator: 'and',
      },
    },
  },
});

const writeRequest = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: "Write the request",
    parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: "// Shared by the AI video scripts that write what Higgsfield is asked for\n// (joined in front of each): generate_video's params, in Higgsfield's own\n// words for each model, as its catalogue gave them on 2026-10-20.\n\n/** What Higgsfield is asked to make, in its own words for each model. */\nconst MODEL_PARAMS = {\n  seedance_2_0_mini: function (ask) {\n    return { resolution: ask.quality, generate_audio: ask.sound === true };\n  },\n  kling3_0: function (ask) {\n    return { mode: ask.quality, sound: ask.sound === true ? 'on' : 'off' };\n  },\n  seedance_2_5: function (ask) {\n    return { mode: 't2v', resolution: ask.quality, generate_audio: ask.sound === true };\n  },\n};\n\n/** The rules every video keeps to, as the ads' pictures do. */\nconst VIDEO_RULES = 'No words, captions or logos in the picture (the ad\\'s words go over it later). No real or identifiable people. No flags.';\n\n/** What the run's reference pictures are for, when Higgsfield is given some. */\nconst VIDEO_REFERENCES = ' Use the reference pictures given for what they show: the real place, product or look to keep to.';\n\n/** The prompt Higgsfield gets: the team's, the brand's picture style, the references' line, then the rules. */\nfunction videoPrompt(ask) {\n  const look = typeof ask.look === 'string' && ask.look.trim() ? ' Style: ' + ask.look.trim().replace(/\\s+/g, ' ').slice(0, 400) + '.' : '';\n  const references = Array.isArray(ask.references) && ask.references.length > 0 ? VIDEO_REFERENCES : '';\n  const room = 2000 - look.length - references.length - VIDEO_RULES.length - 2;\n  const prompt = String(ask.prompt || '').replace(/\\s+/g, ' ').trim().slice(0, Math.max(200, room));\n  return (prompt + look + references + ' ' + VIDEO_RULES).replace(/\\.\\./g, '.').trim();\n}\n\n/**\n * generate_video's params for one ask, with its first picture's media id when\n * it has one, and the reference pictures of the run it was asked for (an ad's\n * video) as image_references, which do not change its price.\n */\nfunction videoParams(ask, mediaId) {\n  const own = MODEL_PARAMS[ask.model];\n  if (!own) throw new Error('Higgsfield is not asked for ' + ask.model + ' videos');\n  const params = Object.assign({ model: ask.model, prompt: videoPrompt(ask), aspect_ratio: ask.aspect, duration: Number(ask.seconds) }, own(ask));\n  const medias = mediaId ? [{ role: 'start_image', value: mediaId }] : [];\n  (Array.isArray(ask.references) ? ask.references : []).forEach(function (id) {\n    if (typeof id === 'string' && id) medias.push({ role: 'image_references', value: id });\n  });\n  if (medias.length > 0) params.medias = medias;\n  return params;\n}\n\n// What Higgsfield is asked to make: generate_video's params for each ask, in\n// Higgsfield's own words for its model, with the first picture's media id\n// when there is one. Never with get_cost: this one is made, and paid for.\nreturn $input.all().map(function (item) {\n  const ask = item.json;\n  return { json: { id: ask.id, generate_input: JSON.stringify({ params: videoParams(ask, ask.media_id || null) }) } };\n});\n" },
  },
  output: [{ id: 'video-id', generate_input: '{"params":{"model":"seedance_2_0_mini"}}' }],
});

const makeIt = node({
  type: '@n8n/n8n-nodes-langchain.mcpClient',
  version: 1.1,
  config: {
    name: "Higgsfield: make it",
    onError: 'continueRegularOutput',
    parameters: {
      serverTransport: 'httpStreamable',
      endpointUrl: 'https://mcp.higgsfield.ai/mcp',
      authentication: 'mcpOAuth2Api',
      tool: { __rl: true, mode: 'id', value: 'generate_video' },
      inputMode: 'json',
      jsonInput: expr("{{ $json.generate_input }}"),
      options: { convertToBinary: false, timeout: 120000 },
    },
    credentials: { mcpOAuth2Api: newCredential('Higgsfield') },
  },
  output: [{ structuredContent: { job_id: 'job-id' } }],
});


const makeDecline = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: "Decline a preset",
    parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: "// Shared by the scripts that read Higgsfield's answers, for AI video and for\n// pictures (joined in front of each). Higgsfield is asked through its MCP,\n// signed in with the team's own account, so every video and every picture\n// spends the plan's credits.\n//\n// An MCP step answers in one of three ways, and each script must tell them\n// apart:\n//   - Higgsfield answered: { structuredContent, content: [{ type: 'text', text }] }\n//   - Higgsfield refused the call: { error: { message } } (bad input, a model\n//     it does not know, not enough credits). Nothing was made.\n//   - n8n could not reach Higgsfield at all: the step hands on the item it was\n//     given, unchanged. Nothing was sent.\n\n/** What Higgsfield's answer carries: its structured content, else its text read as JSON, else {}. */\nfunction answerOf(json) {\n  if (!json || typeof json !== 'object') return {};\n  if (json.structuredContent && typeof json.structuredContent === 'object') return json.structuredContent;\n  const parts = Array.isArray(json.content) ? json.content : [];\n  for (let i = 0; i < parts.length; i++) {\n    const text = parts[i] && parts[i].text;\n    if (text && typeof text === 'object') return text;\n    if (typeof text === 'string' && /^\\s*[{[]/.test(text)) {\n      try {\n        return JSON.parse(text);\n      } catch (e) {\n        // Not JSON: read as words below.\n      }\n    }\n  }\n  return {};\n}\n\n/** Higgsfield's words, for a reason shown to the team. */\nfunction wordsOf(json) {\n  const parts = json && Array.isArray(json.content) ? json.content : [];\n  return parts\n    .map(function (p) { return p && typeof p.text === 'string' ? p.text : ''; })\n    .join(' ')\n    .replace(/\\s+/g, ' ')\n    .trim();\n}\n\n/** The error Higgsfield or the MCP step gave, as text, or ''. */\nfunction errorOf(json) {\n  if (!json || typeof json !== 'object' || !json.error) return '';\n  const e = json.error;\n  const message = typeof e === 'string' ? e : e.message || e.description || JSON.stringify(e);\n  return String(message).replace(/\\s+/g, ' ').trim().slice(0, 400);\n}\n\n/** n8n could not reach Higgsfield: the step handed on what it was given. */\nfunction notReached(json, own) {\n  if (!json || typeof json !== 'object') return true;\n  if (json.structuredContent || json.content || json.error) return false;\n  return Object.prototype.hasOwnProperty.call(json, own);\n}\n\n/**\n * Higgsfield's offer of one of its presets in place of the prompt (\"This\n * prompt looks like the Higgsfield preset … generate literally\"), which comes\n * instead of a price or a job: nothing was priced or made. Its id and name,\n * or null. Seen on every video prompt tried on 2026-10-20, never on a picture.\n */\nfunction presetNotice(json) {\n  const answer = answerOf(json);\n  const notice = answer && answer.notice;\n  if (notice && typeof notice === 'object' && notice.type === 'preset_recommendation') {\n    const data = notice.data && typeof notice.data === 'object' ? notice.data : {};\n    const preset = data.preset && typeof data.preset === 'object' ? data.preset : {};\n    const id = (data.retry_literal_with && data.retry_literal_with.declined_preset_id) || preset.id || '';\n    return { id: String(id), name: typeof preset.name === 'string' ? preset.name : '' };\n  }\n  const words = wordsOf(json);\n  const said = words.match(/declined_preset_id:?\\s*\"?([A-Za-z0-9-]{8,})/);\n  if (!said) return null;\n  const name = words.match(/preset \"([^\"]+)\"/);\n  return { id: said[1], name: name ? name[1] : '' };\n}\n\n/** What the team is told when Higgsfield offered a preset again after it was declined. */\nfunction presetSaid(preset) {\n  return 'Higgsfield offered its preset' + (preset.name ? ' \"' + preset.name + '\"' : '') + ' in place of the prompt as written';\n}\n\n/** A refusal that means nothing was made (the request, the model, the credits, the content). */\nfunction isRefusal(message) {\n  return /input validation error|invalid request|invalid arguments|unknown model|not enough credits|insufficient|top up|balance is|out of credits|nsfw|moderation|content policy|not allowed|prohibited|rejected/i.test(message);\n}\n\n/** The first string found under any of these keys, at any depth. */\nfunction findString(value, keys, depth) {\n  if (depth > 5 || value === null || typeof value !== 'object') return '';\n  const list = Array.isArray(value) ? value : [value];\n  for (let i = 0; i < list.length; i++) {\n    const v = list[i];\n    if (!v || typeof v !== 'object') continue;\n    if (!Array.isArray(v)) {\n      for (let k = 0; k < keys.length; k++) {\n        const found = v[keys[k]];\n        if (typeof found === 'string' && found.trim()) return found.trim();\n        if (typeof found === 'number') return String(found);\n      }\n    }\n    const inner = Array.isArray(v) ? v : Object.keys(v).map(function (key) { return v[key]; });\n    for (let j = 0; j < inner.length; j++) {\n      const got = findString(inner[j], keys, depth + 1);\n      if (got) return got;\n    }\n  }\n  return '';\n}\n\n/**\n * Credits in an answer: { cost: { credits, credits_exact } }, { credits } or\n * { cost }. Higgsfield can quote two figures that differ (a picture at\n * \"1 credit (0.5 exact)\"), and which one the plan is charged is not said, so\n * the higher counts: the month's limit is never under-counted.\n */\nfunction creditsOf(answer) {\n  const cost = answer && answer.cost;\n  const read = function (n) {\n    const value = typeof n === 'string' ? parseFloat(n) : n;\n    return typeof value === 'number' && isFinite(value) && value >= 0 ? value : null;\n  };\n  const figures = (cost && typeof cost === 'object' ? [cost.credits, cost.credits_exact] : [cost != null ? cost : answer && answer.credits]).map(read).filter(function (n) {\n    return n !== null;\n  });\n  return figures.length ? Math.max.apply(null, figures) : null;\n}\n\n/** How a job stands, by Higgsfield's own words for it. */\nconst JOB_DONE = /^(completed|complete|succeeded|success|done|finished|ready)$/;\nconst JOB_FAILED = /^(failed|failure|error|errored|canceled|cancelled|nsfw|rejected|expired|ip_detected|blocked|moderated|submission_failed)$/;\n\n/** A job's status, lower case, or ''. */\nfunction jobStatus(answer) {\n  return (findString(answer, ['status', 'state'], 0) || '').toLowerCase();\n}\n\n/** Every https link in an answer, at any depth. */\nfunction allLinks(value, out, depth) {\n  out = out || [];\n  depth = depth || 0;\n  if (depth > 6 || value === null || value === undefined) return out;\n  if (typeof value === 'string') {\n    if (/^https:\\/\\/\\S+$/.test(value)) out.push(value);\n    return out;\n  }\n  if (typeof value === 'object') {\n    const inner = Array.isArray(value) ? value : Object.keys(value).map(function (k) { return value[k]; });\n    inner.forEach(function (v) { allLinks(v, out, depth + 1); });\n  }\n  return out;\n}\n\n/** Why a job failed, as plainly as Higgsfield says it. */\nfunction jobReason(status, answer, json) {\n  if (status === 'ip_detected') return 'Higgsfield held it back: it may show protected material. If the team has the rights, reveal it on Higgsfield.';\n  if (status === 'nsfw' || status === 'moderated' || status === 'blocked') return 'Higgsfield\\'s safety check stopped it: change the prompt and ask again.';\n  const said = findString(answer, ['error', 'message', 'reason', 'detail'], 0) || wordsOf(json);\n  return 'Higgsfield could not make it (' + status + ')' + (said ? ': ' + said.slice(0, 200) : '.');\n}\n\n// Higgsfield sometimes answers with one of its presets in place of the\n// prompt (\"Ask the user whether to use that preset or generate literally\"),\n// and then nothing is priced or made. The team asked for its own prompt, so\n// the preset is declined and the same request is asked once more as written:\n// declined_preset_id, beside the params and inside them as get_cost is\n// (checked on 2026-10-20: declined, the price came back). Every other answer\n// goes on as it came. A preset offered again after that is read as nothing\n// made, with the reason.\nconst KEY = 'generate_input';\nreturn $input.all().map(function (item, i) {\n  const notice = presetNotice(item.json);\n  let input = null;\n  try {\n    input = JSON.parse($('Write the request').itemMatching(i).json[KEY]);\n  } catch (e) {\n    input = null;\n  }\n  if (!notice || !notice.id || !input || typeof input !== 'object' || input.declined_preset_id) {\n    return { json: Object.assign({}, item.json, { as_written: false }), pairedItem: { item: i } };\n  }\n  input.declined_preset_id = notice.id;\n  if (input.params && typeof input.params === 'object') input.params.declined_preset_id = notice.id;\n  const out = { as_written: true };\n  out[KEY] = JSON.stringify(input);\n  return { json: out, pairedItem: { item: i } };\n});\n" },
  },
  output: [{ as_written: true, generate_input: '{"params":{"declined_preset_id":"preset-id"}}' }],
});

const makeAsWritten = ifElse({
  version: 2.3,
  config: {
    name: "As written?",
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 2 },
        conditions: [{ leftValue: expr("{{ $json.as_written === true }}"), rightValue: true, operator: { type: 'boolean', operation: 'true', singleValue: true } }],
        combinator: 'and',
      },
    },
  },
});

const makeAgain = node({
  type: '@n8n/n8n-nodes-langchain.mcpClient',
  version: 1.1,
  config: {
    name: "Higgsfield: make it, as written",
    onError: 'continueRegularOutput',
    parameters: {
      serverTransport: 'httpStreamable',
      endpointUrl: 'https://mcp.higgsfield.ai/mcp',
      authentication: 'mcpOAuth2Api',
      tool: { __rl: true, mode: 'id', value: 'generate_video' },
      inputMode: 'json',
      jsonInput: expr("{{ $json.generate_input }}"),
      options: { convertToBinary: false, timeout: 120000 },
    },
    credentials: { mcpOAuth2Api: newCredential('Higgsfield') },
  },
  output: [{ structuredContent: { job_id: 'job-id' } }],
});

const readStart = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: "Read the answer",
    parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: "// Shared by the scripts that read Higgsfield's answers, for AI video and for\n// pictures (joined in front of each). Higgsfield is asked through its MCP,\n// signed in with the team's own account, so every video and every picture\n// spends the plan's credits.\n//\n// An MCP step answers in one of three ways, and each script must tell them\n// apart:\n//   - Higgsfield answered: { structuredContent, content: [{ type: 'text', text }] }\n//   - Higgsfield refused the call: { error: { message } } (bad input, a model\n//     it does not know, not enough credits). Nothing was made.\n//   - n8n could not reach Higgsfield at all: the step hands on the item it was\n//     given, unchanged. Nothing was sent.\n\n/** What Higgsfield's answer carries: its structured content, else its text read as JSON, else {}. */\nfunction answerOf(json) {\n  if (!json || typeof json !== 'object') return {};\n  if (json.structuredContent && typeof json.structuredContent === 'object') return json.structuredContent;\n  const parts = Array.isArray(json.content) ? json.content : [];\n  for (let i = 0; i < parts.length; i++) {\n    const text = parts[i] && parts[i].text;\n    if (text && typeof text === 'object') return text;\n    if (typeof text === 'string' && /^\\s*[{[]/.test(text)) {\n      try {\n        return JSON.parse(text);\n      } catch (e) {\n        // Not JSON: read as words below.\n      }\n    }\n  }\n  return {};\n}\n\n/** Higgsfield's words, for a reason shown to the team. */\nfunction wordsOf(json) {\n  const parts = json && Array.isArray(json.content) ? json.content : [];\n  return parts\n    .map(function (p) { return p && typeof p.text === 'string' ? p.text : ''; })\n    .join(' ')\n    .replace(/\\s+/g, ' ')\n    .trim();\n}\n\n/** The error Higgsfield or the MCP step gave, as text, or ''. */\nfunction errorOf(json) {\n  if (!json || typeof json !== 'object' || !json.error) return '';\n  const e = json.error;\n  const message = typeof e === 'string' ? e : e.message || e.description || JSON.stringify(e);\n  return String(message).replace(/\\s+/g, ' ').trim().slice(0, 400);\n}\n\n/** n8n could not reach Higgsfield: the step handed on what it was given. */\nfunction notReached(json, own) {\n  if (!json || typeof json !== 'object') return true;\n  if (json.structuredContent || json.content || json.error) return false;\n  return Object.prototype.hasOwnProperty.call(json, own);\n}\n\n/**\n * Higgsfield's offer of one of its presets in place of the prompt (\"This\n * prompt looks like the Higgsfield preset … generate literally\"), which comes\n * instead of a price or a job: nothing was priced or made. Its id and name,\n * or null. Seen on every video prompt tried on 2026-10-20, never on a picture.\n */\nfunction presetNotice(json) {\n  const answer = answerOf(json);\n  const notice = answer && answer.notice;\n  if (notice && typeof notice === 'object' && notice.type === 'preset_recommendation') {\n    const data = notice.data && typeof notice.data === 'object' ? notice.data : {};\n    const preset = data.preset && typeof data.preset === 'object' ? data.preset : {};\n    const id = (data.retry_literal_with && data.retry_literal_with.declined_preset_id) || preset.id || '';\n    return { id: String(id), name: typeof preset.name === 'string' ? preset.name : '' };\n  }\n  const words = wordsOf(json);\n  const said = words.match(/declined_preset_id:?\\s*\"?([A-Za-z0-9-]{8,})/);\n  if (!said) return null;\n  const name = words.match(/preset \"([^\"]+)\"/);\n  return { id: said[1], name: name ? name[1] : '' };\n}\n\n/** What the team is told when Higgsfield offered a preset again after it was declined. */\nfunction presetSaid(preset) {\n  return 'Higgsfield offered its preset' + (preset.name ? ' \"' + preset.name + '\"' : '') + ' in place of the prompt as written';\n}\n\n/** A refusal that means nothing was made (the request, the model, the credits, the content). */\nfunction isRefusal(message) {\n  return /input validation error|invalid request|invalid arguments|unknown model|not enough credits|insufficient|top up|balance is|out of credits|nsfw|moderation|content policy|not allowed|prohibited|rejected/i.test(message);\n}\n\n/** The first string found under any of these keys, at any depth. */\nfunction findString(value, keys, depth) {\n  if (depth > 5 || value === null || typeof value !== 'object') return '';\n  const list = Array.isArray(value) ? value : [value];\n  for (let i = 0; i < list.length; i++) {\n    const v = list[i];\n    if (!v || typeof v !== 'object') continue;\n    if (!Array.isArray(v)) {\n      for (let k = 0; k < keys.length; k++) {\n        const found = v[keys[k]];\n        if (typeof found === 'string' && found.trim()) return found.trim();\n        if (typeof found === 'number') return String(found);\n      }\n    }\n    const inner = Array.isArray(v) ? v : Object.keys(v).map(function (key) { return v[key]; });\n    for (let j = 0; j < inner.length; j++) {\n      const got = findString(inner[j], keys, depth + 1);\n      if (got) return got;\n    }\n  }\n  return '';\n}\n\n/**\n * Credits in an answer: { cost: { credits, credits_exact } }, { credits } or\n * { cost }. Higgsfield can quote two figures that differ (a picture at\n * \"1 credit (0.5 exact)\"), and which one the plan is charged is not said, so\n * the higher counts: the month's limit is never under-counted.\n */\nfunction creditsOf(answer) {\n  const cost = answer && answer.cost;\n  const read = function (n) {\n    const value = typeof n === 'string' ? parseFloat(n) : n;\n    return typeof value === 'number' && isFinite(value) && value >= 0 ? value : null;\n  };\n  const figures = (cost && typeof cost === 'object' ? [cost.credits, cost.credits_exact] : [cost != null ? cost : answer && answer.credits]).map(read).filter(function (n) {\n    return n !== null;\n  });\n  return figures.length ? Math.max.apply(null, figures) : null;\n}\n\n/** How a job stands, by Higgsfield's own words for it. */\nconst JOB_DONE = /^(completed|complete|succeeded|success|done|finished|ready)$/;\nconst JOB_FAILED = /^(failed|failure|error|errored|canceled|cancelled|nsfw|rejected|expired|ip_detected|blocked|moderated|submission_failed)$/;\n\n/** A job's status, lower case, or ''. */\nfunction jobStatus(answer) {\n  return (findString(answer, ['status', 'state'], 0) || '').toLowerCase();\n}\n\n/** Every https link in an answer, at any depth. */\nfunction allLinks(value, out, depth) {\n  out = out || [];\n  depth = depth || 0;\n  if (depth > 6 || value === null || value === undefined) return out;\n  if (typeof value === 'string') {\n    if (/^https:\\/\\/\\S+$/.test(value)) out.push(value);\n    return out;\n  }\n  if (typeof value === 'object') {\n    const inner = Array.isArray(value) ? value : Object.keys(value).map(function (k) { return value[k]; });\n    inner.forEach(function (v) { allLinks(v, out, depth + 1); });\n  }\n  return out;\n}\n\n/** Why a job failed, as plainly as Higgsfield says it. */\nfunction jobReason(status, answer, json) {\n  if (status === 'ip_detected') return 'Higgsfield held it back: it may show protected material. If the team has the rights, reveal it on Higgsfield.';\n  if (status === 'nsfw' || status === 'moderated' || status === 'blocked') return 'Higgsfield\\'s safety check stopped it: change the prompt and ask again.';\n  const said = findString(answer, ['error', 'message', 'reason', 'detail'], 0) || wordsOf(json);\n  return 'Higgsfield could not make it (' + status + ')' + (said ? ': ' + said.slice(0, 200) : '.');\n}\n\n// Higgsfield's answer to an ask, read once and recorded once:\n//   took it        -> started, with its job (and its price, when it says one)\n//   refused it     -> refused: nothing was made (so is a preset offered again\n//                     in place of the prompt after it was declined: no job)\n//   not reached    -> retry: nothing was sent, so it is sent again next minute\n//   anything else  -> unknown: it may have been made, so it is never sent\n//                     again by itself (Higgsfield: \"do not automatically\n//                     resubmit\"); a person checks its history first.\nreturn $input.all().map(function (item, i) {\n  const sent = $('Write the request').itemMatching(i).json;\n  const json = item.json;\n  if (notReached(json, 'generate_input')) return { json: { kind: 'retry', id: sent.id, error: 'Could not connect to Higgsfield' } };\n  const error = errorOf(json);\n  if (error) {\n    return {\n      json: isRefusal(error)\n        ? { kind: 'refused', id: sent.id, error: 'Higgsfield refused it: ' + error }\n        : { kind: 'unknown', id: sent.id, error: 'Higgsfield may have started it (' + error + '). Check its history before asking again.' },\n    };\n  }\n  const preset = presetNotice(json);\n  if (preset) return { json: { kind: 'refused', id: sent.id, error: presetSaid(preset) + ': nothing was made. Change the prompt a little and ask again.' } };\n  const answer = answerOf(json);\n  const words = wordsOf(json);\n  const fromWords = words.match(/job[_ -]?id[\\s:=\"']+([A-Za-z0-9_-]{6,})/i);\n  const job = findString(answer, ['job_id', 'jobId'], 0) || findString(answer && answer.jobs, ['job_id', 'jobId', 'id'], 0) || (fromWords ? fromWords[1] : '') || findString(answer, ['id'], 0);\n  if (!job) {\n    return { json: { kind: 'unknown', id: sent.id, error: 'Higgsfield answered without a job (' + (words.slice(0, 200) || 'no words') + '). Check its history before asking again.' } };\n  }\n  return { json: { kind: 'started', id: sent.id, job_id: job, credits: creditsOf(answer) } };\n});\n" },
  },
  output: [{ kind: 'started', id: 'video-id', job_id: 'job-id', credits: null }],
});

const writeRequestPicture = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: "Write the request (picture)",
    parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: "// Shared by the AI video scripts that write what Higgsfield is asked for\n// (joined in front of each): generate_video's params, in Higgsfield's own\n// words for each model, as its catalogue gave them on 2026-10-20.\n\n/** What Higgsfield is asked to make, in its own words for each model. */\nconst MODEL_PARAMS = {\n  seedance_2_0_mini: function (ask) {\n    return { resolution: ask.quality, generate_audio: ask.sound === true };\n  },\n  kling3_0: function (ask) {\n    return { mode: ask.quality, sound: ask.sound === true ? 'on' : 'off' };\n  },\n  seedance_2_5: function (ask) {\n    return { mode: 't2v', resolution: ask.quality, generate_audio: ask.sound === true };\n  },\n};\n\n/** The rules every video keeps to, as the ads' pictures do. */\nconst VIDEO_RULES = 'No words, captions or logos in the picture (the ad\\'s words go over it later). No real or identifiable people. No flags.';\n\n/** What the run's reference pictures are for, when Higgsfield is given some. */\nconst VIDEO_REFERENCES = ' Use the reference pictures given for what they show: the real place, product or look to keep to.';\n\n/** The prompt Higgsfield gets: the team's, the brand's picture style, the references' line, then the rules. */\nfunction videoPrompt(ask) {\n  const look = typeof ask.look === 'string' && ask.look.trim() ? ' Style: ' + ask.look.trim().replace(/\\s+/g, ' ').slice(0, 400) + '.' : '';\n  const references = Array.isArray(ask.references) && ask.references.length > 0 ? VIDEO_REFERENCES : '';\n  const room = 2000 - look.length - references.length - VIDEO_RULES.length - 2;\n  const prompt = String(ask.prompt || '').replace(/\\s+/g, ' ').trim().slice(0, Math.max(200, room));\n  return (prompt + look + references + ' ' + VIDEO_RULES).replace(/\\.\\./g, '.').trim();\n}\n\n/**\n * generate_video's params for one ask, with its first picture's media id when\n * it has one, and the reference pictures of the run it was asked for (an ad's\n * video) as image_references, which do not change its price.\n */\nfunction videoParams(ask, mediaId) {\n  const own = MODEL_PARAMS[ask.model];\n  if (!own) throw new Error('Higgsfield is not asked for ' + ask.model + ' videos');\n  const params = Object.assign({ model: ask.model, prompt: videoPrompt(ask), aspect_ratio: ask.aspect, duration: Number(ask.seconds) }, own(ask));\n  const medias = mediaId ? [{ role: 'start_image', value: mediaId }] : [];\n  (Array.isArray(ask.references) ? ask.references : []).forEach(function (id) {\n    if (typeof id === 'string' && id) medias.push({ role: 'image_references', value: id });\n  });\n  if (medias.length > 0) params.medias = medias;\n  return params;\n}\n\n// What Higgsfield is asked to make: generate_video's params for each ask, in\n// Higgsfield's own words for its model, with the first picture's media id\n// when there is one. Never with get_cost: this one is made, and paid for.\nreturn $input.all().map(function (item) {\n  const ask = item.json;\n  return { json: { id: ask.id, generate_input: JSON.stringify({ params: videoParams(ask, ask.media_id || null) }) } };\n});\n" },
  },
  output: [{ id: 'video-id', generate_input: '{"params":{"model":"kling3_0"}}' }],
});

const makeItPicture = node({
  type: '@n8n/n8n-nodes-langchain.mcpClient',
  version: 1.1,
  config: {
    name: "Higgsfield: make it (picture)",
    onError: 'continueRegularOutput',
    parameters: {
      serverTransport: 'httpStreamable',
      endpointUrl: 'https://mcp.higgsfield.ai/mcp',
      authentication: 'mcpOAuth2Api',
      tool: { __rl: true, mode: 'id', value: 'generate_video' },
      inputMode: 'json',
      jsonInput: expr("{{ $json.generate_input }}"),
      options: { convertToBinary: false, timeout: 120000 },
    },
    credentials: { mcpOAuth2Api: newCredential('Higgsfield') },
  },
  output: [{ structuredContent: { job_id: 'job-id' } }],
});


const makePictureDecline = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: "Decline a preset (picture)",
    parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: "// Shared by the scripts that read Higgsfield's answers, for AI video and for\n// pictures (joined in front of each). Higgsfield is asked through its MCP,\n// signed in with the team's own account, so every video and every picture\n// spends the plan's credits.\n//\n// An MCP step answers in one of three ways, and each script must tell them\n// apart:\n//   - Higgsfield answered: { structuredContent, content: [{ type: 'text', text }] }\n//   - Higgsfield refused the call: { error: { message } } (bad input, a model\n//     it does not know, not enough credits). Nothing was made.\n//   - n8n could not reach Higgsfield at all: the step hands on the item it was\n//     given, unchanged. Nothing was sent.\n\n/** What Higgsfield's answer carries: its structured content, else its text read as JSON, else {}. */\nfunction answerOf(json) {\n  if (!json || typeof json !== 'object') return {};\n  if (json.structuredContent && typeof json.structuredContent === 'object') return json.structuredContent;\n  const parts = Array.isArray(json.content) ? json.content : [];\n  for (let i = 0; i < parts.length; i++) {\n    const text = parts[i] && parts[i].text;\n    if (text && typeof text === 'object') return text;\n    if (typeof text === 'string' && /^\\s*[{[]/.test(text)) {\n      try {\n        return JSON.parse(text);\n      } catch (e) {\n        // Not JSON: read as words below.\n      }\n    }\n  }\n  return {};\n}\n\n/** Higgsfield's words, for a reason shown to the team. */\nfunction wordsOf(json) {\n  const parts = json && Array.isArray(json.content) ? json.content : [];\n  return parts\n    .map(function (p) { return p && typeof p.text === 'string' ? p.text : ''; })\n    .join(' ')\n    .replace(/\\s+/g, ' ')\n    .trim();\n}\n\n/** The error Higgsfield or the MCP step gave, as text, or ''. */\nfunction errorOf(json) {\n  if (!json || typeof json !== 'object' || !json.error) return '';\n  const e = json.error;\n  const message = typeof e === 'string' ? e : e.message || e.description || JSON.stringify(e);\n  return String(message).replace(/\\s+/g, ' ').trim().slice(0, 400);\n}\n\n/** n8n could not reach Higgsfield: the step handed on what it was given. */\nfunction notReached(json, own) {\n  if (!json || typeof json !== 'object') return true;\n  if (json.structuredContent || json.content || json.error) return false;\n  return Object.prototype.hasOwnProperty.call(json, own);\n}\n\n/**\n * Higgsfield's offer of one of its presets in place of the prompt (\"This\n * prompt looks like the Higgsfield preset … generate literally\"), which comes\n * instead of a price or a job: nothing was priced or made. Its id and name,\n * or null. Seen on every video prompt tried on 2026-10-20, never on a picture.\n */\nfunction presetNotice(json) {\n  const answer = answerOf(json);\n  const notice = answer && answer.notice;\n  if (notice && typeof notice === 'object' && notice.type === 'preset_recommendation') {\n    const data = notice.data && typeof notice.data === 'object' ? notice.data : {};\n    const preset = data.preset && typeof data.preset === 'object' ? data.preset : {};\n    const id = (data.retry_literal_with && data.retry_literal_with.declined_preset_id) || preset.id || '';\n    return { id: String(id), name: typeof preset.name === 'string' ? preset.name : '' };\n  }\n  const words = wordsOf(json);\n  const said = words.match(/declined_preset_id:?\\s*\"?([A-Za-z0-9-]{8,})/);\n  if (!said) return null;\n  const name = words.match(/preset \"([^\"]+)\"/);\n  return { id: said[1], name: name ? name[1] : '' };\n}\n\n/** What the team is told when Higgsfield offered a preset again after it was declined. */\nfunction presetSaid(preset) {\n  return 'Higgsfield offered its preset' + (preset.name ? ' \"' + preset.name + '\"' : '') + ' in place of the prompt as written';\n}\n\n/** A refusal that means nothing was made (the request, the model, the credits, the content). */\nfunction isRefusal(message) {\n  return /input validation error|invalid request|invalid arguments|unknown model|not enough credits|insufficient|top up|balance is|out of credits|nsfw|moderation|content policy|not allowed|prohibited|rejected/i.test(message);\n}\n\n/** The first string found under any of these keys, at any depth. */\nfunction findString(value, keys, depth) {\n  if (depth > 5 || value === null || typeof value !== 'object') return '';\n  const list = Array.isArray(value) ? value : [value];\n  for (let i = 0; i < list.length; i++) {\n    const v = list[i];\n    if (!v || typeof v !== 'object') continue;\n    if (!Array.isArray(v)) {\n      for (let k = 0; k < keys.length; k++) {\n        const found = v[keys[k]];\n        if (typeof found === 'string' && found.trim()) return found.trim();\n        if (typeof found === 'number') return String(found);\n      }\n    }\n    const inner = Array.isArray(v) ? v : Object.keys(v).map(function (key) { return v[key]; });\n    for (let j = 0; j < inner.length; j++) {\n      const got = findString(inner[j], keys, depth + 1);\n      if (got) return got;\n    }\n  }\n  return '';\n}\n\n/**\n * Credits in an answer: { cost: { credits, credits_exact } }, { credits } or\n * { cost }. Higgsfield can quote two figures that differ (a picture at\n * \"1 credit (0.5 exact)\"), and which one the plan is charged is not said, so\n * the higher counts: the month's limit is never under-counted.\n */\nfunction creditsOf(answer) {\n  const cost = answer && answer.cost;\n  const read = function (n) {\n    const value = typeof n === 'string' ? parseFloat(n) : n;\n    return typeof value === 'number' && isFinite(value) && value >= 0 ? value : null;\n  };\n  const figures = (cost && typeof cost === 'object' ? [cost.credits, cost.credits_exact] : [cost != null ? cost : answer && answer.credits]).map(read).filter(function (n) {\n    return n !== null;\n  });\n  return figures.length ? Math.max.apply(null, figures) : null;\n}\n\n/** How a job stands, by Higgsfield's own words for it. */\nconst JOB_DONE = /^(completed|complete|succeeded|success|done|finished|ready)$/;\nconst JOB_FAILED = /^(failed|failure|error|errored|canceled|cancelled|nsfw|rejected|expired|ip_detected|blocked|moderated|submission_failed)$/;\n\n/** A job's status, lower case, or ''. */\nfunction jobStatus(answer) {\n  return (findString(answer, ['status', 'state'], 0) || '').toLowerCase();\n}\n\n/** Every https link in an answer, at any depth. */\nfunction allLinks(value, out, depth) {\n  out = out || [];\n  depth = depth || 0;\n  if (depth > 6 || value === null || value === undefined) return out;\n  if (typeof value === 'string') {\n    if (/^https:\\/\\/\\S+$/.test(value)) out.push(value);\n    return out;\n  }\n  if (typeof value === 'object') {\n    const inner = Array.isArray(value) ? value : Object.keys(value).map(function (k) { return value[k]; });\n    inner.forEach(function (v) { allLinks(v, out, depth + 1); });\n  }\n  return out;\n}\n\n/** Why a job failed, as plainly as Higgsfield says it. */\nfunction jobReason(status, answer, json) {\n  if (status === 'ip_detected') return 'Higgsfield held it back: it may show protected material. If the team has the rights, reveal it on Higgsfield.';\n  if (status === 'nsfw' || status === 'moderated' || status === 'blocked') return 'Higgsfield\\'s safety check stopped it: change the prompt and ask again.';\n  const said = findString(answer, ['error', 'message', 'reason', 'detail'], 0) || wordsOf(json);\n  return 'Higgsfield could not make it (' + status + ')' + (said ? ': ' + said.slice(0, 200) : '.');\n}\n\n// Higgsfield sometimes answers with one of its presets in place of the\n// prompt (\"Ask the user whether to use that preset or generate literally\"),\n// and then nothing is priced or made. The team asked for its own prompt, so\n// the preset is declined and the same request is asked once more as written:\n// declined_preset_id, beside the params and inside them as get_cost is\n// (checked on 2026-10-20: declined, the price came back). Every other answer\n// goes on as it came. A preset offered again after that is read as nothing\n// made, with the reason.\nconst KEY = 'generate_input';\nreturn $input.all().map(function (item, i) {\n  const notice = presetNotice(item.json);\n  let input = null;\n  try {\n    input = JSON.parse($('Write the request (picture)').itemMatching(i).json[KEY]);\n  } catch (e) {\n    input = null;\n  }\n  if (!notice || !notice.id || !input || typeof input !== 'object' || input.declined_preset_id) {\n    return { json: Object.assign({}, item.json, { as_written: false }), pairedItem: { item: i } };\n  }\n  input.declined_preset_id = notice.id;\n  if (input.params && typeof input.params === 'object') input.params.declined_preset_id = notice.id;\n  const out = { as_written: true };\n  out[KEY] = JSON.stringify(input);\n  return { json: out, pairedItem: { item: i } };\n});\n" },
  },
  output: [{ as_written: true, generate_input: '{"params":{"declined_preset_id":"preset-id"}}' }],
});

const makePictureAsWritten = ifElse({
  version: 2.3,
  config: {
    name: "As written? (picture)",
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 2 },
        conditions: [{ leftValue: expr("{{ $json.as_written === true }}"), rightValue: true, operator: { type: 'boolean', operation: 'true', singleValue: true } }],
        combinator: 'and',
      },
    },
  },
});

const makePictureAgain = node({
  type: '@n8n/n8n-nodes-langchain.mcpClient',
  version: 1.1,
  config: {
    name: "Higgsfield: make it (picture), as written",
    onError: 'continueRegularOutput',
    parameters: {
      serverTransport: 'httpStreamable',
      endpointUrl: 'https://mcp.higgsfield.ai/mcp',
      authentication: 'mcpOAuth2Api',
      tool: { __rl: true, mode: 'id', value: 'generate_video' },
      inputMode: 'json',
      jsonInput: expr("{{ $json.generate_input }}"),
      options: { convertToBinary: false, timeout: 120000 },
    },
    credentials: { mcpOAuth2Api: newCredential('Higgsfield') },
  },
  output: [{ structuredContent: { job_id: 'job-id' } }],
});

const readStartPicture = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: "Read the answer (picture)",
    parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: "// Shared by the scripts that read Higgsfield's answers, for AI video and for\n// pictures (joined in front of each). Higgsfield is asked through its MCP,\n// signed in with the team's own account, so every video and every picture\n// spends the plan's credits.\n//\n// An MCP step answers in one of three ways, and each script must tell them\n// apart:\n//   - Higgsfield answered: { structuredContent, content: [{ type: 'text', text }] }\n//   - Higgsfield refused the call: { error: { message } } (bad input, a model\n//     it does not know, not enough credits). Nothing was made.\n//   - n8n could not reach Higgsfield at all: the step hands on the item it was\n//     given, unchanged. Nothing was sent.\n\n/** What Higgsfield's answer carries: its structured content, else its text read as JSON, else {}. */\nfunction answerOf(json) {\n  if (!json || typeof json !== 'object') return {};\n  if (json.structuredContent && typeof json.structuredContent === 'object') return json.structuredContent;\n  const parts = Array.isArray(json.content) ? json.content : [];\n  for (let i = 0; i < parts.length; i++) {\n    const text = parts[i] && parts[i].text;\n    if (text && typeof text === 'object') return text;\n    if (typeof text === 'string' && /^\\s*[{[]/.test(text)) {\n      try {\n        return JSON.parse(text);\n      } catch (e) {\n        // Not JSON: read as words below.\n      }\n    }\n  }\n  return {};\n}\n\n/** Higgsfield's words, for a reason shown to the team. */\nfunction wordsOf(json) {\n  const parts = json && Array.isArray(json.content) ? json.content : [];\n  return parts\n    .map(function (p) { return p && typeof p.text === 'string' ? p.text : ''; })\n    .join(' ')\n    .replace(/\\s+/g, ' ')\n    .trim();\n}\n\n/** The error Higgsfield or the MCP step gave, as text, or ''. */\nfunction errorOf(json) {\n  if (!json || typeof json !== 'object' || !json.error) return '';\n  const e = json.error;\n  const message = typeof e === 'string' ? e : e.message || e.description || JSON.stringify(e);\n  return String(message).replace(/\\s+/g, ' ').trim().slice(0, 400);\n}\n\n/** n8n could not reach Higgsfield: the step handed on what it was given. */\nfunction notReached(json, own) {\n  if (!json || typeof json !== 'object') return true;\n  if (json.structuredContent || json.content || json.error) return false;\n  return Object.prototype.hasOwnProperty.call(json, own);\n}\n\n/**\n * Higgsfield's offer of one of its presets in place of the prompt (\"This\n * prompt looks like the Higgsfield preset … generate literally\"), which comes\n * instead of a price or a job: nothing was priced or made. Its id and name,\n * or null. Seen on every video prompt tried on 2026-10-20, never on a picture.\n */\nfunction presetNotice(json) {\n  const answer = answerOf(json);\n  const notice = answer && answer.notice;\n  if (notice && typeof notice === 'object' && notice.type === 'preset_recommendation') {\n    const data = notice.data && typeof notice.data === 'object' ? notice.data : {};\n    const preset = data.preset && typeof data.preset === 'object' ? data.preset : {};\n    const id = (data.retry_literal_with && data.retry_literal_with.declined_preset_id) || preset.id || '';\n    return { id: String(id), name: typeof preset.name === 'string' ? preset.name : '' };\n  }\n  const words = wordsOf(json);\n  const said = words.match(/declined_preset_id:?\\s*\"?([A-Za-z0-9-]{8,})/);\n  if (!said) return null;\n  const name = words.match(/preset \"([^\"]+)\"/);\n  return { id: said[1], name: name ? name[1] : '' };\n}\n\n/** What the team is told when Higgsfield offered a preset again after it was declined. */\nfunction presetSaid(preset) {\n  return 'Higgsfield offered its preset' + (preset.name ? ' \"' + preset.name + '\"' : '') + ' in place of the prompt as written';\n}\n\n/** A refusal that means nothing was made (the request, the model, the credits, the content). */\nfunction isRefusal(message) {\n  return /input validation error|invalid request|invalid arguments|unknown model|not enough credits|insufficient|top up|balance is|out of credits|nsfw|moderation|content policy|not allowed|prohibited|rejected/i.test(message);\n}\n\n/** The first string found under any of these keys, at any depth. */\nfunction findString(value, keys, depth) {\n  if (depth > 5 || value === null || typeof value !== 'object') return '';\n  const list = Array.isArray(value) ? value : [value];\n  for (let i = 0; i < list.length; i++) {\n    const v = list[i];\n    if (!v || typeof v !== 'object') continue;\n    if (!Array.isArray(v)) {\n      for (let k = 0; k < keys.length; k++) {\n        const found = v[keys[k]];\n        if (typeof found === 'string' && found.trim()) return found.trim();\n        if (typeof found === 'number') return String(found);\n      }\n    }\n    const inner = Array.isArray(v) ? v : Object.keys(v).map(function (key) { return v[key]; });\n    for (let j = 0; j < inner.length; j++) {\n      const got = findString(inner[j], keys, depth + 1);\n      if (got) return got;\n    }\n  }\n  return '';\n}\n\n/**\n * Credits in an answer: { cost: { credits, credits_exact } }, { credits } or\n * { cost }. Higgsfield can quote two figures that differ (a picture at\n * \"1 credit (0.5 exact)\"), and which one the plan is charged is not said, so\n * the higher counts: the month's limit is never under-counted.\n */\nfunction creditsOf(answer) {\n  const cost = answer && answer.cost;\n  const read = function (n) {\n    const value = typeof n === 'string' ? parseFloat(n) : n;\n    return typeof value === 'number' && isFinite(value) && value >= 0 ? value : null;\n  };\n  const figures = (cost && typeof cost === 'object' ? [cost.credits, cost.credits_exact] : [cost != null ? cost : answer && answer.credits]).map(read).filter(function (n) {\n    return n !== null;\n  });\n  return figures.length ? Math.max.apply(null, figures) : null;\n}\n\n/** How a job stands, by Higgsfield's own words for it. */\nconst JOB_DONE = /^(completed|complete|succeeded|success|done|finished|ready)$/;\nconst JOB_FAILED = /^(failed|failure|error|errored|canceled|cancelled|nsfw|rejected|expired|ip_detected|blocked|moderated|submission_failed)$/;\n\n/** A job's status, lower case, or ''. */\nfunction jobStatus(answer) {\n  return (findString(answer, ['status', 'state'], 0) || '').toLowerCase();\n}\n\n/** Every https link in an answer, at any depth. */\nfunction allLinks(value, out, depth) {\n  out = out || [];\n  depth = depth || 0;\n  if (depth > 6 || value === null || value === undefined) return out;\n  if (typeof value === 'string') {\n    if (/^https:\\/\\/\\S+$/.test(value)) out.push(value);\n    return out;\n  }\n  if (typeof value === 'object') {\n    const inner = Array.isArray(value) ? value : Object.keys(value).map(function (k) { return value[k]; });\n    inner.forEach(function (v) { allLinks(v, out, depth + 1); });\n  }\n  return out;\n}\n\n/** Why a job failed, as plainly as Higgsfield says it. */\nfunction jobReason(status, answer, json) {\n  if (status === 'ip_detected') return 'Higgsfield held it back: it may show protected material. If the team has the rights, reveal it on Higgsfield.';\n  if (status === 'nsfw' || status === 'moderated' || status === 'blocked') return 'Higgsfield\\'s safety check stopped it: change the prompt and ask again.';\n  const said = findString(answer, ['error', 'message', 'reason', 'detail'], 0) || wordsOf(json);\n  return 'Higgsfield could not make it (' + status + ')' + (said ? ': ' + said.slice(0, 200) : '.');\n}\n\n// Higgsfield's answer to an ask, read once and recorded once:\n//   took it        -> started, with its job (and its price, when it says one)\n//   refused it     -> refused: nothing was made (so is a preset offered again\n//                     in place of the prompt after it was declined: no job)\n//   not reached    -> retry: nothing was sent, so it is sent again next minute\n//   anything else  -> unknown: it may have been made, so it is never sent\n//                     again by itself (Higgsfield: \"do not automatically\n//                     resubmit\"); a person checks its history first.\nreturn $input.all().map(function (item, i) {\n  const sent = $('Write the request (picture)').itemMatching(i).json;\n  const json = item.json;\n  if (notReached(json, 'generate_input')) return { json: { kind: 'retry', id: sent.id, error: 'Could not connect to Higgsfield' } };\n  const error = errorOf(json);\n  if (error) {\n    return {\n      json: isRefusal(error)\n        ? { kind: 'refused', id: sent.id, error: 'Higgsfield refused it: ' + error }\n        : { kind: 'unknown', id: sent.id, error: 'Higgsfield may have started it (' + error + '). Check its history before asking again.' },\n    };\n  }\n  const preset = presetNotice(json);\n  if (preset) return { json: { kind: 'refused', id: sent.id, error: presetSaid(preset) + ': nothing was made. Change the prompt a little and ask again.' } };\n  const answer = answerOf(json);\n  const words = wordsOf(json);\n  const fromWords = words.match(/job[_ -]?id[\\s:=\"']+([A-Za-z0-9_-]{6,})/i);\n  const job = findString(answer, ['job_id', 'jobId'], 0) || findString(answer && answer.jobs, ['job_id', 'jobId', 'id'], 0) || (fromWords ? fromWords[1] : '') || findString(answer, ['id'], 0);\n  if (!job) {\n    return { json: { kind: 'unknown', id: sent.id, error: 'Higgsfield answered without a job (' + (words.slice(0, 200) || 'no words') + '). Check its history before asking again.' } };\n  }\n  return { json: { kind: 'started', id: sent.id, job_id: job, credits: creditsOf(answer) } };\n});\n" },
  },
  output: [{ kind: 'started', id: 'video-id', job_id: 'job-id', credits: null }],
});

const whatHappened = switchCase({
  version: 3.4,
  config: {
    name: "What happened?",
    parameters: {
      mode: 'rules',
      rules: {
        values: [
          { outputKey: 'started', conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 2 }, conditions: [{ leftValue: expr("{{ $json.kind === \"started\" }}"), rightValue: true, operator: { type: 'boolean', operation: 'true', singleValue: true } }], combinator: 'and' } },
          { outputKey: 'refused', conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 2 }, conditions: [{ leftValue: expr("{{ $json.kind === \"refused\" }}"), rightValue: true, operator: { type: 'boolean', operation: 'true', singleValue: true } }], combinator: 'and' } },
          { outputKey: 'retry', conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 2 }, conditions: [{ leftValue: expr("{{ $json.kind === \"retry\" }}"), rightValue: true, operator: { type: 'boolean', operation: 'true', singleValue: true } }], combinator: 'and' } },
          { outputKey: 'unknown', conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 2 }, conditions: [{ leftValue: expr("{{ $json.kind === \"unknown\" }}"), rightValue: true, operator: { type: 'boolean', operation: 'true', singleValue: true } }], combinator: 'and' } },
        ],
      },
      options: {},
    },
  },
});

const recordStarted = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: {
    name: "Record: started",
    onError: 'continueRegularOutput',
    parameters: {
      method: 'POST',
      url: 'https://tcinsdexwvzpznqlcpww.supabase.co/rest/v1/rpc/video_started',
      authentication: 'predefinedCredentialType',
      nodeCredentialType: 'supabaseApi',
      sendBody: true,
      contentType: 'json',
      specifyBody: 'json',
      jsonBody: expr("{{ JSON.stringify(Object.assign({ p_id: $json.id, p_job_id: $json.job_id }, typeof $json.credits === \"number\" ? { p_credits: $json.credits } : {})) }}"),
      options: { timeout: 30000 },
    },
    credentials: { supabaseApi: newCredential('Supabase QGR') },
  },
  output: [{}],
});

const recordFailed = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: {
    name: "Record: not made",
    onError: 'continueRegularOutput',
    parameters: {
      method: 'POST',
      url: 'https://tcinsdexwvzpznqlcpww.supabase.co/rest/v1/rpc/video_fail',
      authentication: 'predefinedCredentialType',
      nodeCredentialType: 'supabaseApi',
      sendBody: true,
      contentType: 'json',
      specifyBody: 'json',
      jsonBody: expr("{{ JSON.stringify({ p_id: $json.id, p_error: $json.error }) }}"),
      options: { timeout: 30000 },
    },
    credentials: { supabaseApi: newCredential('Supabase QGR') },
  },
  output: [{}],
});

const recordRetry = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: {
    name: "Record: try again",
    onError: 'continueRegularOutput',
    parameters: {
      method: 'POST',
      url: 'https://tcinsdexwvzpznqlcpww.supabase.co/rest/v1/rpc/video_release',
      authentication: 'predefinedCredentialType',
      nodeCredentialType: 'supabaseApi',
      sendBody: true,
      contentType: 'json',
      specifyBody: 'json',
      jsonBody: expr("{{ JSON.stringify({ p_id: $json.id, p_error: $json.error }) }}"),
      options: { timeout: 30000 },
    },
    credentials: { supabaseApi: newCredential('Supabase QGR') },
  },
  output: [{}],
});

const recordUnknown = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: {
    name: "Record: may have been made",
    onError: 'continueRegularOutput',
    parameters: {
      method: 'POST',
      url: 'https://tcinsdexwvzpznqlcpww.supabase.co/rest/v1/rpc/video_unknown',
      authentication: 'predefinedCredentialType',
      nodeCredentialType: 'supabaseApi',
      sendBody: true,
      contentType: 'json',
      specifyBody: 'json',
      jsonBody: expr("{{ JSON.stringify({ p_id: $json.id, p_error: $json.error }) }}"),
      options: { timeout: 30000 },
    },
    credentials: { supabaseApi: newCredential('Supabase QGR') },
  },
  output: [{}],
});

// ---- the jobs: checked until their video is stored

const takeMaking = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: {
    name: "Take the videos being made",
    executeOnce: true,
    parameters: {
      method: 'POST',
      url: 'https://tcinsdexwvzpznqlcpww.supabase.co/rest/v1/rpc/video_take_making',
      authentication: 'predefinedCredentialType',
      nodeCredentialType: 'supabaseApi',
      sendBody: true,
      contentType: 'json',
      specifyBody: 'json',
      jsonBody: expr("{{ JSON.stringify({ p_limit: 10 }) }}"),
      options: { timeout: 30000 },
    },
    credentials: { supabaseApi: newCredential('Supabase QGR') },
  },
  output: [{ id: 'video-id', job_id: 'job-id', path: 'videos/video-id.mp4' }],
});

const eachJob = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: "One item per job",
    parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: "// The rows a database function returned, one item each. n8n turns a JSON\n// array answer into items by itself; this also takes one item holding the\n// whole array, so the next node sees the same either way. Nothing due means\n// no items, and the rest of the workflow does not run.\nconst out = [];\n$input.all().forEach(function (item) {\n  const json = item.json;\n  let rows = [];\n  if (Array.isArray(json)) rows = json;\n  else if (json && Array.isArray(json.data)) rows = json.data;\n  else if (json && typeof json === 'object' && Object.keys(json).length > 0) rows = [json];\n  rows.forEach(function (row) {\n    if (row && typeof row === 'object') out.push({ json: row });\n  });\n});\nreturn out;\n" },
  },
  output: [{ id: 'video-id', job_id: 'job-id', path: 'videos/video-id.mp4' }],
});

const jobStatus = node({
  type: '@n8n/n8n-nodes-langchain.mcpClient',
  version: 1.1,
  config: {
    name: "Higgsfield: how is it going?",
    onError: 'continueRegularOutput',
    parameters: {
      serverTransport: 'httpStreamable',
      endpointUrl: 'https://mcp.higgsfield.ai/mcp',
      authentication: 'mcpOAuth2Api',
      tool: { __rl: true, mode: 'id', value: 'job_status' },
      inputMode: 'json',
      jsonInput: expr("{{ JSON.stringify({ jobId: $json.job_id }) }}"),
      options: { convertToBinary: false, timeout: 120000 },
    },
    credentials: { mcpOAuth2Api: newCredential('Higgsfield') },
  },
  output: [{ structuredContent: { status: 'completed', results: [{ url: 'https://cdn.higgsfield.ai/job-id/video.mp4' }] } }],
});

const readJob = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: "Read the job",
    parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: "// Shared by the scripts that read Higgsfield's answers, for AI video and for\n// pictures (joined in front of each). Higgsfield is asked through its MCP,\n// signed in with the team's own account, so every video and every picture\n// spends the plan's credits.\n//\n// An MCP step answers in one of three ways, and each script must tell them\n// apart:\n//   - Higgsfield answered: { structuredContent, content: [{ type: 'text', text }] }\n//   - Higgsfield refused the call: { error: { message } } (bad input, a model\n//     it does not know, not enough credits). Nothing was made.\n//   - n8n could not reach Higgsfield at all: the step hands on the item it was\n//     given, unchanged. Nothing was sent.\n\n/** What Higgsfield's answer carries: its structured content, else its text read as JSON, else {}. */\nfunction answerOf(json) {\n  if (!json || typeof json !== 'object') return {};\n  if (json.structuredContent && typeof json.structuredContent === 'object') return json.structuredContent;\n  const parts = Array.isArray(json.content) ? json.content : [];\n  for (let i = 0; i < parts.length; i++) {\n    const text = parts[i] && parts[i].text;\n    if (text && typeof text === 'object') return text;\n    if (typeof text === 'string' && /^\\s*[{[]/.test(text)) {\n      try {\n        return JSON.parse(text);\n      } catch (e) {\n        // Not JSON: read as words below.\n      }\n    }\n  }\n  return {};\n}\n\n/** Higgsfield's words, for a reason shown to the team. */\nfunction wordsOf(json) {\n  const parts = json && Array.isArray(json.content) ? json.content : [];\n  return parts\n    .map(function (p) { return p && typeof p.text === 'string' ? p.text : ''; })\n    .join(' ')\n    .replace(/\\s+/g, ' ')\n    .trim();\n}\n\n/** The error Higgsfield or the MCP step gave, as text, or ''. */\nfunction errorOf(json) {\n  if (!json || typeof json !== 'object' || !json.error) return '';\n  const e = json.error;\n  const message = typeof e === 'string' ? e : e.message || e.description || JSON.stringify(e);\n  return String(message).replace(/\\s+/g, ' ').trim().slice(0, 400);\n}\n\n/** n8n could not reach Higgsfield: the step handed on what it was given. */\nfunction notReached(json, own) {\n  if (!json || typeof json !== 'object') return true;\n  if (json.structuredContent || json.content || json.error) return false;\n  return Object.prototype.hasOwnProperty.call(json, own);\n}\n\n/**\n * Higgsfield's offer of one of its presets in place of the prompt (\"This\n * prompt looks like the Higgsfield preset … generate literally\"), which comes\n * instead of a price or a job: nothing was priced or made. Its id and name,\n * or null. Seen on every video prompt tried on 2026-10-20, never on a picture.\n */\nfunction presetNotice(json) {\n  const answer = answerOf(json);\n  const notice = answer && answer.notice;\n  if (notice && typeof notice === 'object' && notice.type === 'preset_recommendation') {\n    const data = notice.data && typeof notice.data === 'object' ? notice.data : {};\n    const preset = data.preset && typeof data.preset === 'object' ? data.preset : {};\n    const id = (data.retry_literal_with && data.retry_literal_with.declined_preset_id) || preset.id || '';\n    return { id: String(id), name: typeof preset.name === 'string' ? preset.name : '' };\n  }\n  const words = wordsOf(json);\n  const said = words.match(/declined_preset_id:?\\s*\"?([A-Za-z0-9-]{8,})/);\n  if (!said) return null;\n  const name = words.match(/preset \"([^\"]+)\"/);\n  return { id: said[1], name: name ? name[1] : '' };\n}\n\n/** What the team is told when Higgsfield offered a preset again after it was declined. */\nfunction presetSaid(preset) {\n  return 'Higgsfield offered its preset' + (preset.name ? ' \"' + preset.name + '\"' : '') + ' in place of the prompt as written';\n}\n\n/** A refusal that means nothing was made (the request, the model, the credits, the content). */\nfunction isRefusal(message) {\n  return /input validation error|invalid request|invalid arguments|unknown model|not enough credits|insufficient|top up|balance is|out of credits|nsfw|moderation|content policy|not allowed|prohibited|rejected/i.test(message);\n}\n\n/** The first string found under any of these keys, at any depth. */\nfunction findString(value, keys, depth) {\n  if (depth > 5 || value === null || typeof value !== 'object') return '';\n  const list = Array.isArray(value) ? value : [value];\n  for (let i = 0; i < list.length; i++) {\n    const v = list[i];\n    if (!v || typeof v !== 'object') continue;\n    if (!Array.isArray(v)) {\n      for (let k = 0; k < keys.length; k++) {\n        const found = v[keys[k]];\n        if (typeof found === 'string' && found.trim()) return found.trim();\n        if (typeof found === 'number') return String(found);\n      }\n    }\n    const inner = Array.isArray(v) ? v : Object.keys(v).map(function (key) { return v[key]; });\n    for (let j = 0; j < inner.length; j++) {\n      const got = findString(inner[j], keys, depth + 1);\n      if (got) return got;\n    }\n  }\n  return '';\n}\n\n/**\n * Credits in an answer: { cost: { credits, credits_exact } }, { credits } or\n * { cost }. Higgsfield can quote two figures that differ (a picture at\n * \"1 credit (0.5 exact)\"), and which one the plan is charged is not said, so\n * the higher counts: the month's limit is never under-counted.\n */\nfunction creditsOf(answer) {\n  const cost = answer && answer.cost;\n  const read = function (n) {\n    const value = typeof n === 'string' ? parseFloat(n) : n;\n    return typeof value === 'number' && isFinite(value) && value >= 0 ? value : null;\n  };\n  const figures = (cost && typeof cost === 'object' ? [cost.credits, cost.credits_exact] : [cost != null ? cost : answer && answer.credits]).map(read).filter(function (n) {\n    return n !== null;\n  });\n  return figures.length ? Math.max.apply(null, figures) : null;\n}\n\n/** How a job stands, by Higgsfield's own words for it. */\nconst JOB_DONE = /^(completed|complete|succeeded|success|done|finished|ready)$/;\nconst JOB_FAILED = /^(failed|failure|error|errored|canceled|cancelled|nsfw|rejected|expired|ip_detected|blocked|moderated|submission_failed)$/;\n\n/** A job's status, lower case, or ''. */\nfunction jobStatus(answer) {\n  return (findString(answer, ['status', 'state'], 0) || '').toLowerCase();\n}\n\n/** Every https link in an answer, at any depth. */\nfunction allLinks(value, out, depth) {\n  out = out || [];\n  depth = depth || 0;\n  if (depth > 6 || value === null || value === undefined) return out;\n  if (typeof value === 'string') {\n    if (/^https:\\/\\/\\S+$/.test(value)) out.push(value);\n    return out;\n  }\n  if (typeof value === 'object') {\n    const inner = Array.isArray(value) ? value : Object.keys(value).map(function (k) { return value[k]; });\n    inner.forEach(function (v) { allLinks(v, out, depth + 1); });\n  }\n  return out;\n}\n\n/** Why a job failed, as plainly as Higgsfield says it. */\nfunction jobReason(status, answer, json) {\n  if (status === 'ip_detected') return 'Higgsfield held it back: it may show protected material. If the team has the rights, reveal it on Higgsfield.';\n  if (status === 'nsfw' || status === 'moderated' || status === 'blocked') return 'Higgsfield\\'s safety check stopped it: change the prompt and ask again.';\n  const said = findString(answer, ['error', 'message', 'reason', 'detail'], 0) || wordsOf(json);\n  return 'Higgsfield could not make it (' + status + ')' + (said ? ': ' + said.slice(0, 200) : '.');\n}\n\n// How a job is going, read from Higgsfield's job_status:\n//   done     -> its video's link, to copy into Storage\n//   failed   -> why, as plainly as Higgsfield says it\n//   waiting  -> nothing yet: asked again in a minute or so\n// A job Higgsfield no longer knows is left to a person (unknown).\n\n/** The video's own link: an .mp4 first, else one that says video, else the first. */\nfunction videoLink(answer) {\n  const all = allLinks(answer);\n  return all.filter(function (u) { return /\\.mp4(\\?|$)/i.test(u); })[0] || all.filter(function (u) { return /video/i.test(u); })[0] || all[0] || '';\n}\n\nreturn $input.all().map(function (item, i) {\n  const job = $('One item per job').itemMatching(i).json;\n  const json = item.json;\n  if (notReached(json, 'job_id')) return { json: { kind: 'waiting', id: job.id } };\n  const error = errorOf(json);\n  if (error) {\n    return { json: /not found|unknown job|no such job|does not exist/i.test(error) ? { kind: 'unknown', id: job.id, error: 'Higgsfield no longer knows this job: ' + error } : { kind: 'waiting', id: job.id } };\n  }\n  const answer = answerOf(json);\n  const status = jobStatus(answer);\n  if (JOB_DONE.test(status)) {\n    const url = videoLink(answer);\n    if (!url) return { json: { kind: 'unknown', id: job.id, error: 'Higgsfield says it is made but gave no link to it: find it in Higgsfield\\'s history.' } };\n    return { json: { kind: 'done', id: job.id, path: job.path, url: url } };\n  }\n  if (JOB_FAILED.test(status)) return { json: { kind: 'failed', id: job.id, error: jobReason(status, answer, json) } };\n  return { json: { kind: 'waiting', id: job.id } };\n});\n" },
  },
  output: [{ kind: 'done', id: 'video-id', path: 'videos/video-id.mp4', url: 'https://cdn.higgsfield.ai/job-id/video.mp4' }],
});

const howIsItGoing = switchCase({
  version: 3.4,
  config: {
    name: "How is it going?",
    parameters: {
      mode: 'rules',
      rules: {
        values: [
          { outputKey: 'done', conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 2 }, conditions: [{ leftValue: expr("{{ $json.kind === \"done\" }}"), rightValue: true, operator: { type: 'boolean', operation: 'true', singleValue: true } }], combinator: 'and' } },
          { outputKey: 'failed', conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 2 }, conditions: [{ leftValue: expr("{{ $json.kind === \"failed\" }}"), rightValue: true, operator: { type: 'boolean', operation: 'true', singleValue: true } }], combinator: 'and' } },
          { outputKey: 'unknown', conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 2 }, conditions: [{ leftValue: expr("{{ $json.kind === \"unknown\" }}"), rightValue: true, operator: { type: 'boolean', operation: 'true', singleValue: true } }], combinator: 'and' } },
        ],
      },
      options: {},
    },
  },
});

const download = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: {
    name: "Fetch the video",
    onError: 'continueRegularOutput',
    parameters: {
      method: 'GET',
      url: expr('{{ $json.url }}'),
      options: { timeout: 180000, response: { response: { responseFormat: 'file', outputPropertyName: 'data' } } },
    },
  },
  output: [{}],
});

const upload = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: {
    name: "Upload to Storage",
    onError: 'continueRegularOutput',
    parameters: {
      method: 'POST',
      url: expr('https://tcinsdexwvzpznqlcpww.supabase.co/storage/v1/object/ai-videos/{{ $("Read the job").item.json.path }}'),
      authentication: 'predefinedCredentialType',
      nodeCredentialType: 'supabaseApi',
      sendHeaders: true,
      headerParameters: { parameters: [{ name: 'Content-Type', value: 'video/mp4' }, { name: 'x-upsert', value: 'true' }] },
      sendBody: true,
      contentType: 'binaryData',
      inputDataFieldName: 'data',
      options: { timeout: 180000, response: { response: { fullResponse: true, neverError: true } } },
    },
    credentials: { supabaseApi: newCredential('Supabase QGR') },
  },
  output: [{ statusCode: 200, body: { Key: 'ai-videos/videos/video-id.mp4' } }],
});

const uploaded = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: "Stored?",
    parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: "// Storage's answer to the upload of what Higgsfield made (a video, or a\n// picture): in the bucket at its path, to be recorded; or not yet, and the\n// job is asked about again at the next check, when its file is fetched and\n// stored again (Higgsfield keeps it meanwhile).\nreturn $input.all().map(function (item, i) {\n  const done = $('Read the job').itemMatching(i).json;\n  const res = item.json || {};\n  if (res.statusCode >= 200 && res.statusCode < 300) return { json: { kind: 'stored', id: done.id, path: done.path } };\n  return { json: { kind: 'not_stored', id: done.id, error: 'Made, but not stored yet (' + (res.statusCode || 'no answer') + ')' } };\n});\n" },
  },
  output: [{ kind: 'stored', id: 'video-id', path: 'videos/video-id.mp4' }],
});

const stored = ifElse({
  version: 2.3,
  config: {
    name: "In Storage?",
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 2 },
        conditions: [{ leftValue: expr("{{ $json.kind === \"stored\" }}"), rightValue: true, operator: { type: 'boolean', operation: 'true', singleValue: true } }],
        combinator: 'and',
      },
    },
  },
});

const recordReady = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: {
    name: "Record: ready",
    onError: 'continueRegularOutput',
    parameters: {
      method: 'POST',
      url: 'https://tcinsdexwvzpznqlcpww.supabase.co/rest/v1/rpc/video_finish',
      authentication: 'predefinedCredentialType',
      nodeCredentialType: 'supabaseApi',
      sendBody: true,
      contentType: 'json',
      specifyBody: 'json',
      jsonBody: expr("{{ JSON.stringify({ p_id: $json.id, p_path: $json.path }) }}"),
      options: { timeout: 30000 },
    },
    credentials: { supabaseApi: newCredential('Supabase QGR') },
  },
  output: [{}],
});

const noteFlow = sticky('## AI video\nThe team asks on the AI video page. **Price** answers the page with Higgsfield\'s price for the request (generate_video with **get_cost**, which makes nothing) and the credits left on the plan. Every minute, and at once when someone asks, the asks waiting (**video_take_due**, each sent once) go to Higgsfield, and the jobs being made (**video_take_making**) are checked until their video can be fetched, stored in ai-videos and recorded.', [everyMinute, makeNow, priceIt, takeDue, eachAsk, takeMaking, eachJob], { color: 4 });
const noteHiggsfield = sticky('## Higgsfield\nCalled through its MCP (**mcp.higgsfield.ai**) with the **Higgsfield** credential (MCP OAuth2 API), signed in with the team\'s own Higgsfield account: every video spends the plan\'s credits, even on an Unlimited plan, and the team\'s monthly limit in Settings holds them. A first picture is signed for 15 minutes and imported first (**media_import_url**).\n\nAn ask is sent once. Not reached at all, it waits for the next minute (three tries). Refused, nothing was made. Any other trouble after sending is **unknown**: never sent again by itself (Higgsfield: do not automatically resubmit), a person checks Higgsfield\'s history.\n\nHiggsfield may offer one of its presets in place of the prompt: nothing is priced or made, so it is declined and the request asked once more as written (**declined_preset_id**). Offered again, nothing was made and the page says so.', [forReal, firstPicture, signPicture, pictureLink, linkMade, importPicture, readMedia, pictureTaken, writeRequest, makeIt, makeDecline, makeAsWritten, makeAgain, readStart, writeRequestPicture, makeItPicture, makePictureDecline, makePictureAsWritten, makePictureAgain, readStartPicture, whatHappened], { color: 5 });
const noteStandIn = sticky('## Stand-in\nThe way taken while AI video is not switched on (Settings, AI video). Nothing is sent and nothing is spent: the page says no video was made and where to switch it on.', [standIn, recordStandIn], { color: 3 });

export default workflow('qgr-ai-video', 'QGR · AI video')
  .add(priceIt)
  .to(priceRequest)
  .to(higgsPrice)
  .to(priceDecline)
  .to(priceAsWritten.onTrue(priceAgain.to(readPrice)).onFalse(readPrice))
  .add(readPrice)
  .to(higgsBalance)
  .to(answer)
  .to(respond)
  .add(everyMinute)
  .to(takeDue)
  .add(makeNow)
  .to(takeDue)
  .add(takeDue)
  .to(eachAsk)
  .to(forReal.onTrue(firstPicture.onTrue(signPicture.to(pictureLink).to(linkMade.onTrue(importPicture.to(readMedia).to(pictureTaken.onTrue(writeRequestPicture.to(makeItPicture).to(makePictureDecline).to(makePictureAsWritten.onTrue(makePictureAgain.to(readStartPicture)).onFalse(readStartPicture))).onFalse(whatHappened))).onFalse(whatHappened))).onFalse(writeRequest.to(makeIt).to(makeDecline).to(makeAsWritten.onTrue(makeAgain.to(readStart)).onFalse(readStart)))).onFalse(standIn.to(recordStandIn)))
  .add(readStartPicture)
  .to(whatHappened)
  .add(readStart)
  .to(whatHappened.onCase(0, recordStarted).onCase(1, recordFailed).onCase(2, recordRetry).onCase(3, recordUnknown))
  .add(everyMinute)
  .to(takeMaking)
  .add(makeNow)
  .to(takeMaking)
  .add(takeMaking)
  .to(eachJob)
  .to(jobStatus)
  .to(readJob)
  .to(howIsItGoing.onCase(0, download.to(upload).to(uploaded).to(stored.onTrue(recordReady))).onCase(1, recordFailed).onCase(2, recordUnknown))
  .add(noteFlow)
  .add(noteHiggsfield)
  .add(noteStandIn);
