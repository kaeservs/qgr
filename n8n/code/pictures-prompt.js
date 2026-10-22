// Shared by the scripts that ask an image model for a picture (joined in
// front of each): what it is asked to draw, for each ask. The scene (a
// person's prompt in the studio, or the Content Agent's), then how it should
// look (a real photograph of real-looking people, as the team asked on
// 2026-10-22), the brand's picture style from brand memory, a line on the
// run's reference pictures when Higgsfield is given some, then the rules
// every picture keeps: no words (the ad's words go over the picture), people
// who are made up rather than anyone real or famous, and the flag and props
// the team allowed (2026-10-22) with no writing on them. Cloudflare's
// FLUX takes 2,048 characters at most; Higgsfield's GPT Image far more, so
// its scripts pass HIGGSFIELD_PROMPT_MAX. The scene is shortened first, at a
// word, then a long picture style; the rules never are.
const PROMPT_MAX = 2048;
const HIGGSFIELD_PROMPT_MAX = 6000;
const PHOTO_LOOK = 'A real photograph, as a documentary or lifestyle photographer would take it: natural light, real skin, hands and textures, candid and unposed, honest emotion. Not an illustration, a 3D render or a stock-photo pose.';
const PICTURE_RULES = 'No readable text, letters, numbers, logos or watermarks anywhere, on signs, books or documents either. Everyone shown is a made-up person: never a real, famous or recognisable one. A U.S. flag or quiet props such as passports, a folder or a gavel may appear, with no writing on them; never a green card or visa held up as approved, never money.';
const SCENE_MIN = 300;

const REFERENCES_RULE = 'Use the reference pictures given for what they show: the real place, product or look to keep to.';

function atWord(text, room) {
  if (text.length <= room) return text;
  let cut = text.slice(0, Math.max(0, room));
  const space = cut.lastIndexOf(' ');
  if (space > room * 0.6) cut = cut.slice(0, space);
  return cut;
}

function picturePrompt(ask, max) {
  const limit = max || PROMPT_MAX;
  const references = Array.isArray(ask.references) && ask.references.length > 0 ? ' ' + REFERENCES_RULE : '';
  const fixed = ' ' + PHOTO_LOOK + references + ' ' + PICTURE_RULES;
  let look = String(ask.look || '').trim().replace(/\s+/g, ' ');
  const lookRoom = limit - fixed.length - SCENE_MIN - ' Picture style: .'.length;
  if (look.length > lookRoom) look = atWord(look, lookRoom);
  const styled = look ? ' Picture style: ' + look + (/[.!?]$/.test(look) ? '' : '.') : '';
  const tail = ' ' + PHOTO_LOOK + styled + references + ' ' + PICTURE_RULES;
  let scene = atWord(String(ask.prompt || '').trim().replace(/\s+/g, ' '), limit - tail.length - 1);
  if (!/[.!?]$/.test(scene)) scene += '.';
  return scene + tail;
}

// Higgsfield's GPT Image 2.5, as the team's quality asks: square at 1k (one
// picture serves Meta's square and LinkedIn's wide frame, cropped about its
// middle, as Cloudflare's does), low quality unless the team chose more.
const HIGGSFIELD_PICTURE_MODEL = 'gpt_image_2_5';
const HIGGSFIELD_QUALITIES = ['low', 'medium', 'high'];

// The run's reference pictures, as Higgsfield keeps them (their media ids),
// go with the picture as image_references; they do not change its price.
function higgsfieldPictureParams(prompt, quality, references) {
  const params = {
    model: HIGGSFIELD_PICTURE_MODEL,
    prompt: prompt,
    aspect_ratio: '1:1',
    resolution: '1k',
    quality: HIGGSFIELD_QUALITIES.indexOf(quality) >= 0 ? quality : 'low',
  };
  const ids = (Array.isArray(references) ? references : []).filter(function (id) { return typeof id === 'string' && id; });
  if (ids.length > 0) params.medias = ids.map(function (id) { return { role: 'image_references', value: id }; });
  return params;
}
