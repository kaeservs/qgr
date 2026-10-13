// Instagram publishes in two steps: a container is made from the file (Meta
// fetches it from the link Storage signed), and published once Instagram has
// prepared it. A picture is ready in seconds, so it is checked after ten; a
// video is posted as a Reel and takes longer, so it is first checked after a
// minute (then once a minute, as Meta asks: "Ready to publish?").
// Graph API v25.0, pinned, as for Facebook.
const GRAPH = 'https://graph.facebook.com/v25.0/';

return $input.all().map(function (item) {
  const p = item.json;
  const account = String(p.page.id);
  const video = p.media_kind === 'video';
  const body = video
    ? { media_type: 'REELS', video_url: p.media_url, caption: p.text, share_to_feed: true }
    : { image_url: p.media_url, caption: p.text };
  return {
    json: {
      post_id: p.post_id,
      place: p.place,
      account: account,
      kind: video ? 'video' : 'image',
      url: GRAPH + account + '/media',
      body: body,
      wait: video ? 60 : 10,
    },
  };
});
