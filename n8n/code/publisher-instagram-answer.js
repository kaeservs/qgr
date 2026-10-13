// Instagram's answer to publishing, in the shape the stand-in documents (see
// publisher-facebook-answer.js), with the post's link when Instagram gives it.
// Publishing is the one step that makes the post public: an answer lost after
// it was sent is unknown, never sent again by itself.
function said(error) {
  if (!error) return '';
  if (typeof error === 'string') return error;
  return String(error.message || error.description || JSON.stringify(error));
}

return $input.all().map(function (item, i) {
  const box = $('Publish, wait or stop?').itemMatching(i).json;
  const pub = $('Instagram: publish').itemMatching(i).json || {};
  const link = item.json || {};
  const out = function (fields) {
    return { json: Object.assign({ post_id: box.post_id, place: box.place }, fields) };
  };
  const failed = function (error) {
    return out({ ok: false, error: error, unknown: false });
  };
  const unknown = function (error) {
    return out({ ok: false, error: error, unknown: true });
  };

  if (pub.statusCode === undefined && !pub.error) {
    return failed('Instagram was not asked to publish: attach the “Facebook Graph API” credential to “Instagram: publish” in n8n.');
  }
  if (pub.error) {
    const why = said(pub.error).slice(0, 200);
    if (/credential|ENOTFOUND|EAI_AGAIN|ECONNREFUSED|certificate/i.test(why)) return failed('Instagram could not be asked to publish (' + why + '). Nothing went out: try again.');
    return unknown('Instagram did not answer after publishing was asked for (' + why + '). Check the account before sending it again.');
  }
  const body = pub.body && typeof pub.body === 'object' ? pub.body : {};
  if (pub.statusCode >= 200 && pub.statusCode < 300) {
    if (!body.id) return unknown('Instagram answered without the post’s id. Check the account before sending it again.');
    const permalink = link.body && typeof link.body === 'object' && typeof link.body.permalink === 'string' ? link.body.permalink : null;
    return out({ ok: true, remote_id: String(body.id), remote_url: permalink, stand_in: false });
  }
  if (pub.statusCode >= 500) {
    return unknown('Instagram had a problem after publishing was asked for (' + pub.statusCode + '). Check the account before sending it again.');
  }
  const e = body.error && typeof body.error === 'object' ? body.error : {};
  const message = String(e.error_user_msg || e.message || 'no reason given').slice(0, 300);
  if (e.code === 9007) return failed('Instagram had not finished preparing it. Nothing went out: try again in a few minutes.');
  if (e.error_subcode === 2207042) return failed('Instagram allows 100 posts a day through its API, and that is reached. Nothing went out: try again tomorrow.');
  if (e.code === 190) return failed('The Facebook token has expired or was revoked. Make a new Page access token and update the “Facebook Graph API” credential in n8n.');
  return failed('Instagram would not publish it (' + pub.statusCode + (e.code ? ', code ' + e.code : '') + '): ' + message);
});
