// Whether Instagram has prepared the container, checked once a minute for
// five minutes at most, as Meta asks. FINISHED goes on to publish. Still
// IN_PROGRESS (a video takes a while), or no answer to the check, waits a
// minute and asks again ("Publish, wait or stop?" sends it back). Anything
// else ends here with nothing published, and says why. PUBLISHED means it
// already went out, so it is never sent again by itself.
const CHECKS = 5;

return $input.all().map(function (item, i) {
  const box = $('Give Instagram time').itemMatching(i).json;
  const res = item.json || {};
  const out = function (fields) {
    return { json: Object.assign({ post_id: box.post_id, place: box.place }, fields) };
  };
  const failed = function (error) {
    return out({ ok: false, error: error, unknown: false });
  };
  const tries = (Number(box.tries) || 0) + 1;
  const again = function (error) {
    if (tries >= CHECKS) return failed(error);
    return { json: Object.assign({}, box, { ok: false, again: true, tries: tries, wait: 60 }) };
  };
  const body = res.body && typeof res.body === 'object' ? res.body : {};
  const status = typeof body.status_code === 'string' ? body.status_code : null;
  const what = box.kind === 'video' ? 'video' : 'picture';
  if (status === 'FINISHED') {
    return out({ ok: true, creation_id: box.creation_id, publish_url: box.publish_url });
  }
  if (status === 'PUBLISHED') {
    return out({ ok: false, unknown: true, error: 'Instagram says this was already published. Check the account before sending it again.' });
  }
  if (status === 'ERROR') {
    return failed('Instagram could not use the ' + what + (body.status ? ' (' + String(body.status).slice(0, 200) + ')' : '') + '. Nothing went out.');
  }
  if (status === 'EXPIRED') return failed('Instagram let the post expire before it was published. Nothing went out: try again.');
  if (status === 'IN_PROGRESS') return again('Instagram was still preparing the ' + what + ' after five minutes. Nothing went out: try again later.');
  if (res.error || !(res.statusCode < 500)) {
    return again('Instagram did not say whether the ' + what + ' was ready (' + (res.statusCode || 'no answer') + '). Nothing went out: try again.');
  }
  const e = body.error && typeof body.error === 'object' ? body.error : {};
  return failed('Instagram would not say whether the ' + what + ' was ready (' + res.statusCode + (e.code ? ', code ' + e.code : '') + '): ' + String(e.message || 'no reason given').slice(0, 300) + '. Nothing went out.');
});
