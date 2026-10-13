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
  output: [{ variant_id: 'variant-id', label: 'A', prompt: 'A calm skyline at dusk, indigo and gold. No words, no people, no flags.', style: 'arcs', look: 'Warm natural light, indigo and gold accents.', model: 'stand-in', account: null, path: 'pictures/variant-id/picture-id.png' }],
});

const eachAsk = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: "One item per picture",
    parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: "// The rows a database function returned, one item each. n8n turns a JSON\n// array answer into items by itself; this also takes one item holding the\n// whole array, so the next node sees the same either way. Nothing due means\n// no items, and the rest of the workflow does not run.\nconst out = [];\n$input.all().forEach(function (item) {\n  const json = item.json;\n  let rows = [];\n  if (Array.isArray(json)) rows = json;\n  else if (json && Array.isArray(json.data)) rows = json.data;\n  else if (json && typeof json === 'object' && Object.keys(json).length > 0) rows = [json];\n  rows.forEach(function (row) {\n    if (row && typeof row === 'object') out.push({ json: row });\n  });\n});\nreturn out;\n" },
  },
  output: [{ variant_id: 'variant-id', label: 'A', prompt: 'A calm skyline at dusk, indigo and gold. No words, no people, no flags.', style: 'arcs', look: 'Warm natural light, indigo and gold accents.', model: 'stand-in', account: null, path: 'pictures/variant-id/picture-id.png' }],
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
    parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: "// What Cloudflare's FLUX.1 schnell is asked to draw, for each ask: the scene\n// (a person's prompt in the studio, or the Content Agent's), then the brand's\n// picture style from brand memory, then the rules every picture keeps: no\n// words (the ad's words go over the picture), no real or identifiable people,\n// no flags. FLUX takes 2,048 characters. The studio keeps a person's prompt to\n// 1,200 and the style is at most 600, so all of it fits; only a longer prompt\n// from the agent is shortened, at a word, and never the style or the rules.\nconst MAX = 2048;\nconst RULES = 'No text, letters, numbers, logos or watermarks anywhere. No real or identifiable people. No flags.';\nconst MODEL = '@cf/black-forest-labs/flux-1-schnell';\n\nreturn $input.all().map(function (item) {\n  const ask = item.json;\n  const look = String(ask.look || '').trim();\n  const tail = (look ? ' Picture style: ' + look + (/[.!?]$/.test(look) ? '' : '.') : '') + ' ' + RULES;\n  let scene = String(ask.prompt || '').trim().replace(/\\s+/g, ' ');\n  const room = MAX - tail.length - 1;\n  if (scene.length > room) {\n    scene = scene.slice(0, room);\n    const cut = scene.lastIndexOf(' ');\n    if (cut > room * 0.6) scene = scene.slice(0, cut);\n  }\n  if (!/[.!?]$/.test(scene)) scene += '.';\n  return {\n    json: {\n      variant_id: ask.variant_id,\n      label: ask.label,\n      path: ask.path,\n      url: 'https://api.cloudflare.com/client/v4/accounts/' + ask.account + '/ai/run/' + MODEL,\n      body: { prompt: scene + tail },\n    },\n  };\n});\n" },
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

const noteFlow = sticky('## Pictures\nAt once when someone asks in the studio, and every five minutes for the ads that asked by themselves (the team\'s switch in Settings, Agents), the database hands over the ads waiting for a picture (**picture_take_due**, claimed so two runs never make the same one; a claim lost for ten minutes is taken again, three times at most), each with its prompt, the brand\'s picture style, the team\'s image model and the path to upload to. The answer is recorded (**picture_finish** or **picture_fail**): the studio shows the picture under the ad\'s words and keeps it with the variant\'s others to choose again, and takes an approval back, since the ad changed. Past the eight a variant keeps, the oldest it does not show is removed from Storage.', [everyFiveMinutes, makeNow, takeDue, eachAsk], { color: 4 });
const noteCloudflare = sticky('## Cloudflare Workers AI\nWith pictures set to Cloudflare in Settings, Agents (with the account ID there), each ask goes to **FLUX.1 schnell**: the scene, the brand\'s picture style from brand memory, and the rules (no words, no real people, no flags), 2,048 characters at most. The picture is read by its bytes, uploaded to ad-pictures with the **Supabase QGR** credential, and recorded.\n\nThe token: create a **Bearer Auth** credential named **Cloudflare Workers AI** holding an API token made from Cloudflare\'s Workers AI template, then attach it to **Cloudflare: FLUX.1 schnell**. Until then that step does not run and the studio says why.\n\nFree: 10,000 neurons a day, about 170 pictures at 1024×1024. On Cloudflare\'s free plan nothing is charged: past that a picture fails and says so until 00:00 UTC.', [realPictures, writePrompt, cloudflare, readPicture, gotPicture, toFile, upload, uploaded], { color: 5 });
const noteStandIn = sticky('## Stand-in\nThe way taken while pictures are set to the stand-in (Settings, Agents). It makes nothing and says so: the studio says no picture was made, and the variant keeps what it shows. Its output is the shape the real way answers in: { ok: true, variant_id, path, stand_in }, or { ok: false, variant_id, error }.', [imageModel], { color: 3 });

export default workflow('qgr-pictures', 'QGR · Pictures')
  .add(everyFiveMinutes)
  .to(takeDue)
  .to(eachAsk)
  .to(realPictures.onTrue(writePrompt.to(cloudflare).to(readPicture).to(gotPicture.onTrue(toFile.to(upload).to(uploaded).to(made)).onFalse(made))).onFalse(imageModel))
  .add(imageModel)
  .to(made.onTrue(finish.to(pictureToRemove.onTrue(removePicture))).onFalse(fail))
  .add(makeNow)
  .to(takeDue)
  .add(noteFlow)
  .add(noteCloudflare)
  .add(noteStandIn);
