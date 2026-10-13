// LinkedIn takes a video in parts: its answer to starting the upload lists the
// byte ranges, each with its own address. One item per part, each carrying the
// range n8n reads from the file (Storage answers a Range request with just
// those bytes, so the file is never cut up here) and the address to put it.
return $input.all().reduce(function (items, item, i) {
  const plan = $('Plan the LinkedIn post').itemMatching(i).json;
  const res = item.json || {};
  const failed = function (error) {
    items.push({ json: { ok: false, post_id: plan.post_id, place: plan.place, error: error, unknown: false }, pairedItem: { item: i } });
    return items;
  };
  if (res.statusCode === undefined && !res.error) {
    return failed('LinkedIn was not asked: attach the “LinkedIn Community Management” credential to the LinkedIn steps in n8n.');
  }
  if (res.error) return failed('LinkedIn could not be asked to take the video (' + linkedinSaid(res.error).slice(0, 200) + '). Nothing went out: try again.');
  const value = res.body && res.body.value ? res.body.value : null;
  const parts = value && Array.isArray(value.uploadInstructions) ? value.uploadInstructions : [];
  if (!(res.statusCode >= 200 && res.statusCode < 300) || !value || !value.video || parts.length === 0) {
    return failed(linkedinRefusal(res, 'take the video'));
  }
  parts.forEach(function (part, k) {
    items.push({
      json: {
        ok: true,
        post_id: plan.post_id,
        place: plan.place,
        part: k,
        parts: parts.length,
        media_url: plan.media_url,
        range: 'bytes=' + part.firstByte + '-' + part.lastByte,
        upload_url: part.uploadUrl,
        video: value.video,
        upload_token: value.uploadToken || '',
      },
      pairedItem: { item: i },
    });
  });
  return items;
}, []);
