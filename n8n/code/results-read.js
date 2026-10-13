// A platform's numbers for a post, as the counts results_record keeps:
//   { ok: true, post_id, place, results: { reach, views, reactions, comments, shares, clicks } }
// each a whole number, or null where the platform does not give it for this
// post; or, when it would not answer, { ok: false, post_id, place, error }, and
// the numbers before are kept. Every number is read by its name, never by its
// place in a list, so a metric a platform drops leaves the others as they are.
// A step that could not start (no credential attached) hands its input on, so
// an answer with no status at all means the platform was never asked.
const NAME = { facebook: 'Facebook', instagram: 'Instagram', linkedin: 'LinkedIn' };

function count(value) {
  const n = typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN;
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
}

/** The sum of an object of counts ({ like: 3, love: 1 }), or null without any. */
function total(value) {
  if (!value || typeof value !== 'object') return count(value);
  const counts = Object.keys(value)
    .map(function (key) {
      return count(value[key]);
    })
    .filter(function (n) {
      return n !== null;
    });
  return counts.length ? counts.reduce(function (a, b) {
    return a + b;
  }, 0) : null;
}

/** A metric's lifetime value in Meta's insights list, found by its name. */
function metric(list, name) {
  const found = (Array.isArray(list) ? list : []).find(function (m) {
    return m && m.name === name;
  });
  if (!found) return undefined;
  if (found.total_value && found.total_value.value !== undefined) return found.total_value.value;
  const values = Array.isArray(found.values) ? found.values : [];
  return values.length ? values[values.length - 1].value : undefined;
}

/** Meta's reason, made plain where it is a known one. */
function metaRefusal(body, status, place) {
  const e = body && body.error && typeof body.error === 'object' ? body.error : {};
  const message = String(e.error_user_msg || e.message || 'no reason given').slice(0, 300);
  if (e.code === 190) return 'The Facebook token has expired or was revoked. Make a new Page access token and update the “Facebook Graph API” credential in n8n.';
  if (e.code === 10 || (e.code >= 200 && e.code < 300)) {
    return place === 'instagram'
      ? 'The token may not read Instagram’s numbers: it needs instagram_manage_insights (' + message + ').'
      : 'The token may not read the post’s numbers: it needs pages_read_engagement and pages_read_user_content (' + message + ').';
  }
  if (e.code === 4 || e.code === 17 || e.code === 32 || e.code === 613) return NAME[place] + ' is limiting requests right now: the numbers are read again in six hours.';
  if (e.code === 100 && /metric/i.test(message)) return NAME[place] + ' no longer gives one of the numbers asked for (' + message + '): the metrics in “Plan the read” need updating.';
  return NAME[place] + ' would not give the numbers (' + status + (e.code ? ', code ' + e.code : '') + '): ' + message;
}

return $input.all().map(function (item, i) {
  const plan = $('Plan the read').itemMatching(i).json;
  const res = item.json || {};
  const out = function (fields) {
    return { json: Object.assign({ post_id: plan.post_id, place: plan.place }, fields) };
  };
  const failed = function (error) {
    return out({ ok: false, error: error });
  };
  if (res.statusCode === undefined && !res.error) {
    const where = plan.place === 'linkedin' ? '“LinkedIn Community Management” credential to “LinkedIn: its numbers”' : '“Facebook Graph API” credential to “Meta: its numbers”';
    return failed(NAME[plan.place] + ' was not asked: attach the ' + where + ' in n8n.');
  }
  if (res.error) return failed(NAME[plan.place] + ' could not be asked for the numbers (' + linkedinSaid(res.error).slice(0, 200) + '). They are read again in six hours.');
  const body = res.body && typeof res.body === 'object' ? res.body : {};
  if (!(res.statusCode >= 200 && res.statusCode < 300)) {
    return failed(plan.place === 'linkedin' ? linkedinRefusal(res, 'give the numbers') : metaRefusal(body, res.statusCode, plan.place));
  }

  if (plan.kind === 'facebook-post') {
    const insights = body.insights && Array.isArray(body.insights.data) ? body.insights.data : [];
    return out({
      ok: true,
      results: {
        reach: count(metric(insights, 'post_total_media_view_unique')),
        views: count(metric(insights, 'post_media_view')),
        reactions: count(body.reactions && body.reactions.summary ? body.reactions.summary.total_count : undefined),
        comments: count(body.comments && body.comments.summary ? body.comments.summary.total_count : undefined),
        // Facebook leaves shares out of a post nobody has shared.
        shares: body.shares ? count(body.shares.count) : 0,
        clicks: count(metric(insights, 'post_clicks')),
      },
    });
  }
  if (plan.kind === 'facebook-video') {
    const data = Array.isArray(body.data) ? body.data : [];
    const stories = metric(data, 'total_video_stories_by_action_type');
    const by = stories && typeof stories === 'object' ? stories : {};
    return out({
      ok: true,
      results: {
        reach: count(metric(data, 'total_video_views_unique')),
        views: count(metric(data, 'total_video_views')),
        reactions: total(metric(data, 'total_video_reactions_by_type_total')),
        comments: count(by.comment),
        shares: count(by.share),
        clicks: null,
      },
    });
  }
  if (plan.kind === 'instagram') {
    const data = Array.isArray(body.data) ? body.data : [];
    return out({
      ok: true,
      results: {
        reach: count(metric(data, 'reach')),
        views: count(metric(data, 'views')),
        reactions: count(metric(data, 'likes')),
        comments: count(metric(data, 'comments')),
        shares: count(metric(data, 'shares')),
        // An Instagram post's words carry no link: nothing to click.
        clicks: null,
      },
    });
  }
  const element = Array.isArray(body.elements) && body.elements.length ? body.elements[0] : null;
  const stats = element && element.totalShareStatistics ? element.totalShareStatistics : null;
  if (!stats) return failed('LinkedIn gave no numbers for this post. They are read again in six hours.');
  return out({
    ok: true,
    results: {
      reach: count(stats.uniqueImpressionsCount),
      views: count(stats.impressionCount),
      reactions: count(stats.likeCount),
      comments: count(stats.commentCount),
      shares: count(stats.shareCount),
      clicks: count(stats.clickCount),
    },
  });
});
