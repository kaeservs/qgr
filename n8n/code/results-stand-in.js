// STAND-IN for reading a post's results from __PLACE_NAME__. It reads
// nothing: it answers as the real step does when the platform has no numbers
// to give, so the workflow runs end to end and records nothing.
//
// To connect __PLACE_NAME__, replace this node with the real request (the
// sticky note beside it says which), keeping the output the same:
//   { ok: true, post_id, place, results: { reach, views, reactions, comments, shares, clicks } }
// each a count, or null when the platform does not report it for this post;
// or, when the platform refused:
//   { ok: false, post_id, place, error }
return $input.all().map(function (item) {
  const post = item.json;
  return {
    json: {
      ok: true,
      post_id: post.post_id,
      place: post.place,
      results: null,
      stand_in: true,
    },
  };
});
