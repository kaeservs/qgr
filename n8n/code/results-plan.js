// What to ask each platform for a post's numbers, read every six hours for
// four weeks after it went out (results_take_due hands over only posts that
// went out for real). One request a post:
//   Facebook, a post: its shares, comments and reactions, and its insights:
//     views (post_media_view), people reached (post_total_media_view_unique)
//     and clicks (post_clicks), the metrics Meta keeps since its impressions
//     metrics went in 2025.
//   Facebook, a video: the video's insights, all of them, read by name.
//   Instagram: the media's insights (reach, views, likes, comments, shares).
//   LinkedIn: the post's statistics on the Page
//     (organizationalEntityShareStatistics, by share or ugcPost URN).
// Graph API v25.0 and LinkedIn-Version 202609, as the publisher uses.
const GRAPH = 'https://graph.facebook.com/v25.0/';
const LINKEDIN = 'https://api.linkedin.com/rest/organizationalEntityShareStatistics';
const VERSION = '202609';
const FACEBOOK_POST = 'shares,comments.limit(0).summary(true),reactions.limit(0).summary(true),insights.metric(post_media_view,post_total_media_view_unique,post_clicks)';
const INSTAGRAM = 'reach,views,likes,comments,shares';

return $input.all().map(function (item) {
  const p = item.json;
  const id = String(p.remote_id || '');
  const plan = { post_id: p.post_id, place: p.place };
  if (p.place === 'facebook' && p.media_kind === 'video') {
    return { json: Object.assign(plan, { kind: 'facebook-video', url: GRAPH + id + '/video_insights' }) };
  }
  if (p.place === 'facebook') {
    return { json: Object.assign(plan, { kind: 'facebook-post', url: GRAPH + id + '?fields=' + FACEBOOK_POST }) };
  }
  if (p.place === 'instagram') {
    return { json: Object.assign(plan, { kind: 'instagram', url: GRAPH + id + '/insights?metric=' + INSTAGRAM }) };
  }
  const list = /^urn:li:ugcPost:/.test(id) ? 'ugcPosts' : 'shares';
  const page = 'urn:li:organization:' + String(p.page && p.page.id);
  return {
    json: Object.assign(plan, {
      kind: 'linkedin',
      version: VERSION,
      url: LINKEDIN + '?q=organizationalEntity&organizationalEntity=' + encodeURIComponent(page) + '&' + list + '=List(' + encodeURIComponent(id) + ')',
    }),
  };
});
