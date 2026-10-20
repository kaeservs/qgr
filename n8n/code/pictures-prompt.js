// Shared by the scripts that ask an image model for a picture (joined in
// front of each): what it is asked to draw, for each ask. The scene (a
// person's prompt in the studio, or the Content Agent's), then the brand's
// picture style from brand memory, then the rules every picture keeps: no
// words (the ad's words go over the picture), no real or identifiable people,
// no flags. 2,048 characters at most, FLUX's limit, kept for every model. The
// studio keeps a person's prompt to 1,200 and the style is at most 600, so all
// of it fits; only a longer prompt from the agent is shortened, at a word, and
// never the style or the rules.
const PROMPT_MAX = 2048;
const PICTURE_RULES = 'No text, letters, numbers, logos or watermarks anywhere. No real or identifiable people. No flags.';

function picturePrompt(ask) {
  const look = String(ask.look || '').trim();
  const tail = (look ? ' Picture style: ' + look + (/[.!?]$/.test(look) ? '' : '.') : '') + ' ' + PICTURE_RULES;
  let scene = String(ask.prompt || '').trim().replace(/\s+/g, ' ');
  const room = PROMPT_MAX - tail.length - 1;
  if (scene.length > room) {
    scene = scene.slice(0, room);
    const cut = scene.lastIndexOf(' ');
    if (cut > room * 0.6) scene = scene.slice(0, cut);
  }
  if (!/[.!?]$/.test(scene)) scene += '.';
  return scene + tail;
}

// Higgsfield's GPT Image 2.5, as the team's quality asks: square at 1k (one
// picture serves Meta's square and LinkedIn's wide frame, cropped about its
// middle, as Cloudflare's does), low quality unless the team chose more.
const HIGGSFIELD_PICTURE_MODEL = 'gpt_image_2_5';
const HIGGSFIELD_QUALITIES = ['low', 'medium', 'high'];

function higgsfieldPictureParams(prompt, quality) {
  return {
    model: HIGGSFIELD_PICTURE_MODEL,
    prompt: prompt,
    aspect_ratio: '1:1',
    resolution: '1k',
    quality: HIGGSFIELD_QUALITIES.indexOf(quality) >= 0 ? quality : 'low',
  };
}
