// Facebook's answer to the post, in the shape the stand-in documents:
//   posted:  { ok: true, post_id, place, remote_id, remote_url, stand_in: false }
//   failed:  { ok: false, post_id, place, error, unknown: false }, nothing went out
//   unknown: { ok: false, ..., unknown: true }, it may have: it is never sent
//            again by itself (rule 11), a person checks the Page first.
// A step that could not start (no credential attached) hands its input on, so
// an answer with no status at all means Facebook was never asked.
function said(error) {
  if (!error) return '';
  if (typeof error === 'string') return error;
  return String(error.message || error.description || JSON.stringify(error));
}

/** Graph API's own reason, made plain where it is a known one. Nothing went out. */
function refusal(error, status) {
  const e = error && typeof error === 'object' ? error : {};
  const message = String(e.error_user_msg || e.message || 'no reason given').slice(0, 300);
  if (e.code === 190) return 'The Facebook token has expired or was revoked. Make a new Page access token and update the “Facebook Graph API” credential in n8n.';
  if (e.code === 10 || (e.code >= 200 && e.code < 300)) return 'The token may not post to the Page: it needs pages_manage_posts and pages_read_engagement (' + message + ').';
  if (e.code === 4 || e.code === 17 || e.code === 32 || e.code === 613) return 'Facebook is limiting requests right now: try again later (' + message + ').';
  if (e.code === 506) return 'Facebook refused it as a duplicate of a recent post.';
  if (e.code === 368) return 'Facebook blocked the post: ' + message;
  return 'Facebook refused it (' + status + (e.code ? ', code ' + e.code : '') + '): ' + message;
}

return $input.all().map(function (item, i) {
  const plan = $('Plan the Facebook post').itemMatching(i).json;
  const res = item.json || {};
  const out = function (fields) {
    return { json: Object.assign({ post_id: plan.post_id, place: plan.place }, fields) };
  };
  const failed = function (error) {
    return out({ ok: false, error: error, unknown: false });
  };
  const unknown = function (error) {
    return out({ ok: false, error: error, unknown: true });
  };

  if (res.statusCode === undefined && !res.error) {
    return failed('Facebook was not asked: attach the “Facebook Graph API” credential (the Page’s access token) to “Facebook: post” in n8n.');
  }
  if (res.error) {
    const why = said(res.error).slice(0, 200);
    if (/credential/i.test(why)) return failed('Facebook was not asked: ' + why);
    if (/ENOTFOUND|EAI_AGAIN|ECONNREFUSED|certificate/i.test(why)) return failed('Facebook could not be reached (' + why + '). Nothing went out: try again.');
    return unknown('Facebook did not answer after the post was sent (' + why + '). Check the Page before sending it again.');
  }
  const body = res.body && typeof res.body === 'object' ? res.body : {};
  if (res.statusCode >= 200 && res.statusCode < 300) {
    if (!body.id) return unknown('Facebook answered without the post’s id. Check the Page before sending it again.');
    if (plan.kind === 'video') {
      return out({ ok: true, remote_id: String(body.id), remote_url: 'https://www.facebook.com/' + plan.page_id + '/videos/' + body.id, stand_in: false });
    }
    const postId = String(body.post_id || body.id);
    return out({ ok: true, remote_id: postId, remote_url: 'https://www.facebook.com/' + postId, stand_in: false });
  }
  if (res.statusCode >= 500) {
    return unknown('Facebook had a problem after the post was sent (' + res.statusCode + '). Check the Page before sending it again.');
  }
  return failed(refusal(body.error, res.statusCode));
});
