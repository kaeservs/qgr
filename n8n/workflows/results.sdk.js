import { workflow, node, trigger, sticky, newCredential, ifElse, switchCase, expr } from '@n8n/workflow-sdk';

const everySixHours = trigger({
  type: 'n8n-nodes-base.scheduleTrigger',
  version: 1.4,
  config: {
    name: 'Every six hours',
    parameters: { rule: { interval: [{ field: 'hours', hoursInterval: 6, triggerAtMinute: 17 }] } },
  },
  output: [{}],
});

const takeDue = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: {
    name: "Take the posts to read",
    executeOnce: true,
    parameters: {
      method: 'POST',
      url: 'https://tcinsdexwvzpznqlcpww.supabase.co/rest/v1/rpc/results_take_due',
      authentication: 'predefinedCredentialType',
      nodeCredentialType: 'supabaseApi',
      sendBody: true,
      contentType: 'json',
      specifyBody: 'json',
      jsonBody: expr("{{ JSON.stringify({ p_limit: 50 }) }}"),
      options: { timeout: 30000 },
    },
    credentials: { supabaseApi: newCredential('Supabase QGR') },
  },
  output: [{ post_id: 'post-id', place: 'facebook', remote_id: '1234567890_987654321', media_kind: 'image', posted_at: '2026-10-08T13:00:12+00:00', page: { id: '1234567890' } }],
});

const eachPlace = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: "One item per place",
    parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: "// The rows a database function returned, one item each. n8n turns a JSON\n// array answer into items by itself; this also takes one item holding the\n// whole array, so the next node sees the same either way. Nothing due means\n// no items, and the rest of the workflow does not run.\nconst out = [];\n$input.all().forEach(function (item) {\n  const json = item.json;\n  let rows = [];\n  if (Array.isArray(json)) rows = json;\n  else if (json && Array.isArray(json.data)) rows = json.data;\n  else if (json && typeof json === 'object' && Object.keys(json).length > 0) rows = [json];\n  rows.forEach(function (row) {\n    if (row && typeof row === 'object') out.push({ json: row });\n  });\n});\nreturn out;\n" },
  },
  output: [{ post_id: 'post-id', place: 'facebook', remote_id: '1234567890_987654321', media_kind: 'image', posted_at: '2026-10-08T13:00:12+00:00', page: { id: '1234567890' } }],
});

const whichPlace = switchCase({
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
    name: "Facebook results (stand-in)",
    parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: "// STAND-IN for reading a post's results from Facebook. It reads\n// nothing: it answers as the real step does when the platform has no numbers\n// to give, so the workflow runs end to end and records nothing.\n//\n// To connect Facebook, replace this node with the real request (the\n// sticky note beside it says which), keeping the output the same:\n//   { ok: true, post_id, place, results: { reach, views, reactions, comments, shares, clicks } }\n// each a count, or null when the platform does not report it for this post;\n// or, when the platform refused:\n//   { ok: false, post_id, place, error }\nreturn $input.all().map(function (item) {\n  const post = item.json;\n  return {\n    json: {\n      ok: true,\n      post_id: post.post_id,\n      place: post.place,\n      results: null,\n      stand_in: true,\n    },\n  };\n});\n" },
  },
  output: [{ ok: true, post_id: 'post-id', place: 'facebook', results: null, stand_in: true }],
});

const instagram = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: "Instagram results (stand-in)",
    parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: "// STAND-IN for reading a post's results from Instagram. It reads\n// nothing: it answers as the real step does when the platform has no numbers\n// to give, so the workflow runs end to end and records nothing.\n//\n// To connect Instagram, replace this node with the real request (the\n// sticky note beside it says which), keeping the output the same:\n//   { ok: true, post_id, place, results: { reach, views, reactions, comments, shares, clicks } }\n// each a count, or null when the platform does not report it for this post;\n// or, when the platform refused:\n//   { ok: false, post_id, place, error }\nreturn $input.all().map(function (item) {\n  const post = item.json;\n  return {\n    json: {\n      ok: true,\n      post_id: post.post_id,\n      place: post.place,\n      results: null,\n      stand_in: true,\n    },\n  };\n});\n" },
  },
  output: [{ ok: true, post_id: 'post-id', place: 'instagram', results: null, stand_in: true }],
});

const linkedin = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: "LinkedIn results (stand-in)",
    parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: "// STAND-IN for reading a post's results from LinkedIn. It reads\n// nothing: it answers as the real step does when the platform has no numbers\n// to give, so the workflow runs end to end and records nothing.\n//\n// To connect LinkedIn, replace this node with the real request (the\n// sticky note beside it says which), keeping the output the same:\n//   { ok: true, post_id, place, results: { reach, views, reactions, comments, shares, clicks } }\n// each a count, or null when the platform does not report it for this post;\n// or, when the platform refused:\n//   { ok: false, post_id, place, error }\nreturn $input.all().map(function (item) {\n  const post = item.json;\n  return {\n    json: {\n      ok: true,\n      post_id: post.post_id,\n      place: post.place,\n      results: null,\n      stand_in: true,\n    },\n  };\n});\n" },
  },
  output: [{ ok: true, post_id: 'post-id', place: 'linkedin', results: null, stand_in: true }],
});

const gotNumbers = ifElse({
  version: 2.3,
  config: {
    name: "Numbers back?",
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 2 },
        conditions: [{ leftValue: expr("{{ $json.ok === true && $json.results !== null && typeof $json.results === \"object\" }}"), rightValue: true, operator: { type: 'boolean', operation: 'true', singleValue: true } }],
        combinator: 'and',
      },
    },
  },
});

const refused = ifElse({
  version: 2.3,
  config: {
    name: "Refused?",
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 2 },
        conditions: [{ leftValue: expr("{{ $json.ok === false }}"), rightValue: true, operator: { type: 'boolean', operation: 'true', singleValue: true } }],
        combinator: 'and',
      },
    },
  },
});

const record = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: {
    name: "Record the numbers",
    onError: 'continueRegularOutput',
    parameters: {
      method: 'POST',
      url: 'https://tcinsdexwvzpznqlcpww.supabase.co/rest/v1/rpc/results_record',
      authentication: 'predefinedCredentialType',
      nodeCredentialType: 'supabaseApi',
      sendBody: true,
      contentType: 'json',
      specifyBody: 'json',
      jsonBody: expr("{{ JSON.stringify({ p_post_id: $json.post_id, p_place: $json.place, p_results: $json.results }) }}"),
      options: { timeout: 30000 },
    },
    credentials: { supabaseApi: newCredential('Supabase QGR') },
  },
  output: [{}],
});

const recordWhy = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: {
    name: "Record why not",
    onError: 'continueRegularOutput',
    parameters: {
      method: 'POST',
      url: 'https://tcinsdexwvzpznqlcpww.supabase.co/rest/v1/rpc/results_fail',
      authentication: 'predefinedCredentialType',
      nodeCredentialType: 'supabaseApi',
      sendBody: true,
      contentType: 'json',
      specifyBody: 'json',
      jsonBody: expr("{{ JSON.stringify({ p_post_id: $json.post_id, p_place: $json.place, p_error: $json.error }) }}"),
      options: { timeout: 30000 },
    },
    credentials: { supabaseApi: newCredential('Supabase QGR') },
  },
  output: [{}],
});

const noteFlow = sticky('## Results\nEvery six hours the database hands over the posts that went out for real in the last four weeks and were not read in the last six hours (**results_take_due**). Each place is asked for its numbers, which are recorded as counts (**results_record**). If a platform refuses, the reason is kept beside the last numbers (**results_fail**). A stand-in post has none: nothing was posted.', [everySixHours, takeDue, eachPlace], { color: 4 });
const noteStandIns = sticky('## Stand-ins until the keys are in\nThese read nothing. Each is replaced by a request with the same output, using the same tokens as the publisher (check the metric names against each platform\'s current docs):\n- **Facebook**: the post\'s insights (reach, views, reactions, clicks) and its comments and shares.\n- **Instagram**: the media\'s insights (reach, views, likes, comments, shares). A feed post has no clicks: null.\n- **LinkedIn**: organizationalEntityShareStatistics for the share (unique impressions, impressions, likes, comments, shares, clicks).', [facebook, instagram, linkedin], { color: 3 });

export default workflow('qgr-post-results', 'QGR · Post results')
  .add(everySixHours)
  .to(takeDue)
  .to(eachPlace)
  .to(whichPlace
    .onCase(0, facebook)
    .onCase(1, instagram)
    .onCase(2, linkedin))
  .add(facebook)
  .to(gotNumbers.onTrue(record).onFalse(refused.onTrue(recordWhy)))
  .add(instagram)
  .to(gotNumbers)
  .add(linkedin)
  .to(gotNumbers)
  .add(noteFlow)
  .add(noteStandIns);
