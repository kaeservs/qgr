// The first picture, as Higgsfield keeps it: its media id goes with the ask.
// Not reached, the ask waits for the next minute; refused, nothing is made.
return $input.all().map(function (item, i) {
  const ask = $('Picture link').itemMatching(i).json;
  const json = item.json;
  if (notReached(json, 'url')) return { json: { kind: 'retry', id: ask.id, error: 'Higgsfield could not be reached to take the first picture' } };
  const error = errorOf(json);
  if (error) return { json: { kind: 'refused', id: ask.id, error: 'Higgsfield could not take the first picture: ' + error } };
  const mediaId = findString(answerOf(json), ['media_id', 'mediaId', 'id'], 0);
  if (!mediaId) return { json: { kind: 'refused', id: ask.id, error: 'Higgsfield took the first picture but gave no id for it.' } };
  const out = Object.assign({}, ask, { kind: 'go', media_id: mediaId });
  delete out.url;
  return { json: out };
});
