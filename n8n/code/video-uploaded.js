// Storage's answer to the video's upload: in the bucket at its path, to be
// recorded; or not yet, and the job is asked about again in a minute, when
// its video is fetched and stored again (Higgsfield keeps it meanwhile).
return $input.all().map(function (item, i) {
  const done = $('Read the job').itemMatching(i).json;
  const res = item.json || {};
  if (res.statusCode >= 200 && res.statusCode < 300) return { json: { kind: 'stored', id: done.id, path: done.path } };
  return { json: { kind: 'not_stored', id: done.id, error: 'Made, but not stored yet (' + (res.statusCode || 'no answer') + ')' } };
});
