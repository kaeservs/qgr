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

const planRead = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: "Plan the read",
    parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: "// What to ask each platform for a post's numbers, read every six hours for\n// four weeks after it went out (results_take_due hands over only posts that\n// went out for real). One request a post:\n//   Facebook, a post: its shares, comments and reactions, and its insights:\n//     views (post_media_view), people reached (post_total_media_view_unique)\n//     and clicks (post_clicks), the metrics Meta keeps since its impressions\n//     metrics went in 2025.\n//   Facebook, a video: the video's insights, all of them, read by name.\n//   Instagram: the media's insights (reach, views, likes, comments, shares).\n//   LinkedIn: the post's statistics on the Page\n//     (organizationalEntityShareStatistics, by share or ugcPost URN).\n// Graph API v25.0 and LinkedIn-Version 202609, as the publisher uses.\nconst GRAPH = 'https://graph.facebook.com/v25.0/';\nconst LINKEDIN = 'https://api.linkedin.com/rest/organizationalEntityShareStatistics';\nconst VERSION = '202609';\nconst FACEBOOK_POST = 'shares,comments.limit(0).summary(true),reactions.limit(0).summary(true),insights.metric(post_media_view,post_total_media_view_unique,post_clicks)';\nconst INSTAGRAM = 'reach,views,likes,comments,shares';\n\nreturn $input.all().map(function (item) {\n  const p = item.json;\n  const id = String(p.remote_id || '');\n  const plan = { post_id: p.post_id, place: p.place };\n  if (p.place === 'facebook' && p.media_kind === 'video') {\n    return { json: Object.assign(plan, { kind: 'facebook-video', url: GRAPH + id + '/video_insights' }) };\n  }\n  if (p.place === 'facebook') {\n    return { json: Object.assign(plan, { kind: 'facebook-post', url: GRAPH + id + '?fields=' + FACEBOOK_POST }) };\n  }\n  if (p.place === 'instagram') {\n    return { json: Object.assign(plan, { kind: 'instagram', url: GRAPH + id + '/insights?metric=' + INSTAGRAM }) };\n  }\n  const list = /^urn:li:ugcPost:/.test(id) ? 'ugcPosts' : 'shares';\n  const page = 'urn:li:organization:' + String(p.page && p.page.id);\n  return {\n    json: Object.assign(plan, {\n      kind: 'linkedin',\n      version: VERSION,\n      url: LINKEDIN + '?q=organizationalEntity&organizationalEntity=' + encodeURIComponent(page) + '&' + list + '=List(' + encodeURIComponent(id) + ')',\n    }),\n  };\n});\n" },
  },
  output: [{ post_id: 'post-id', place: 'facebook', kind: 'facebook-post', url: 'https://graph.facebook.com/v25.0/1234567890_987654321?fields=shares' }],
});

const toLinkedin = ifElse({
  version: 2.3,
  config: {
    name: "LinkedIn?",
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 2 },
        conditions: [{ leftValue: expr("{{ $json.place === \"linkedin\" }}"), rightValue: true, operator: { type: 'boolean', operation: 'true', singleValue: true } }],
        combinator: 'and',
      },
    },
  },
});

const metaNumbers = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: {
    name: "Meta: its numbers",
    onError: 'continueRegularOutput',
    parameters: {
      method: 'GET',
      url: expr('{{ $json.url }}'),
      authentication: 'predefinedCredentialType',
      nodeCredentialType: 'facebookGraphApi',
      options: { timeout: 30000, response: { response: { fullResponse: true, neverError: true } } },
    },
  },
  output: [{ statusCode: 200, body: { shares: { count: 3 }, comments: { summary: { total_count: 7 } }, reactions: { summary: { total_count: 38 } }, insights: { data: [{ name: 'post_media_view', period: 'lifetime', values: [{ value: 1320 }] }] } } }],
});

const linkedinNumbers = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: {
    name: "LinkedIn: its numbers",
    onError: 'continueRegularOutput',
    parameters: {
      method: 'GET',
      url: expr('{{ $json.url }}'),
      authentication: 'predefinedCredentialType',
      nodeCredentialType: 'linkedInCommunityManagementOAuth2Api',
      sendHeaders: true,
      headerParameters: { parameters: [{ name: 'LinkedIn-Version', value: expr('{{ $json.version }}') }, { name: 'X-Restli-Protocol-Version', value: '2.0.0' }] },
      options: { timeout: 30000, response: { response: { fullResponse: true, neverError: true } } },
    },
  },
  output: [{ statusCode: 200, body: { elements: [{ totalShareStatistics: { uniqueImpressionsCount: 940, impressionCount: 1320, likeCount: 38, commentCount: 7, shareCount: 3, clickCount: 29 } }] } }],
});

const readNumbers = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: "Read the numbers",
    parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: "// LinkedIn's reason for refusing a request, made plain where it is a known one.\n// Shared by the LinkedIn steps' scripts in the publisher and in Post results\n// (the build puts it before each).\nfunction linkedinRefusal(res, doing) {\n  const body = res && res.body && typeof res.body === 'object' ? res.body : {};\n  const message = String(body.message || body.error_description || body.error || 'no reason given').slice(0, 300);\n  const status = res && res.statusCode;\n  if (status === 401) return 'The LinkedIn token has expired or was revoked: reconnect the “LinkedIn Community Management” credential in n8n.';\n  if (status === 403) {\n    return 'LinkedIn would not let the app ' + doing + ' (' + message + '). It needs LinkedIn’s approval for the Community Management API, and the person who connected it must be an admin of the Page.';\n  }\n  if (status === 429) return 'LinkedIn is limiting requests right now: try again later.';\n  if (status === 426 || /version/i.test(message)) return 'LinkedIn no longer takes the API version this uses (' + message + '): move VERSION on in “Plan the LinkedIn post” (QGR · Publisher) and “Plan the read” (QGR · Post results).';\n  return 'LinkedIn would not ' + doing + ' (' + (status || 'no answer') + '): ' + message;\n}\n\n/** What n8n said when it could not make a request. */\nfunction linkedinSaid(error) {\n  if (!error) return '';\n  if (typeof error === 'string') return error;\n  return String(error.message || error.description || JSON.stringify(error));\n}\n\n// A platform's numbers for a post, as the counts results_record keeps:\n//   { ok: true, post_id, place, results: { reach, views, reactions, comments, shares, clicks } }\n// each a whole number, or null where the platform does not give it for this\n// post; or, when it would not answer, { ok: false, post_id, place, error }, and\n// the numbers before are kept. Every number is read by its name, never by its\n// place in a list, so a metric a platform drops leaves the others as they are.\n// A step that could not start (no credential attached) hands its input on, so\n// an answer with no status at all means the platform was never asked.\nconst NAME = { facebook: 'Facebook', instagram: 'Instagram', linkedin: 'LinkedIn' };\n\nfunction count(value) {\n  const n = typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN;\n  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;\n}\n\n/** The sum of an object of counts ({ like: 3, love: 1 }), or null without any. */\nfunction total(value) {\n  if (!value || typeof value !== 'object') return count(value);\n  const counts = Object.keys(value)\n    .map(function (key) {\n      return count(value[key]);\n    })\n    .filter(function (n) {\n      return n !== null;\n    });\n  return counts.length ? counts.reduce(function (a, b) {\n    return a + b;\n  }, 0) : null;\n}\n\n/** A metric's lifetime value in Meta's insights list, found by its name. */\nfunction metric(list, name) {\n  const found = (Array.isArray(list) ? list : []).find(function (m) {\n    return m && m.name === name;\n  });\n  if (!found) return undefined;\n  if (found.total_value && found.total_value.value !== undefined) return found.total_value.value;\n  const values = Array.isArray(found.values) ? found.values : [];\n  return values.length ? values[values.length - 1].value : undefined;\n}\n\n/** Meta's reason, made plain where it is a known one. */\nfunction metaRefusal(body, status, place) {\n  const e = body && body.error && typeof body.error === 'object' ? body.error : {};\n  const message = String(e.error_user_msg || e.message || 'no reason given').slice(0, 300);\n  if (e.code === 190) return 'The Facebook token has expired or was revoked. Make a new Page access token and update the “Facebook Graph API” credential in n8n.';\n  if (e.code === 10 || (e.code >= 200 && e.code < 300)) {\n    return place === 'instagram'\n      ? 'The token may not read Instagram’s numbers: it needs instagram_manage_insights (' + message + ').'\n      : 'The token may not read the post’s numbers: it needs pages_read_engagement and pages_read_user_content (' + message + ').';\n  }\n  if (e.code === 4 || e.code === 17 || e.code === 32 || e.code === 613) return NAME[place] + ' is limiting requests right now: the numbers are read again in six hours.';\n  if (e.code === 100 && /metric/i.test(message)) return NAME[place] + ' no longer gives one of the numbers asked for (' + message + '): the metrics in “Plan the read” need updating.';\n  return NAME[place] + ' would not give the numbers (' + status + (e.code ? ', code ' + e.code : '') + '): ' + message;\n}\n\nreturn $input.all().map(function (item, i) {\n  const plan = $('Plan the read').itemMatching(i).json;\n  const res = item.json || {};\n  const out = function (fields) {\n    return { json: Object.assign({ post_id: plan.post_id, place: plan.place }, fields) };\n  };\n  const failed = function (error) {\n    return out({ ok: false, error: error });\n  };\n  if (res.statusCode === undefined && !res.error) {\n    const where = plan.place === 'linkedin' ? '“LinkedIn Community Management” credential to “LinkedIn: its numbers”' : '“Facebook Graph API” credential to “Meta: its numbers”';\n    return failed(NAME[plan.place] + ' was not asked: attach the ' + where + ' in n8n.');\n  }\n  if (res.error) return failed(NAME[plan.place] + ' could not be asked for the numbers (' + linkedinSaid(res.error).slice(0, 200) + '). They are read again in six hours.');\n  const body = res.body && typeof res.body === 'object' ? res.body : {};\n  if (!(res.statusCode >= 200 && res.statusCode < 300)) {\n    return failed(plan.place === 'linkedin' ? linkedinRefusal(res, 'give the numbers') : metaRefusal(body, res.statusCode, plan.place));\n  }\n\n  if (plan.kind === 'facebook-post') {\n    const insights = body.insights && Array.isArray(body.insights.data) ? body.insights.data : [];\n    return out({\n      ok: true,\n      results: {\n        reach: count(metric(insights, 'post_total_media_view_unique')),\n        views: count(metric(insights, 'post_media_view')),\n        reactions: count(body.reactions && body.reactions.summary ? body.reactions.summary.total_count : undefined),\n        comments: count(body.comments && body.comments.summary ? body.comments.summary.total_count : undefined),\n        // Facebook leaves shares out of a post nobody has shared.\n        shares: body.shares ? count(body.shares.count) : 0,\n        clicks: count(metric(insights, 'post_clicks')),\n      },\n    });\n  }\n  if (plan.kind === 'facebook-video') {\n    const data = Array.isArray(body.data) ? body.data : [];\n    const stories = metric(data, 'total_video_stories_by_action_type');\n    const by = stories && typeof stories === 'object' ? stories : {};\n    return out({\n      ok: true,\n      results: {\n        reach: count(metric(data, 'total_video_views_unique')),\n        views: count(metric(data, 'total_video_views')),\n        reactions: total(metric(data, 'total_video_reactions_by_type_total')),\n        comments: count(by.comment),\n        shares: count(by.share),\n        clicks: null,\n      },\n    });\n  }\n  if (plan.kind === 'instagram') {\n    const data = Array.isArray(body.data) ? body.data : [];\n    return out({\n      ok: true,\n      results: {\n        reach: count(metric(data, 'reach')),\n        views: count(metric(data, 'views')),\n        reactions: count(metric(data, 'likes')),\n        comments: count(metric(data, 'comments')),\n        shares: count(metric(data, 'shares')),\n        // An Instagram post's words carry no link: nothing to click.\n        clicks: null,\n      },\n    });\n  }\n  const element = Array.isArray(body.elements) && body.elements.length ? body.elements[0] : null;\n  const stats = element && element.totalShareStatistics ? element.totalShareStatistics : null;\n  if (!stats) return failed('LinkedIn gave no numbers for this post. They are read again in six hours.');\n  return out({\n    ok: true,\n    results: {\n      reach: count(stats.uniqueImpressionsCount),\n      views: count(stats.impressionCount),\n      reactions: count(stats.likeCount),\n      comments: count(stats.commentCount),\n      shares: count(stats.shareCount),\n      clicks: count(stats.clickCount),\n    },\n  });\n});\n" },
  },
  output: [{ ok: true, post_id: 'post-id', place: 'facebook', results: { reach: 940, views: 1320, reactions: 38, comments: 7, shares: 3, clicks: 29 } }],
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

const noteFlow = sticky('## Results\nEvery six hours the database hands over the posts that went out for real in the last four weeks and were not read in the last six hours (**results_take_due**). Each is asked for its numbers, which are recorded as counts (**results_record**). If a platform refuses, the reason is kept beside the last numbers (**results_fail**). A stand-in post has none: nothing was posted.', [everySixHours, takeDue, eachPlace], { color: 4 });
const noteReaders = sticky('## One request a post\n**Plan the read** names it: on Facebook a post\'s shares, comments, reactions and insights (post_media_view, post_total_media_view_unique, post_clicks), or a video\'s video insights; on Instagram the media\'s insights (reach, views, likes, comments, shares); on LinkedIn the post\'s organizationalEntityShareStatistics. **Read the numbers** takes each by its name, and leaves a number the platform does not give empty.\n\nThe same tokens as the publisher: the **Facebook Graph API** credential on **Meta: its numbers** (with pages_read_engagement, pages_read_user_content and instagram_manage_insights), the **LinkedIn Community Management** credential on **LinkedIn: its numbers** (with rw_organization_admin). Until then each read says why, and nothing is recorded.', [planRead, toLinkedin, metaNumbers, linkedinNumbers, readNumbers], { color: 5 });

export default workflow('qgr-post-results', 'QGR · Post results')
  .add(everySixHours)
  .to(takeDue)
  .to(eachPlace)
  .to(planRead)
  .to(toLinkedin.onTrue(linkedinNumbers).onFalse(metaNumbers))
  .add(linkedinNumbers)
  .to(readNumbers)
  .to(gotNumbers.onTrue(record).onFalse(refused.onTrue(recordWhy)))
  .add(metaNumbers)
  .to(readNumbers)
  .add(noteFlow)
  .add(noteReaders);
