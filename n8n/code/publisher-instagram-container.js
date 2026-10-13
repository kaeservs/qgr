// Instagram's answer to making the container. A container is not a post, so
// anything that goes wrong here leaves nothing published: it fails, and Try
// again makes a new one. Made, it carries what the next steps ask with: the
// address to check it at and the one to publish it to.
const GRAPH = 'https://graph.facebook.com/v25.0/';

function said(error) {
  if (!error) return '';
  if (typeof error === 'string') return error;
  return String(error.message || error.description || JSON.stringify(error));
}

return $input.all().map(function (item, i) {
  const plan = $('Plan the Instagram post').itemMatching(i).json;
  const res = item.json || {};
  const failed = function (error) {
    return { json: { ok: false, post_id: plan.post_id, place: plan.place, error: error, unknown: false } };
  };
  if (res.statusCode === undefined && !res.error) {
    return failed('Instagram was not asked: attach the “Facebook Graph API” credential (the Page’s access token, with instagram_content_publish) to the Instagram steps in n8n.');
  }
  if (res.error) return failed('Instagram could not be asked to prepare the post (' + said(res.error).slice(0, 200) + '). Nothing went out: try again.');
  const body = res.body && typeof res.body === 'object' ? res.body : {};
  if (res.statusCode >= 200 && res.statusCode < 300 && body.id) {
    return {
      json: {
        ok: true,
        post_id: plan.post_id,
        place: plan.place,
        kind: plan.kind,
        wait: plan.wait,
        tries: 0,
        creation_id: String(body.id),
        status_url: GRAPH + body.id + '?fields=status_code,status',
        publish_url: GRAPH + plan.account + '/media_publish',
      },
    };
  }
  const e = body.error && typeof body.error === 'object' ? body.error : {};
  if (e.code === 190) return failed('The Facebook token has expired or was revoked. Make a new Page access token and update the “Facebook Graph API” credential in n8n.');
  if (e.code === 10 || (e.code >= 200 && e.code < 300)) {
    return failed('The token may not publish to Instagram: it needs instagram_basic and instagram_content_publish, and the account must be linked to the Page (' + String(e.message || '') + ').');
  }
  return failed('Instagram would not prepare the post (' + (res.statusCode || 'no answer') + (e.code ? ', code ' + e.code : '') + '): ' + String(e.error_user_msg || e.message || 'no reason given').slice(0, 300));
});
