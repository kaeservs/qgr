// What Higgsfield is asked to make: generate_video's params for each ask, in
// Higgsfield's own words for its model, with the first picture's media id
// when there is one. Never with get_cost: this one is made, and paid for.
return $input.all().map(function (item) {
  const ask = item.json;
  return { json: { id: ask.id, generate_input: JSON.stringify({ params: videoParams(ask, ask.media_id || null) }) } };
});
