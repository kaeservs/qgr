// Higgsfield's answer to taking a reference picture (media_import_url): its
// media id, which every picture and video of the run then hands Higgsfield.
// Not reached, it is taken again at the next run; refused, the run goes on
// without it and says why.
return $input.all().map(function (item, i) {
  const ref = $('Reference link').itemMatching(i).json;
  const json = item.json;
  if (notReached(json, 'url')) return { json: { kind: 'retry', id: ref.id, error: 'Higgsfield could not be reached to take the reference picture' } };
  const error = errorOf(json);
  if (error) return { json: { kind: 'failed', id: ref.id, error: error } };
  const mediaId = findString(answerOf(json), ['media_id', 'mediaId', 'id'], 0);
  if (!mediaId) return { json: { kind: 'failed', id: ref.id, error: 'Higgsfield took the picture but gave no id for it.' } };
  return { json: { kind: 'ready', id: ref.id, media_id: mediaId } };
});
