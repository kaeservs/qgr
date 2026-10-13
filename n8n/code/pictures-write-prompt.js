// What Cloudflare's FLUX.1 schnell is asked to draw, for each ask: the scene
// (a person's prompt in the studio, or the Content Agent's), then the brand's
// picture style from brand memory, then the rules every picture keeps: no
// words (the ad's words go over the picture), no real or identifiable people,
// no flags. FLUX takes 2,048 characters. The studio keeps a person's prompt to
// 1,200 and the style is at most 600, so all of it fits; only a longer prompt
// from the agent is shortened, at a word, and never the style or the rules.
const MAX = 2048;
const RULES = 'No text, letters, numbers, logos or watermarks anywhere. No real or identifiable people. No flags.';
const MODEL = '@cf/black-forest-labs/flux-1-schnell';

return $input.all().map(function (item) {
  const ask = item.json;
  const look = String(ask.look || '').trim();
  const tail = (look ? ' Picture style: ' + look + (/[.!?]$/.test(look) ? '' : '.') : '') + ' ' + RULES;
  let scene = String(ask.prompt || '').trim().replace(/\s+/g, ' ');
  const room = MAX - tail.length - 1;
  if (scene.length > room) {
    scene = scene.slice(0, room);
    const cut = scene.lastIndexOf(' ');
    if (cut > room * 0.6) scene = scene.slice(0, cut);
  }
  if (!/[.!?]$/.test(scene)) scene += '.';
  return {
    json: {
      variant_id: ask.variant_id,
      label: ask.label,
      path: ask.path,
      url: 'https://api.cloudflare.com/client/v4/accounts/' + ask.account + '/ai/run/' + MODEL,
      body: { prompt: scene + tail },
    },
  };
});
