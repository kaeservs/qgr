// The video's parts gathered back into one item per post: LinkedIn names each
// part it took by the ETag of its answer, and finishing the upload lists them
// in the order the parts were given. A part that did not go fails the post.
return $input.all().reduce(function (posts, item, i) {
  const part = $('One item per part').itemMatching(i).json;
  const res = item.json || {};
  const key = part.post_id + '|' + part.place;
  let post = posts.find(function (p) {
    return p.key === key;
  });
  if (!post) {
    post = { key: key, first: i, part: part, etags: [], problem: null };
    posts.push(post);
  }
  const headers = res.headers && typeof res.headers === 'object' ? res.headers : {};
  const etag = typeof headers.etag === 'string' ? headers.etag.replace(/^W\//, '').replace(/^"|"$/g, '') : '';
  if (res.error || !(res.statusCode >= 200 && res.statusCode < 300) || !etag) {
    post.problem = post.problem || 'Part ' + (part.part + 1) + ' of ' + part.parts + ' could not be sent to LinkedIn (' + (res.statusCode || linkedinSaid(res.error).slice(0, 120) || 'no answer') + ').';
  } else {
    post.etags[part.part] = etag;
  }
  return posts;
}, []).map(function (post) {
  const p = post.part;
  const complete = post.etags.length === p.parts && post.etags.every(Boolean);
  if (post.problem || !complete) {
    return {
      json: { ok: false, post_id: p.post_id, place: p.place, error: (post.problem || 'Not every part of the video reached LinkedIn.') + ' Nothing went out: try again.', unknown: false },
      pairedItem: { item: post.first },
    };
  }
  return {
    json: { ok: true, post_id: p.post_id, place: p.place, video: p.video, upload_token: p.upload_token, etags: post.etags },
    pairedItem: { item: post.first },
  };
});
