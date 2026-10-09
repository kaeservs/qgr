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

const postNow = trigger({
  type: 'n8n-nodes-base.webhook',
  version: 2.1,
  config: {
    name: 'Post now',
    parameters: {
      httpMethod: 'POST',
      path: 'qgr-publish',
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
    name: "Take the posts that are due",
    executeOnce: true,
    parameters: {
      method: 'POST',
      url: 'https://tcinsdexwvzpznqlcpww.supabase.co/rest/v1/rpc/publisher_take_due',
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
  output: [{ post_id: 'post-id', place: 'facebook', text: 'Plan your EB-5 path.', media_path: 'posts/user/file.jpg', media_kind: 'image', page: { id: '1234567890', name: 'Quantum Global' } }],
});

const eachPlace = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: "One item per place",
    parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: "// The rows a database function returned, one item each. n8n turns a JSON\n// array answer into items by itself; this also takes one item holding the\n// whole array, so the next node sees the same either way. Nothing due means\n// no items, and the rest of the workflow does not run.\nconst out = [];\n$input.all().forEach(function (item) {\n  const json = item.json;\n  let rows = [];\n  if (Array.isArray(json)) rows = json;\n  else if (json && Array.isArray(json.data)) rows = json.data;\n  else if (json && typeof json === 'object' && Object.keys(json).length > 0) rows = [json];\n  rows.forEach(function (row) {\n    if (row && typeof row === 'object') out.push({ json: row });\n  });\n});\nreturn out;\n" },
  },
  output: [{ post_id: 'post-id', place: 'facebook', text: 'Plan your EB-5 path.', media_path: 'posts/user/file.jpg', media_kind: 'image', page: { id: '1234567890', name: 'Quantum Global' } }],
});

const wherePost = switchCase({
  version: 3.4,
  config: {
    name: 'Which place?',
    parameters: {
      mode: 'rules',
      rules: {
        values: [
          { outputKey: 'facebook', conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 }, conditions: [{ leftValue: expr('{{ $json.place }}'), rightValue: 'facebook', operator: { type: 'string', operation: 'equals' } }], combinator: 'and' } },
          { outputKey: 'instagram', conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 }, conditions: [{ leftValue: expr('{{ $json.place }}'), rightValue: 'instagram', operator: { type: 'string', operation: 'equals' } }], combinator: 'and' } },
          { outputKey: 'linkedin', conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 }, conditions: [{ leftValue: expr('{{ $json.place }}'), rightValue: 'linkedin', operator: { type: 'string', operation: 'equals' } }], combinator: 'and' } },
        ],
      },
      options: {},
    },
  },
});

const facebook = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: "Facebook (stand-in)",
    parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: "// STAND-IN for posting to Facebook. Nothing is posted anywhere: it\n// answers as the real step will, so a post can be followed from the\n// dashboard to here and back, and marks the result stand_in so the dashboard\n// says nothing went out.\n//\n// To connect Facebook, replace this node with the real steps (the\n// sticky note beside it lists them), keeping the output the same:\n//   { ok: true, post_id, place, remote_id, remote_url, stand_in: false }\n// or, when it did not go out:\n//   { ok: false, post_id, place, error, unknown }\n// where unknown is true if the post may have gone out anyway (the platform\n// did not answer after it was sent): it is then never sent again by itself.\nreturn $input.all().map(function (item) {\n  const post = item.json;\n  return {\n    json: {\n      ok: true,\n      post_id: post.post_id,\n      place: post.place,\n      remote_id: null,\n      remote_url: null,\n      stand_in: true,\n    },\n  };\n});\n" },
  },
  output: [{ ok: true, post_id: 'post-id', place: 'facebook', remote_id: null, remote_url: null, stand_in: true }],
});

const instagram = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: "Instagram (stand-in)",
    parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: "// STAND-IN for posting to Instagram. Nothing is posted anywhere: it\n// answers as the real step will, so a post can be followed from the\n// dashboard to here and back, and marks the result stand_in so the dashboard\n// says nothing went out.\n//\n// To connect Instagram, replace this node with the real steps (the\n// sticky note beside it lists them), keeping the output the same:\n//   { ok: true, post_id, place, remote_id, remote_url, stand_in: false }\n// or, when it did not go out:\n//   { ok: false, post_id, place, error, unknown }\n// where unknown is true if the post may have gone out anyway (the platform\n// did not answer after it was sent): it is then never sent again by itself.\nreturn $input.all().map(function (item) {\n  const post = item.json;\n  return {\n    json: {\n      ok: true,\n      post_id: post.post_id,\n      place: post.place,\n      remote_id: null,\n      remote_url: null,\n      stand_in: true,\n    },\n  };\n});\n" },
  },
  output: [{ ok: true, post_id: 'post-id', place: 'instagram', remote_id: null, remote_url: null, stand_in: true }],
});

const linkedin = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: "LinkedIn (stand-in)",
    parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: "// STAND-IN for posting to LinkedIn. Nothing is posted anywhere: it\n// answers as the real step will, so a post can be followed from the\n// dashboard to here and back, and marks the result stand_in so the dashboard\n// says nothing went out.\n//\n// To connect LinkedIn, replace this node with the real steps (the\n// sticky note beside it lists them), keeping the output the same:\n//   { ok: true, post_id, place, remote_id, remote_url, stand_in: false }\n// or, when it did not go out:\n//   { ok: false, post_id, place, error, unknown }\n// where unknown is true if the post may have gone out anyway (the platform\n// did not answer after it was sent): it is then never sent again by itself.\nreturn $input.all().map(function (item) {\n  const post = item.json;\n  return {\n    json: {\n      ok: true,\n      post_id: post.post_id,\n      place: post.place,\n      remote_id: null,\n      remote_url: null,\n      stand_in: true,\n    },\n  };\n});\n" },
  },
  output: [{ ok: true, post_id: 'post-id', place: 'linkedin', remote_id: null, remote_url: null, stand_in: true }],
});

const wentOut = ifElse({
  version: 2.3,
  config: {
    name: "Did it go out?",
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
    name: "Record it posted",
    parameters: {
      method: 'POST',
      url: 'https://tcinsdexwvzpznqlcpww.supabase.co/rest/v1/rpc/publisher_finish',
      authentication: 'predefinedCredentialType',
      nodeCredentialType: 'supabaseApi',
      sendBody: true,
      contentType: 'json',
      specifyBody: 'json',
      jsonBody: expr("{{ JSON.stringify({ p_post_id: $json.post_id, p_place: $json.place, p_remote_id: $json.remote_id, p_remote_url: $json.remote_url, p_stand_in: $json.stand_in === true }) }}"),
      options: { timeout: 30000 },
    },
    credentials: { supabaseApi: newCredential('Supabase QGR') },
  },
  output: [{ remove_media: 'posts/user/file.jpg' }],
});

const fail = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: {
    name: "Record why it did not",
    parameters: {
      method: 'POST',
      url: 'https://tcinsdexwvzpznqlcpww.supabase.co/rest/v1/rpc/publisher_fail',
      authentication: 'predefinedCredentialType',
      nodeCredentialType: 'supabaseApi',
      sendBody: true,
      contentType: 'json',
      specifyBody: 'json',
      jsonBody: expr("{{ JSON.stringify({ p_post_id: $json.post_id, p_place: $json.place, p_error: $json.error, p_unknown: $json.unknown === true }) }}"),
      options: { timeout: 30000 },
    },
    credentials: { supabaseApi: newCredential('Supabase QGR') },
  },
  output: [{}],
});

const fileToRemove = ifElse({
  version: 2.3,
  config: {
    name: 'A file no post needs?',
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 2 },
        conditions: [{ leftValue: expr('{{ $json.remove_media }}'), rightValue: '', operator: { type: 'string', operation: 'notEmpty', singleValue: true } }],
        combinator: 'and',
      },
    },
  },
});

const removeFile = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: {
    name: 'Remove the file from Storage',
    onError: 'continueRegularOutput',
    parameters: {
      method: 'DELETE',
      url: 'https://tcinsdexwvzpznqlcpww.supabase.co/storage/v1/object/post-media',
      authentication: 'predefinedCredentialType',
      nodeCredentialType: 'supabaseApi',
      sendBody: true,
      contentType: 'json',
      specifyBody: 'json',
      jsonBody: expr('{{ JSON.stringify({ prefixes: [$json.remove_media] }) }}'),
      options: { timeout: 30000 },
    },
    credentials: { supabaseApi: newCredential('Supabase QGR') },
  },
  output: [{}],
});

const noteFlow = sticky('## Posting\nEvery minute, and at once when the dashboard sends a post now, the database hands over the places that are due (**publisher_take_due**, never the same one twice). Each goes to its place, and the result is recorded. A file goes from Storage once no post needs it: the platform keeps its own copy. A send cut off halfway is marked *check the Page* and never sent again by itself.', [everyMinute, postNow, takeDue, eachPlace], { color: 4 });
const noteStandIns = sticky('## Stand-ins until the keys are in\nThese three post nothing and say so. Each is replaced by real steps with the same output (see the note in its code):\n- **Facebook**: POST /{page-id}/photos (url, message) or /{page-id}/videos (file_url, description) with a Page access token.\n- **Instagram**: POST /{ig-user-id}/media (image_url or video_url with media_type REELS, caption), wait for status FINISHED, then POST /{ig-user-id}/media_publish.\n- **LinkedIn**: initializeUpload on /rest/images or /rest/videos, PUT the file, then POST /rest/posts as urn:li:organization:{id}.\nThe file goes to Meta as a link Storage signs for a few minutes; LinkedIn is sent the bytes.', [facebook, instagram, linkedin], { color: 3 });

export default workflow('qgr-publisher', 'QGR · Publisher')
  .add(everyMinute)
  .to(takeDue)
  .to(eachPlace)
  .to(wherePost
    .onCase(0, facebook)
    .onCase(1, instagram)
    .onCase(2, linkedin))
  .add(postNow)
  .to(takeDue)
  .add(facebook)
  .to(wentOut.onTrue(finish.to(fileToRemove.onTrue(removeFile))).onFalse(fail))
  .add(instagram)
  .to(wentOut)
  .add(linkedin)
  .to(wentOut)
  .add(noteFlow)
  .add(noteStandIns);
