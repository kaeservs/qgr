// A link Higgsfield can fetch the first picture from: Storage signs it for
// 15 minutes, as the screenshots of competitors' ads are. Higgsfield copies it
// into its own storage (media_import_url) before the video is asked for.
const STORAGE = 'https://tcinsdexwvzpznqlcpww.supabase.co/storage/v1';
return $input.all().map(function (item, i) {
  const ask = $('A first picture?').itemMatching(i).json;
  const res = item.json || {};
  const body = res.body && typeof res.body === 'object' ? res.body : {};
  const signed = body.signedURL || body.signedUrl;
  if (res.statusCode >= 200 && res.statusCode < 300 && typeof signed === 'string') {
    return { json: Object.assign({}, ask, { url: STORAGE + (signed.charAt(0) === '/' ? '' : '/') + signed }) };
  }
  const said = String(body.message || body.error || res.error || 'no answer').slice(0, 200);
  return { json: { kind: 'refused', id: ask.id, error: 'The first picture could not be read from Storage (' + (res.statusCode || 'no answer') + '): ' + said } };
});
