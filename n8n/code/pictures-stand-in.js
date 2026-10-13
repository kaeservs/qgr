// STAND-IN for an image model: the way taken while the team's pictures are
// set to the stand-in (Settings, Agents), as they are until Cloudflare Workers
// AI is chosen there. Nothing is drawn: it answers as the real steps do when
// no picture could be made, marked stand_in, so the ask ends, the studio says
// no picture was made, and the variant keeps what it shows.
//
// The real way ("Real pictures?" true) is Cloudflare's FLUX.1 schnell: write
// the prompt, ask Cloudflare, read the picture, upload it to the private
// bucket ad-pictures at the item's path (ending .jpg, .png or .webp for what
// came back), and answer in the same shape:
//   { ok: true, variant_id, path, stand_in: false }
// or, when no picture was made:
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
