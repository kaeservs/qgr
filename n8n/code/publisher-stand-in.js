// STAND-IN for posting to __PLACE_NAME__. Nothing is posted anywhere: it
// answers as the real step will, so a post can be followed from the
// dashboard to here and back, and marks the result stand_in so the dashboard
// says nothing went out.
//
// To connect __PLACE_NAME__, replace this node with the real steps (the
// sticky note beside it lists them), keeping the output the same:
//   { ok: true, post_id, place, remote_id, remote_url, stand_in: false }
// or, when it did not go out:
//   { ok: false, post_id, place, error, unknown }
// where unknown is true if the post may have gone out anyway (the platform
// did not answer after it was sent): it is then never sent again by itself.
return $input.all().map(function (item) {
  const post = item.json;
  return {
    json: {
      ok: true,
      post_id: post.post_id,
      place: post.place,
      remote_id: null,
      remote_url: null,
      stand_in: true,
    },
  };
});
