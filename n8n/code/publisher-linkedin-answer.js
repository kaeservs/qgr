// LinkedIn's answer to the post, in the shape the stand-in documents (see
// publisher-facebook-answer.js). LinkedIn names the new post in a header
// (x-restli-id), and its address follows from that name.
return $input.all().map(function (item, i) {
  const plan = $('Ready to post?').itemMatching(i).json;
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
    return failed('LinkedIn was not asked: attach the “LinkedIn Community Management” credential to “LinkedIn: post” in n8n.');
  }
  if (res.error) {
    const why = linkedinSaid(res.error).slice(0, 200);
    if (/credential|ENOTFOUND|EAI_AGAIN|ECONNREFUSED|certificate/i.test(why)) return failed('LinkedIn could not be reached (' + why + '). Nothing went out: try again.');
    return unknown('LinkedIn did not answer after the post was sent (' + why + '). Check the Page before sending it again.');
  }
  if (res.statusCode >= 200 && res.statusCode < 300) {
    const headers = res.headers && typeof res.headers === 'object' ? res.headers : {};
    const urn = headers['x-restli-id'] || headers['x-linkedin-id'] || (res.body && res.body.id) || null;
    if (!urn) return unknown('LinkedIn answered without the post’s id. Check the Page before sending it again.');
    return out({ ok: true, remote_id: String(urn), remote_url: 'https://www.linkedin.com/feed/update/' + urn, stand_in: false });
  }
  if (res.statusCode >= 500) return unknown('LinkedIn had a problem after the post was sent (' + res.statusCode + '). Check the Page before sending it again.');
  return failed(linkedinRefusal(res, 'post it'));
});
