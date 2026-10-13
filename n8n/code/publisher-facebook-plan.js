// The request that publishes a post on the Facebook Page: a picture with the
// post's words (/photos), a video with them (/videos, on graph-video, as Meta
// asks for video), or the words alone (/feed). Meta fetches the file itself
// from the link Storage signed. Graph API v25.0, pinned: Meta keeps a version
// for two years (v25.0 until July 2028).
const GRAPH = 'https://graph.facebook.com/v25.0/';
const GRAPH_VIDEO = 'https://graph-video.facebook.com/v25.0/';

return $input.all().map(function (item) {
  const p = item.json;
  const page = String(p.page.id);
  const kind = p.media_url ? (p.media_kind === 'video' ? 'video' : 'image') : 'text';
  let url;
  let body;
  if (kind === 'video') {
    url = GRAPH_VIDEO + page + '/videos';
    body = { file_url: p.media_url, description: p.text, published: true };
  } else if (kind === 'image') {
    url = GRAPH + page + '/photos';
    body = { url: p.media_url, message: p.text, published: true };
  } else {
    url = GRAPH + page + '/feed';
    body = { message: p.text, published: true };
  }
  return { json: { post_id: p.post_id, place: p.place, page_id: page, kind: kind, url: url, body: body } };
});
