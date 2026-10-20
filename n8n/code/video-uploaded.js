// Storage's answer to the upload of what Higgsfield made (a video, or a
// picture): in the bucket at its path, to be recorded; or not yet, and the
// job is asked about again at the next check, when its file is fetched and
// stored again (Higgsfield keeps it meanwhile).
return $input.all().map(function (item, i) {
  const done = $('Read the job').itemMatching(i).json;
  const res = item.json || {};
  if (res.statusCode >= 200 && res.statusCode < 300) return { json: { kind: 'stored', id: done.id, path: done.path } };
  return { json: { kind: 'not_stored', id: done.id, error: 'Made, but not stored yet (' + (res.statusCode || 'no answer') + ')' } };
});
