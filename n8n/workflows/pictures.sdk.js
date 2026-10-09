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
  output: [{ variant_id: 'variant-id', label: 'A', prompt: 'A calm skyline at dusk, indigo and gold. No words, no people, no flags.', style: 'arcs', path: 'pictures/variant-id/picture-id.png' }],
});

const eachAsk = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: "One item per picture",
    parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: "// The rows a database function returned, one item each. n8n turns a JSON\n// array answer into items by itself; this also takes one item holding the\n// whole array, so the next node sees the same either way. Nothing due means\n// no items, and the rest of the workflow does not run.\nconst out = [];\n$input.all().forEach(function (item) {\n  const json = item.json;\n  let rows = [];\n  if (Array.isArray(json)) rows = json;\n  else if (json && Array.isArray(json.data)) rows = json.data;\n  else if (json && typeof json === 'object' && Object.keys(json).length > 0) rows = [json];\n  rows.forEach(function (row) {\n    if (row && typeof row === 'object') out.push({ json: row });\n  });\n});\nreturn out;\n" },
  },
  output: [{ variant_id: 'variant-id', label: 'A', prompt: 'A calm skyline at dusk, indigo and gold. No words, no people, no flags.', style: 'arcs', path: 'pictures/variant-id/picture-id.png' }],
});

const imageModel = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: "Image model (stand-in)",
    parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: "// STAND-IN for the image model. Nothing is drawn: it answers as the real\n// steps will when no picture could be made, marked stand_in, so the ask ends,\n// the studio says no picture was made and the branded design is drawn as\n// before.\n//\n// To connect an image model (ChatGPT's images API or Higgsfield), replace this\n// node with the real steps (the sticky note beside it lists them): send the\n// item's prompt, upload what comes back to the private bucket ad-pictures at\n// the item's path (a .png path: a model that answers JPEG or WebP uploads to\n// the same path ending .jpg or .webp), and keep the output the same:\n//   { ok: true, variant_id, path, stand_in: false }\n// or, when the model made nothing:\n//   { ok: false, variant_id, error }\nreturn $input.all().map(function (item) {\n  const ask = item.json;\n  return {\n    json: {\n      ok: true,\n      variant_id: ask.variant_id,\n      path: null,\n      stand_in: true,\n    },\n  };\n});\n" },
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

const noteFlow = sticky('## Pictures\nAt once when someone asks in the studio, and every five minutes for the ads that asked by themselves (the team\'s switch in Settings, Agents), the database hands over the ads waiting for a picture (**picture_take_due**, claimed so two runs never make the same one; a claim lost for ten minutes is taken again, three times at most). Each goes to the image model with its prompt and the path to upload to, and the answer is recorded (**picture_finish** or **picture_fail**). The studio shows the picture under the ad\'s words, and takes an approval back, since the ad changed. A picture no variant shows any more is removed from Storage.', [everyFiveMinutes, makeNow, takeDue, eachAsk], { color: 4 });
const noteStandIn = sticky('## Stand-in until the key is in\nThis makes nothing and says so: the studio keeps the drawn design and says no picture was made. To connect an image model (ChatGPT\'s images API or Higgsfield), replace it with steps that keep its output (see the note in its code):\n- send the item\'s **prompt** and take the picture back;\n- upload it with the **Supabase QGR** credential: POST /storage/v1/object/ad-pictures/{path} with its content type (a JPEG or WebP to the same path ending .jpg or .webp);\n- answer { ok: true, variant_id, path }, or { ok: false, variant_id, error } when the model made nothing.', [imageModel], { color: 3 });

export default workflow('qgr-pictures', 'QGR · Pictures')
  .add(everyFiveMinutes)
  .to(takeDue)
  .to(eachAsk)
  .to(imageModel)
  .to(made.onTrue(finish.to(pictureToRemove.onTrue(removePicture))).onFalse(fail))
  .add(makeNow)
  .to(takeDue)
  .add(noteFlow)
  .add(noteStandIn);
