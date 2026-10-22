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
      path: 'qgr-picture',
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
      path: 'qgr-picture-price',
      authentication: 'headerAuth',
      responseMode: 'responseNode',
      options: {},
    },
    credentials: { httpHeaderAuth: newCredential('QGR webhook secret') },
  },
  output: [{ body: { quality: 'low' } }],
});

// ---- Higgsfield's price for one picture, asked by Settings and the studio

const priceRequest = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: "Price request",
    parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: "// Shared by the scripts that ask an image model for a picture (joined in\n// front of each): what it is asked to draw, for each ask. The scene (a\n// person's prompt in the studio, or the Content Agent's), then how it should\n// look (a real photograph of real-looking people, as the team asked on\n// 2026-10-22), the brand's picture style from brand memory, a line on the\n// run's reference pictures when Higgsfield is given some, then the rules\n// every picture keeps: no words (the ad's words go over the picture), people\n// who are made up rather than anyone real or famous, and the flag and props\n// the team allowed (2026-10-22) with no writing on them. Cloudflare's\n// FLUX takes 2,048 characters at most; Higgsfield's GPT Image far more, so\n// its scripts pass HIGGSFIELD_PROMPT_MAX. The scene is shortened first, at a\n// word, then a long picture style; the rules never are.\nconst PROMPT_MAX = 2048;\nconst HIGGSFIELD_PROMPT_MAX = 6000;\nconst PHOTO_LOOK = 'A real photograph, as a documentary or lifestyle photographer would take it: natural light, real skin, hands and textures, candid and unposed, honest emotion. Not an illustration, a 3D render or a stock-photo pose.';\nconst PICTURE_RULES = 'No readable text, letters, numbers, logos or watermarks anywhere, on signs, books or documents either. Everyone shown is a made-up person: never a real, famous or recognisable one. A U.S. flag or quiet props such as passports, a folder or a gavel may appear, with no writing on them; never a green card or visa held up as approved, never money.';\nconst SCENE_MIN = 300;\n\nconst REFERENCES_RULE = 'Use the reference pictures given for what they show: the real place, product or look to keep to.';\n\nfunction atWord(text, room) {\n  if (text.length <= room) return text;\n  let cut = text.slice(0, Math.max(0, room));\n  const space = cut.lastIndexOf(' ');\n  if (space > room * 0.6) cut = cut.slice(0, space);\n  return cut;\n}\n\nfunction picturePrompt(ask, max) {\n  const limit = max || PROMPT_MAX;\n  const references = Array.isArray(ask.references) && ask.references.length > 0 ? ' ' + REFERENCES_RULE : '';\n  const fixed = ' ' + PHOTO_LOOK + references + ' ' + PICTURE_RULES;\n  let look = String(ask.look || '').trim().replace(/\\s+/g, ' ');\n  const lookRoom = limit - fixed.length - SCENE_MIN - ' Picture style: .'.length;\n  if (look.length > lookRoom) look = atWord(look, lookRoom);\n  const styled = look ? ' Picture style: ' + look + (/[.!?]$/.test(look) ? '' : '.') : '';\n  const tail = ' ' + PHOTO_LOOK + styled + references + ' ' + PICTURE_RULES;\n  let scene = atWord(String(ask.prompt || '').trim().replace(/\\s+/g, ' '), limit - tail.length - 1);\n  if (!/[.!?]$/.test(scene)) scene += '.';\n  return scene + tail;\n}\n\n// Higgsfield's GPT Image 2.5, as the team's quality asks: square at 1k (one\n// picture serves Meta's square and LinkedIn's wide frame, cropped about its\n// middle, as Cloudflare's does), low quality unless the team chose more.\nconst HIGGSFIELD_PICTURE_MODEL = 'gpt_image_2_5';\nconst HIGGSFIELD_QUALITIES = ['low', 'medium', 'high'];\n\n// The run's reference pictures, as Higgsfield keeps them (their media ids),\n// go with the picture as image_references; they do not change its price.\nfunction higgsfieldPictureParams(prompt, quality, references) {\n  const params = {\n    model: HIGGSFIELD_PICTURE_MODEL,\n    prompt: prompt,\n    aspect_ratio: '1:1',\n    resolution: '1k',\n    quality: HIGGSFIELD_QUALITIES.indexOf(quality) >= 0 ? quality : 'low',\n  };\n  const ids = (Array.isArray(references) ? references : []).filter(function (id) { return typeof id === 'string' && id; });\n  if (ids.length > 0) params.medias = ids.map(function (id) { return { role: 'image_references', value: id }; });\n  return params;\n}\n\n// Higgsfield's price for one picture at a quality, asked by Settings and the\n// studio before any picture is made: get_cost beside the params and inside\n// them, which makes nothing. The words do not change the price; a short scene\n// stands in.\nconst STAND_IN_SCENE = 'A calm city skyline at dusk, wide empty sky at the top.';\nconst body = ($input.first().json && $input.first().json.body) || {};\nconst params = higgsfieldPictureParams(picturePrompt({ prompt: STAND_IN_SCENE, look: null }), body.quality);\nparams.get_cost = true;\nreturn [{ json: { quote_input: JSON.stringify({ params: params, get_cost: true }) } }];\n" },
  },
  output: [{ quote_input: '{"params":{"model":"gpt_image_2_5","get_cost":true},"get_cost":true}' }],
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
      tool: { __rl: true, mode: 'id', value: 'generate_image' },
      inputMode: 'json',
      jsonInput: expr("{{ $json.quote_input }}"),
      options: { convertToBinary: false, timeout: 120000 },
    },
    credentials: { mcpOAuth2Api: newCredential('Higgsfield') },
  },
  output: [{ structuredContent: { cost: { credits: 0.25, credits_exact: 0.25 } }, content: [{ type: 'text', text: 'Cost preflight for gpt_image_2_5: 0.25 credits (0.25 exact). No job submitted.' }] }],
});

const readPrice = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: "Read the price",
    parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: "// Shared by the scripts that read Higgsfield's answers, for AI video and for\n// pictures (joined in front of each). Higgsfield is asked through its MCP,\n// signed in with the team's own account, so every video and every picture\n// spends the plan's credits.\n//\n// An MCP step answers in one of three ways, and each script must tell them\n// apart:\n//   - Higgsfield answered: { structuredContent, content: [{ type: 'text', text }] }\n//   - Higgsfield refused the call: { error: { message } } (bad input, a model\n//     it does not know, not enough credits). Nothing was made.\n//   - n8n could not reach Higgsfield at all: the step hands on the item it was\n//     given, unchanged. Nothing was sent.\n\n/** What Higgsfield's answer carries: its structured content, else its text read as JSON, else {}. */\nfunction answerOf(json) {\n  if (!json || typeof json !== 'object') return {};\n  if (json.structuredContent && typeof json.structuredContent === 'object') return json.structuredContent;\n  const parts = Array.isArray(json.content) ? json.content : [];\n  for (let i = 0; i < parts.length; i++) {\n    const text = parts[i] && parts[i].text;\n    if (text && typeof text === 'object') return text;\n    if (typeof text === 'string' && /^\\s*[{[]/.test(text)) {\n      try {\n        return JSON.parse(text);\n      } catch (e) {\n        // Not JSON: read as words below.\n      }\n    }\n  }\n  return {};\n}\n\n/** Higgsfield's words, for a reason shown to the team. */\nfunction wordsOf(json) {\n  const parts = json && Array.isArray(json.content) ? json.content : [];\n  return parts\n    .map(function (p) { return p && typeof p.text === 'string' ? p.text : ''; })\n    .join(' ')\n    .replace(/\\s+/g, ' ')\n    .trim();\n}\n\n/** The error Higgsfield or the MCP step gave, as text, or ''. */\nfunction errorOf(json) {\n  if (!json || typeof json !== 'object' || !json.error) return '';\n  const e = json.error;\n  const message = typeof e === 'string' ? e : e.message || e.description || JSON.stringify(e);\n  return String(message).replace(/\\s+/g, ' ').trim().slice(0, 400);\n}\n\n/** n8n could not reach Higgsfield: the step handed on what it was given. */\nfunction notReached(json, own) {\n  if (!json || typeof json !== 'object') return true;\n  if (json.structuredContent || json.content || json.error) return false;\n  return Object.prototype.hasOwnProperty.call(json, own);\n}\n\n/**\n * Higgsfield's offer of one of its presets in place of the prompt (\"This\n * prompt looks like the Higgsfield preset … generate literally\"), which comes\n * instead of a price or a job: nothing was priced or made. Its id and name,\n * or null. Seen on every video prompt tried on 2026-10-20, never on a picture.\n */\nfunction presetNotice(json) {\n  const answer = answerOf(json);\n  const notice = answer && answer.notice;\n  if (notice && typeof notice === 'object' && notice.type === 'preset_recommendation') {\n    const data = notice.data && typeof notice.data === 'object' ? notice.data : {};\n    const preset = data.preset && typeof data.preset === 'object' ? data.preset : {};\n    const id = (data.retry_literal_with && data.retry_literal_with.declined_preset_id) || preset.id || '';\n    return { id: String(id), name: typeof preset.name === 'string' ? preset.name : '' };\n  }\n  const words = wordsOf(json);\n  const said = words.match(/declined_preset_id:?\\s*\"?([A-Za-z0-9-]{8,})/);\n  if (!said) return null;\n  const name = words.match(/preset \"([^\"]+)\"/);\n  return { id: said[1], name: name ? name[1] : '' };\n}\n\n/** What the team is told when Higgsfield offered a preset again after it was declined. */\nfunction presetSaid(preset) {\n  return 'Higgsfield offered its preset' + (preset.name ? ' \"' + preset.name + '\"' : '') + ' in place of the prompt as written';\n}\n\n/** A refusal that means nothing was made (the request, the model, the credits, the content). */\nfunction isRefusal(message) {\n  return /input validation error|invalid request|invalid arguments|unknown model|not enough credits|insufficient|top up|balance is|out of credits|nsfw|moderation|content policy|not allowed|prohibited|rejected/i.test(message);\n}\n\n/** The first string found under any of these keys, at any depth. */\nfunction findString(value, keys, depth) {\n  if (depth > 5 || value === null || typeof value !== 'object') return '';\n  const list = Array.isArray(value) ? value : [value];\n  for (let i = 0; i < list.length; i++) {\n    const v = list[i];\n    if (!v || typeof v !== 'object') continue;\n    if (!Array.isArray(v)) {\n      for (let k = 0; k < keys.length; k++) {\n        const found = v[keys[k]];\n        if (typeof found === 'string' && found.trim()) return found.trim();\n        if (typeof found === 'number') return String(found);\n      }\n    }\n    const inner = Array.isArray(v) ? v : Object.keys(v).map(function (key) { return v[key]; });\n    for (let j = 0; j < inner.length; j++) {\n      const got = findString(inner[j], keys, depth + 1);\n      if (got) return got;\n    }\n  }\n  return '';\n}\n\n/**\n * Credits in an answer: { cost: { credits, credits_exact } }, { credits } or\n * { cost }. Higgsfield can quote two figures that differ (a picture at\n * \"1 credit (0.5 exact)\"), and which one the plan is charged is not said, so\n * the higher counts: the month's limit is never under-counted.\n */\nfunction creditsOf(answer) {\n  const cost = answer && answer.cost;\n  const read = function (n) {\n    const value = typeof n === 'string' ? parseFloat(n) : n;\n    return typeof value === 'number' && isFinite(value) && value >= 0 ? value : null;\n  };\n  const figures = (cost && typeof cost === 'object' ? [cost.credits, cost.credits_exact] : [cost != null ? cost : answer && answer.credits]).map(read).filter(function (n) {\n    return n !== null;\n  });\n  return figures.length ? Math.max.apply(null, figures) : null;\n}\n\n/** How a job stands, by Higgsfield's own words for it. */\nconst JOB_DONE = /^(completed|complete|succeeded|success|done|finished|ready)$/;\nconst JOB_FAILED = /^(failed|failure|error|errored|canceled|cancelled|nsfw|rejected|expired|ip_detected|blocked|moderated|submission_failed)$/;\n\n/** A job's status, lower case, or ''. */\nfunction jobStatus(answer) {\n  return (findString(answer, ['status', 'state'], 0) || '').toLowerCase();\n}\n\n/**\n * The links to what a job made, its rawUrl first. Never one from params,\n * where Higgsfield echoes the request with the pictures it was given (a\n * reference's link would pass for the result: it did on 2026-10-21), nor the\n * small minUrl preview.\n */\nfunction madeLinks(answer) {\n  const raw = [];\n  const rest = [];\n  (function walk(value, key, depth) {\n    if (depth > 6 || value === null || value === undefined || key === 'params' || key === 'minUrl') return;\n    if (typeof value === 'string') {\n      if (/^https:\\/\\/\\S+$/.test(value)) (key === 'rawUrl' ? raw : rest).push(value);\n      return;\n    }\n    if (Array.isArray(value)) value.forEach(function (v) { walk(v, key, depth + 1); });\n    else if (typeof value === 'object') Object.keys(value).forEach(function (k) { walk(value[k], k, depth + 1); });\n  })(answer, '', 0);\n  return raw.concat(rest);\n}\n\n/** Why a job failed, as plainly as Higgsfield says it. */\nfunction jobReason(status, answer, json) {\n  if (status === 'ip_detected') return 'Higgsfield held it back: it may show protected material. If the team has the rights, reveal it on Higgsfield.';\n  if (status === 'nsfw' || status === 'moderated' || status === 'blocked') return 'Higgsfield\\'s safety check stopped it: change the prompt and ask again.';\n  const said = findString(answer, ['error', 'message', 'reason', 'detail'], 0) || wordsOf(json);\n  return 'Higgsfield could not make it (' + status + ')' + (said ? ': ' + said.slice(0, 200) : '.');\n}\n\n// Higgsfield's price, read: credits, or why there is none. A price that came\n// back with a job means Higgsfield made a video when it was only asked its\n// price: said plainly, so a person checks. A preset offered in place of the\n// prompt was declined once already (\"Decline a preset\"): offered again, there\n// is no price.\nreturn $input.all().map(function (item) {\n  const json = item.json;\n  if (notReached(json, 'quote_input')) return { json: { ok: false, error: 'Higgsfield could not be reached just now: try again in a minute.' } };\n  const error = errorOf(json);\n  if (error) return { json: { ok: false, error: 'Higgsfield would not price it: ' + error } };\n  const preset = presetNotice(json);\n  if (preset) return { json: { ok: false, error: presetSaid(preset) + ': change the prompt a little and ask again.' } };\n  const answer = answerOf(json);\n  if (findString(answer, ['job_id', 'jobId'], 0)) return { json: { ok: false, error: 'Higgsfield started a video when asked only its price: check its history.' } };\n  const credits = creditsOf(answer);\n  if (credits === null) {\n    const words = wordsOf(json);\n    return { json: { ok: false, error: 'Higgsfield gave no price' + (words ? ': ' + words.slice(0, 200) : '.') } };\n  }\n  return { json: { ok: true, credits: credits } };\n});\n" },
  },
  output: [{ ok: true, credits: 0.25 }],
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
    parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: "// Shared by the scripts that read Higgsfield's answers, for AI video and for\n// pictures (joined in front of each). Higgsfield is asked through its MCP,\n// signed in with the team's own account, so every video and every picture\n// spends the plan's credits.\n//\n// An MCP step answers in one of three ways, and each script must tell them\n// apart:\n//   - Higgsfield answered: { structuredContent, content: [{ type: 'text', text }] }\n//   - Higgsfield refused the call: { error: { message } } (bad input, a model\n//     it does not know, not enough credits). Nothing was made.\n//   - n8n could not reach Higgsfield at all: the step hands on the item it was\n//     given, unchanged. Nothing was sent.\n\n/** What Higgsfield's answer carries: its structured content, else its text read as JSON, else {}. */\nfunction answerOf(json) {\n  if (!json || typeof json !== 'object') return {};\n  if (json.structuredContent && typeof json.structuredContent === 'object') return json.structuredContent;\n  const parts = Array.isArray(json.content) ? json.content : [];\n  for (let i = 0; i < parts.length; i++) {\n    const text = parts[i] && parts[i].text;\n    if (text && typeof text === 'object') return text;\n    if (typeof text === 'string' && /^\\s*[{[]/.test(text)) {\n      try {\n        return JSON.parse(text);\n      } catch (e) {\n        // Not JSON: read as words below.\n      }\n    }\n  }\n  return {};\n}\n\n/** Higgsfield's words, for a reason shown to the team. */\nfunction wordsOf(json) {\n  const parts = json && Array.isArray(json.content) ? json.content : [];\n  return parts\n    .map(function (p) { return p && typeof p.text === 'string' ? p.text : ''; })\n    .join(' ')\n    .replace(/\\s+/g, ' ')\n    .trim();\n}\n\n/** The error Higgsfield or the MCP step gave, as text, or ''. */\nfunction errorOf(json) {\n  if (!json || typeof json !== 'object' || !json.error) return '';\n  const e = json.error;\n  const message = typeof e === 'string' ? e : e.message || e.description || JSON.stringify(e);\n  return String(message).replace(/\\s+/g, ' ').trim().slice(0, 400);\n}\n\n/** n8n could not reach Higgsfield: the step handed on what it was given. */\nfunction notReached(json, own) {\n  if (!json || typeof json !== 'object') return true;\n  if (json.structuredContent || json.content || json.error) return false;\n  return Object.prototype.hasOwnProperty.call(json, own);\n}\n\n/**\n * Higgsfield's offer of one of its presets in place of the prompt (\"This\n * prompt looks like the Higgsfield preset … generate literally\"), which comes\n * instead of a price or a job: nothing was priced or made. Its id and name,\n * or null. Seen on every video prompt tried on 2026-10-20, never on a picture.\n */\nfunction presetNotice(json) {\n  const answer = answerOf(json);\n  const notice = answer && answer.notice;\n  if (notice && typeof notice === 'object' && notice.type === 'preset_recommendation') {\n    const data = notice.data && typeof notice.data === 'object' ? notice.data : {};\n    const preset = data.preset && typeof data.preset === 'object' ? data.preset : {};\n    const id = (data.retry_literal_with && data.retry_literal_with.declined_preset_id) || preset.id || '';\n    return { id: String(id), name: typeof preset.name === 'string' ? preset.name : '' };\n  }\n  const words = wordsOf(json);\n  const said = words.match(/declined_preset_id:?\\s*\"?([A-Za-z0-9-]{8,})/);\n  if (!said) return null;\n  const name = words.match(/preset \"([^\"]+)\"/);\n  return { id: said[1], name: name ? name[1] : '' };\n}\n\n/** What the team is told when Higgsfield offered a preset again after it was declined. */\nfunction presetSaid(preset) {\n  return 'Higgsfield offered its preset' + (preset.name ? ' \"' + preset.name + '\"' : '') + ' in place of the prompt as written';\n}\n\n/** A refusal that means nothing was made (the request, the model, the credits, the content). */\nfunction isRefusal(message) {\n  return /input validation error|invalid request|invalid arguments|unknown model|not enough credits|insufficient|top up|balance is|out of credits|nsfw|moderation|content policy|not allowed|prohibited|rejected/i.test(message);\n}\n\n/** The first string found under any of these keys, at any depth. */\nfunction findString(value, keys, depth) {\n  if (depth > 5 || value === null || typeof value !== 'object') return '';\n  const list = Array.isArray(value) ? value : [value];\n  for (let i = 0; i < list.length; i++) {\n    const v = list[i];\n    if (!v || typeof v !== 'object') continue;\n    if (!Array.isArray(v)) {\n      for (let k = 0; k < keys.length; k++) {\n        const found = v[keys[k]];\n        if (typeof found === 'string' && found.trim()) return found.trim();\n        if (typeof found === 'number') return String(found);\n      }\n    }\n    const inner = Array.isArray(v) ? v : Object.keys(v).map(function (key) { return v[key]; });\n    for (let j = 0; j < inner.length; j++) {\n      const got = findString(inner[j], keys, depth + 1);\n      if (got) return got;\n    }\n  }\n  return '';\n}\n\n/**\n * Credits in an answer: { cost: { credits, credits_exact } }, { credits } or\n * { cost }. Higgsfield can quote two figures that differ (a picture at\n * \"1 credit (0.5 exact)\"), and which one the plan is charged is not said, so\n * the higher counts: the month's limit is never under-counted.\n */\nfunction creditsOf(answer) {\n  const cost = answer && answer.cost;\n  const read = function (n) {\n    const value = typeof n === 'string' ? parseFloat(n) : n;\n    return typeof value === 'number' && isFinite(value) && value >= 0 ? value : null;\n  };\n  const figures = (cost && typeof cost === 'object' ? [cost.credits, cost.credits_exact] : [cost != null ? cost : answer && answer.credits]).map(read).filter(function (n) {\n    return n !== null;\n  });\n  return figures.length ? Math.max.apply(null, figures) : null;\n}\n\n/** How a job stands, by Higgsfield's own words for it. */\nconst JOB_DONE = /^(completed|complete|succeeded|success|done|finished|ready)$/;\nconst JOB_FAILED = /^(failed|failure|error|errored|canceled|cancelled|nsfw|rejected|expired|ip_detected|blocked|moderated|submission_failed)$/;\n\n/** A job's status, lower case, or ''. */\nfunction jobStatus(answer) {\n  return (findString(answer, ['status', 'state'], 0) || '').toLowerCase();\n}\n\n/**\n * The links to what a job made, its rawUrl first. Never one from params,\n * where Higgsfield echoes the request with the pictures it was given (a\n * reference's link would pass for the result: it did on 2026-10-21), nor the\n * small minUrl preview.\n */\nfunction madeLinks(answer) {\n  const raw = [];\n  const rest = [];\n  (function walk(value, key, depth) {\n    if (depth > 6 || value === null || value === undefined || key === 'params' || key === 'minUrl') return;\n    if (typeof value === 'string') {\n      if (/^https:\\/\\/\\S+$/.test(value)) (key === 'rawUrl' ? raw : rest).push(value);\n      return;\n    }\n    if (Array.isArray(value)) value.forEach(function (v) { walk(v, key, depth + 1); });\n    else if (typeof value === 'object') Object.keys(value).forEach(function (k) { walk(value[k], k, depth + 1); });\n  })(answer, '', 0);\n  return raw.concat(rest);\n}\n\n/** Why a job failed, as plainly as Higgsfield says it. */\nfunction jobReason(status, answer, json) {\n  if (status === 'ip_detected') return 'Higgsfield held it back: it may show protected material. If the team has the rights, reveal it on Higgsfield.';\n  if (status === 'nsfw' || status === 'moderated' || status === 'blocked') return 'Higgsfield\\'s safety check stopped it: change the prompt and ask again.';\n  const said = findString(answer, ['error', 'message', 'reason', 'detail'], 0) || wordsOf(json);\n  return 'Higgsfield could not make it (' + status + ')' + (said ? ': ' + said.slice(0, 200) : '.');\n}\n\n// What the page asking is told (AI video, or Settings and the studio for a\n// picture): the price, and the credits left on the team's Higgsfield plan\n// when it was read (null when Higgsfield did not say).\nconst price = $('Read the price').first().json;\nconst balance = creditsOf({ credits: answerOf($input.first().json).credits });\nreturn [{ json: Object.assign({}, price, { balance: balance }) }];\n" },
  },
  output: [{ ok: true, credits: 0.25, balance: 280 }],
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

// ---- the asks

const takeDue = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: {
    name: "Take the pictures asked for",
    executeOnce: true,
    parameters: {
      method: 'POST',
      url: 'https://tcinsdexwvzpznqlcpww.supabase.co/rest/v1/rpc/picture_take_due',
      authentication: 'predefinedCredentialType',
      nodeCredentialType: 'supabaseApi',
      sendBody: true,
      contentType: 'json',
      specifyBody: 'json',
      jsonBody: expr("{{ JSON.stringify({ p_limit: 5 }) }}"),
      options: { timeout: 30000 },
    },
    credentials: { supabaseApi: newCredential('Supabase QGR') },
  },
  output: [{ variant_id: 'variant-id', label: 'A', prompt: 'A calm skyline at dusk, indigo and gold. No words, no people, no flags.', style: 'arcs', look: 'Warm natural light, indigo and gold accents.', model: 'stand-in', account: null, quality: 'low', path: 'pictures/variant-id/picture-id.png' }],
});

const eachAsk = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: "One item per picture",
    parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: "// The rows a database function returned, one item each. n8n turns a JSON\n// array answer into items by itself; this also takes one item holding the\n// whole array, so the next node sees the same either way. Nothing due means\n// no items, and the rest of the workflow does not run.\nconst out = [];\n$input.all().forEach(function (item) {\n  const json = item.json;\n  let rows = [];\n  if (Array.isArray(json)) rows = json;\n  else if (json && Array.isArray(json.data)) rows = json.data;\n  else if (json && typeof json === 'object' && Object.keys(json).length > 0) rows = [json];\n  rows.forEach(function (row) {\n    if (row && typeof row === 'object') out.push({ json: row });\n  });\n});\nreturn out;\n" },
  },
  output: [{ variant_id: 'variant-id', label: 'A', prompt: 'A calm skyline at dusk, indigo and gold. No words, no people, no flags.', style: 'arcs', look: 'Warm natural light, indigo and gold accents.', model: 'stand-in', account: null, quality: 'low', path: 'pictures/variant-id/picture-id.png' }],
});

const imageModel = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: "Image model (stand-in)",
    parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: "// STAND-IN for an image model: the way taken while the team's pictures are\n// set to the stand-in (Settings, Agents), as they are until Cloudflare Workers\n// AI is chosen there. Nothing is drawn: it answers as the real steps do when\n// no picture could be made, marked stand_in, so the ask ends, the studio says\n// no picture was made, and the variant keeps what it shows.\n//\n// The real way (\"Real pictures?\" true) is Cloudflare's FLUX.1 schnell: write\n// the prompt, ask Cloudflare, read the picture, upload it to the private\n// bucket ad-pictures at the item's path (ending .jpg, .png or .webp for what\n// came back), and answer in the same shape:\n//   { ok: true, variant_id, path, stand_in: false }\n// or, when no picture was made:\n//   { ok: false, variant_id, error }\nreturn $input.all().map(function (item) {\n  const ask = item.json;\n  return {\n    json: {\n      ok: true,\n      variant_id: ask.variant_id,\n      path: null,\n      stand_in: true,\n    },\n  };\n});\n" },
  },
  output: [{ ok: true, variant_id: 'variant-id', path: null, stand_in: true }],
});

const made = ifElse({
  version: 2.3,
  config: {
    name: "Made?",
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 },
        conditions: [{ leftValue: expr('{{ $json.ok }}'), rightValue: true, operator: { type: 'boolean', operation: 'true', singleValue: true } }],
        combinator: 'and',
      },
    },
  },
});

const onHiggsfield = ifElse({
  version: 2.3,
  config: {
    name: "Higgsfield?",
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 2 },
        conditions: [{ leftValue: expr("{{ $json.model === \"higgsfield\" }}"), rightValue: true, operator: { type: 'boolean', operation: 'true', singleValue: true } }],
        combinator: 'and',
      },
    },
  },
});

// ---- Higgsfield: priced, recorded against the month's limit, sent once

const higgsRequest = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: "Write the Higgsfield request",
    parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: "// Shared by the scripts that ask an image model for a picture (joined in\n// front of each): what it is asked to draw, for each ask. The scene (a\n// person's prompt in the studio, or the Content Agent's), then how it should\n// look (a real photograph of real-looking people, as the team asked on\n// 2026-10-22), the brand's picture style from brand memory, a line on the\n// run's reference pictures when Higgsfield is given some, then the rules\n// every picture keeps: no words (the ad's words go over the picture), people\n// who are made up rather than anyone real or famous, and the flag and props\n// the team allowed (2026-10-22) with no writing on them. Cloudflare's\n// FLUX takes 2,048 characters at most; Higgsfield's GPT Image far more, so\n// its scripts pass HIGGSFIELD_PROMPT_MAX. The scene is shortened first, at a\n// word, then a long picture style; the rules never are.\nconst PROMPT_MAX = 2048;\nconst HIGGSFIELD_PROMPT_MAX = 6000;\nconst PHOTO_LOOK = 'A real photograph, as a documentary or lifestyle photographer would take it: natural light, real skin, hands and textures, candid and unposed, honest emotion. Not an illustration, a 3D render or a stock-photo pose.';\nconst PICTURE_RULES = 'No readable text, letters, numbers, logos or watermarks anywhere, on signs, books or documents either. Everyone shown is a made-up person: never a real, famous or recognisable one. A U.S. flag or quiet props such as passports, a folder or a gavel may appear, with no writing on them; never a green card or visa held up as approved, never money.';\nconst SCENE_MIN = 300;\n\nconst REFERENCES_RULE = 'Use the reference pictures given for what they show: the real place, product or look to keep to.';\n\nfunction atWord(text, room) {\n  if (text.length <= room) return text;\n  let cut = text.slice(0, Math.max(0, room));\n  const space = cut.lastIndexOf(' ');\n  if (space > room * 0.6) cut = cut.slice(0, space);\n  return cut;\n}\n\nfunction picturePrompt(ask, max) {\n  const limit = max || PROMPT_MAX;\n  const references = Array.isArray(ask.references) && ask.references.length > 0 ? ' ' + REFERENCES_RULE : '';\n  const fixed = ' ' + PHOTO_LOOK + references + ' ' + PICTURE_RULES;\n  let look = String(ask.look || '').trim().replace(/\\s+/g, ' ');\n  const lookRoom = limit - fixed.length - SCENE_MIN - ' Picture style: .'.length;\n  if (look.length > lookRoom) look = atWord(look, lookRoom);\n  const styled = look ? ' Picture style: ' + look + (/[.!?]$/.test(look) ? '' : '.') : '';\n  const tail = ' ' + PHOTO_LOOK + styled + references + ' ' + PICTURE_RULES;\n  let scene = atWord(String(ask.prompt || '').trim().replace(/\\s+/g, ' '), limit - tail.length - 1);\n  if (!/[.!?]$/.test(scene)) scene += '.';\n  return scene + tail;\n}\n\n// Higgsfield's GPT Image 2.5, as the team's quality asks: square at 1k (one\n// picture serves Meta's square and LinkedIn's wide frame, cropped about its\n// middle, as Cloudflare's does), low quality unless the team chose more.\nconst HIGGSFIELD_PICTURE_MODEL = 'gpt_image_2_5';\nconst HIGGSFIELD_QUALITIES = ['low', 'medium', 'high'];\n\n// The run's reference pictures, as Higgsfield keeps them (their media ids),\n// go with the picture as image_references; they do not change its price.\nfunction higgsfieldPictureParams(prompt, quality, references) {\n  const params = {\n    model: HIGGSFIELD_PICTURE_MODEL,\n    prompt: prompt,\n    aspect_ratio: '1:1',\n    resolution: '1k',\n    quality: HIGGSFIELD_QUALITIES.indexOf(quality) >= 0 ? quality : 'low',\n  };\n  const ids = (Array.isArray(references) ? references : []).filter(function (id) { return typeof id === 'string' && id; });\n  if (ids.length > 0) params.medias = ids.map(function (id) { return { role: 'image_references', value: id }; });\n  return params;\n}\n\n// What Higgsfield is asked for each ad's picture: GPT Image 2.5 drawing the\n// picture's words (picturePrompt) at the team's quality, with the run's\n// reference pictures when it has some. Its price is asked\n// first, with get_cost beside the params and inside them, which makes\n// nothing; the same params, without it, make the picture once the price is\n// recorded against the month's limit.\nreturn $input.all().map(function (item) {\n  const ask = item.json;\n  const params = higgsfieldPictureParams(picturePrompt(ask, HIGGSFIELD_PROMPT_MAX), ask.quality, ask.references);\n  return {\n    json: {\n      variant_id: ask.variant_id,\n      label: ask.label,\n      path: ask.path,\n      quality: params.quality,\n      params: params,\n      quote_input: JSON.stringify({ params: Object.assign({}, params, { get_cost: true }), get_cost: true }),\n    },\n  };\n});\n" },
  },
  output: [{ variant_id: 'variant-id', label: 'A', path: 'pictures/variant-id/picture-id.png', quality: 'low', params: { model: 'gpt_image_2_5' }, quote_input: '{"params":{"model":"gpt_image_2_5","get_cost":true},"get_cost":true}' }],
});

const higgsPricePicture = node({
  type: '@n8n/n8n-nodes-langchain.mcpClient',
  version: 1.1,
  config: {
    name: "Higgsfield: price the picture",
    onError: 'continueRegularOutput',
    parameters: {
      serverTransport: 'httpStreamable',
      endpointUrl: 'https://mcp.higgsfield.ai/mcp',
      authentication: 'mcpOAuth2Api',
      tool: { __rl: true, mode: 'id', value: 'generate_image' },
      inputMode: 'json',
      jsonInput: expr("{{ $json.quote_input }}"),
      options: { convertToBinary: false, timeout: 120000 },
    },
    credentials: { mcpOAuth2Api: newCredential('Higgsfield') },
  },
  output: [{ structuredContent: { cost: { credits: 0.25, credits_exact: 0.25 } }, content: [{ type: 'text', text: 'Cost preflight for gpt_image_2_5: 0.25 credits (0.25 exact). No job submitted.' }] }],
});

const readPicturePrice = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: "Read the picture's price",
    parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: "// Shared by the scripts that read Higgsfield's answers, for AI video and for\n// pictures (joined in front of each). Higgsfield is asked through its MCP,\n// signed in with the team's own account, so every video and every picture\n// spends the plan's credits.\n//\n// An MCP step answers in one of three ways, and each script must tell them\n// apart:\n//   - Higgsfield answered: { structuredContent, content: [{ type: 'text', text }] }\n//   - Higgsfield refused the call: { error: { message } } (bad input, a model\n//     it does not know, not enough credits). Nothing was made.\n//   - n8n could not reach Higgsfield at all: the step hands on the item it was\n//     given, unchanged. Nothing was sent.\n\n/** What Higgsfield's answer carries: its structured content, else its text read as JSON, else {}. */\nfunction answerOf(json) {\n  if (!json || typeof json !== 'object') return {};\n  if (json.structuredContent && typeof json.structuredContent === 'object') return json.structuredContent;\n  const parts = Array.isArray(json.content) ? json.content : [];\n  for (let i = 0; i < parts.length; i++) {\n    const text = parts[i] && parts[i].text;\n    if (text && typeof text === 'object') return text;\n    if (typeof text === 'string' && /^\\s*[{[]/.test(text)) {\n      try {\n        return JSON.parse(text);\n      } catch (e) {\n        // Not JSON: read as words below.\n      }\n    }\n  }\n  return {};\n}\n\n/** Higgsfield's words, for a reason shown to the team. */\nfunction wordsOf(json) {\n  const parts = json && Array.isArray(json.content) ? json.content : [];\n  return parts\n    .map(function (p) { return p && typeof p.text === 'string' ? p.text : ''; })\n    .join(' ')\n    .replace(/\\s+/g, ' ')\n    .trim();\n}\n\n/** The error Higgsfield or the MCP step gave, as text, or ''. */\nfunction errorOf(json) {\n  if (!json || typeof json !== 'object' || !json.error) return '';\n  const e = json.error;\n  const message = typeof e === 'string' ? e : e.message || e.description || JSON.stringify(e);\n  return String(message).replace(/\\s+/g, ' ').trim().slice(0, 400);\n}\n\n/** n8n could not reach Higgsfield: the step handed on what it was given. */\nfunction notReached(json, own) {\n  if (!json || typeof json !== 'object') return true;\n  if (json.structuredContent || json.content || json.error) return false;\n  return Object.prototype.hasOwnProperty.call(json, own);\n}\n\n/**\n * Higgsfield's offer of one of its presets in place of the prompt (\"This\n * prompt looks like the Higgsfield preset … generate literally\"), which comes\n * instead of a price or a job: nothing was priced or made. Its id and name,\n * or null. Seen on every video prompt tried on 2026-10-20, never on a picture.\n */\nfunction presetNotice(json) {\n  const answer = answerOf(json);\n  const notice = answer && answer.notice;\n  if (notice && typeof notice === 'object' && notice.type === 'preset_recommendation') {\n    const data = notice.data && typeof notice.data === 'object' ? notice.data : {};\n    const preset = data.preset && typeof data.preset === 'object' ? data.preset : {};\n    const id = (data.retry_literal_with && data.retry_literal_with.declined_preset_id) || preset.id || '';\n    return { id: String(id), name: typeof preset.name === 'string' ? preset.name : '' };\n  }\n  const words = wordsOf(json);\n  const said = words.match(/declined_preset_id:?\\s*\"?([A-Za-z0-9-]{8,})/);\n  if (!said) return null;\n  const name = words.match(/preset \"([^\"]+)\"/);\n  return { id: said[1], name: name ? name[1] : '' };\n}\n\n/** What the team is told when Higgsfield offered a preset again after it was declined. */\nfunction presetSaid(preset) {\n  return 'Higgsfield offered its preset' + (preset.name ? ' \"' + preset.name + '\"' : '') + ' in place of the prompt as written';\n}\n\n/** A refusal that means nothing was made (the request, the model, the credits, the content). */\nfunction isRefusal(message) {\n  return /input validation error|invalid request|invalid arguments|unknown model|not enough credits|insufficient|top up|balance is|out of credits|nsfw|moderation|content policy|not allowed|prohibited|rejected/i.test(message);\n}\n\n/** The first string found under any of these keys, at any depth. */\nfunction findString(value, keys, depth) {\n  if (depth > 5 || value === null || typeof value !== 'object') return '';\n  const list = Array.isArray(value) ? value : [value];\n  for (let i = 0; i < list.length; i++) {\n    const v = list[i];\n    if (!v || typeof v !== 'object') continue;\n    if (!Array.isArray(v)) {\n      for (let k = 0; k < keys.length; k++) {\n        const found = v[keys[k]];\n        if (typeof found === 'string' && found.trim()) return found.trim();\n        if (typeof found === 'number') return String(found);\n      }\n    }\n    const inner = Array.isArray(v) ? v : Object.keys(v).map(function (key) { return v[key]; });\n    for (let j = 0; j < inner.length; j++) {\n      const got = findString(inner[j], keys, depth + 1);\n      if (got) return got;\n    }\n  }\n  return '';\n}\n\n/**\n * Credits in an answer: { cost: { credits, credits_exact } }, { credits } or\n * { cost }. Higgsfield can quote two figures that differ (a picture at\n * \"1 credit (0.5 exact)\"), and which one the plan is charged is not said, so\n * the higher counts: the month's limit is never under-counted.\n */\nfunction creditsOf(answer) {\n  const cost = answer && answer.cost;\n  const read = function (n) {\n    const value = typeof n === 'string' ? parseFloat(n) : n;\n    return typeof value === 'number' && isFinite(value) && value >= 0 ? value : null;\n  };\n  const figures = (cost && typeof cost === 'object' ? [cost.credits, cost.credits_exact] : [cost != null ? cost : answer && answer.credits]).map(read).filter(function (n) {\n    return n !== null;\n  });\n  return figures.length ? Math.max.apply(null, figures) : null;\n}\n\n/** How a job stands, by Higgsfield's own words for it. */\nconst JOB_DONE = /^(completed|complete|succeeded|success|done|finished|ready)$/;\nconst JOB_FAILED = /^(failed|failure|error|errored|canceled|cancelled|nsfw|rejected|expired|ip_detected|blocked|moderated|submission_failed)$/;\n\n/** A job's status, lower case, or ''. */\nfunction jobStatus(answer) {\n  return (findString(answer, ['status', 'state'], 0) || '').toLowerCase();\n}\n\n/**\n * The links to what a job made, its rawUrl first. Never one from params,\n * where Higgsfield echoes the request with the pictures it was given (a\n * reference's link would pass for the result: it did on 2026-10-21), nor the\n * small minUrl preview.\n */\nfunction madeLinks(answer) {\n  const raw = [];\n  const rest = [];\n  (function walk(value, key, depth) {\n    if (depth > 6 || value === null || value === undefined || key === 'params' || key === 'minUrl') return;\n    if (typeof value === 'string') {\n      if (/^https:\\/\\/\\S+$/.test(value)) (key === 'rawUrl' ? raw : rest).push(value);\n      return;\n    }\n    if (Array.isArray(value)) value.forEach(function (v) { walk(v, key, depth + 1); });\n    else if (typeof value === 'object') Object.keys(value).forEach(function (k) { walk(value[k], k, depth + 1); });\n  })(answer, '', 0);\n  return raw.concat(rest);\n}\n\n/** Why a job failed, as plainly as Higgsfield says it. */\nfunction jobReason(status, answer, json) {\n  if (status === 'ip_detected') return 'Higgsfield held it back: it may show protected material. If the team has the rights, reveal it on Higgsfield.';\n  if (status === 'nsfw' || status === 'moderated' || status === 'blocked') return 'Higgsfield\\'s safety check stopped it: change the prompt and ask again.';\n  const said = findString(answer, ['error', 'message', 'reason', 'detail'], 0) || wordsOf(json);\n  return 'Higgsfield could not make it (' + status + ')' + (said ? ': ' + said.slice(0, 200) : '.');\n}\n\n// Higgsfield's price for each ad's picture, read:\n//   priced   -> recorded against the month's limit, then sent\n//   retry    -> Higgsfield was not reached: nothing was sent, and the ad is\n//               taken again at the next run (three tries)\n//   refused  -> nothing will be made, and the ad says why (one of Higgsfield's\n//               presets offered in place of the prompt included: never seen\n//               for a picture, and never taken)\nreturn $input.all().map(function (item, i) {\n  const asked = $('Write the Higgsfield request').itemMatching(i).json;\n  const json = item.json;\n  if (notReached(json, 'quote_input')) {\n    return { json: { kind: 'retry', variant_id: asked.variant_id, error: 'Higgsfield could not be reached for its price' } };\n  }\n  const error = errorOf(json);\n  if (error) return { json: { kind: 'refused', variant_id: asked.variant_id, error: 'Higgsfield would not price the picture: ' + error } };\n  const preset = presetNotice(json);\n  if (preset) return { json: { kind: 'refused', variant_id: asked.variant_id, error: presetSaid(preset) + ': nothing was made. Change the picture\\'s prompt a little and ask again.' } };\n  const answer = answerOf(json);\n  if (findString(answer, ['job_id', 'jobId'], 0)) {\n    return { json: { kind: 'refused', variant_id: asked.variant_id, error: 'Higgsfield started a picture when asked only its price: check its history before asking again.' } };\n  }\n  const credits = creditsOf(answer);\n  if (credits === null) {\n    const words = wordsOf(json);\n    return { json: { kind: 'refused', variant_id: asked.variant_id, error: 'Higgsfield gave no price for the picture' + (words ? ': ' + words.slice(0, 200) : '.') } };\n  }\n  return { json: { kind: 'priced', variant_id: asked.variant_id, credits: credits, quality: asked.quality, path: asked.path } };\n});\n" },
  },
  output: [{ kind: 'priced', variant_id: 'variant-id', credits: 0.25, quality: 'low', path: 'pictures/variant-id/picture-id.png' }],
});

const priced = switchCase({
  version: 3.4,
  config: {
    name: "Priced?",
    parameters: {
      mode: 'rules',
      rules: {
        values: [
          { outputKey: 'priced', conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 2 }, conditions: [{ leftValue: expr("{{ $json.kind === \"priced\" }}"), rightValue: true, operator: { type: 'boolean', operation: 'true', singleValue: true } }], combinator: 'and' } },
          { outputKey: 'retry', conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 2 }, conditions: [{ leftValue: expr("{{ $json.kind === \"retry\" }}"), rightValue: true, operator: { type: 'boolean', operation: 'true', singleValue: true } }], combinator: 'and' } },
          { outputKey: 'refused', conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 2 }, conditions: [{ leftValue: expr("{{ $json.kind === \"refused\" }}"), rightValue: true, operator: { type: 'boolean', operation: 'true', singleValue: true } }], combinator: 'and' } },
        ],
      },
      options: {},
    },
  },
});

const begin = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: {
    name: "Record: about to send",
    onError: 'continueRegularOutput',
    parameters: {
      method: 'POST',
      url: 'https://tcinsdexwvzpznqlcpww.supabase.co/rest/v1/rpc/picture_higgsfield_begin',
      authentication: 'predefinedCredentialType',
      nodeCredentialType: 'supabaseApi',
      sendBody: true,
      contentType: 'json',
      specifyBody: 'json',
      jsonBody: expr("{{ JSON.stringify({ p_variant_id: $json.variant_id, p_credits: $json.credits, p_quality: $json.quality, p_path: $json.path }) }}"),
      options: { timeout: 30000 },
    },
    credentials: { supabaseApi: newCredential('Supabase QGR') },
  },
  output: [{ begun: true, id: 'sent-id' }],
});

const begun = ifElse({
  version: 2.3,
  config: {
    name: "Begun?",
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 2 },
        conditions: [{ leftValue: expr("{{ $json.begun === true }}"), rightValue: true, operator: { type: 'boolean', operation: 'true', singleValue: true } }],
        combinator: 'and',
      },
    },
  },
});

const releaseAsk = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: {
    name: "Take it again later",
    onError: 'continueRegularOutput',
    parameters: {
      method: 'POST',
      url: 'https://tcinsdexwvzpznqlcpww.supabase.co/rest/v1/rpc/picture_release',
      authentication: 'predefinedCredentialType',
      nodeCredentialType: 'supabaseApi',
      sendBody: true,
      contentType: 'json',
      specifyBody: 'json',
      jsonBody: expr("{{ JSON.stringify({ p_variant_id: $json.variant_id, p_error: $json.error }) }}"),
      options: { timeout: 30000 },
    },
    credentials: { supabaseApi: newCredential('Supabase QGR') },
  },
  output: [{}],
});

const pictureRequest = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: "Write the picture request",
    parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: "// The request for each picture recorded as being sent\n// (picture_higgsfield_begin): the params its price was asked with, without\n// get_cost, so this time it is made. Each is sent once.\nreturn $input.all().map(function (item, i) {\n  const asked = $('Write the Higgsfield request').itemMatching(i).json;\n  return { json: { id: item.json.id, variant_id: asked.variant_id, generate_input: JSON.stringify({ params: asked.params }) } };\n});\n" },
  },
  output: [{ id: 'sent-id', variant_id: 'variant-id', generate_input: '{"params":{"model":"gpt_image_2_5"}}' }],
});

const makePicture = node({
  type: '@n8n/n8n-nodes-langchain.mcpClient',
  version: 1.1,
  config: {
    name: "Higgsfield: make the picture",
    onError: 'continueRegularOutput',
    parameters: {
      serverTransport: 'httpStreamable',
      endpointUrl: 'https://mcp.higgsfield.ai/mcp',
      authentication: 'mcpOAuth2Api',
      tool: { __rl: true, mode: 'id', value: 'generate_image' },
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
    parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: "// Shared by the scripts that read Higgsfield's answers, for AI video and for\n// pictures (joined in front of each). Higgsfield is asked through its MCP,\n// signed in with the team's own account, so every video and every picture\n// spends the plan's credits.\n//\n// An MCP step answers in one of three ways, and each script must tell them\n// apart:\n//   - Higgsfield answered: { structuredContent, content: [{ type: 'text', text }] }\n//   - Higgsfield refused the call: { error: { message } } (bad input, a model\n//     it does not know, not enough credits). Nothing was made.\n//   - n8n could not reach Higgsfield at all: the step hands on the item it was\n//     given, unchanged. Nothing was sent.\n\n/** What Higgsfield's answer carries: its structured content, else its text read as JSON, else {}. */\nfunction answerOf(json) {\n  if (!json || typeof json !== 'object') return {};\n  if (json.structuredContent && typeof json.structuredContent === 'object') return json.structuredContent;\n  const parts = Array.isArray(json.content) ? json.content : [];\n  for (let i = 0; i < parts.length; i++) {\n    const text = parts[i] && parts[i].text;\n    if (text && typeof text === 'object') return text;\n    if (typeof text === 'string' && /^\\s*[{[]/.test(text)) {\n      try {\n        return JSON.parse(text);\n      } catch (e) {\n        // Not JSON: read as words below.\n      }\n    }\n  }\n  return {};\n}\n\n/** Higgsfield's words, for a reason shown to the team. */\nfunction wordsOf(json) {\n  const parts = json && Array.isArray(json.content) ? json.content : [];\n  return parts\n    .map(function (p) { return p && typeof p.text === 'string' ? p.text : ''; })\n    .join(' ')\n    .replace(/\\s+/g, ' ')\n    .trim();\n}\n\n/** The error Higgsfield or the MCP step gave, as text, or ''. */\nfunction errorOf(json) {\n  if (!json || typeof json !== 'object' || !json.error) return '';\n  const e = json.error;\n  const message = typeof e === 'string' ? e : e.message || e.description || JSON.stringify(e);\n  return String(message).replace(/\\s+/g, ' ').trim().slice(0, 400);\n}\n\n/** n8n could not reach Higgsfield: the step handed on what it was given. */\nfunction notReached(json, own) {\n  if (!json || typeof json !== 'object') return true;\n  if (json.structuredContent || json.content || json.error) return false;\n  return Object.prototype.hasOwnProperty.call(json, own);\n}\n\n/**\n * Higgsfield's offer of one of its presets in place of the prompt (\"This\n * prompt looks like the Higgsfield preset … generate literally\"), which comes\n * instead of a price or a job: nothing was priced or made. Its id and name,\n * or null. Seen on every video prompt tried on 2026-10-20, never on a picture.\n */\nfunction presetNotice(json) {\n  const answer = answerOf(json);\n  const notice = answer && answer.notice;\n  if (notice && typeof notice === 'object' && notice.type === 'preset_recommendation') {\n    const data = notice.data && typeof notice.data === 'object' ? notice.data : {};\n    const preset = data.preset && typeof data.preset === 'object' ? data.preset : {};\n    const id = (data.retry_literal_with && data.retry_literal_with.declined_preset_id) || preset.id || '';\n    return { id: String(id), name: typeof preset.name === 'string' ? preset.name : '' };\n  }\n  const words = wordsOf(json);\n  const said = words.match(/declined_preset_id:?\\s*\"?([A-Za-z0-9-]{8,})/);\n  if (!said) return null;\n  const name = words.match(/preset \"([^\"]+)\"/);\n  return { id: said[1], name: name ? name[1] : '' };\n}\n\n/** What the team is told when Higgsfield offered a preset again after it was declined. */\nfunction presetSaid(preset) {\n  return 'Higgsfield offered its preset' + (preset.name ? ' \"' + preset.name + '\"' : '') + ' in place of the prompt as written';\n}\n\n/** A refusal that means nothing was made (the request, the model, the credits, the content). */\nfunction isRefusal(message) {\n  return /input validation error|invalid request|invalid arguments|unknown model|not enough credits|insufficient|top up|balance is|out of credits|nsfw|moderation|content policy|not allowed|prohibited|rejected/i.test(message);\n}\n\n/** The first string found under any of these keys, at any depth. */\nfunction findString(value, keys, depth) {\n  if (depth > 5 || value === null || typeof value !== 'object') return '';\n  const list = Array.isArray(value) ? value : [value];\n  for (let i = 0; i < list.length; i++) {\n    const v = list[i];\n    if (!v || typeof v !== 'object') continue;\n    if (!Array.isArray(v)) {\n      for (let k = 0; k < keys.length; k++) {\n        const found = v[keys[k]];\n        if (typeof found === 'string' && found.trim()) return found.trim();\n        if (typeof found === 'number') return String(found);\n      }\n    }\n    const inner = Array.isArray(v) ? v : Object.keys(v).map(function (key) { return v[key]; });\n    for (let j = 0; j < inner.length; j++) {\n      const got = findString(inner[j], keys, depth + 1);\n      if (got) return got;\n    }\n  }\n  return '';\n}\n\n/**\n * Credits in an answer: { cost: { credits, credits_exact } }, { credits } or\n * { cost }. Higgsfield can quote two figures that differ (a picture at\n * \"1 credit (0.5 exact)\"), and which one the plan is charged is not said, so\n * the higher counts: the month's limit is never under-counted.\n */\nfunction creditsOf(answer) {\n  const cost = answer && answer.cost;\n  const read = function (n) {\n    const value = typeof n === 'string' ? parseFloat(n) : n;\n    return typeof value === 'number' && isFinite(value) && value >= 0 ? value : null;\n  };\n  const figures = (cost && typeof cost === 'object' ? [cost.credits, cost.credits_exact] : [cost != null ? cost : answer && answer.credits]).map(read).filter(function (n) {\n    return n !== null;\n  });\n  return figures.length ? Math.max.apply(null, figures) : null;\n}\n\n/** How a job stands, by Higgsfield's own words for it. */\nconst JOB_DONE = /^(completed|complete|succeeded|success|done|finished|ready)$/;\nconst JOB_FAILED = /^(failed|failure|error|errored|canceled|cancelled|nsfw|rejected|expired|ip_detected|blocked|moderated|submission_failed)$/;\n\n/** A job's status, lower case, or ''. */\nfunction jobStatus(answer) {\n  return (findString(answer, ['status', 'state'], 0) || '').toLowerCase();\n}\n\n/**\n * The links to what a job made, its rawUrl first. Never one from params,\n * where Higgsfield echoes the request with the pictures it was given (a\n * reference's link would pass for the result: it did on 2026-10-21), nor the\n * small minUrl preview.\n */\nfunction madeLinks(answer) {\n  const raw = [];\n  const rest = [];\n  (function walk(value, key, depth) {\n    if (depth > 6 || value === null || value === undefined || key === 'params' || key === 'minUrl') return;\n    if (typeof value === 'string') {\n      if (/^https:\\/\\/\\S+$/.test(value)) (key === 'rawUrl' ? raw : rest).push(value);\n      return;\n    }\n    if (Array.isArray(value)) value.forEach(function (v) { walk(v, key, depth + 1); });\n    else if (typeof value === 'object') Object.keys(value).forEach(function (k) { walk(value[k], k, depth + 1); });\n  })(answer, '', 0);\n  return raw.concat(rest);\n}\n\n/** Why a job failed, as plainly as Higgsfield says it. */\nfunction jobReason(status, answer, json) {\n  if (status === 'ip_detected') return 'Higgsfield held it back: it may show protected material. If the team has the rights, reveal it on Higgsfield.';\n  if (status === 'nsfw' || status === 'moderated' || status === 'blocked') return 'Higgsfield\\'s safety check stopped it: change the prompt and ask again.';\n  const said = findString(answer, ['error', 'message', 'reason', 'detail'], 0) || wordsOf(json);\n  return 'Higgsfield could not make it (' + status + ')' + (said ? ': ' + said.slice(0, 200) : '.');\n}\n\n// Higgsfield's answer to an ask, read once and recorded once:\n//   took it        -> started, with its job (and its price, when it says one)\n//   refused it     -> refused: nothing was made (so is a preset offered again\n//                     in place of the prompt after it was declined: no job)\n//   not reached    -> retry: nothing was sent, so it is sent again next minute\n//   anything else  -> unknown: it may have been made, so it is never sent\n//                     again by itself (Higgsfield: \"do not automatically\n//                     resubmit\"); a person checks its history first.\nreturn $input.all().map(function (item, i) {\n  const sent = $('Write the picture request').itemMatching(i).json;\n  const json = item.json;\n  if (notReached(json, 'generate_input')) return { json: { kind: 'retry', id: sent.id, error: 'Could not connect to Higgsfield' } };\n  const error = errorOf(json);\n  if (error) {\n    return {\n      json: isRefusal(error)\n        ? { kind: 'refused', id: sent.id, error: 'Higgsfield refused it: ' + error }\n        : { kind: 'unknown', id: sent.id, error: 'Higgsfield may have started it (' + error + '). Check its history before asking again.' },\n    };\n  }\n  const preset = presetNotice(json);\n  if (preset) return { json: { kind: 'refused', id: sent.id, error: presetSaid(preset) + ': nothing was made. Change the prompt a little and ask again.' } };\n  const answer = answerOf(json);\n  const words = wordsOf(json);\n  const fromWords = words.match(/job[_ -]?id[\\s:=\"']+([A-Za-z0-9_-]{6,})/i);\n  const job = findString(answer, ['job_id', 'jobId'], 0) || findString(answer && answer.jobs, ['job_id', 'jobId', 'id'], 0) || (fromWords ? fromWords[1] : '') || findString(answer, ['id'], 0);\n  if (!job) {\n    return { json: { kind: 'unknown', id: sent.id, error: 'Higgsfield answered without a job (' + (words.slice(0, 200) || 'no words') + '). Check its history before asking again.' } };\n  }\n  return { json: { kind: 'started', id: sent.id, job_id: job, credits: creditsOf(answer) } };\n});\n" },
  },
  output: [{ kind: 'started', id: 'sent-id', job_id: 'job-id', credits: null }],
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
    name: "Record: Higgsfield has it",
    onError: 'continueRegularOutput',
    parameters: {
      method: 'POST',
      url: 'https://tcinsdexwvzpznqlcpww.supabase.co/rest/v1/rpc/picture_higgsfield_started',
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

const recordNotMade = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: {
    name: "Record: not made",
    onError: 'continueRegularOutput',
    parameters: {
      method: 'POST',
      url: 'https://tcinsdexwvzpznqlcpww.supabase.co/rest/v1/rpc/picture_higgsfield_fail',
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
      url: 'https://tcinsdexwvzpznqlcpww.supabase.co/rest/v1/rpc/picture_higgsfield_release',
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
      url: 'https://tcinsdexwvzpznqlcpww.supabase.co/rest/v1/rpc/picture_higgsfield_unknown',
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

// ---- a run's reference pictures, given to Higgsfield once

const takeRefs = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: {
    name: "Take the references for Higgsfield",
    executeOnce: true,
    parameters: {
      method: 'POST',
      url: 'https://tcinsdexwvzpznqlcpww.supabase.co/rest/v1/rpc/reference_take_due',
      authentication: 'predefinedCredentialType',
      nodeCredentialType: 'supabaseApi',
      sendBody: true,
      contentType: 'json',
      specifyBody: 'json',
      jsonBody: expr("{{ JSON.stringify({ p_limit: 8 }) }}"),
      options: { timeout: 30000 },
    },
    credentials: { supabaseApi: newCredential('Supabase QGR') },
  },
  output: [{ id: 'reference-id', run_id: 'run-id', position: 0, path: 'refs/user-id/picture-id.png' }],
});

const eachRef = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: "One item per reference",
    parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: "// The rows a database function returned, one item each. n8n turns a JSON\n// array answer into items by itself; this also takes one item holding the\n// whole array, so the next node sees the same either way. Nothing due means\n// no items, and the rest of the workflow does not run.\nconst out = [];\n$input.all().forEach(function (item) {\n  const json = item.json;\n  let rows = [];\n  if (Array.isArray(json)) rows = json;\n  else if (json && Array.isArray(json.data)) rows = json.data;\n  else if (json && typeof json === 'object' && Object.keys(json).length > 0) rows = [json];\n  rows.forEach(function (row) {\n    if (row && typeof row === 'object') out.push({ json: row });\n  });\n});\nreturn out;\n" },
  },
  output: [{ id: 'reference-id', run_id: 'run-id', position: 0, path: 'refs/user-id/picture-id.png' }],
});

const signRef = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: {
    name: "Sign the reference",
    onError: 'continueRegularOutput',
    parameters: {
      method: 'POST',
      url: expr('https://tcinsdexwvzpznqlcpww.supabase.co/storage/v1/object/sign/run-refs/{{ $json.path }}'),
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
  output: [{ statusCode: 200, body: { signedURL: '/object/sign/run-refs/refs/user-id/picture-id.png?token=t' } }],
});

const refLink = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: "Reference link",
    parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: "// A link Higgsfield can fetch a reference picture from: Storage signs it for\n// 15 minutes, as the screenshots of competitors' ads are. A signing that fails\n// is tried again at the next run of n8n: the picture is in run-refs.\nconst STORAGE = 'https://tcinsdexwvzpznqlcpww.supabase.co/storage/v1';\nreturn $input.all().map(function (item, i) {\n  const ref = $('One item per reference').itemMatching(i).json;\n  const res = item.json || {};\n  const body = res.body && typeof res.body === 'object' ? res.body : {};\n  const signed = body.signedURL || body.signedUrl;\n  if (res.statusCode >= 200 && res.statusCode < 300 && typeof signed === 'string') {\n    return { json: { id: ref.id, url: STORAGE + (signed.charAt(0) === '/' ? '' : '/') + signed } };\n  }\n  const said = String(body.message || body.error || res.error || 'no answer').slice(0, 200);\n  return { json: { kind: 'retry', id: ref.id, error: 'The reference picture could not be read from Storage (' + (res.statusCode || 'no answer') + '): ' + said } };\n});\n" },
  },
  output: [{ id: 'reference-id', url: 'https://tcinsdexwvzpznqlcpww.supabase.co/storage/v1/object/sign/run-refs/refs/user-id/picture-id.png?token=t' }],
});

const refLinked = ifElse({
  version: 2.3,
  config: {
    name: "Reference link made?",
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 2 },
        conditions: [{ leftValue: expr("{{ typeof $json.url === \"string\" && $json.url.length > 0 }}"), rightValue: true, operator: { type: 'boolean', operation: 'true', singleValue: true } }],
        combinator: 'and',
      },
    },
  },
});

const importRef = node({
  type: '@n8n/n8n-nodes-langchain.mcpClient',
  version: 1.1,
  config: {
    name: "Higgsfield: take the reference",
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

const readRef = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: "Read the reference's id",
    parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: "// Shared by the scripts that read Higgsfield's answers, for AI video and for\n// pictures (joined in front of each). Higgsfield is asked through its MCP,\n// signed in with the team's own account, so every video and every picture\n// spends the plan's credits.\n//\n// An MCP step answers in one of three ways, and each script must tell them\n// apart:\n//   - Higgsfield answered: { structuredContent, content: [{ type: 'text', text }] }\n//   - Higgsfield refused the call: { error: { message } } (bad input, a model\n//     it does not know, not enough credits). Nothing was made.\n//   - n8n could not reach Higgsfield at all: the step hands on the item it was\n//     given, unchanged. Nothing was sent.\n\n/** What Higgsfield's answer carries: its structured content, else its text read as JSON, else {}. */\nfunction answerOf(json) {\n  if (!json || typeof json !== 'object') return {};\n  if (json.structuredContent && typeof json.structuredContent === 'object') return json.structuredContent;\n  const parts = Array.isArray(json.content) ? json.content : [];\n  for (let i = 0; i < parts.length; i++) {\n    const text = parts[i] && parts[i].text;\n    if (text && typeof text === 'object') return text;\n    if (typeof text === 'string' && /^\\s*[{[]/.test(text)) {\n      try {\n        return JSON.parse(text);\n      } catch (e) {\n        // Not JSON: read as words below.\n      }\n    }\n  }\n  return {};\n}\n\n/** Higgsfield's words, for a reason shown to the team. */\nfunction wordsOf(json) {\n  const parts = json && Array.isArray(json.content) ? json.content : [];\n  return parts\n    .map(function (p) { return p && typeof p.text === 'string' ? p.text : ''; })\n    .join(' ')\n    .replace(/\\s+/g, ' ')\n    .trim();\n}\n\n/** The error Higgsfield or the MCP step gave, as text, or ''. */\nfunction errorOf(json) {\n  if (!json || typeof json !== 'object' || !json.error) return '';\n  const e = json.error;\n  const message = typeof e === 'string' ? e : e.message || e.description || JSON.stringify(e);\n  return String(message).replace(/\\s+/g, ' ').trim().slice(0, 400);\n}\n\n/** n8n could not reach Higgsfield: the step handed on what it was given. */\nfunction notReached(json, own) {\n  if (!json || typeof json !== 'object') return true;\n  if (json.structuredContent || json.content || json.error) return false;\n  return Object.prototype.hasOwnProperty.call(json, own);\n}\n\n/**\n * Higgsfield's offer of one of its presets in place of the prompt (\"This\n * prompt looks like the Higgsfield preset … generate literally\"), which comes\n * instead of a price or a job: nothing was priced or made. Its id and name,\n * or null. Seen on every video prompt tried on 2026-10-20, never on a picture.\n */\nfunction presetNotice(json) {\n  const answer = answerOf(json);\n  const notice = answer && answer.notice;\n  if (notice && typeof notice === 'object' && notice.type === 'preset_recommendation') {\n    const data = notice.data && typeof notice.data === 'object' ? notice.data : {};\n    const preset = data.preset && typeof data.preset === 'object' ? data.preset : {};\n    const id = (data.retry_literal_with && data.retry_literal_with.declined_preset_id) || preset.id || '';\n    return { id: String(id), name: typeof preset.name === 'string' ? preset.name : '' };\n  }\n  const words = wordsOf(json);\n  const said = words.match(/declined_preset_id:?\\s*\"?([A-Za-z0-9-]{8,})/);\n  if (!said) return null;\n  const name = words.match(/preset \"([^\"]+)\"/);\n  return { id: said[1], name: name ? name[1] : '' };\n}\n\n/** What the team is told when Higgsfield offered a preset again after it was declined. */\nfunction presetSaid(preset) {\n  return 'Higgsfield offered its preset' + (preset.name ? ' \"' + preset.name + '\"' : '') + ' in place of the prompt as written';\n}\n\n/** A refusal that means nothing was made (the request, the model, the credits, the content). */\nfunction isRefusal(message) {\n  return /input validation error|invalid request|invalid arguments|unknown model|not enough credits|insufficient|top up|balance is|out of credits|nsfw|moderation|content policy|not allowed|prohibited|rejected/i.test(message);\n}\n\n/** The first string found under any of these keys, at any depth. */\nfunction findString(value, keys, depth) {\n  if (depth > 5 || value === null || typeof value !== 'object') return '';\n  const list = Array.isArray(value) ? value : [value];\n  for (let i = 0; i < list.length; i++) {\n    const v = list[i];\n    if (!v || typeof v !== 'object') continue;\n    if (!Array.isArray(v)) {\n      for (let k = 0; k < keys.length; k++) {\n        const found = v[keys[k]];\n        if (typeof found === 'string' && found.trim()) return found.trim();\n        if (typeof found === 'number') return String(found);\n      }\n    }\n    const inner = Array.isArray(v) ? v : Object.keys(v).map(function (key) { return v[key]; });\n    for (let j = 0; j < inner.length; j++) {\n      const got = findString(inner[j], keys, depth + 1);\n      if (got) return got;\n    }\n  }\n  return '';\n}\n\n/**\n * Credits in an answer: { cost: { credits, credits_exact } }, { credits } or\n * { cost }. Higgsfield can quote two figures that differ (a picture at\n * \"1 credit (0.5 exact)\"), and which one the plan is charged is not said, so\n * the higher counts: the month's limit is never under-counted.\n */\nfunction creditsOf(answer) {\n  const cost = answer && answer.cost;\n  const read = function (n) {\n    const value = typeof n === 'string' ? parseFloat(n) : n;\n    return typeof value === 'number' && isFinite(value) && value >= 0 ? value : null;\n  };\n  const figures = (cost && typeof cost === 'object' ? [cost.credits, cost.credits_exact] : [cost != null ? cost : answer && answer.credits]).map(read).filter(function (n) {\n    return n !== null;\n  });\n  return figures.length ? Math.max.apply(null, figures) : null;\n}\n\n/** How a job stands, by Higgsfield's own words for it. */\nconst JOB_DONE = /^(completed|complete|succeeded|success|done|finished|ready)$/;\nconst JOB_FAILED = /^(failed|failure|error|errored|canceled|cancelled|nsfw|rejected|expired|ip_detected|blocked|moderated|submission_failed)$/;\n\n/** A job's status, lower case, or ''. */\nfunction jobStatus(answer) {\n  return (findString(answer, ['status', 'state'], 0) || '').toLowerCase();\n}\n\n/**\n * The links to what a job made, its rawUrl first. Never one from params,\n * where Higgsfield echoes the request with the pictures it was given (a\n * reference's link would pass for the result: it did on 2026-10-21), nor the\n * small minUrl preview.\n */\nfunction madeLinks(answer) {\n  const raw = [];\n  const rest = [];\n  (function walk(value, key, depth) {\n    if (depth > 6 || value === null || value === undefined || key === 'params' || key === 'minUrl') return;\n    if (typeof value === 'string') {\n      if (/^https:\\/\\/\\S+$/.test(value)) (key === 'rawUrl' ? raw : rest).push(value);\n      return;\n    }\n    if (Array.isArray(value)) value.forEach(function (v) { walk(v, key, depth + 1); });\n    else if (typeof value === 'object') Object.keys(value).forEach(function (k) { walk(value[k], k, depth + 1); });\n  })(answer, '', 0);\n  return raw.concat(rest);\n}\n\n/** Why a job failed, as plainly as Higgsfield says it. */\nfunction jobReason(status, answer, json) {\n  if (status === 'ip_detected') return 'Higgsfield held it back: it may show protected material. If the team has the rights, reveal it on Higgsfield.';\n  if (status === 'nsfw' || status === 'moderated' || status === 'blocked') return 'Higgsfield\\'s safety check stopped it: change the prompt and ask again.';\n  const said = findString(answer, ['error', 'message', 'reason', 'detail'], 0) || wordsOf(json);\n  return 'Higgsfield could not make it (' + status + ')' + (said ? ': ' + said.slice(0, 200) : '.');\n}\n\n// Higgsfield's answer to taking a reference picture (media_import_url): its\n// media id, which every picture and video of the run then hands Higgsfield.\n// Not reached, it is taken again at the next run; refused, the run goes on\n// without it and says why.\nreturn $input.all().map(function (item, i) {\n  const ref = $('Reference link').itemMatching(i).json;\n  const json = item.json;\n  if (notReached(json, 'url')) return { json: { kind: 'retry', id: ref.id, error: 'Higgsfield could not be reached to take the reference picture' } };\n  const error = errorOf(json);\n  if (error) return { json: { kind: 'failed', id: ref.id, error: error } };\n  const mediaId = findString(answerOf(json), ['media_id', 'mediaId', 'id'], 0);\n  if (!mediaId) return { json: { kind: 'failed', id: ref.id, error: 'Higgsfield took the picture but gave no id for it.' } };\n  return { json: { kind: 'ready', id: ref.id, media_id: mediaId } };\n});\n" },
  },
  output: [{ kind: 'ready', id: 'reference-id', media_id: 'media-id' }],
});

const refOutcome = switchCase({
  version: 3.4,
  config: {
    name: "Reference taken?",
    parameters: {
      mode: 'rules',
      rules: {
        values: [
          { outputKey: 'ready', conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 2 }, conditions: [{ leftValue: expr("{{ $json.kind === \"ready\" }}"), rightValue: true, operator: { type: 'boolean', operation: 'true', singleValue: true } }], combinator: 'and' } },
          { outputKey: 'failed', conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 2 }, conditions: [{ leftValue: expr("{{ $json.kind === \"failed\" }}"), rightValue: true, operator: { type: 'boolean', operation: 'true', singleValue: true } }], combinator: 'and' } },
          { outputKey: 'retry', conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 2 }, conditions: [{ leftValue: expr("{{ $json.kind === \"retry\" }}"), rightValue: true, operator: { type: 'boolean', operation: 'true', singleValue: true } }], combinator: 'and' } },
        ],
      },
      options: {},
    },
  },
});

const refReady = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: {
    name: "Record: Higgsfield has the reference",
    onError: 'continueRegularOutput',
    parameters: {
      method: 'POST',
      url: 'https://tcinsdexwvzpznqlcpww.supabase.co/rest/v1/rpc/reference_ready',
      authentication: 'predefinedCredentialType',
      nodeCredentialType: 'supabaseApi',
      sendBody: true,
      contentType: 'json',
      specifyBody: 'json',
      jsonBody: expr("{{ JSON.stringify({ p_id: $json.id, p_media_id: $json.media_id }) }}"),
      options: { timeout: 30000 },
    },
    credentials: { supabaseApi: newCredential('Supabase QGR') },
  },
  output: [{}],
});

const refFailed = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: {
    name: "Record: the reference was refused",
    onError: 'continueRegularOutput',
    parameters: {
      method: 'POST',
      url: 'https://tcinsdexwvzpznqlcpww.supabase.co/rest/v1/rpc/reference_failed',
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

const refRetry = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: {
    name: "Record: try the reference again",
    onError: 'continueRegularOutput',
    parameters: {
      method: 'POST',
      url: 'https://tcinsdexwvzpznqlcpww.supabase.co/rest/v1/rpc/reference_release',
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

// ---- Higgsfield's jobs: checked until the picture is stored

const takeMaking = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: {
    name: "Take the pictures being made",
    executeOnce: true,
    parameters: {
      method: 'POST',
      url: 'https://tcinsdexwvzpznqlcpww.supabase.co/rest/v1/rpc/picture_take_making',
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
  output: [{ id: 'sent-id', variant_id: 'variant-id', job_id: 'job-id', path: 'pictures/variant-id/picture-id.png' }],
});

const eachJob = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: "One item per job",
    parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: "// The rows a database function returned, one item each. n8n turns a JSON\n// array answer into items by itself; this also takes one item holding the\n// whole array, so the next node sees the same either way. Nothing due means\n// no items, and the rest of the workflow does not run.\nconst out = [];\n$input.all().forEach(function (item) {\n  const json = item.json;\n  let rows = [];\n  if (Array.isArray(json)) rows = json;\n  else if (json && Array.isArray(json.data)) rows = json.data;\n  else if (json && typeof json === 'object' && Object.keys(json).length > 0) rows = [json];\n  rows.forEach(function (row) {\n    if (row && typeof row === 'object') out.push({ json: row });\n  });\n});\nreturn out;\n" },
  },
  output: [{ id: 'sent-id', variant_id: 'variant-id', job_id: 'job-id', path: 'pictures/variant-id/picture-id.png' }],
});

const jobStatus = node({
  type: '@n8n/n8n-nodes-langchain.mcpClient',
  version: 1.1,
  config: {
    name: "Higgsfield: how is the picture going?",
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
  output: [{ structuredContent: { status: 'completed', results: [{ url: 'https://cdn.higgsfield.ai/job-id/image.png' }] } }],
});

const readJob = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: "Read the picture's job",
    parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: "// Shared by the scripts that read Higgsfield's answers, for AI video and for\n// pictures (joined in front of each). Higgsfield is asked through its MCP,\n// signed in with the team's own account, so every video and every picture\n// spends the plan's credits.\n//\n// An MCP step answers in one of three ways, and each script must tell them\n// apart:\n//   - Higgsfield answered: { structuredContent, content: [{ type: 'text', text }] }\n//   - Higgsfield refused the call: { error: { message } } (bad input, a model\n//     it does not know, not enough credits). Nothing was made.\n//   - n8n could not reach Higgsfield at all: the step hands on the item it was\n//     given, unchanged. Nothing was sent.\n\n/** What Higgsfield's answer carries: its structured content, else its text read as JSON, else {}. */\nfunction answerOf(json) {\n  if (!json || typeof json !== 'object') return {};\n  if (json.structuredContent && typeof json.structuredContent === 'object') return json.structuredContent;\n  const parts = Array.isArray(json.content) ? json.content : [];\n  for (let i = 0; i < parts.length; i++) {\n    const text = parts[i] && parts[i].text;\n    if (text && typeof text === 'object') return text;\n    if (typeof text === 'string' && /^\\s*[{[]/.test(text)) {\n      try {\n        return JSON.parse(text);\n      } catch (e) {\n        // Not JSON: read as words below.\n      }\n    }\n  }\n  return {};\n}\n\n/** Higgsfield's words, for a reason shown to the team. */\nfunction wordsOf(json) {\n  const parts = json && Array.isArray(json.content) ? json.content : [];\n  return parts\n    .map(function (p) { return p && typeof p.text === 'string' ? p.text : ''; })\n    .join(' ')\n    .replace(/\\s+/g, ' ')\n    .trim();\n}\n\n/** The error Higgsfield or the MCP step gave, as text, or ''. */\nfunction errorOf(json) {\n  if (!json || typeof json !== 'object' || !json.error) return '';\n  const e = json.error;\n  const message = typeof e === 'string' ? e : e.message || e.description || JSON.stringify(e);\n  return String(message).replace(/\\s+/g, ' ').trim().slice(0, 400);\n}\n\n/** n8n could not reach Higgsfield: the step handed on what it was given. */\nfunction notReached(json, own) {\n  if (!json || typeof json !== 'object') return true;\n  if (json.structuredContent || json.content || json.error) return false;\n  return Object.prototype.hasOwnProperty.call(json, own);\n}\n\n/**\n * Higgsfield's offer of one of its presets in place of the prompt (\"This\n * prompt looks like the Higgsfield preset … generate literally\"), which comes\n * instead of a price or a job: nothing was priced or made. Its id and name,\n * or null. Seen on every video prompt tried on 2026-10-20, never on a picture.\n */\nfunction presetNotice(json) {\n  const answer = answerOf(json);\n  const notice = answer && answer.notice;\n  if (notice && typeof notice === 'object' && notice.type === 'preset_recommendation') {\n    const data = notice.data && typeof notice.data === 'object' ? notice.data : {};\n    const preset = data.preset && typeof data.preset === 'object' ? data.preset : {};\n    const id = (data.retry_literal_with && data.retry_literal_with.declined_preset_id) || preset.id || '';\n    return { id: String(id), name: typeof preset.name === 'string' ? preset.name : '' };\n  }\n  const words = wordsOf(json);\n  const said = words.match(/declined_preset_id:?\\s*\"?([A-Za-z0-9-]{8,})/);\n  if (!said) return null;\n  const name = words.match(/preset \"([^\"]+)\"/);\n  return { id: said[1], name: name ? name[1] : '' };\n}\n\n/** What the team is told when Higgsfield offered a preset again after it was declined. */\nfunction presetSaid(preset) {\n  return 'Higgsfield offered its preset' + (preset.name ? ' \"' + preset.name + '\"' : '') + ' in place of the prompt as written';\n}\n\n/** A refusal that means nothing was made (the request, the model, the credits, the content). */\nfunction isRefusal(message) {\n  return /input validation error|invalid request|invalid arguments|unknown model|not enough credits|insufficient|top up|balance is|out of credits|nsfw|moderation|content policy|not allowed|prohibited|rejected/i.test(message);\n}\n\n/** The first string found under any of these keys, at any depth. */\nfunction findString(value, keys, depth) {\n  if (depth > 5 || value === null || typeof value !== 'object') return '';\n  const list = Array.isArray(value) ? value : [value];\n  for (let i = 0; i < list.length; i++) {\n    const v = list[i];\n    if (!v || typeof v !== 'object') continue;\n    if (!Array.isArray(v)) {\n      for (let k = 0; k < keys.length; k++) {\n        const found = v[keys[k]];\n        if (typeof found === 'string' && found.trim()) return found.trim();\n        if (typeof found === 'number') return String(found);\n      }\n    }\n    const inner = Array.isArray(v) ? v : Object.keys(v).map(function (key) { return v[key]; });\n    for (let j = 0; j < inner.length; j++) {\n      const got = findString(inner[j], keys, depth + 1);\n      if (got) return got;\n    }\n  }\n  return '';\n}\n\n/**\n * Credits in an answer: { cost: { credits, credits_exact } }, { credits } or\n * { cost }. Higgsfield can quote two figures that differ (a picture at\n * \"1 credit (0.5 exact)\"), and which one the plan is charged is not said, so\n * the higher counts: the month's limit is never under-counted.\n */\nfunction creditsOf(answer) {\n  const cost = answer && answer.cost;\n  const read = function (n) {\n    const value = typeof n === 'string' ? parseFloat(n) : n;\n    return typeof value === 'number' && isFinite(value) && value >= 0 ? value : null;\n  };\n  const figures = (cost && typeof cost === 'object' ? [cost.credits, cost.credits_exact] : [cost != null ? cost : answer && answer.credits]).map(read).filter(function (n) {\n    return n !== null;\n  });\n  return figures.length ? Math.max.apply(null, figures) : null;\n}\n\n/** How a job stands, by Higgsfield's own words for it. */\nconst JOB_DONE = /^(completed|complete|succeeded|success|done|finished|ready)$/;\nconst JOB_FAILED = /^(failed|failure|error|errored|canceled|cancelled|nsfw|rejected|expired|ip_detected|blocked|moderated|submission_failed)$/;\n\n/** A job's status, lower case, or ''. */\nfunction jobStatus(answer) {\n  return (findString(answer, ['status', 'state'], 0) || '').toLowerCase();\n}\n\n/**\n * The links to what a job made, its rawUrl first. Never one from params,\n * where Higgsfield echoes the request with the pictures it was given (a\n * reference's link would pass for the result: it did on 2026-10-21), nor the\n * small minUrl preview.\n */\nfunction madeLinks(answer) {\n  const raw = [];\n  const rest = [];\n  (function walk(value, key, depth) {\n    if (depth > 6 || value === null || value === undefined || key === 'params' || key === 'minUrl') return;\n    if (typeof value === 'string') {\n      if (/^https:\\/\\/\\S+$/.test(value)) (key === 'rawUrl' ? raw : rest).push(value);\n      return;\n    }\n    if (Array.isArray(value)) value.forEach(function (v) { walk(v, key, depth + 1); });\n    else if (typeof value === 'object') Object.keys(value).forEach(function (k) { walk(value[k], k, depth + 1); });\n  })(answer, '', 0);\n  return raw.concat(rest);\n}\n\n/** Why a job failed, as plainly as Higgsfield says it. */\nfunction jobReason(status, answer, json) {\n  if (status === 'ip_detected') return 'Higgsfield held it back: it may show protected material. If the team has the rights, reveal it on Higgsfield.';\n  if (status === 'nsfw' || status === 'moderated' || status === 'blocked') return 'Higgsfield\\'s safety check stopped it: change the prompt and ask again.';\n  const said = findString(answer, ['error', 'message', 'reason', 'detail'], 0) || wordsOf(json);\n  return 'Higgsfield could not make it (' + status + ')' + (said ? ': ' + said.slice(0, 200) : '.');\n}\n\n// How each picture's job is going, read from Higgsfield's job_status:\n//   done     -> the picture's link, to fetch and store\n//   failed   -> why, as plainly as Higgsfield says it\n//   waiting  -> nothing yet: checked again at the next run\n// A job Higgsfield no longer knows is left to a person (unknown).\n\n/** The picture's own link: one ending as a picture does, else the first it made. */\nfunction pictureLink(answer) {\n  const all = madeLinks(answer);\n  return all.filter(function (u) { return /\\.(png|jpe?g|webp)(\\?|$)/i.test(u); })[0] || all[0] || '';\n}\n\nreturn $input.all().map(function (item, i) {\n  const job = $('One item per job').itemMatching(i).json;\n  const json = item.json;\n  if (notReached(json, 'job_id')) return { json: { kind: 'waiting', id: job.id } };\n  const error = errorOf(json);\n  if (error) {\n    return { json: /not found|unknown job|no such job|does not exist/i.test(error) ? { kind: 'unknown', id: job.id, error: 'Higgsfield no longer knows this picture\\'s job: ' + error } : { kind: 'waiting', id: job.id } };\n  }\n  const answer = answerOf(json);\n  const status = jobStatus(answer);\n  if (JOB_DONE.test(status)) {\n    const url = pictureLink(answer);\n    if (!url) return { json: { kind: 'unknown', id: job.id, error: 'Higgsfield says the picture is made but gave no link to it: find it in Higgsfield\\'s history.' } };\n    return { json: { kind: 'done', id: job.id, path: job.path, url: url } };\n  }\n  if (JOB_FAILED.test(status)) return { json: { kind: 'failed', id: job.id, error: jobReason(status, answer, json) } };\n  return { json: { kind: 'waiting', id: job.id } };\n});\n" },
  },
  output: [{ kind: 'done', id: 'sent-id', path: 'pictures/variant-id/picture-id.png', url: 'https://cdn.higgsfield.ai/job-id/image.png' }],
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
    name: "Fetch the picture",
    onError: 'continueRegularOutput',
    parameters: {
      method: 'GET',
      url: expr('{{ $json.url }}'),
      options: { timeout: 60000, response: { response: { responseFormat: 'file', outputPropertyName: 'data' } } },
    },
  },
  output: [{}],
});

const readFile = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: "Read the file",
    parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: "// The picture Higgsfield made, as fetched: its kind from the file's type, or\n// else from its link's ending, and the path given that extension; the file is\n// handed on to be uploaded. Anything but a PNG, JPEG or WebP is refused (the\n// bucket takes nothing else). A fetch that failed is tried again at the next\n// check: Higgsfield keeps the picture meanwhile.\nconst EXTENSIONS = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/webp': 'webp' };\nconst BY_ENDING = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp' };\n\nreturn $input.all().map(function (item, i) {\n  const done = $(\"Read the picture's job\").itemMatching(i).json;\n  const file = item.binary && item.binary.data;\n  if (!file) return { json: { kind: 'retry', id: done.id } };\n  let mime = String(file.mimeType || '').split(';')[0].trim().toLowerCase();\n  if (!EXTENSIONS[mime]) {\n    const ending = /\\.(png|jpe?g|webp)(\\?|$)/i.exec(String(done.url || ''));\n    if (ending) mime = BY_ENDING[ending[1].toLowerCase()];\n  }\n  const extension = EXTENSIONS[mime];\n  if (!extension) {\n    return { json: { kind: 'failed', id: done.id, error: 'Higgsfield answered with something that is not a PNG, JPEG or WebP picture (' + (mime || 'no type') + ').' } };\n  }\n  const path = String(done.path).replace(/\\.(png|jpg|webp)$/, '.' + extension);\n  return { json: { kind: 'picture', id: done.id, path: path, mime: mime }, binary: item.binary };\n});\n" },
  },
  output: [{ kind: 'picture', id: 'sent-id', path: 'pictures/variant-id/picture-id.png', mime: 'image/png' }],
});

const aPicture = switchCase({
  version: 3.4,
  config: {
    name: "A picture?",
    parameters: {
      mode: 'rules',
      rules: {
        values: [
          { outputKey: 'picture', conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 2 }, conditions: [{ leftValue: expr("{{ $json.kind === \"picture\" }}"), rightValue: true, operator: { type: 'boolean', operation: 'true', singleValue: true } }], combinator: 'and' } },
          { outputKey: 'failed', conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 2 }, conditions: [{ leftValue: expr("{{ $json.kind === \"failed\" }}"), rightValue: true, operator: { type: 'boolean', operation: 'true', singleValue: true } }], combinator: 'and' } },
        ],
      },
      options: {},
    },
  },
});

const store = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: {
    name: "Store the picture",
    onError: 'continueRegularOutput',
    parameters: {
      method: 'POST',
      url: expr('https://tcinsdexwvzpznqlcpww.supabase.co/storage/v1/object/ad-pictures/{{ $json.path }}'),
      authentication: 'predefinedCredentialType',
      nodeCredentialType: 'supabaseApi',
      sendHeaders: true,
      headerParameters: { parameters: [{ name: 'Content-Type', value: expr('{{ $json.mime }}') }, { name: 'x-upsert', value: 'true' }] },
      sendBody: true,
      contentType: 'binaryData',
      inputDataFieldName: 'data',
      options: { timeout: 60000, response: { response: { fullResponse: true, neverError: true } } },
    },
    credentials: { supabaseApi: newCredential('Supabase QGR') },
  },
  output: [{ statusCode: 200, body: { Key: 'ad-pictures/pictures/variant-id/picture-id.png' } }],
});

const stored = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: "Stored?",
    parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: "// Storage's answer to the upload of what Higgsfield made (a video, or a\n// picture): in the bucket at its path, to be recorded; or not yet, and the\n// job is asked about again at the next check, when its file is fetched and\n// stored again (Higgsfield keeps it meanwhile).\nreturn $input.all().map(function (item, i) {\n  const done = $('Read the file').itemMatching(i).json;\n  const res = item.json || {};\n  if (res.statusCode >= 200 && res.statusCode < 300) return { json: { kind: 'stored', id: done.id, path: done.path } };\n  return { json: { kind: 'not_stored', id: done.id, error: 'Made, but not stored yet (' + (res.statusCode || 'no answer') + ')' } };\n});\n" },
  },
  output: [{ kind: 'stored', id: 'sent-id', path: 'pictures/variant-id/picture-id.png' }],
});

const inStorage = ifElse({
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

const recordHiggsfield = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: {
    name: "Record the Higgsfield picture",
    onError: 'continueRegularOutput',
    parameters: {
      method: 'POST',
      url: 'https://tcinsdexwvzpznqlcpww.supabase.co/rest/v1/rpc/picture_higgsfield_finish',
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
  output: [{ remove_picture: null }],
});

const realPictures = ifElse({
  version: 2.3,
  config: {
    name: 'Real pictures?',
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 2 },
        conditions: [{ leftValue: expr('{{ $json.model === "cloudflare" && /^[0-9a-f]{32}$/.test($json.account || "") }}'), rightValue: true, operator: { type: 'boolean', operation: 'true', singleValue: true } }],
        combinator: 'and',
      },
    },
  },
});

const writePrompt = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: "Write the prompt",
    parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: "// Shared by the scripts that ask an image model for a picture (joined in\n// front of each): what it is asked to draw, for each ask. The scene (a\n// person's prompt in the studio, or the Content Agent's), then how it should\n// look (a real photograph of real-looking people, as the team asked on\n// 2026-10-22), the brand's picture style from brand memory, a line on the\n// run's reference pictures when Higgsfield is given some, then the rules\n// every picture keeps: no words (the ad's words go over the picture), people\n// who are made up rather than anyone real or famous, and the flag and props\n// the team allowed (2026-10-22) with no writing on them. Cloudflare's\n// FLUX takes 2,048 characters at most; Higgsfield's GPT Image far more, so\n// its scripts pass HIGGSFIELD_PROMPT_MAX. The scene is shortened first, at a\n// word, then a long picture style; the rules never are.\nconst PROMPT_MAX = 2048;\nconst HIGGSFIELD_PROMPT_MAX = 6000;\nconst PHOTO_LOOK = 'A real photograph, as a documentary or lifestyle photographer would take it: natural light, real skin, hands and textures, candid and unposed, honest emotion. Not an illustration, a 3D render or a stock-photo pose.';\nconst PICTURE_RULES = 'No readable text, letters, numbers, logos or watermarks anywhere, on signs, books or documents either. Everyone shown is a made-up person: never a real, famous or recognisable one. A U.S. flag or quiet props such as passports, a folder or a gavel may appear, with no writing on them; never a green card or visa held up as approved, never money.';\nconst SCENE_MIN = 300;\n\nconst REFERENCES_RULE = 'Use the reference pictures given for what they show: the real place, product or look to keep to.';\n\nfunction atWord(text, room) {\n  if (text.length <= room) return text;\n  let cut = text.slice(0, Math.max(0, room));\n  const space = cut.lastIndexOf(' ');\n  if (space > room * 0.6) cut = cut.slice(0, space);\n  return cut;\n}\n\nfunction picturePrompt(ask, max) {\n  const limit = max || PROMPT_MAX;\n  const references = Array.isArray(ask.references) && ask.references.length > 0 ? ' ' + REFERENCES_RULE : '';\n  const fixed = ' ' + PHOTO_LOOK + references + ' ' + PICTURE_RULES;\n  let look = String(ask.look || '').trim().replace(/\\s+/g, ' ');\n  const lookRoom = limit - fixed.length - SCENE_MIN - ' Picture style: .'.length;\n  if (look.length > lookRoom) look = atWord(look, lookRoom);\n  const styled = look ? ' Picture style: ' + look + (/[.!?]$/.test(look) ? '' : '.') : '';\n  const tail = ' ' + PHOTO_LOOK + styled + references + ' ' + PICTURE_RULES;\n  let scene = atWord(String(ask.prompt || '').trim().replace(/\\s+/g, ' '), limit - tail.length - 1);\n  if (!/[.!?]$/.test(scene)) scene += '.';\n  return scene + tail;\n}\n\n// Higgsfield's GPT Image 2.5, as the team's quality asks: square at 1k (one\n// picture serves Meta's square and LinkedIn's wide frame, cropped about its\n// middle, as Cloudflare's does), low quality unless the team chose more.\nconst HIGGSFIELD_PICTURE_MODEL = 'gpt_image_2_5';\nconst HIGGSFIELD_QUALITIES = ['low', 'medium', 'high'];\n\n// The run's reference pictures, as Higgsfield keeps them (their media ids),\n// go with the picture as image_references; they do not change its price.\nfunction higgsfieldPictureParams(prompt, quality, references) {\n  const params = {\n    model: HIGGSFIELD_PICTURE_MODEL,\n    prompt: prompt,\n    aspect_ratio: '1:1',\n    resolution: '1k',\n    quality: HIGGSFIELD_QUALITIES.indexOf(quality) >= 0 ? quality : 'low',\n  };\n  const ids = (Array.isArray(references) ? references : []).filter(function (id) { return typeof id === 'string' && id; });\n  if (ids.length > 0) params.medias = ids.map(function (id) { return { role: 'image_references', value: id }; });\n  return params;\n}\n\n// What Cloudflare's FLUX.1 schnell is asked to draw, for each ask: the\n// picture's words (picturePrompt, joined in front), on the account the team\n// named in Settings.\nconst MODEL = '@cf/black-forest-labs/flux-1-schnell';\n\nreturn $input.all().map(function (item) {\n  const ask = item.json;\n  return {\n    json: {\n      variant_id: ask.variant_id,\n      label: ask.label,\n      path: ask.path,\n      url: 'https://api.cloudflare.com/client/v4/accounts/' + ask.account + '/ai/run/' + MODEL,\n      body: { prompt: picturePrompt(ask) },\n    },\n  };\n});\n" },
  },
  output: [{ variant_id: 'variant-id', label: 'A', path: 'pictures/variant-id/picture-id.png', url: 'https://api.cloudflare.com/client/v4/accounts/account-id/ai/run/@cf/black-forest-labs/flux-1-schnell', body: { prompt: 'A calm skyline at dusk.' } }],
});

// The token is the "Cloudflare Workers AI" credential (Bearer Auth), attached
// here by hand once it exists in n8n: a node naming a credential that does not
// exist fails every run, the stand-in's too.
const cloudflare = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: {
    name: 'Cloudflare: FLUX.1 schnell',
    onError: 'continueRegularOutput',
    parameters: {
      method: 'POST',
      url: expr('{{ $json.url }}'),
      authentication: 'genericCredentialType',
      genericAuthType: 'httpBearerAuth',
      sendBody: true,
      contentType: 'json',
      specifyBody: 'json',
      jsonBody: expr('{{ JSON.stringify($json.body) }}'),
      options: { timeout: 120000, response: { response: { fullResponse: true, neverError: true } } },
    },
  },
  output: [{ statusCode: 200, body: { success: true, result: { image: '/9j/4AAQSkZJRgABAQAAAQABAAD/2Q==' } } }],
});

const readPicture = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: "Read the picture",
    parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: "// Cloudflare's answer for each ask: the picture as base64 (FLUX.1 schnell\n// answers a JPEG), or why there is none, in words the studio can show. What\n// kind of file it is comes from its first bytes, never from an assumption,\n// and the path takes that extension; anything but a JPEG, PNG or WebP under\n// the bucket's 10 MB is refused here. A step that did not run at all (its\n// credential is missing) hands its input on unchanged, and says so too.\nconst MAX_BYTES = 10 * 1024 * 1024;\nconst ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';\nconst KINDS = [\n  { ext: 'jpg', mime: 'image/jpeg', test: function (b) { return b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff; } },\n  { ext: 'png', mime: 'image/png', test: function (b) { return b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47; } },\n  {\n    ext: 'webp',\n    mime: 'image/webp',\n    test: function (b) {\n      return b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50;\n    },\n  },\n];\n\n/** The first bytes of a base64 string: n8n's Code node has no Buffer or atob. */\nfunction firstBytes(b64, n) {\n  const out = [];\n  let buf = 0;\n  let bits = 0;\n  for (let i = 0; i < b64.length && out.length < n; i += 1) {\n    const v = ALPHABET.indexOf(b64[i]);\n    if (v < 0) break;\n    buf = ((buf << 6) | v) & 0xffffff;\n    bits += 6;\n    if (bits >= 8) {\n      bits -= 8;\n      out.push((buf >> bits) & 0xff);\n    }\n  }\n  return out;\n}\n\n/** Cloudflare's own words for a refusal, made plain where the reason is a known one. */\nfunction why(status, body) {\n  const first = body && Array.isArray(body.errors) && body.errors[0] ? body.errors[0] : {};\n  const said = String(first.message || (body && body.message) || '').slice(0, 300);\n  if (first.code === 4006 || /daily free allocation/i.test(said)) {\n    return \"Cloudflare's free pictures for today are used up (10,000 neurons a day). They come back at 00:00 UTC.\";\n  }\n  if (status === 401 || status === 403 || first.code === 10000) {\n    return 'Cloudflare refused the API token. Check the \"Cloudflare Workers AI\" credential in n8n: a token made from the Workers AI template.';\n  }\n  if (status === 404 || first.code === 7003) {\n    return 'Cloudflare has no account with that ID. Check the account ID in Settings, Agents.';\n  }\n  if (status === 429) return 'Cloudflare is busy (429). Ask for the picture again in a minute.';\n  return 'Cloudflare could not make the picture (' + (status || 'no answer') + ')' + (said ? ': ' + said : '.');\n}\n\nreturn $input.all().map(function (item, i) {\n  const ask = $('Write the prompt').itemMatching(i).json;\n  const res = item.json || {};\n  const fail = function (error) {\n    return { json: { ok: false, variant_id: ask.variant_id, error: error } };\n  };\n  if (res.error) {\n    const said = typeof res.error === 'string' ? res.error : res.error.message || res.error.description || 'the request failed';\n    return fail('Cloudflare could not be asked: ' + String(said).slice(0, 300));\n  }\n  // A full response always has its status; the step's own input never does.\n  if (res.statusCode === undefined) {\n    return fail('The Cloudflare step did not run. In n8n, attach the \"Cloudflare Workers AI\" credential (Bearer Auth, holding the API token) to it.');\n  }\n  const body = res.body && typeof res.body === 'object' ? res.body : null;\n  if (res.statusCode !== 200 || !body || body.success === false) return fail(why(res.statusCode, body));\n\n  let image = body.result && typeof body.result.image === 'string' ? body.result.image : '';\n  image = image.replace(/^data:[^,]*,/, '').replace(/\\s+/g, '');\n  if (!image) return fail('Cloudflare answered without a picture.');\n  const bytes = Math.floor((image.length * 3) / 4);\n  if (bytes > MAX_BYTES) return fail('The picture is over 10 MB, more than Storage keeps.');\n  const head = firstBytes(image, 12);\n  const kind = KINDS.find(function (k) {\n    return k.test(head);\n  });\n  if (!kind) return fail('Cloudflare answered with something that is not a JPEG, PNG or WebP picture.');\n  const path = String(ask.path).replace(/\\.(png|jpg|webp)$/, '.' + kind.ext);\n  return {\n    json: {\n      ok: true,\n      variant_id: ask.variant_id,\n      path: path,\n      mime: kind.mime,\n      file: path.split('/').pop(),\n      image: image,\n    },\n  };\n});\n" },
  },
  output: [{ ok: true, variant_id: 'variant-id', path: 'pictures/variant-id/picture-id.jpg', mime: 'image/jpeg', file: 'picture-id.jpg', image: '/9j/4AAQSkZJRgABAQAAAQABAAD/2Q==' }],
});

const gotPicture = ifElse({
  version: 2.3,
  config: {
    name: "Got a picture?",
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 },
        conditions: [{ leftValue: expr('{{ $json.ok }}'), rightValue: true, operator: { type: 'boolean', operation: 'true', singleValue: true } }],
        combinator: 'and',
      },
    },
  },
});

const toFile = node({
  type: 'n8n-nodes-base.convertToFile',
  version: 1.1,
  config: {
    name: 'To a file',
    parameters: {
      operation: 'toBinary',
      sourceProperty: 'image',
      options: { mimeType: expr('{{ $json.mime }}'), fileName: expr('{{ $json.file }}') },
    },
  },
  output: [{}],
});

const upload = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: {
    name: 'Upload to Storage',
    onError: 'continueRegularOutput',
    parameters: {
      method: 'POST',
      url: expr('https://tcinsdexwvzpznqlcpww.supabase.co/storage/v1/object/ad-pictures/{{ $("Read the picture").item.json.path }}'),
      authentication: 'predefinedCredentialType',
      nodeCredentialType: 'supabaseApi',
      sendBody: true,
      contentType: 'binaryData',
      inputDataFieldName: 'data',
      options: { timeout: 60000, response: { response: { fullResponse: true, neverError: true } } },
    },
    credentials: { supabaseApi: newCredential('Supabase QGR') },
  },
  output: [{ statusCode: 200, body: { Key: 'ad-pictures/pictures/variant-id/picture-id.jpg' } }],
});

const uploaded = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: "Uploaded",
    parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: "// Storage's answer to each upload, matched to the picture it carried: the\n// picture is in the bucket at its path, to be recorded, or the reason it is\n// not. Answered in the shape the stand-in documents.\nreturn $input.all().map(function (item, i) {\n  const made = $('Read the picture').itemMatching(i).json;\n  const res = item.json || {};\n  if (res.statusCode >= 200 && res.statusCode < 300) {\n    return { json: { ok: true, variant_id: made.variant_id, path: made.path, stand_in: false } };\n  }\n  const body = res.body && typeof res.body === 'object' ? res.body : {};\n  const err = res.error && typeof res.error === 'object' ? res.error.message : res.error;\n  const said = String(body.message || body.error || err || 'no answer').slice(0, 200);\n  return {\n    json: {\n      ok: false,\n      variant_id: made.variant_id,\n      error: 'The picture was made but could not be stored (' + (res.statusCode || 'no answer') + '): ' + said,\n    },\n  };\n});\n" },
  },
  output: [{ ok: true, variant_id: 'variant-id', path: 'pictures/variant-id/picture-id.jpg', stand_in: false }],
});

const finish = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: {
    name: "Record the picture",
    onError: 'continueRegularOutput',
    parameters: {
      method: 'POST',
      url: 'https://tcinsdexwvzpznqlcpww.supabase.co/rest/v1/rpc/picture_finish',
      authentication: 'predefinedCredentialType',
      nodeCredentialType: 'supabaseApi',
      sendBody: true,
      contentType: 'json',
      specifyBody: 'json',
      jsonBody: expr("{{ JSON.stringify({ p_variant_id: $json.variant_id, p_path: $json.path, p_stand_in: $json.stand_in === true }) }}"),
      options: { timeout: 30000 },
    },
    credentials: { supabaseApi: newCredential('Supabase QGR') },
  },
  output: [{ remove_picture: null }],
});

const fail = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: {
    name: "Record why not",
    onError: 'continueRegularOutput',
    parameters: {
      method: 'POST',
      url: 'https://tcinsdexwvzpznqlcpww.supabase.co/rest/v1/rpc/picture_fail',
      authentication: 'predefinedCredentialType',
      nodeCredentialType: 'supabaseApi',
      sendBody: true,
      contentType: 'json',
      specifyBody: 'json',
      jsonBody: expr("{{ JSON.stringify({ p_variant_id: $json.variant_id, p_error: $json.error }) }}"),
      options: { timeout: 30000 },
    },
    credentials: { supabaseApi: newCredential('Supabase QGR') },
  },
  output: [{}],
});

const pictureToRemove = ifElse({
  version: 2.3,
  config: {
    name: 'A picture no variant shows?',
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 2 },
        conditions: [{ leftValue: expr('{{ $json.remove_picture }}'), rightValue: '', operator: { type: 'string', operation: 'notEmpty', singleValue: true } }],
        combinator: 'and',
      },
    },
  },
});

const removePicture = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: {
    name: 'Remove it from Storage',
    onError: 'continueRegularOutput',
    parameters: {
      method: 'DELETE',
      url: 'https://tcinsdexwvzpznqlcpww.supabase.co/storage/v1/object/ad-pictures',
      authentication: 'predefinedCredentialType',
      nodeCredentialType: 'supabaseApi',
      sendBody: true,
      contentType: 'json',
      specifyBody: 'json',
      jsonBody: expr('{{ JSON.stringify({ prefixes: [$json.remove_picture] }) }}'),
      options: { timeout: 30000 },
    },
    credentials: { supabaseApi: newCredential('Supabase QGR') },
  },
  output: [{}],
});

const noteFlow = sticky('## Pictures\nAt once when someone asks in the studio, and every minute for the ads that asked by themselves (the team\'s switch in Settings, Agents), the database hands over the ads waiting for a picture (**picture_take_due**, claimed so two runs never make the same one; a claim lost for ten minutes is taken again, three times at most), each with its prompt, the brand\'s picture style, the team\'s image model and quality, and the path to upload to. The answer is recorded (**picture_finish** or **picture_fail**): the studio shows the picture under the ad\'s words and keeps it with the variant\'s others to choose again, and takes an approval back, since the ad changed. Past the eight a variant keeps, the oldest it does not show is removed from Storage.', [everyMinute, makeNow, takeDue, eachAsk], { color: 4 });
const noteHiggsfield = sticky('## Higgsfield\nWith pictures set to Higgsfield in Settings, Agents, each ask goes to **GPT Image 2.5** (square, 1k, the team\'s quality) through Higgsfield\'s MCP with the **Higgsfield** credential, signed in with the team\'s own account: every picture spends the plan\'s credits. Its price is asked first (**get_cost**, which makes nothing) and recorded against the month\'s Higgsfield limit (**picture_higgsfield_begin**, shared with AI video); past the limit nothing is sent and the studio says why.\n\nA picture is sent once. Not reached at all, it waits for the next minute (three tries). Refused, nothing was made. Any other trouble after sending is **unknown**: never sent again by itself, a person checks Higgsfield\'s history. Jobs are checked every minute (**picture_take_making**); a finished one\'s file is fetched, typed by what it is, stored in ad-pictures and recorded (**picture_higgsfield_finish**).', [onHiggsfield, higgsRequest, higgsPricePicture, readPicturePrice, priced, begin, begun, releaseAsk, pictureRequest, makePicture, readStart, whatHappened, takeMaking, eachJob, jobStatus, readJob, howIsItGoing, download, readFile, aPicture, store, stored, inStorage, recordHiggsfield], { color: 6 });
const noteReferences = sticky('## Reference pictures\nA run can carry up to four reference pictures the team uploaded (bucket **run-refs**). Every minute the database hands over those Higgsfield does not have yet (**reference_take_due**, claimed so two runs never take the same one; three tries at most). Each is signed for 15 minutes and given to Higgsfield (**media_import_url**, which costs nothing), and its media id is kept (**reference_ready**). Every picture and video of the run then goes with those ids as image_references; a run\'s pictures and videos wait until its references are in. Refused, the run goes on without that one and says why (**reference_failed**); not reached, it is taken again (**reference_release**).', [takeRefs, eachRef, signRef, refLink, refLinked, importRef, readRef, refOutcome, refReady, refFailed, refRetry], { color: 2 });
const notePrice = sticky('## Price\nSettings and the studio ask what one picture costs at a quality before any is made: **generate_image** with **get_cost**, which makes nothing, and the credits left on the plan.', [priceIt, priceRequest, higgsPrice, readPrice, higgsBalance, answer, respond], { color: 7 });
const noteCloudflare = sticky('## Cloudflare Workers AI\nWith pictures set to Cloudflare in Settings, Agents (with the account ID there), each ask goes to **FLUX.1 schnell**: the scene, the brand\'s picture style from brand memory, and the rules (no words, no real people, no flags), 2,048 characters at most. The picture is read by its bytes, uploaded to ad-pictures with the **Supabase QGR** credential, and recorded.\n\nThe token: create a **Bearer Auth** credential named **Cloudflare Workers AI** holding an API token made from Cloudflare\'s Workers AI template, then attach it to **Cloudflare: FLUX.1 schnell**. Until then that step does not run and the studio says why.\n\nFree: 10,000 neurons a day, about 170 pictures at 1024×1024. On Cloudflare\'s free plan nothing is charged: past that a picture fails and says so until 00:00 UTC.', [realPictures, writePrompt, cloudflare, readPicture, gotPicture, toFile, upload, uploaded], { color: 5 });
const noteStandIn = sticky('## Stand-in\nThe way taken while pictures are set to the stand-in (Settings, Agents). It makes nothing and says so: the studio says no picture was made, and the variant keeps what it shows. Its output is the shape the real way answers in: { ok: true, variant_id, path, stand_in }, or { ok: false, variant_id, error }.', [imageModel], { color: 3 });

export default workflow('qgr-pictures', 'QGR · Pictures')
  .add(priceIt)
  .to(priceRequest)
  .to(higgsPrice)
  .to(readPrice)
  .to(higgsBalance)
  .to(answer)
  .to(respond)
  .add(everyMinute)
  .to(takeDue)
  .add(makeNow)
  .to(takeDue)
  .add(takeDue)
  .to(eachAsk)
  .to(onHiggsfield.onTrue(higgsRequest).onFalse(realPictures.onTrue(writePrompt.to(cloudflare).to(readPicture).to(gotPicture.onTrue(toFile.to(upload).to(uploaded).to(made)).onFalse(made))).onFalse(imageModel)))
  .add(higgsRequest)
  .to(higgsPricePicture)
  .to(readPicturePrice)
  .to(priced.onCase(0, begin.to(begun.onTrue(pictureRequest.to(makePicture).to(readStart)))).onCase(1, releaseAsk).onCase(2, fail))
  .add(readStart)
  .to(whatHappened.onCase(0, recordStarted).onCase(1, recordNotMade).onCase(2, recordRetry).onCase(3, recordUnknown))
  .add(imageModel)
  .to(made.onTrue(finish.to(pictureToRemove.onTrue(removePicture))).onFalse(fail))
  .add(everyMinute)
  .to(takeRefs)
  .add(makeNow)
  .to(takeRefs)
  .add(takeRefs)
  .to(eachRef)
  .to(signRef)
  .to(refLink)
  .to(refLinked.onTrue(importRef.to(readRef).to(refOutcome.onCase(0, refReady).onCase(1, refFailed).onCase(2, refRetry))).onFalse(refRetry))
  .add(everyMinute)
  .to(takeMaking)
  .add(makeNow)
  .to(takeMaking)
  .add(takeMaking)
  .to(eachJob)
  .to(jobStatus)
  .to(readJob)
  .to(howIsItGoing.onCase(0, download.to(readFile).to(aPicture.onCase(0, store.to(stored).to(inStorage.onTrue(recordHiggsfield.to(pictureToRemove)))).onCase(1, recordNotMade))).onCase(1, recordNotMade).onCase(2, recordUnknown))
  .add(noteFlow)
  .add(noteHiggsfield)
  .add(noteReferences)
  .add(notePrice)
  .add(noteCloudflare)
  .add(noteStandIn);
