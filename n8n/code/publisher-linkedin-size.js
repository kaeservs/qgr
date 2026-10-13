// How big the video is, from Storage's answer to a request for its first byte
// (206, Content-Range: bytes 0-0/<size>): LinkedIn asks for the size before it
// takes a video, and splits it into parts by it. Storage reads each part the
// same way, so an answer that is not a part fails here, before LinkedIn is
// asked anything.
return $input.all().map(function (item, i) {
  const plan = $('Plan the LinkedIn post').itemMatching(i).json;
  const res = item.json || {};
  const headers = res.headers && typeof res.headers === 'object' ? res.headers : {};
  const match = /\/(\d+)\s*$/.exec(String(headers['content-range'] || ''));
  const size = match ? Number(match[1]) : 0;
  if (res.statusCode !== 206 || !(size > 0)) {
    const why = res.statusCode || linkedinSaid(res.error).slice(0, 120) || 'no answer';
    return { json: { ok: false, post_id: plan.post_id, place: plan.place, error: 'The video could not be read from Storage in parts (' + why + '). Nothing went out: try again.', unknown: false } };
  }
  return { json: { ok: true, post_id: plan.post_id, place: plan.place, size: size } };
});
