// Whether the picture reached LinkedIn: LinkedIn gave an address to put it at
// (and the image's id), and it was put there. Then the post names the image.
// Nothing is public yet, so anything that went wrong fails: try again.
return $input.all().map(function (item, i) {
  const plan = $('Plan the LinkedIn post').itemMatching(i).json;
  const start = $('LinkedIn: start the picture').itemMatching(i).json || {};
  const put = item.json || {};
  const failed = function (error) {
    return { json: { ok: false, post_id: plan.post_id, place: plan.place, error: error, unknown: false } };
  };
  if (start.statusCode === undefined && !start.error) {
    return failed('LinkedIn was not asked: attach the “LinkedIn Community Management” credential to the LinkedIn steps in n8n.');
  }
  const image = start.body && start.body.value ? start.body.value.image : null;
  if (start.error || !(start.statusCode >= 200 && start.statusCode < 300) || !image) {
    return failed(start.error ? 'LinkedIn could not be asked to take the picture (' + linkedinSaid(start.error).slice(0, 200) + '). Nothing went out: try again.' : linkedinRefusal(start, 'take the picture'));
  }
  if (put.error || !(put.statusCode >= 200 && put.statusCode < 300)) {
    return failed('The picture could not be sent to LinkedIn (' + (put.statusCode || linkedinSaid(put.error).slice(0, 200) || 'no answer') + '). Nothing went out: try again.');
  }
  const post = Object.assign({}, plan.post, { content: { media: { id: image } } });
  return { json: { ok: true, post_id: plan.post_id, place: plan.place, version: plan.version, post: post } };
});
