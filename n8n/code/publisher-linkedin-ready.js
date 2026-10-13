// Whether LinkedIn has processed the video, checked once a minute for five
// minutes at most: the post names it only once it is AVAILABLE, because a post
// whose video then fails to process is never shown. Still processing, or no
// answer to the check, it waits a minute and asks again ("Post, wait or
// stop?" sends it back). Nothing is public yet, so anything else fails: try
// again.
const CHECKS = 5;

return $input.all().map(function (item, i) {
  const video = $('Give LinkedIn time').itemMatching(i).json;
  const res = item.json || {};
  const failed = function (error) {
    return { json: { ok: false, post_id: video.post_id, place: video.place, error: error, unknown: false } };
  };
  const tries = (Number(video.tries) || 0) + 1;
  const again = function (error) {
    if (tries >= CHECKS) return failed(error);
    return { json: Object.assign({}, video, { ok: false, again: true, tries: tries, wait: 60 }) };
  };
  const body = res.body && typeof res.body === 'object' ? res.body : {};
  const status = typeof body.status === 'string' ? body.status : null;
  if (status === 'AVAILABLE') {
    return { json: { ok: true, post_id: video.post_id, place: video.place, version: video.version, post: video.post } };
  }
  if (status === 'PROCESSING_FAILED') {
    return failed('LinkedIn could not process the video' + (body.processingFailureReason ? ' (' + String(body.processingFailureReason).slice(0, 200) + ')' : '') + '. Nothing went out.');
  }
  if (status === 'PROCESSING' || status === 'WAITING_UPLOAD') {
    return again('LinkedIn was still processing the video after five minutes. Nothing went out: try again later.');
  }
  if (res.error || !(res.statusCode < 500)) {
    return again('LinkedIn did not say whether the video was ready (' + (res.statusCode || linkedinSaid(res.error).slice(0, 120) || 'no answer') + '). Nothing went out: try again.');
  }
  return failed(linkedinRefusal(res, 'say whether the video is ready'));
});
