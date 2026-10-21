// What Higgsfield is asked for each ad's picture: GPT Image 2.5 drawing the
// picture's words (picturePrompt) at the team's quality, with the run's
// reference pictures when it has some. Its price is asked
// first, with get_cost beside the params and inside them, which makes
// nothing; the same params, without it, make the picture once the price is
// recorded against the month's limit.
return $input.all().map(function (item) {
  const ask = item.json;
  const params = higgsfieldPictureParams(picturePrompt(ask), ask.quality, ask.references);
  return {
    json: {
      variant_id: ask.variant_id,
      label: ask.label,
      path: ask.path,
      quality: params.quality,
      params: params,
      quote_input: JSON.stringify({ params: Object.assign({}, params, { get_cost: true }), get_cost: true }),
    },
  };
});
