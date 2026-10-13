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
  output: [{ post_id: 'post-id', place: 'facebook', text: 'Plan your EB-5 path.', media_path: 'posts/user/file.jpg', media_kind: 'image', page: { id: '1234567890', name: 'Quantum Global' }, live: false }],
});

const eachPlace = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: "One item per place",
    parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: "// The rows a database function returned, one item each. n8n turns a JSON\n// array answer into items by itself; this also takes one item holding the\n// whole array, so the next node sees the same either way. Nothing due means\n// no items, and the rest of the workflow does not run.\nconst out = [];\n$input.all().forEach(function (item) {\n  const json = item.json;\n  let rows = [];\n  if (Array.isArray(json)) rows = json;\n  else if (json && Array.isArray(json.data)) rows = json.data;\n  else if (json && typeof json === 'object' && Object.keys(json).length > 0) rows = [json];\n  rows.forEach(function (row) {\n    if (row && typeof row === 'object') out.push({ json: row });\n  });\n});\nreturn out;\n" },
  },
  output: [{ post_id: 'post-id', place: 'facebook', text: 'Plan your EB-5 path.', media_path: 'posts/user/file.jpg', media_kind: 'image', page: { id: '1234567890', name: 'Quantum Global' }, live: false }],
});

const forReal = ifElse({
  version: 2.3,
  config: {
    name: "Post for real?",
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 2 },
        conditions: [{ leftValue: expr("{{ $json.live === true }}"), rightValue: true, operator: { type: 'boolean', operation: 'true', singleValue: true } }],
        combinator: 'and',
      },
    },
  },
});

const wherePost = switchCase({
  version: 3.4,
  config: {
    name: "Which place?",
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
    parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: "// STAND-IN for posting to Facebook, the way taken while Facebook is\n// not switched to post for real (Settings, Where posts go). Nothing is posted\n// anywhere: it answers as the real steps do, so a post can be followed from\n// the dashboard to here and back, and marks the result stand_in so the\n// dashboard says nothing went out.\n//\n// The real steps (on \"Post for real?\"'s true side) answer in the same shape:\n//   { ok: true, post_id, place, remote_id, remote_url, stand_in: false }\n// or, when it did not go out:\n//   { ok: false, post_id, place, error, unknown }\n// where unknown is true if the post may have gone out anyway (the platform\n// did not answer after it was sent): it is then never sent again by itself.\nreturn $input.all().map(function (item) {\n  const post = item.json;\n  return {\n    json: {\n      ok: true,\n      post_id: post.post_id,\n      place: post.place,\n      remote_id: null,\n      remote_url: null,\n      stand_in: true,\n    },\n  };\n});\n" },
  },
  output: [{ ok: true, post_id: 'post-id', place: 'facebook', remote_id: null, remote_url: null, stand_in: true }],
});

const instagram = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: "Instagram (stand-in)",
    parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: "// STAND-IN for posting to Instagram, the way taken while Instagram is\n// not switched to post for real (Settings, Where posts go). Nothing is posted\n// anywhere: it answers as the real steps do, so a post can be followed from\n// the dashboard to here and back, and marks the result stand_in so the\n// dashboard says nothing went out.\n//\n// The real steps (on \"Post for real?\"'s true side) answer in the same shape:\n//   { ok: true, post_id, place, remote_id, remote_url, stand_in: false }\n// or, when it did not go out:\n//   { ok: false, post_id, place, error, unknown }\n// where unknown is true if the post may have gone out anyway (the platform\n// did not answer after it was sent): it is then never sent again by itself.\nreturn $input.all().map(function (item) {\n  const post = item.json;\n  return {\n    json: {\n      ok: true,\n      post_id: post.post_id,\n      place: post.place,\n      remote_id: null,\n      remote_url: null,\n      stand_in: true,\n    },\n  };\n});\n" },
  },
  output: [{ ok: true, post_id: 'post-id', place: 'instagram', remote_id: null, remote_url: null, stand_in: true }],
});

const linkedin = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: "LinkedIn (stand-in)",
    parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: "// STAND-IN for posting to LinkedIn, the way taken while LinkedIn is\n// not switched to post for real (Settings, Where posts go). Nothing is posted\n// anywhere: it answers as the real steps do, so a post can be followed from\n// the dashboard to here and back, and marks the result stand_in so the\n// dashboard says nothing went out.\n//\n// The real steps (on \"Post for real?\"'s true side) answer in the same shape:\n//   { ok: true, post_id, place, remote_id, remote_url, stand_in: false }\n// or, when it did not go out:\n//   { ok: false, post_id, place, error, unknown }\n// where unknown is true if the post may have gone out anyway (the platform\n// did not answer after it was sent): it is then never sent again by itself.\nreturn $input.all().map(function (item) {\n  const post = item.json;\n  return {\n    json: {\n      ok: true,\n      post_id: post.post_id,\n      place: post.place,\n      remote_id: null,\n      remote_url: null,\n      stand_in: true,\n    },\n  };\n});\n" },
  },
  output: [{ ok: true, post_id: 'post-id', place: 'linkedin', remote_id: null, remote_url: null, stand_in: true }],
});

// ---- for real: the file signed for an hour, so the platform (or n8n, for
// LinkedIn) can fetch it from the private bucket without a key.

const sign = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: {
    name: "Sign the file",
    onError: 'continueRegularOutput',
    parameters: {
      method: 'POST',
      url: expr('https://tcinsdexwvzpznqlcpww.supabase.co/storage/v1/object/sign/post-media/{{ $json.media_path }}'),
      authentication: 'predefinedCredentialType',
      nodeCredentialType: 'supabaseApi',
      sendBody: true,
      contentType: 'json',
      specifyBody: 'json',
      jsonBody: expr("{{ JSON.stringify({ expiresIn: 3600 }) }}"),
      options: { timeout: 30000, response: { response: { fullResponse: true, neverError: true } } },
    },
    credentials: { supabaseApi: newCredential('Supabase QGR') },
  },
  output: [{ statusCode: 200, body: { signedURL: '/object/sign/post-media/posts/user/file.jpg?token=token' } }],
});

const withLink = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: "With its link",
    parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: "// The places going out for real, each with a link to its file that the\n// platform can fetch: Storage signs it for an hour, so Meta (and n8n, for\n// LinkedIn) reads the private file without a key. A place that cannot go out\n// (no Page set, Instagram without a file, a file that could not be signed)\n// fails here, before anything is sent, in the shape the stand-in documents.\nconst STORAGE = 'https://tcinsdexwvzpznqlcpww.supabase.co/storage/v1';\nconst NAME = { facebook: 'Facebook', instagram: 'Instagram', linkedin: 'LinkedIn' };\n\nreturn $input.all().map(function (item, i) {\n  const post = $('Post for real?').itemMatching(i).json;\n  const res = item.json || {};\n  const fail = function (error) {\n    return { json: { ok: false, post_id: post.post_id, place: post.place, error: error, unknown: false } };\n  };\n  if (!post.page || !post.page.id) {\n    return fail(post.place === 'instagram' ? 'No Instagram account is set in Settings, Where posts go.' : 'No ' + NAME[post.place] + ' Page is set in Settings, Where posts go.');\n  }\n  let mediaUrl = null;\n  if (post.media_path) {\n    const signed = res.body && typeof res.body === 'object' ? res.body.signedURL || res.body.signedUrl : null;\n    if (res.statusCode !== 200 || typeof signed !== 'string') {\n      return fail('The file could not be made ready for ' + NAME[post.place] + ' (' + (res.statusCode || 'no answer') + '). Nothing went out: try again.');\n    }\n    mediaUrl = /^https?:\\/\\//.test(signed) ? signed : STORAGE + (signed.charAt(0) === '/' ? '' : '/') + signed;\n  }\n  if (post.place === 'instagram' && !mediaUrl) return fail('Instagram needs a picture or a video, and this post has none.');\n  return {\n    json: {\n      ok: true,\n      post_id: post.post_id,\n      place: post.place,\n      text: post.text,\n      media_kind: post.media_kind,\n      media_url: mediaUrl,\n      page: post.page,\n    },\n  };\n});\n" },
  },
  output: [{ ok: true, post_id: 'post-id', place: 'facebook', text: 'Plan your EB-5 path.', media_kind: 'image', media_url: 'https://tcinsdexwvzpznqlcpww.supabase.co/storage/v1/object/sign/post-media/posts/user/file.jpg?token=token', page: { id: '1234567890', name: 'Quantum Global' } }],
});

const readyToSend = ifElse({
  version: 2.3,
  config: {
    name: "Ready to send?",
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 },
        conditions: [{ leftValue: expr('{{ $json.ok }}'), rightValue: true, operator: { type: 'boolean', operation: 'true', singleValue: true } }],
        combinator: 'and',
      },
    },
  },
});

const whereReal = switchCase({
  version: 3.4,
  config: {
    name: "Which place, for real?",
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

// ---- Facebook: one request, with the Page's access token.

const planFacebook = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: "Plan the Facebook post",
    parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: "// The request that publishes a post on the Facebook Page: a picture with the\n// post's words (/photos), a video with them (/videos, on graph-video, as Meta\n// asks for video), or the words alone (/feed). Meta fetches the file itself\n// from the link Storage signed. Graph API v25.0, pinned: Meta keeps a version\n// for two years (v25.0 until July 2028).\nconst GRAPH = 'https://graph.facebook.com/v25.0/';\nconst GRAPH_VIDEO = 'https://graph-video.facebook.com/v25.0/';\n\nreturn $input.all().map(function (item) {\n  const p = item.json;\n  const page = String(p.page.id);\n  const kind = p.media_url ? (p.media_kind === 'video' ? 'video' : 'image') : 'text';\n  let url;\n  let body;\n  if (kind === 'video') {\n    url = GRAPH_VIDEO + page + '/videos';\n    body = { file_url: p.media_url, description: p.text, published: true };\n  } else if (kind === 'image') {\n    url = GRAPH + page + '/photos';\n    body = { url: p.media_url, message: p.text, published: true };\n  } else {\n    url = GRAPH + page + '/feed';\n    body = { message: p.text, published: true };\n  }\n  return { json: { post_id: p.post_id, place: p.place, page_id: page, kind: kind, url: url, body: body } };\n});\n" },
  },
  output: [{ post_id: 'post-id', place: 'facebook', page_id: '1234567890', kind: 'image', url: 'https://graph.facebook.com/v25.0/1234567890/photos', body: { url: 'https://example.com/file.jpg', message: 'Plan your EB-5 path.', published: true } }],
});

const facebookPost = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: {
    name: "Facebook: post",
    onError: 'continueRegularOutput',
    parameters: {
      method: 'POST',
      url: expr('{{ $json.url }}'),
      authentication: 'predefinedCredentialType',
      nodeCredentialType: 'facebookGraphApi',
      sendBody: true,
      contentType: 'json',
      specifyBody: 'json',
      jsonBody: expr("{{ JSON.stringify($json.body) }}"),
      options: { timeout: 300000, response: { response: { fullResponse: true, neverError: true } } },
    },
  },
  output: [{ statusCode: 200, body: { id: '555', post_id: '1234567890_555' } }],
});

const facebookAnswer = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: "Read Facebook's answer",
    parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: "// Facebook's answer to the post, in the shape the stand-in documents:\n//   posted:  { ok: true, post_id, place, remote_id, remote_url, stand_in: false }\n//   failed:  { ok: false, post_id, place, error, unknown: false }, nothing went out\n//   unknown: { ok: false, ..., unknown: true }, it may have: it is never sent\n//            again by itself (rule 11), a person checks the Page first.\n// A step that could not start (no credential attached) hands its input on, so\n// an answer with no status at all means Facebook was never asked.\nfunction said(error) {\n  if (!error) return '';\n  if (typeof error === 'string') return error;\n  return String(error.message || error.description || JSON.stringify(error));\n}\n\n/** Graph API's own reason, made plain where it is a known one. Nothing went out. */\nfunction refusal(error, status) {\n  const e = error && typeof error === 'object' ? error : {};\n  const message = String(e.error_user_msg || e.message || 'no reason given').slice(0, 300);\n  if (e.code === 190) return 'The Facebook token has expired or was revoked. Make a new Page access token and update the “Facebook Graph API” credential in n8n.';\n  if (e.code === 10 || (e.code >= 200 && e.code < 300)) return 'The token may not post to the Page: it needs pages_manage_posts and pages_read_engagement (' + message + ').';\n  if (e.code === 4 || e.code === 17 || e.code === 32 || e.code === 613) return 'Facebook is limiting requests right now: try again later (' + message + ').';\n  if (e.code === 506) return 'Facebook refused it as a duplicate of a recent post.';\n  if (e.code === 368) return 'Facebook blocked the post: ' + message;\n  return 'Facebook refused it (' + status + (e.code ? ', code ' + e.code : '') + '): ' + message;\n}\n\nreturn $input.all().map(function (item, i) {\n  const plan = $('Plan the Facebook post').itemMatching(i).json;\n  const res = item.json || {};\n  const out = function (fields) {\n    return { json: Object.assign({ post_id: plan.post_id, place: plan.place }, fields) };\n  };\n  const failed = function (error) {\n    return out({ ok: false, error: error, unknown: false });\n  };\n  const unknown = function (error) {\n    return out({ ok: false, error: error, unknown: true });\n  };\n\n  if (res.statusCode === undefined && !res.error) {\n    return failed('Facebook was not asked: attach the “Facebook Graph API” credential (the Page’s access token) to “Facebook: post” in n8n.');\n  }\n  if (res.error) {\n    const why = said(res.error).slice(0, 200);\n    if (/credential/i.test(why)) return failed('Facebook was not asked: ' + why);\n    if (/ENOTFOUND|EAI_AGAIN|ECONNREFUSED|certificate/i.test(why)) return failed('Facebook could not be reached (' + why + '). Nothing went out: try again.');\n    return unknown('Facebook did not answer after the post was sent (' + why + '). Check the Page before sending it again.');\n  }\n  const body = res.body && typeof res.body === 'object' ? res.body : {};\n  if (res.statusCode >= 200 && res.statusCode < 300) {\n    if (!body.id) return unknown('Facebook answered without the post’s id. Check the Page before sending it again.');\n    if (plan.kind === 'video') {\n      return out({ ok: true, remote_id: String(body.id), remote_url: 'https://www.facebook.com/' + plan.page_id + '/videos/' + body.id, stand_in: false });\n    }\n    const postId = String(body.post_id || body.id);\n    return out({ ok: true, remote_id: postId, remote_url: 'https://www.facebook.com/' + postId, stand_in: false });\n  }\n  if (res.statusCode >= 500) {\n    return unknown('Facebook had a problem after the post was sent (' + res.statusCode + '). Check the Page before sending it again.');\n  }\n  return failed(refusal(body.error, res.statusCode));\n});\n" },
  },
  output: [{ ok: true, post_id: 'post-id', place: 'facebook', remote_id: '1234567890_555', remote_url: 'https://www.facebook.com/1234567890_555', stand_in: false }],
});

// ---- Instagram: a container, checked until it is ready, then published.

const planInstagram = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: "Plan the Instagram post",
    parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: "// Instagram publishes in two steps: a container is made from the file (Meta\n// fetches it from the link Storage signed), and published once Instagram has\n// prepared it. A picture is ready in seconds, so it is checked after ten; a\n// video is posted as a Reel and takes longer, so it is first checked after a\n// minute (then once a minute, as Meta asks: \"Ready to publish?\").\n// Graph API v25.0, pinned, as for Facebook.\nconst GRAPH = 'https://graph.facebook.com/v25.0/';\n\nreturn $input.all().map(function (item) {\n  const p = item.json;\n  const account = String(p.page.id);\n  const video = p.media_kind === 'video';\n  const body = video\n    ? { media_type: 'REELS', video_url: p.media_url, caption: p.text, share_to_feed: true }\n    : { image_url: p.media_url, caption: p.text };\n  return {\n    json: {\n      post_id: p.post_id,\n      place: p.place,\n      account: account,\n      kind: video ? 'video' : 'image',\n      url: GRAPH + account + '/media',\n      body: body,\n      wait: video ? 60 : 10,\n    },\n  };\n});\n" },
  },
  output: [{ post_id: 'post-id', place: 'instagram', account: '17841400000000000', kind: 'image', url: 'https://graph.facebook.com/v25.0/17841400000000000/media', body: { image_url: 'https://example.com/file.jpg', caption: 'Plan your EB-5 path.' }, wait: 10 }],
});

const container = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: {
    name: "Instagram: make the container",
    onError: 'continueRegularOutput',
    parameters: {
      method: 'POST',
      url: expr('{{ $json.url }}'),
      authentication: 'predefinedCredentialType',
      nodeCredentialType: 'facebookGraphApi',
      sendBody: true,
      contentType: 'json',
      specifyBody: 'json',
      jsonBody: expr("{{ JSON.stringify($json.body) }}"),
      options: { timeout: 120000, response: { response: { fullResponse: true, neverError: true } } },
    },
  },
  output: [{ statusCode: 200, body: { id: '9001' } }],
});

const readContainer = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: "Read the container",
    parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: "// Instagram's answer to making the container. A container is not a post, so\n// anything that goes wrong here leaves nothing published: it fails, and Try\n// again makes a new one. Made, it carries what the next steps ask with: the\n// address to check it at and the one to publish it to.\nconst GRAPH = 'https://graph.facebook.com/v25.0/';\n\nfunction said(error) {\n  if (!error) return '';\n  if (typeof error === 'string') return error;\n  return String(error.message || error.description || JSON.stringify(error));\n}\n\nreturn $input.all().map(function (item, i) {\n  const plan = $('Plan the Instagram post').itemMatching(i).json;\n  const res = item.json || {};\n  const failed = function (error) {\n    return { json: { ok: false, post_id: plan.post_id, place: plan.place, error: error, unknown: false } };\n  };\n  if (res.statusCode === undefined && !res.error) {\n    return failed('Instagram was not asked: attach the “Facebook Graph API” credential (the Page’s access token, with instagram_content_publish) to the Instagram steps in n8n.');\n  }\n  if (res.error) return failed('Instagram could not be asked to prepare the post (' + said(res.error).slice(0, 200) + '). Nothing went out: try again.');\n  const body = res.body && typeof res.body === 'object' ? res.body : {};\n  if (res.statusCode >= 200 && res.statusCode < 300 && body.id) {\n    return {\n      json: {\n        ok: true,\n        post_id: plan.post_id,\n        place: plan.place,\n        kind: plan.kind,\n        wait: plan.wait,\n        tries: 0,\n        creation_id: String(body.id),\n        status_url: GRAPH + body.id + '?fields=status_code,status',\n        publish_url: GRAPH + plan.account + '/media_publish',\n      },\n    };\n  }\n  const e = body.error && typeof body.error === 'object' ? body.error : {};\n  if (e.code === 190) return failed('The Facebook token has expired or was revoked. Make a new Page access token and update the “Facebook Graph API” credential in n8n.');\n  if (e.code === 10 || (e.code >= 200 && e.code < 300)) {\n    return failed('The token may not publish to Instagram: it needs instagram_basic and instagram_content_publish, and the account must be linked to the Page (' + String(e.message || '') + ').');\n  }\n  return failed('Instagram would not prepare the post (' + (res.statusCode || 'no answer') + (e.code ? ', code ' + e.code : '') + '): ' + String(e.error_user_msg || e.message || 'no reason given').slice(0, 300));\n});\n" },
  },
  output: [{ ok: true, post_id: 'post-id', place: 'instagram', kind: 'image', wait: 10, tries: 0, creation_id: '9001', status_url: 'https://graph.facebook.com/v25.0/9001?fields=status_code,status', publish_url: 'https://graph.facebook.com/v25.0/17841400000000000/media_publish' }],
});

const containerMade = ifElse({
  version: 2.3,
  config: {
    name: "Container made?",
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 },
        conditions: [{ leftValue: expr('{{ $json.ok }}'), rightValue: true, operator: { type: 'boolean', operation: 'true', singleValue: true } }],
        combinator: 'and',
      },
    },
  },
});

const instagramWait = node({
  type: 'n8n-nodes-base.wait',
  version: 1.1,
  config: {
    name: "Give Instagram time",
    parameters: {
      resume: 'timeInterval',
      amount: expr('{{ $input.all().reduce((most, item) => Math.max(most, Number(item.json.wait) || 0), 10) }}'),
      unit: 'seconds',
    },
  },
  output: [{}],
});

const instagramStatus = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: {
    name: "Instagram: is it ready?",
    onError: 'continueRegularOutput',
    parameters: {
      method: 'GET',
      url: expr('{{ $json.status_url }}'),
      authentication: 'predefinedCredentialType',
      nodeCredentialType: 'facebookGraphApi',
      options: { timeout: 30000, response: { response: { fullResponse: true, neverError: true } } },
    },
  },
  output: [{ statusCode: 200, body: { status_code: 'FINISHED', id: '9001' } }],
});

const instagramReady = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: "Ready to publish?",
    parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: "// Whether Instagram has prepared the container, checked once a minute for\n// five minutes at most, as Meta asks. FINISHED goes on to publish. Still\n// IN_PROGRESS (a video takes a while), or no answer to the check, waits a\n// minute and asks again (\"Publish, wait or stop?\" sends it back). Anything\n// else ends here with nothing published, and says why. PUBLISHED means it\n// already went out, so it is never sent again by itself.\nconst CHECKS = 5;\n\nreturn $input.all().map(function (item, i) {\n  const box = $('Give Instagram time').itemMatching(i).json;\n  const res = item.json || {};\n  const out = function (fields) {\n    return { json: Object.assign({ post_id: box.post_id, place: box.place }, fields) };\n  };\n  const failed = function (error) {\n    return out({ ok: false, error: error, unknown: false });\n  };\n  const tries = (Number(box.tries) || 0) + 1;\n  const again = function (error) {\n    if (tries >= CHECKS) return failed(error);\n    return { json: Object.assign({}, box, { ok: false, again: true, tries: tries, wait: 60 }) };\n  };\n  const body = res.body && typeof res.body === 'object' ? res.body : {};\n  const status = typeof body.status_code === 'string' ? body.status_code : null;\n  const what = box.kind === 'video' ? 'video' : 'picture';\n  if (status === 'FINISHED') {\n    return out({ ok: true, creation_id: box.creation_id, publish_url: box.publish_url });\n  }\n  if (status === 'PUBLISHED') {\n    return out({ ok: false, unknown: true, error: 'Instagram says this was already published. Check the account before sending it again.' });\n  }\n  if (status === 'ERROR') {\n    return failed('Instagram could not use the ' + what + (body.status ? ' (' + String(body.status).slice(0, 200) + ')' : '') + '. Nothing went out.');\n  }\n  if (status === 'EXPIRED') return failed('Instagram let the post expire before it was published. Nothing went out: try again.');\n  if (status === 'IN_PROGRESS') return again('Instagram was still preparing the ' + what + ' after five minutes. Nothing went out: try again later.');\n  if (res.error || !(res.statusCode < 500)) {\n    return again('Instagram did not say whether the ' + what + ' was ready (' + (res.statusCode || 'no answer') + '). Nothing went out: try again.');\n  }\n  const e = body.error && typeof body.error === 'object' ? body.error : {};\n  return failed('Instagram would not say whether the ' + what + ' was ready (' + res.statusCode + (e.code ? ', code ' + e.code : '') + '): ' + String(e.message || 'no reason given').slice(0, 300) + '. Nothing went out.');\n});\n" },
  },
  output: [{ post_id: 'post-id', place: 'instagram', ok: true, creation_id: '9001', publish_url: 'https://graph.facebook.com/v25.0/17841400000000000/media_publish' }],
});

const instagramNext = switchCase({
  version: 3.4,
  config: {
    name: "Publish, wait or stop?",
    parameters: {
      mode: 'rules',
      rules: {
        values: [
          { outputKey: 'publish', conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 2 }, conditions: [{ leftValue: expr("{{ $json.ok === true }}"), rightValue: true, operator: { type: 'boolean', operation: 'true', singleValue: true } }], combinator: 'and' } },
          { outputKey: 'wait', conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 2 }, conditions: [{ leftValue: expr("{{ $json.again === true }}"), rightValue: true, operator: { type: 'boolean', operation: 'true', singleValue: true } }], combinator: 'and' } },
          { outputKey: 'stop', conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 2 }, conditions: [{ leftValue: expr("{{ $json.ok !== true && $json.again !== true }}"), rightValue: true, operator: { type: 'boolean', operation: 'true', singleValue: true } }], combinator: 'and' } },
        ],
      },
      options: {},
    },
  },
});

const instagramPublish = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: {
    name: "Instagram: publish",
    onError: 'continueRegularOutput',
    parameters: {
      method: 'POST',
      url: expr('{{ $json.publish_url }}'),
      authentication: 'predefinedCredentialType',
      nodeCredentialType: 'facebookGraphApi',
      sendBody: true,
      contentType: 'json',
      specifyBody: 'json',
      jsonBody: expr("{{ JSON.stringify({ creation_id: $json.creation_id }) }}"),
      options: { timeout: 120000, response: { response: { fullResponse: true, neverError: true } } },
    },
  },
  output: [{ statusCode: 200, body: { id: '17900000000000001' } }],
});

const instagramLink = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: {
    name: "Instagram: its link",
    onError: 'continueRegularOutput',
    parameters: {
      method: 'GET',
      url: expr('https://graph.facebook.com/v25.0/{{ $json.body && $json.body.id }}?fields=permalink'),
      authentication: 'predefinedCredentialType',
      nodeCredentialType: 'facebookGraphApi',
      options: { timeout: 30000, response: { response: { fullResponse: true, neverError: true } } },
    },
  },
  output: [{ statusCode: 200, body: { permalink: 'https://www.instagram.com/p/AbC123/', id: '17900000000000001' } }],
});

const instagramAnswer = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: "Read Instagram's answer",
    parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: "// Instagram's answer to publishing, in the shape the stand-in documents (see\n// publisher-facebook-answer.js), with the post's link when Instagram gives it.\n// Publishing is the one step that makes the post public: an answer lost after\n// it was sent is unknown, never sent again by itself.\nfunction said(error) {\n  if (!error) return '';\n  if (typeof error === 'string') return error;\n  return String(error.message || error.description || JSON.stringify(error));\n}\n\nreturn $input.all().map(function (item, i) {\n  const box = $('Publish, wait or stop?').itemMatching(i).json;\n  const pub = $('Instagram: publish').itemMatching(i).json || {};\n  const link = item.json || {};\n  const out = function (fields) {\n    return { json: Object.assign({ post_id: box.post_id, place: box.place }, fields) };\n  };\n  const failed = function (error) {\n    return out({ ok: false, error: error, unknown: false });\n  };\n  const unknown = function (error) {\n    return out({ ok: false, error: error, unknown: true });\n  };\n\n  if (pub.statusCode === undefined && !pub.error) {\n    return failed('Instagram was not asked to publish: attach the “Facebook Graph API” credential to “Instagram: publish” in n8n.');\n  }\n  if (pub.error) {\n    const why = said(pub.error).slice(0, 200);\n    if (/credential|ENOTFOUND|EAI_AGAIN|ECONNREFUSED|certificate/i.test(why)) return failed('Instagram could not be asked to publish (' + why + '). Nothing went out: try again.');\n    return unknown('Instagram did not answer after publishing was asked for (' + why + '). Check the account before sending it again.');\n  }\n  const body = pub.body && typeof pub.body === 'object' ? pub.body : {};\n  if (pub.statusCode >= 200 && pub.statusCode < 300) {\n    if (!body.id) return unknown('Instagram answered without the post’s id. Check the account before sending it again.');\n    const permalink = link.body && typeof link.body === 'object' && typeof link.body.permalink === 'string' ? link.body.permalink : null;\n    return out({ ok: true, remote_id: String(body.id), remote_url: permalink, stand_in: false });\n  }\n  if (pub.statusCode >= 500) {\n    return unknown('Instagram had a problem after publishing was asked for (' + pub.statusCode + '). Check the account before sending it again.');\n  }\n  const e = body.error && typeof body.error === 'object' ? body.error : {};\n  const message = String(e.error_user_msg || e.message || 'no reason given').slice(0, 300);\n  if (e.code === 9007) return failed('Instagram had not finished preparing it. Nothing went out: try again in a few minutes.');\n  if (e.error_subcode === 2207042) return failed('Instagram allows 100 posts a day through its API, and that is reached. Nothing went out: try again tomorrow.');\n  if (e.code === 190) return failed('The Facebook token has expired or was revoked. Make a new Page access token and update the “Facebook Graph API” credential in n8n.');\n  return failed('Instagram would not publish it (' + pub.statusCode + (e.code ? ', code ' + e.code : '') + '): ' + message);\n});\n" },
  },
  output: [{ ok: true, post_id: 'post-id', place: 'instagram', remote_id: '17900000000000001', remote_url: 'https://www.instagram.com/p/AbC123/', stand_in: false }],
});

// ---- LinkedIn: the picture or the video uploaded first, then the post names it.

const planLinkedin = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: "Plan the LinkedIn post",
    parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: "// A post on the LinkedIn Page through its Posts API, as the Page\n// (urn:li:organization:{id}). A picture or a video is uploaded to LinkedIn\n// first and the post names it. The API version is pinned: LinkedIn keeps each\n// one a year (202609 until about September 2027), so move it on before then.\n// The words go in LinkedIn's \"little\" text format, where \\ | { } @ [ ] ( ) < >\n// # * _ ~ mean something: they are escaped, so the post reads as written.\nconst VERSION = '202609';\n\nfunction little(text) {\n  return String(text || '').replace(/[\\\\|{}@[\\]()<>#*_~]/g, '\\\\$&');\n}\n\nreturn $input.all().map(function (item) {\n  const p = item.json;\n  const owner = 'urn:li:organization:' + String(p.page.id);\n  const kind = p.media_url ? (p.media_kind === 'video' ? 'video' : 'image') : 'none';\n  return {\n    json: {\n      ok: true,\n      post_id: p.post_id,\n      place: p.place,\n      owner: owner,\n      kind: kind,\n      version: VERSION,\n      media_url: p.media_url,\n      post: {\n        author: owner,\n        commentary: little(p.text),\n        visibility: 'PUBLIC',\n        distribution: { feedDistribution: 'MAIN_FEED', targetEntities: [], thirdPartyDistributionChannels: [] },\n        lifecycleState: 'PUBLISHED',\n        isReshareDisabledByAuthor: false,\n      },\n    },\n  };\n});\n" },
  },
  output: [{ ok: true, post_id: 'post-id', place: 'linkedin', owner: 'urn:li:organization:98765', kind: 'image', version: '202609', media_url: 'https://example.com/file.jpg', post: { author: 'urn:li:organization:98765', commentary: 'Plan your EB-5 path.', visibility: 'PUBLIC', lifecycleState: 'PUBLISHED' } }],
});

const linkedinUpload = switchCase({
  version: 3.4,
  config: {
    name: "Which LinkedIn upload?",
    parameters: {
      mode: 'rules',
      rules: {
        values: [
          { outputKey: 'picture', conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 2 }, conditions: [{ leftValue: expr("{{ $json.kind === \"image\" }}"), rightValue: true, operator: { type: 'boolean', operation: 'true', singleValue: true } }], combinator: 'and' } },
          { outputKey: 'video', conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 2 }, conditions: [{ leftValue: expr("{{ $json.kind === \"video\" }}"), rightValue: true, operator: { type: 'boolean', operation: 'true', singleValue: true } }], combinator: 'and' } },
          { outputKey: 'words', conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 2 }, conditions: [{ leftValue: expr("{{ $json.kind !== \"image\" && $json.kind !== \"video\" }}"), rightValue: true, operator: { type: 'boolean', operation: 'true', singleValue: true } }], combinator: 'and' } },
        ],
      },
      options: {},
    },
  },
});

const startPicture = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: {
    name: "LinkedIn: start the picture",
    onError: 'continueRegularOutput',
    parameters: {
      method: 'POST',
      url: 'https://api.linkedin.com/rest/images?action=initializeUpload',
      authentication: 'predefinedCredentialType',
      nodeCredentialType: 'linkedInCommunityManagementOAuth2Api',
      sendHeaders: true,
      headerParameters: { parameters: [{ name: 'LinkedIn-Version', value: expr('{{ $("Plan the LinkedIn post").item.json.version }}') }, { name: 'X-Restli-Protocol-Version', value: '2.0.0' }] },
      sendBody: true,
      contentType: 'json',
      specifyBody: 'json',
      jsonBody: expr("{{ JSON.stringify({ initializeUploadRequest: { owner: $json.owner } }) }}"),
      options: { timeout: 60000, response: { response: { fullResponse: true, neverError: true } } },
    },
  },
  output: [{ statusCode: 200, body: { value: { uploadUrl: 'https://www.linkedin.com/dms-uploads/abc', image: 'urn:li:image:C4E10AQ' } } }],
});

const pictureStarted = ifElse({
  version: 2.3,
  config: {
    name: "Picture started?",
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 2 },
        conditions: [{ leftValue: expr("{{ $json.statusCode >= 200 && $json.statusCode < 300 && !!($json.body && $json.body.value && $json.body.value.uploadUrl) }}"), rightValue: true, operator: { type: 'boolean', operation: 'true', singleValue: true } }],
        combinator: 'and',
      },
    },
  },
});

const getPicture = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: {
    name: "Get the picture",
    onError: 'continueRegularOutput',
    parameters: {
      method: 'GET',
      url: expr('{{ $("Plan the LinkedIn post").item.json.media_url }}'),
      options: { timeout: 60000, response: { response: { responseFormat: 'file', outputPropertyName: 'data' } } },
    },
  },
  output: [{}],
});

const sendPicture = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: {
    name: "LinkedIn: send the picture",
    onError: 'continueRegularOutput',
    parameters: {
      method: 'PUT',
      url: expr('{{ $("LinkedIn: start the picture").item.json.body.value.uploadUrl }}'),
      authentication: 'predefinedCredentialType',
      nodeCredentialType: 'linkedInCommunityManagementOAuth2Api',
      sendBody: true,
      contentType: 'binaryData',
      inputDataFieldName: 'data',
      options: { timeout: 120000, response: { response: { fullResponse: true, neverError: true } } },
    },
  },
  output: [{ statusCode: 201, body: '' }],
});

const pictureSent = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: "Picture sent?",
    parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: "// LinkedIn's reason for refusing a request, made plain where it is a known one.\n// Shared by the LinkedIn steps' scripts in the publisher and in Post results\n// (the build puts it before each).\nfunction linkedinRefusal(res, doing) {\n  const body = res && res.body && typeof res.body === 'object' ? res.body : {};\n  const message = String(body.message || body.error_description || body.error || 'no reason given').slice(0, 300);\n  const status = res && res.statusCode;\n  if (status === 401) return 'The LinkedIn token has expired or was revoked: reconnect the “LinkedIn Community Management” credential in n8n.';\n  if (status === 403) {\n    return 'LinkedIn would not let the app ' + doing + ' (' + message + '). It needs LinkedIn’s approval for the Community Management API, and the person who connected it must be an admin of the Page.';\n  }\n  if (status === 429) return 'LinkedIn is limiting requests right now: try again later.';\n  if (status === 426 || /version/i.test(message)) return 'LinkedIn no longer takes the API version this uses (' + message + '): move VERSION on in “Plan the LinkedIn post” (QGR · Publisher) and “Plan the read” (QGR · Post results).';\n  return 'LinkedIn would not ' + doing + ' (' + (status || 'no answer') + '): ' + message;\n}\n\n/** What n8n said when it could not make a request. */\nfunction linkedinSaid(error) {\n  if (!error) return '';\n  if (typeof error === 'string') return error;\n  return String(error.message || error.description || JSON.stringify(error));\n}\n\n// Whether the picture reached LinkedIn: LinkedIn gave an address to put it at\n// (and the image's id), and it was put there. Then the post names the image.\n// Nothing is public yet, so anything that went wrong fails: try again.\nreturn $input.all().map(function (item, i) {\n  const plan = $('Plan the LinkedIn post').itemMatching(i).json;\n  const start = $('LinkedIn: start the picture').itemMatching(i).json || {};\n  const put = item.json || {};\n  const failed = function (error) {\n    return { json: { ok: false, post_id: plan.post_id, place: plan.place, error: error, unknown: false } };\n  };\n  if (start.statusCode === undefined && !start.error) {\n    return failed('LinkedIn was not asked: attach the “LinkedIn Community Management” credential to the LinkedIn steps in n8n.');\n  }\n  const image = start.body && start.body.value ? start.body.value.image : null;\n  if (start.error || !(start.statusCode >= 200 && start.statusCode < 300) || !image) {\n    return failed(start.error ? 'LinkedIn could not be asked to take the picture (' + linkedinSaid(start.error).slice(0, 200) + '). Nothing went out: try again.' : linkedinRefusal(start, 'take the picture'));\n  }\n  if (put.error || !(put.statusCode >= 200 && put.statusCode < 300)) {\n    return failed('The picture could not be sent to LinkedIn (' + (put.statusCode || linkedinSaid(put.error).slice(0, 200) || 'no answer') + '). Nothing went out: try again.');\n  }\n  const post = Object.assign({}, plan.post, { content: { media: { id: image } } });\n  return { json: { ok: true, post_id: plan.post_id, place: plan.place, version: plan.version, post: post } };\n});\n" },
  },
  output: [{ ok: true, post_id: 'post-id', place: 'linkedin', version: '202609', post: { author: 'urn:li:organization:98765', content: { media: { id: 'urn:li:image:C4E10AQ' } } } }],
});

const videoSize = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: {
    name: "Find the video's size",
    onError: 'continueRegularOutput',
    parameters: {
      method: 'GET',
      url: expr('{{ $json.media_url }}'),
      sendHeaders: true,
      headerParameters: { parameters: [{ name: 'Range', value: 'bytes=0-0' }] },
      options: { timeout: 30000, response: { response: { fullResponse: true, neverError: true, responseFormat: 'text', outputPropertyName: 'data' } } },
    },
  },
  output: [{ statusCode: 206, headers: { 'content-range': 'bytes 0-0/6000001' }, data: 'x' }],
});

const sizeRead = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: "How big is the video?",
    parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: "// LinkedIn's reason for refusing a request, made plain where it is a known one.\n// Shared by the LinkedIn steps' scripts in the publisher and in Post results\n// (the build puts it before each).\nfunction linkedinRefusal(res, doing) {\n  const body = res && res.body && typeof res.body === 'object' ? res.body : {};\n  const message = String(body.message || body.error_description || body.error || 'no reason given').slice(0, 300);\n  const status = res && res.statusCode;\n  if (status === 401) return 'The LinkedIn token has expired or was revoked: reconnect the “LinkedIn Community Management” credential in n8n.';\n  if (status === 403) {\n    return 'LinkedIn would not let the app ' + doing + ' (' + message + '). It needs LinkedIn’s approval for the Community Management API, and the person who connected it must be an admin of the Page.';\n  }\n  if (status === 429) return 'LinkedIn is limiting requests right now: try again later.';\n  if (status === 426 || /version/i.test(message)) return 'LinkedIn no longer takes the API version this uses (' + message + '): move VERSION on in “Plan the LinkedIn post” (QGR · Publisher) and “Plan the read” (QGR · Post results).';\n  return 'LinkedIn would not ' + doing + ' (' + (status || 'no answer') + '): ' + message;\n}\n\n/** What n8n said when it could not make a request. */\nfunction linkedinSaid(error) {\n  if (!error) return '';\n  if (typeof error === 'string') return error;\n  return String(error.message || error.description || JSON.stringify(error));\n}\n\n// How big the video is, from Storage's answer to a request for its first byte\n// (206, Content-Range: bytes 0-0/<size>): LinkedIn asks for the size before it\n// takes a video, and splits it into parts by it. Storage reads each part the\n// same way, so an answer that is not a part fails here, before LinkedIn is\n// asked anything.\nreturn $input.all().map(function (item, i) {\n  const plan = $('Plan the LinkedIn post').itemMatching(i).json;\n  const res = item.json || {};\n  const headers = res.headers && typeof res.headers === 'object' ? res.headers : {};\n  const match = /\\/(\\d+)\\s*$/.exec(String(headers['content-range'] || ''));\n  const size = match ? Number(match[1]) : 0;\n  if (res.statusCode !== 206 || !(size > 0)) {\n    const why = res.statusCode || linkedinSaid(res.error).slice(0, 120) || 'no answer';\n    return { json: { ok: false, post_id: plan.post_id, place: plan.place, error: 'The video could not be read from Storage in parts (' + why + '). Nothing went out: try again.', unknown: false } };\n  }\n  return { json: { ok: true, post_id: plan.post_id, place: plan.place, size: size } };\n});\n" },
  },
  output: [{ ok: true, post_id: 'post-id', place: 'linkedin', size: 6000001 }],
});

const sizeKnown = ifElse({
  version: 2.3,
  config: {
    name: "Size known?",
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 },
        conditions: [{ leftValue: expr('{{ $json.ok }}'), rightValue: true, operator: { type: 'boolean', operation: 'true', singleValue: true } }],
        combinator: 'and',
      },
    },
  },
});

const startVideo = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: {
    name: "LinkedIn: start the video",
    onError: 'continueRegularOutput',
    parameters: {
      method: 'POST',
      url: 'https://api.linkedin.com/rest/videos?action=initializeUpload',
      authentication: 'predefinedCredentialType',
      nodeCredentialType: 'linkedInCommunityManagementOAuth2Api',
      sendHeaders: true,
      headerParameters: { parameters: [{ name: 'LinkedIn-Version', value: expr('{{ $("Plan the LinkedIn post").item.json.version }}') }, { name: 'X-Restli-Protocol-Version', value: '2.0.0' }] },
      sendBody: true,
      contentType: 'json',
      specifyBody: 'json',
      jsonBody: expr("{{ JSON.stringify({ initializeUploadRequest: { owner: $(\"Plan the LinkedIn post\").item.json.owner, fileSizeBytes: $json.size, uploadCaptions: false, uploadThumbnail: false } }) }}"),
      options: { timeout: 60000, response: { response: { fullResponse: true, neverError: true } } },
    },
  },
  output: [{ statusCode: 200, body: { value: { video: 'urn:li:video:C5F10AQ', uploadToken: '', uploadInstructions: [{ uploadUrl: 'https://www.linkedin.com/dms-uploads/abc', firstByte: 0, lastByte: 6000000 }] } } }],
});

const eachPart = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: "One item per part",
    parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: "// LinkedIn's reason for refusing a request, made plain where it is a known one.\n// Shared by the LinkedIn steps' scripts in the publisher and in Post results\n// (the build puts it before each).\nfunction linkedinRefusal(res, doing) {\n  const body = res && res.body && typeof res.body === 'object' ? res.body : {};\n  const message = String(body.message || body.error_description || body.error || 'no reason given').slice(0, 300);\n  const status = res && res.statusCode;\n  if (status === 401) return 'The LinkedIn token has expired or was revoked: reconnect the “LinkedIn Community Management” credential in n8n.';\n  if (status === 403) {\n    return 'LinkedIn would not let the app ' + doing + ' (' + message + '). It needs LinkedIn’s approval for the Community Management API, and the person who connected it must be an admin of the Page.';\n  }\n  if (status === 429) return 'LinkedIn is limiting requests right now: try again later.';\n  if (status === 426 || /version/i.test(message)) return 'LinkedIn no longer takes the API version this uses (' + message + '): move VERSION on in “Plan the LinkedIn post” (QGR · Publisher) and “Plan the read” (QGR · Post results).';\n  return 'LinkedIn would not ' + doing + ' (' + (status || 'no answer') + '): ' + message;\n}\n\n/** What n8n said when it could not make a request. */\nfunction linkedinSaid(error) {\n  if (!error) return '';\n  if (typeof error === 'string') return error;\n  return String(error.message || error.description || JSON.stringify(error));\n}\n\n// LinkedIn takes a video in parts: its answer to starting the upload lists the\n// byte ranges, each with its own address. One item per part, each carrying the\n// range n8n reads from the file (Storage answers a Range request with just\n// those bytes, so the file is never cut up here) and the address to put it.\nreturn $input.all().reduce(function (items, item, i) {\n  const plan = $('Plan the LinkedIn post').itemMatching(i).json;\n  const res = item.json || {};\n  const failed = function (error) {\n    items.push({ json: { ok: false, post_id: plan.post_id, place: plan.place, error: error, unknown: false }, pairedItem: { item: i } });\n    return items;\n  };\n  if (res.statusCode === undefined && !res.error) {\n    return failed('LinkedIn was not asked: attach the “LinkedIn Community Management” credential to the LinkedIn steps in n8n.');\n  }\n  if (res.error) return failed('LinkedIn could not be asked to take the video (' + linkedinSaid(res.error).slice(0, 200) + '). Nothing went out: try again.');\n  const value = res.body && res.body.value ? res.body.value : null;\n  const parts = value && Array.isArray(value.uploadInstructions) ? value.uploadInstructions : [];\n  if (!(res.statusCode >= 200 && res.statusCode < 300) || !value || !value.video || parts.length === 0) {\n    return failed(linkedinRefusal(res, 'take the video'));\n  }\n  parts.forEach(function (part, k) {\n    items.push({\n      json: {\n        ok: true,\n        post_id: plan.post_id,\n        place: plan.place,\n        part: k,\n        parts: parts.length,\n        media_url: plan.media_url,\n        range: 'bytes=' + part.firstByte + '-' + part.lastByte,\n        upload_url: part.uploadUrl,\n        video: value.video,\n        upload_token: value.uploadToken || '',\n      },\n      pairedItem: { item: i },\n    });\n  });\n  return items;\n}, []);\n" },
  },
  output: [{ ok: true, post_id: 'post-id', place: 'linkedin', part: 0, parts: 1, media_url: 'https://example.com/file.mp4', range: 'bytes=0-6000000', upload_url: 'https://www.linkedin.com/dms-uploads/abc', video: 'urn:li:video:C5F10AQ', upload_token: '' }],
});

const partsToSend = ifElse({
  version: 2.3,
  config: {
    name: "Parts to send?",
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 },
        conditions: [{ leftValue: expr('{{ $json.ok }}'), rightValue: true, operator: { type: 'boolean', operation: 'true', singleValue: true } }],
        combinator: 'and',
      },
    },
  },
});

const getPart = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: {
    name: "Get the part",
    onError: 'continueRegularOutput',
    parameters: {
      method: 'GET',
      url: expr('{{ $json.media_url }}'),
      sendHeaders: true,
      headerParameters: { parameters: [{ name: 'Range', value: expr('{{ $json.range }}') }] },
      options: { timeout: 120000, response: { response: { responseFormat: 'file', outputPropertyName: 'data' } } },
    },
  },
  output: [{}],
});

const sendPart = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: {
    name: "LinkedIn: send the part",
    onError: 'continueRegularOutput',
    parameters: {
      method: 'PUT',
      url: expr('{{ $("One item per part").item.json.upload_url }}'),
      authentication: 'predefinedCredentialType',
      nodeCredentialType: 'linkedInCommunityManagementOAuth2Api',
      sendHeaders: true,
      headerParameters: { parameters: [{ name: 'Content-Type', value: 'application/octet-stream' }] },
      sendBody: true,
      contentType: 'binaryData',
      inputDataFieldName: 'data',
      options: { timeout: 120000, response: { response: { fullResponse: true, neverError: true } } },
    },
  },
  output: [{ statusCode: 200, headers: { etag: '/ama/one' }, body: '' }],
});

const gatherParts = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: "Gather the parts",
    parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: "// LinkedIn's reason for refusing a request, made plain where it is a known one.\n// Shared by the LinkedIn steps' scripts in the publisher and in Post results\n// (the build puts it before each).\nfunction linkedinRefusal(res, doing) {\n  const body = res && res.body && typeof res.body === 'object' ? res.body : {};\n  const message = String(body.message || body.error_description || body.error || 'no reason given').slice(0, 300);\n  const status = res && res.statusCode;\n  if (status === 401) return 'The LinkedIn token has expired or was revoked: reconnect the “LinkedIn Community Management” credential in n8n.';\n  if (status === 403) {\n    return 'LinkedIn would not let the app ' + doing + ' (' + message + '). It needs LinkedIn’s approval for the Community Management API, and the person who connected it must be an admin of the Page.';\n  }\n  if (status === 429) return 'LinkedIn is limiting requests right now: try again later.';\n  if (status === 426 || /version/i.test(message)) return 'LinkedIn no longer takes the API version this uses (' + message + '): move VERSION on in “Plan the LinkedIn post” (QGR · Publisher) and “Plan the read” (QGR · Post results).';\n  return 'LinkedIn would not ' + doing + ' (' + (status || 'no answer') + '): ' + message;\n}\n\n/** What n8n said when it could not make a request. */\nfunction linkedinSaid(error) {\n  if (!error) return '';\n  if (typeof error === 'string') return error;\n  return String(error.message || error.description || JSON.stringify(error));\n}\n\n// The video's parts gathered back into one item per post: LinkedIn names each\n// part it took by the ETag of its answer, and finishing the upload lists them\n// in the order the parts were given. A part that did not go fails the post.\nreturn $input.all().reduce(function (posts, item, i) {\n  const part = $('One item per part').itemMatching(i).json;\n  const res = item.json || {};\n  const key = part.post_id + '|' + part.place;\n  let post = posts.find(function (p) {\n    return p.key === key;\n  });\n  if (!post) {\n    post = { key: key, first: i, part: part, etags: [], problem: null };\n    posts.push(post);\n  }\n  const headers = res.headers && typeof res.headers === 'object' ? res.headers : {};\n  const etag = typeof headers.etag === 'string' ? headers.etag.replace(/^W\\//, '').replace(/^\"|\"$/g, '') : '';\n  if (res.error || !(res.statusCode >= 200 && res.statusCode < 300) || !etag) {\n    post.problem = post.problem || 'Part ' + (part.part + 1) + ' of ' + part.parts + ' could not be sent to LinkedIn (' + (res.statusCode || linkedinSaid(res.error).slice(0, 120) || 'no answer') + ').';\n  } else {\n    post.etags[part.part] = etag;\n  }\n  return posts;\n}, []).map(function (post) {\n  const p = post.part;\n  const complete = post.etags.length === p.parts && post.etags.every(Boolean);\n  if (post.problem || !complete) {\n    return {\n      json: { ok: false, post_id: p.post_id, place: p.place, error: (post.problem || 'Not every part of the video reached LinkedIn.') + ' Nothing went out: try again.', unknown: false },\n      pairedItem: { item: post.first },\n    };\n  }\n  return {\n    json: { ok: true, post_id: p.post_id, place: p.place, video: p.video, upload_token: p.upload_token, etags: post.etags },\n    pairedItem: { item: post.first },\n  };\n});\n" },
  },
  output: [{ ok: true, post_id: 'post-id', place: 'linkedin', video: 'urn:li:video:C5F10AQ', upload_token: '', etags: ['/ama/one'] }],
});

const partsSent = ifElse({
  version: 2.3,
  config: {
    name: "Parts sent?",
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 },
        conditions: [{ leftValue: expr('{{ $json.ok }}'), rightValue: true, operator: { type: 'boolean', operation: 'true', singleValue: true } }],
        combinator: 'and',
      },
    },
  },
});

const finishVideo = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: {
    name: "LinkedIn: finish the video",
    onError: 'continueRegularOutput',
    parameters: {
      method: 'POST',
      url: 'https://api.linkedin.com/rest/videos?action=finalizeUpload',
      authentication: 'predefinedCredentialType',
      nodeCredentialType: 'linkedInCommunityManagementOAuth2Api',
      sendHeaders: true,
      headerParameters: { parameters: [{ name: 'LinkedIn-Version', value: expr('{{ $("Plan the LinkedIn post").item.json.version }}') }, { name: 'X-Restli-Protocol-Version', value: '2.0.0' }] },
      sendBody: true,
      contentType: 'json',
      specifyBody: 'json',
      jsonBody: expr("{{ JSON.stringify({ finalizeUploadRequest: { video: $json.video, uploadToken: $json.upload_token, uploadedPartIds: $json.etags } }) }}"),
      options: { timeout: 60000, response: { response: { fullResponse: true, neverError: true } } },
    },
  },
  output: [{ statusCode: 200, body: '' }],
});

const videoSent = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: "Video sent?",
    parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: "// LinkedIn's reason for refusing a request, made plain where it is a known one.\n// Shared by the LinkedIn steps' scripts in the publisher and in Post results\n// (the build puts it before each).\nfunction linkedinRefusal(res, doing) {\n  const body = res && res.body && typeof res.body === 'object' ? res.body : {};\n  const message = String(body.message || body.error_description || body.error || 'no reason given').slice(0, 300);\n  const status = res && res.statusCode;\n  if (status === 401) return 'The LinkedIn token has expired or was revoked: reconnect the “LinkedIn Community Management” credential in n8n.';\n  if (status === 403) {\n    return 'LinkedIn would not let the app ' + doing + ' (' + message + '). It needs LinkedIn’s approval for the Community Management API, and the person who connected it must be an admin of the Page.';\n  }\n  if (status === 429) return 'LinkedIn is limiting requests right now: try again later.';\n  if (status === 426 || /version/i.test(message)) return 'LinkedIn no longer takes the API version this uses (' + message + '): move VERSION on in “Plan the LinkedIn post” (QGR · Publisher) and “Plan the read” (QGR · Post results).';\n  return 'LinkedIn would not ' + doing + ' (' + (status || 'no answer') + '): ' + message;\n}\n\n/** What n8n said when it could not make a request. */\nfunction linkedinSaid(error) {\n  if (!error) return '';\n  if (typeof error === 'string') return error;\n  return String(error.message || error.description || JSON.stringify(error));\n}\n\n// Whether LinkedIn took the whole video: finishing the upload was accepted.\n// LinkedIn then processes it, so it is checked before the post names it\n// (\"Video ready?\"), the first time after twenty seconds. Nothing is public\n// yet, so anything that went wrong fails: try again.\nreturn $input.all().map(function (item, i) {\n  const plan = $('Plan the LinkedIn post').itemMatching(i).json;\n  const gathered = $('Gather the parts').itemMatching(i).json;\n  const res = item.json || {};\n  const failed = function (error) {\n    return { json: { ok: false, post_id: plan.post_id, place: plan.place, error: error, unknown: false } };\n  };\n  if (res.error) return failed('LinkedIn could not be asked to finish the video (' + linkedinSaid(res.error).slice(0, 200) + '). Nothing went out: try again.');\n  if (!(res.statusCode >= 200 && res.statusCode < 300)) return failed(linkedinRefusal(res, 'finish the video'));\n  const post = Object.assign({}, plan.post, { content: { media: { id: gathered.video } } });\n  return { json: { ok: true, post_id: plan.post_id, place: plan.place, version: plan.version, video: gathered.video, post: post, tries: 0, wait: 20 } };\n});\n" },
  },
  output: [{ ok: true, post_id: 'post-id', place: 'linkedin', version: '202609', video: 'urn:li:video:C5F10AQ', post: { author: 'urn:li:organization:98765', content: { media: { id: 'urn:li:video:C5F10AQ' } } }, tries: 0, wait: 20 }],
});

const videoTaken = ifElse({
  version: 2.3,
  config: {
    name: "Video taken?",
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 },
        conditions: [{ leftValue: expr('{{ $json.ok }}'), rightValue: true, operator: { type: 'boolean', operation: 'true', singleValue: true } }],
        combinator: 'and',
      },
    },
  },
});

const linkedinWait = node({
  type: 'n8n-nodes-base.wait',
  version: 1.1,
  config: {
    name: "Give LinkedIn time",
    parameters: {
      resume: 'timeInterval',
      amount: expr('{{ $input.all().reduce((most, item) => Math.max(most, Number(item.json.wait) || 0), 10) }}'),
      unit: 'seconds',
    },
  },
  output: [{}],
});

const videoStatus = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: {
    name: "LinkedIn: is the video ready?",
    onError: 'continueRegularOutput',
    parameters: {
      method: 'GET',
      url: expr('https://api.linkedin.com/rest/videos/{{ encodeURIComponent($json.video) }}'),
      authentication: 'predefinedCredentialType',
      nodeCredentialType: 'linkedInCommunityManagementOAuth2Api',
      sendHeaders: true,
      headerParameters: { parameters: [{ name: 'LinkedIn-Version', value: expr('{{ $json.version }}') }, { name: 'X-Restli-Protocol-Version', value: '2.0.0' }] },
      options: { timeout: 30000, response: { response: { fullResponse: true, neverError: true } } },
    },
  },
  output: [{ statusCode: 200, body: { status: 'AVAILABLE', id: 'urn:li:video:C5F10AQ' } }],
});

const videoReady = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: "Video ready?",
    parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: "// LinkedIn's reason for refusing a request, made plain where it is a known one.\n// Shared by the LinkedIn steps' scripts in the publisher and in Post results\n// (the build puts it before each).\nfunction linkedinRefusal(res, doing) {\n  const body = res && res.body && typeof res.body === 'object' ? res.body : {};\n  const message = String(body.message || body.error_description || body.error || 'no reason given').slice(0, 300);\n  const status = res && res.statusCode;\n  if (status === 401) return 'The LinkedIn token has expired or was revoked: reconnect the “LinkedIn Community Management” credential in n8n.';\n  if (status === 403) {\n    return 'LinkedIn would not let the app ' + doing + ' (' + message + '). It needs LinkedIn’s approval for the Community Management API, and the person who connected it must be an admin of the Page.';\n  }\n  if (status === 429) return 'LinkedIn is limiting requests right now: try again later.';\n  if (status === 426 || /version/i.test(message)) return 'LinkedIn no longer takes the API version this uses (' + message + '): move VERSION on in “Plan the LinkedIn post” (QGR · Publisher) and “Plan the read” (QGR · Post results).';\n  return 'LinkedIn would not ' + doing + ' (' + (status || 'no answer') + '): ' + message;\n}\n\n/** What n8n said when it could not make a request. */\nfunction linkedinSaid(error) {\n  if (!error) return '';\n  if (typeof error === 'string') return error;\n  return String(error.message || error.description || JSON.stringify(error));\n}\n\n// Whether LinkedIn has processed the video, checked once a minute for five\n// minutes at most: the post names it only once it is AVAILABLE, because a post\n// whose video then fails to process is never shown. Still processing, or no\n// answer to the check, it waits a minute and asks again (\"Post, wait or\n// stop?\" sends it back). Nothing is public yet, so anything else fails: try\n// again.\nconst CHECKS = 5;\n\nreturn $input.all().map(function (item, i) {\n  const video = $('Give LinkedIn time').itemMatching(i).json;\n  const res = item.json || {};\n  const failed = function (error) {\n    return { json: { ok: false, post_id: video.post_id, place: video.place, error: error, unknown: false } };\n  };\n  const tries = (Number(video.tries) || 0) + 1;\n  const again = function (error) {\n    if (tries >= CHECKS) return failed(error);\n    return { json: Object.assign({}, video, { ok: false, again: true, tries: tries, wait: 60 }) };\n  };\n  const body = res.body && typeof res.body === 'object' ? res.body : {};\n  const status = typeof body.status === 'string' ? body.status : null;\n  if (status === 'AVAILABLE') {\n    return { json: { ok: true, post_id: video.post_id, place: video.place, version: video.version, post: video.post } };\n  }\n  if (status === 'PROCESSING_FAILED') {\n    return failed('LinkedIn could not process the video' + (body.processingFailureReason ? ' (' + String(body.processingFailureReason).slice(0, 200) + ')' : '') + '. Nothing went out.');\n  }\n  if (status === 'PROCESSING' || status === 'WAITING_UPLOAD') {\n    return again('LinkedIn was still processing the video after five minutes. Nothing went out: try again later.');\n  }\n  if (res.error || !(res.statusCode < 500)) {\n    return again('LinkedIn did not say whether the video was ready (' + (res.statusCode || linkedinSaid(res.error).slice(0, 120) || 'no answer') + '). Nothing went out: try again.');\n  }\n  return failed(linkedinRefusal(res, 'say whether the video is ready'));\n});\n" },
  },
  output: [{ ok: true, post_id: 'post-id', place: 'linkedin', version: '202609', post: { author: 'urn:li:organization:98765', content: { media: { id: 'urn:li:video:C5F10AQ' } } } }],
});

const linkedinNext = switchCase({
  version: 3.4,
  config: {
    name: "Post, wait or stop?",
    parameters: {
      mode: 'rules',
      rules: {
        values: [
          { outputKey: 'publish', conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 2 }, conditions: [{ leftValue: expr("{{ $json.ok === true }}"), rightValue: true, operator: { type: 'boolean', operation: 'true', singleValue: true } }], combinator: 'and' } },
          { outputKey: 'wait', conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 2 }, conditions: [{ leftValue: expr("{{ $json.again === true }}"), rightValue: true, operator: { type: 'boolean', operation: 'true', singleValue: true } }], combinator: 'and' } },
          { outputKey: 'stop', conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 2 }, conditions: [{ leftValue: expr("{{ $json.ok !== true && $json.again !== true }}"), rightValue: true, operator: { type: 'boolean', operation: 'true', singleValue: true } }], combinator: 'and' } },
        ],
      },
      options: {},
    },
  },
});

const readyToPost = ifElse({
  version: 2.3,
  config: {
    name: "Ready to post?",
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 },
        conditions: [{ leftValue: expr('{{ $json.ok }}'), rightValue: true, operator: { type: 'boolean', operation: 'true', singleValue: true } }],
        combinator: 'and',
      },
    },
  },
});

const linkedinPost = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: {
    name: "LinkedIn: post",
    onError: 'continueRegularOutput',
    parameters: {
      method: 'POST',
      url: 'https://api.linkedin.com/rest/posts',
      authentication: 'predefinedCredentialType',
      nodeCredentialType: 'linkedInCommunityManagementOAuth2Api',
      sendHeaders: true,
      headerParameters: { parameters: [{ name: 'LinkedIn-Version', value: expr('{{ $json.version }}') }, { name: 'X-Restli-Protocol-Version', value: '2.0.0' }] },
      sendBody: true,
      contentType: 'json',
      specifyBody: 'json',
      jsonBody: expr("{{ JSON.stringify($json.post) }}"),
      options: { timeout: 60000, response: { response: { fullResponse: true, neverError: true } } },
    },
  },
  output: [{ statusCode: 201, headers: { 'x-restli-id': 'urn:li:share:7123' }, body: '' }],
});

const linkedinAnswer = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: "Read LinkedIn's answer",
    parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: "// LinkedIn's reason for refusing a request, made plain where it is a known one.\n// Shared by the LinkedIn steps' scripts in the publisher and in Post results\n// (the build puts it before each).\nfunction linkedinRefusal(res, doing) {\n  const body = res && res.body && typeof res.body === 'object' ? res.body : {};\n  const message = String(body.message || body.error_description || body.error || 'no reason given').slice(0, 300);\n  const status = res && res.statusCode;\n  if (status === 401) return 'The LinkedIn token has expired or was revoked: reconnect the “LinkedIn Community Management” credential in n8n.';\n  if (status === 403) {\n    return 'LinkedIn would not let the app ' + doing + ' (' + message + '). It needs LinkedIn’s approval for the Community Management API, and the person who connected it must be an admin of the Page.';\n  }\n  if (status === 429) return 'LinkedIn is limiting requests right now: try again later.';\n  if (status === 426 || /version/i.test(message)) return 'LinkedIn no longer takes the API version this uses (' + message + '): move VERSION on in “Plan the LinkedIn post” (QGR · Publisher) and “Plan the read” (QGR · Post results).';\n  return 'LinkedIn would not ' + doing + ' (' + (status || 'no answer') + '): ' + message;\n}\n\n/** What n8n said when it could not make a request. */\nfunction linkedinSaid(error) {\n  if (!error) return '';\n  if (typeof error === 'string') return error;\n  return String(error.message || error.description || JSON.stringify(error));\n}\n\n// LinkedIn's answer to the post, in the shape the stand-in documents (see\n// publisher-facebook-answer.js). LinkedIn names the new post in a header\n// (x-restli-id), and its address follows from that name.\nreturn $input.all().map(function (item, i) {\n  const plan = $('Ready to post?').itemMatching(i).json;\n  const res = item.json || {};\n  const out = function (fields) {\n    return { json: Object.assign({ post_id: plan.post_id, place: plan.place }, fields) };\n  };\n  const failed = function (error) {\n    return out({ ok: false, error: error, unknown: false });\n  };\n  const unknown = function (error) {\n    return out({ ok: false, error: error, unknown: true });\n  };\n\n  if (res.statusCode === undefined && !res.error) {\n    return failed('LinkedIn was not asked: attach the “LinkedIn Community Management” credential to “LinkedIn: post” in n8n.');\n  }\n  if (res.error) {\n    const why = linkedinSaid(res.error).slice(0, 200);\n    if (/credential|ENOTFOUND|EAI_AGAIN|ECONNREFUSED|certificate/i.test(why)) return failed('LinkedIn could not be reached (' + why + '). Nothing went out: try again.');\n    return unknown('LinkedIn did not answer after the post was sent (' + why + '). Check the Page before sending it again.');\n  }\n  if (res.statusCode >= 200 && res.statusCode < 300) {\n    const headers = res.headers && typeof res.headers === 'object' ? res.headers : {};\n    const urn = headers['x-restli-id'] || headers['x-linkedin-id'] || (res.body && res.body.id) || null;\n    if (!urn) return unknown('LinkedIn answered without the post’s id. Check the Page before sending it again.');\n    return out({ ok: true, remote_id: String(urn), remote_url: 'https://www.linkedin.com/feed/update/' + urn, stand_in: false });\n  }\n  if (res.statusCode >= 500) return unknown('LinkedIn had a problem after the post was sent (' + res.statusCode + '). Check the Page before sending it again.');\n  return failed(linkedinRefusal(res, 'post it'));\n});\n" },
  },
  output: [{ ok: true, post_id: 'post-id', place: 'linkedin', remote_id: 'urn:li:share:7123', remote_url: 'https://www.linkedin.com/feed/update/urn:li:share:7123', stand_in: false }],
});

// ---- every place's answer, stand-in or real, is recorded the same way.

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

const noteFlow = sticky('## Posting\nEvery minute, and at once when the dashboard sends a post now, the database hands over the places that are due (**publisher_take_due**, never the same one twice). **Post for real?** follows each place\'s switch in Settings, Where posts go: off, the place\'s stand-in answers and nothing goes out; on, the file is signed for an hour so the platform can fetch it, and the place\'s own steps post it. The result is recorded either way. A file goes from Storage once no post needs it: the platform keeps its own copy. A send cut off halfway is marked *check the Page* and never sent again by itself.', [everyMinute, postNow, takeDue, eachPlace, forReal], { color: 4 });
const noteStandIns = sticky('## Stand-ins\nThe way taken while a place is not switched to post for real (Settings, Where posts go). They post nothing and say so: the dashboard shows the post as a stand-in, and nothing is read for results. They answer in the shape the real steps do.', [wherePost, facebook, instagram, linkedin], { color: 3 });
const noteFacebook = sticky('## Facebook\nOne request to the Page (Graph API v25.0): a picture to /photos, a video to /videos on graph-video, or the words alone to /feed. Meta fetches the file from the signed link.\n\nThe token: a **Facebook Graph API** credential holding a Page access token with pages_manage_posts, pages_read_engagement and pages_show_list (a System User\'s token in Meta Business Suite does not expire). Attach it to **Facebook: post** and to the four Instagram steps. Until then those steps do not run and the post says why.', [planFacebook, facebookPost, facebookAnswer], { color: 5 });
const noteInstagram = sticky('## Instagram\nA container is made from the file (a picture, or a video as a Reel), checked after ten seconds (a minute for a video) and then once a minute for five minutes at most, as Meta asks, and published once it is FINISHED. The account set in Settings is the Instagram professional account\'s id, linked to the Page; the token also needs instagram_basic and instagram_content_publish. Instagram takes 100 posts a day through its API.', [planInstagram, container, readContainer, containerMade, instagramWait, instagramStatus, instagramReady, instagramNext, instagramPublish, instagramLink, instagramAnswer], { color: 5 });
const noteLinkedin = sticky('## LinkedIn\nThe picture or the video is uploaded first (a video in the parts LinkedIn asks for, read from Storage a part at a time, then checked once a minute until LinkedIn has processed it), then the post names it, as the Page (urn:li:organization). API version 202609, pinned: LinkedIn keeps one a year. The words are escaped for LinkedIn\'s little text format, so they read as written.\n\nThe token: a **LinkedIn Community Management** credential (LinkedIn Community Management OAuth2 API) from an app LinkedIn has approved for the Community Management API, connected by an admin of the Page (w_organization_social, r_organization_social). Attach it to every LinkedIn step.', [planLinkedin, linkedinUpload, startPicture, pictureStarted, getPicture, sendPicture, pictureSent, videoSize, sizeRead, sizeKnown, startVideo, eachPart, partsToSend, getPart, sendPart, gatherParts, partsSent, finishVideo, videoSent, videoTaken, linkedinWait, videoStatus, videoReady, linkedinNext, readyToPost, linkedinPost, linkedinAnswer], { color: 5 });

export default workflow('qgr-publisher', 'QGR · Publisher')
  .add(everyMinute)
  .to(takeDue)
  .to(eachPlace)
  .to(forReal.onTrue(sign).onFalse(wherePost
    .onCase(0, facebook)
    .onCase(1, instagram)
    .onCase(2, linkedin)))
  .add(postNow)
  .to(takeDue)
  .add(facebook)
  .to(wentOut.onTrue(finish.to(fileToRemove.onTrue(removeFile))).onFalse(fail))
  .add(instagram)
  .to(wentOut)
  .add(linkedin)
  .to(wentOut)
  .add(sign)
  .to(withLink)
  .to(readyToSend.onTrue(whereReal
    .onCase(0, planFacebook)
    .onCase(1, planInstagram)
    .onCase(2, planLinkedin)).onFalse(wentOut))
  .add(planFacebook)
  .to(facebookPost)
  .to(facebookAnswer)
  .to(wentOut)
  .add(planInstagram)
  .to(container)
  .to(readContainer)
  .to(containerMade.onTrue(instagramWait).onFalse(wentOut))
  .add(instagramWait)
  .to(instagramStatus)
  .to(instagramReady)
  .to(instagramNext
    .onCase(0, instagramPublish)
    .onCase(1, instagramWait)
    .onCase(2, wentOut))
  .add(instagramPublish)
  .to(instagramLink)
  .to(instagramAnswer)
  .to(wentOut)
  .add(planLinkedin)
  .to(linkedinUpload
    .onCase(0, startPicture)
    .onCase(1, videoSize)
    .onCase(2, readyToPost))
  .add(startPicture)
  .to(pictureStarted.onTrue(getPicture).onFalse(pictureSent))
  .add(getPicture)
  .to(sendPicture)
  .to(pictureSent)
  .to(readyToPost.onTrue(linkedinPost).onFalse(wentOut))
  .add(videoSize)
  .to(sizeRead)
  .to(sizeKnown.onTrue(startVideo).onFalse(wentOut))
  .add(startVideo)
  .to(eachPart)
  .to(partsToSend.onTrue(getPart).onFalse(wentOut))
  .add(getPart)
  .to(sendPart)
  .to(gatherParts)
  .to(partsSent.onTrue(finishVideo).onFalse(wentOut))
  .add(finishVideo)
  .to(videoSent)
  .to(videoTaken.onTrue(linkedinWait).onFalse(wentOut))
  .add(linkedinWait)
  .to(videoStatus)
  .to(videoReady)
  .to(linkedinNext
    .onCase(0, readyToPost)
    .onCase(1, linkedinWait)
    .onCase(2, wentOut))
  .add(linkedinPost)
  .to(linkedinAnswer)
  .to(wentOut)
  .add(noteFlow)
  .add(noteStandIns)
  .add(noteFacebook)
  .add(noteInstagram)
  .add(noteLinkedin);
