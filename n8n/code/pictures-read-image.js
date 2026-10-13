// Cloudflare's answer for each ask: the picture as base64 (FLUX.1 schnell
// answers a JPEG), or why there is none, in words the studio can show. What
// kind of file it is comes from its first bytes, never from an assumption,
// and the path takes that extension; anything but a JPEG, PNG or WebP under
// the bucket's 10 MB is refused here. A step that did not run at all (its
// credential is missing) hands its input on unchanged, and says so too.
const MAX_BYTES = 10 * 1024 * 1024;
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const KINDS = [
  { ext: 'jpg', mime: 'image/jpeg', test: function (b) { return b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff; } },
  { ext: 'png', mime: 'image/png', test: function (b) { return b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47; } },
  {
    ext: 'webp',
    mime: 'image/webp',
    test: function (b) {
      return b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50;
    },
  },
];

/** The first bytes of a base64 string: n8n's Code node has no Buffer or atob. */
function firstBytes(b64, n) {
  const out = [];
  let buf = 0;
  let bits = 0;
  for (let i = 0; i < b64.length && out.length < n; i += 1) {
    const v = ALPHABET.indexOf(b64[i]);
    if (v < 0) break;
    buf = ((buf << 6) | v) & 0xffffff;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out.push((buf >> bits) & 0xff);
    }
  }
  return out;
}

/** Cloudflare's own words for a refusal, made plain where the reason is a known one. */
function why(status, body) {
  const first = body && Array.isArray(body.errors) && body.errors[0] ? body.errors[0] : {};
  const said = String(first.message || (body && body.message) || '').slice(0, 300);
  if (first.code === 4006 || /daily free allocation/i.test(said)) {
    return "Cloudflare's free pictures for today are used up (10,000 neurons a day). They come back at 00:00 UTC.";
  }
  if (status === 401 || status === 403 || first.code === 10000) {
    return 'Cloudflare refused the API token. Check the "Cloudflare Workers AI" credential in n8n: a token made from the Workers AI template.';
  }
  if (status === 404 || first.code === 7003) {
    return 'Cloudflare has no account with that ID. Check the account ID in Settings, Agents.';
  }
  if (status === 429) return 'Cloudflare is busy (429). Ask for the picture again in a minute.';
  return 'Cloudflare could not make the picture (' + (status || 'no answer') + ')' + (said ? ': ' + said : '.');
}

return $input.all().map(function (item, i) {
  const ask = $('Write the prompt').itemMatching(i).json;
  const res = item.json || {};
  const fail = function (error) {
    return { json: { ok: false, variant_id: ask.variant_id, error: error } };
  };
  if (res.error) {
    const said = typeof res.error === 'string' ? res.error : res.error.message || res.error.description || 'the request failed';
    return fail('Cloudflare could not be asked: ' + String(said).slice(0, 300));
  }
  // A full response always has its status; the step's own input never does.
  if (res.statusCode === undefined) {
    return fail('The Cloudflare step did not run. In n8n, attach the "Cloudflare Workers AI" credential (Bearer Auth, holding the API token) to it.');
  }
  const body = res.body && typeof res.body === 'object' ? res.body : null;
  if (res.statusCode !== 200 || !body || body.success === false) return fail(why(res.statusCode, body));

  let image = body.result && typeof body.result.image === 'string' ? body.result.image : '';
  image = image.replace(/^data:[^,]*,/, '').replace(/\s+/g, '');
  if (!image) return fail('Cloudflare answered without a picture.');
  const bytes = Math.floor((image.length * 3) / 4);
  if (bytes > MAX_BYTES) return fail('The picture is over 10 MB, more than Storage keeps.');
  const head = firstBytes(image, 12);
  const kind = KINDS.find(function (k) {
    return k.test(head);
  });
  if (!kind) return fail('Cloudflare answered with something that is not a JPEG, PNG or WebP picture.');
  const path = String(ask.path).replace(/\.(png|jpg|webp)$/, '.' + kind.ext);
  return {
    json: {
      ok: true,
      variant_id: ask.variant_id,
      path: path,
      mime: kind.mime,
      file: path.split('/').pop(),
      image: image,
    },
  };
});
