// The places going out for real, each with a link to its file that the
// platform can fetch: Storage signs it for an hour, so Meta (and n8n, for
// LinkedIn) reads the private file without a key. A place that cannot go out
// (no Page set, Instagram without a file, a file that could not be signed)
// fails here, before anything is sent, in the shape the stand-in documents.
const STORAGE = '__STORAGE__';
const NAME = { facebook: 'Facebook', instagram: 'Instagram', linkedin: 'LinkedIn' };

return $input.all().map(function (item, i) {
  const post = $('Post for real?').itemMatching(i).json;
  const res = item.json || {};
  const fail = function (error) {
    return { json: { ok: false, post_id: post.post_id, place: post.place, error: error, unknown: false } };
  };
  if (!post.page || !post.page.id) {
    return fail(post.place === 'instagram' ? 'No Instagram account is set in Settings, Where posts go.' : 'No ' + NAME[post.place] + ' Page is set in Settings, Where posts go.');
  }
  let mediaUrl = null;
  if (post.media_path) {
    const signed = res.body && typeof res.body === 'object' ? res.body.signedURL || res.body.signedUrl : null;
    if (res.statusCode !== 200 || typeof signed !== 'string') {
      return fail('The file could not be made ready for ' + NAME[post.place] + ' (' + (res.statusCode || 'no answer') + '). Nothing went out: try again.');
    }
    mediaUrl = /^https?:\/\//.test(signed) ? signed : STORAGE + (signed.charAt(0) === '/' ? '' : '/') + signed;
  }
  if (post.place === 'instagram' && !mediaUrl) return fail('Instagram needs a picture or a video, and this post has none.');
  return {
    json: {
      ok: true,
      post_id: post.post_id,
      place: post.place,
      text: post.text,
      media_kind: post.media_kind,
      media_url: mediaUrl,
      page: post.page,
    },
  };
});
