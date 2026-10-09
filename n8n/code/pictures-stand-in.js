// STAND-IN for the image model. Nothing is drawn: it answers as the real
// steps will when no picture could be made, marked stand_in, so the ask ends,
// the studio says no picture was made and the branded design is drawn as
// before.
//
// To connect an image model (ChatGPT's images API or Higgsfield), replace this
// node with the real steps (the sticky note beside it lists them): send the
// item's prompt, upload what comes back to the private bucket ad-pictures at
// the item's path (a .png path: a model that answers JPEG or WebP uploads to
// the same path ending .jpg or .webp), and keep the output the same:
//   { ok: true, variant_id, path, stand_in: false }
// or, when the model made nothing:
//   { ok: false, variant_id, error }
return $input.all().map(function (item) {
  const ask = item.json;
  return {
    json: {
      ok: true,
      variant_id: ask.variant_id,
      path: null,
      stand_in: true,
    },
  };
});
