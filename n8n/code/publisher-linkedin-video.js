// Whether LinkedIn took the whole video: finishing the upload was accepted.
// LinkedIn then processes it, so it is checked before the post names it
// ("Video ready?"), the first time after twenty seconds. Nothing is public
// yet, so anything that went wrong fails: try again.
return $input.all().map(function (item, i) {
  const plan = $('Plan the LinkedIn post').itemMatching(i).json;
  const gathered = $('Gather the parts').itemMatching(i).json;
  const res = item.json || {};
  const failed = function (error) {
    return { json: { ok: false, post_id: plan.post_id, place: plan.place, error: error, unknown: false } };
  };
  if (res.error) return failed('LinkedIn could not be asked to finish the video (' + linkedinSaid(res.error).slice(0, 200) + '). Nothing went out: try again.');
  if (!(res.statusCode >= 200 && res.statusCode < 300)) return failed(linkedinRefusal(res, 'finish the video'));
  const post = Object.assign({}, plan.post, { content: { media: { id: gathered.video } } });
  return { json: { ok: true, post_id: plan.post_id, place: plan.place, version: plan.version, video: gathered.video, post: post, tries: 0, wait: 20 } };
});
