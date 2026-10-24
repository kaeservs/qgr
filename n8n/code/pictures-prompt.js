// Shared by the scripts that ask an image model for a picture (joined in
// front of each): what it is asked to draw, for each ask. The scene (a
// person's prompt in the studio, or the Content Agent's), then the team's
// picture Do's (Brand memory, "How content is made": the look, who is in it,
// the setting; they were written here until 2026-10-23) and Don'ts ("Avoid:"),
// the brand's picture style, a line on the run's reference pictures when Higgsfield is given
// some, then what every picture keeps whatever the team writes: no words (the
// ad's words go over the picture), people who are made up rather than anyone
// real or famous, and nothing that shows a promised outcome. Cloudflare's
// FLUX takes 2,048 characters at most; Higgsfield's GPT Image far more, so
// its scripts pass HIGGSFIELD_PROMPT_MAX. The scene is shortened first, at a
// word, then a long picture style, then the team's Do's, then their Don'ts;
// PICTURE_SAFETY never is.
const PROMPT_MAX = 2048;
const HIGGSFIELD_PROMPT_MAX = 6000;
const PICTURE_SAFETY = 'No readable text, letters, numbers, logos or watermarks anywhere, on signs, books or documents either. Everyone shown is a made-up person: never a real, famous or recognisable one. Never a green card or visa held up as approved, never money.';
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
  const fixed = references + ' ' + PICTURE_SAFETY;
  const room = limit - fixed.length - SCENE_MIN;
  const sentence = function (t) { return /[.!?]$/.test(t) ? t : t + '.'; };
  const clean = function (list) {
    return (Array.isArray(list) ? list : []).map(function (r) { return String(r || '').trim().replace(/\s+/g, ' '); }).filter(Boolean);
  };
  // The team's Don'ts first, then their Do's, then the picture style, in what room the scene leaves.
  let donts = clean(ask.donts).map(function (r) { return r.replace(/[.!?]+$/, ''); }).join('; ');
  if (donts.length > room - ' Avoid: .'.length) donts = atWord(donts, room - ' Avoid: .'.length);
  const avoided = donts ? ' Avoid: ' + donts + '.' : '';
  let rules = clean(ask.rules).map(sentence).join(' ');
  const rulesRoom = room - avoided.length - 2;
  if (rules.length > rulesRoom) rules = rulesRoom > 20 ? atWord(rules, rulesRoom) : '';
  const ruled = (rules ? ' ' + sentence(rules) : '') + avoided;
  let look = String(ask.look || '').trim().replace(/\s+/g, ' ');
  const lookRoom = room - ruled.length - ' Picture style: .'.length;
  if (look.length > lookRoom) look = lookRoom > 20 ? atWord(look, lookRoom) : '';
  const styled = look ? ' Picture style: ' + sentence(look) : '';
  const tail = ruled + styled + fixed;
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
