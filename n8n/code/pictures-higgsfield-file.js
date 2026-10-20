// The picture Higgsfield made, as fetched: its kind from the file's type, or
// else from its link's ending, and the path given that extension; the file is
// handed on to be uploaded. Anything but a PNG, JPEG or WebP is refused (the
// bucket takes nothing else). A fetch that failed is tried again at the next
// check: Higgsfield keeps the picture meanwhile.
const EXTENSIONS = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/webp': 'webp' };
const BY_ENDING = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp' };

return $input.all().map(function (item, i) {
  const done = $("Read the picture's job").itemMatching(i).json;
  const file = item.binary && item.binary.data;
  if (!file) return { json: { kind: 'retry', id: done.id } };
  let mime = String(file.mimeType || '').split(';')[0].trim().toLowerCase();
  if (!EXTENSIONS[mime]) {
    const ending = /\.(png|jpe?g|webp)(\?|$)/i.exec(String(done.url || ''));
    if (ending) mime = BY_ENDING[ending[1].toLowerCase()];
  }
  const extension = EXTENSIONS[mime];
  if (!extension) {
    return { json: { kind: 'failed', id: done.id, error: 'Higgsfield answered with something that is not a PNG, JPEG or WebP picture (' + (mime || 'no type') + ').' } };
  }
  const path = String(done.path).replace(/\.(png|jpg|webp)$/, '.' + extension);
  return { json: { kind: 'picture', id: done.id, path: path, mime: mime }, binary: item.binary };
});
