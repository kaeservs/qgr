// What Cloudflare's FLUX.1 schnell is asked to draw, for each ask: the
// picture's words (picturePrompt, joined in front), on the account the team
// named in Settings.
const MODEL = '@cf/black-forest-labs/flux-1-schnell';

return $input.all().map(function (item) {
  const ask = item.json;
  return {
    json: {
      variant_id: ask.variant_id,
      label: ask.label,
      path: ask.path,
      url: 'https://api.cloudflare.com/client/v4/accounts/' + ask.account + '/ai/run/' + MODEL,
      body: { prompt: picturePrompt(ask) },
    },
  };
});
