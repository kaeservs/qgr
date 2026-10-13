// Storage's answer to each upload, matched to the picture it carried: the
// picture is in the bucket at its path, to be recorded, or the reason it is
// not. Answered in the shape the stand-in documents.
return $input.all().map(function (item, i) {
  const made = $('Read the picture').itemMatching(i).json;
  const res = item.json || {};
  if (res.statusCode >= 200 && res.statusCode < 300) {
    return { json: { ok: true, variant_id: made.variant_id, path: made.path, stand_in: false } };
  }
  const body = res.body && typeof res.body === 'object' ? res.body : {};
  const err = res.error && typeof res.error === 'object' ? res.error.message : res.error;
  const said = String(body.message || body.error || err || 'no answer').slice(0, 200);
  return {
    json: {
      ok: false,
      variant_id: made.variant_id,
      error: 'The picture was made but could not be stored (' + (res.statusCode || 'no answer') + '): ' + said,
    },
  };
});
