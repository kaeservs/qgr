// A link Higgsfield can fetch a reference picture from: Storage signs it for
// 15 minutes, as the screenshots of competitors' ads are. A signing that fails
// is tried again at the next run of n8n: the picture is in run-refs.
const STORAGE = 'https://tcinsdexwvzpznqlcpww.supabase.co/storage/v1';
return $input.all().map(function (item, i) {
  const ref = $('One item per reference').itemMatching(i).json;
  const res = item.json || {};
  const body = res.body && typeof res.body === 'object' ? res.body : {};
  const signed = body.signedURL || body.signedUrl;
  if (res.statusCode >= 200 && res.statusCode < 300 && typeof signed === 'string') {
    return { json: { id: ref.id, url: STORAGE + (signed.charAt(0) === '/' ? '' : '/') + signed } };
  }
  const said = String(body.message || body.error || res.error || 'no answer').slice(0, 200);
  return { json: { kind: 'retry', id: ref.id, error: 'The reference picture could not be read from Storage (' + (res.statusCode || 'no answer') + '): ' + said } };
});
