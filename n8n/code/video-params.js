// Shared by the AI video scripts that write what Higgsfield is asked for
// (joined in front of each): generate_video's params, in Higgsfield's own
// words for each model, as its catalogue gave them on 2026-10-20.

/** What Higgsfield is asked to make, in its own words for each model. */
const MODEL_PARAMS = {
  seedance_2_0_mini: function (ask) {
    return { resolution: ask.quality, generate_audio: ask.sound === true };
  },
  kling3_0: function (ask) {
    return { mode: ask.quality, sound: ask.sound === true ? 'on' : 'off' };
  },
  seedance_2_5: function (ask) {
    return { mode: 't2v', resolution: ask.quality, generate_audio: ask.sound === true };
  },
};

/** The rules every video keeps to, as the ads' pictures do. */
const VIDEO_RULES = 'No words, captions or logos in the picture (the ad\'s words go over it later). No real or identifiable people. No flags.';

/** What the run's reference pictures are for, when Higgsfield is given some. */
const VIDEO_REFERENCES = ' Use the reference pictures given for what they show: the real place, product or look to keep to.';

/** The prompt Higgsfield gets: the team's, the brand's picture style, the references' line, then the rules. */
function videoPrompt(ask) {
  const look = typeof ask.look === 'string' && ask.look.trim() ? ' Style: ' + ask.look.trim().replace(/\s+/g, ' ').slice(0, 400) + '.' : '';
  const references = Array.isArray(ask.references) && ask.references.length > 0 ? VIDEO_REFERENCES : '';
  const room = 2000 - look.length - references.length - VIDEO_RULES.length - 2;
  const prompt = String(ask.prompt || '').replace(/\s+/g, ' ').trim().slice(0, Math.max(200, room));
  return (prompt + look + references + ' ' + VIDEO_RULES).replace(/\.\./g, '.').trim();
}

/**
 * generate_video's params for one ask, with its first picture's media id when
 * it has one, and the reference pictures of the run it was asked for (an ad's
 * video) as image_references, which do not change its price.
 */
function videoParams(ask, mediaId) {
  const own = MODEL_PARAMS[ask.model];
  if (!own) throw new Error('Higgsfield is not asked for ' + ask.model + ' videos');
  const params = Object.assign({ model: ask.model, prompt: videoPrompt(ask), aspect_ratio: ask.aspect, duration: Number(ask.seconds) }, own(ask));
  const medias = mediaId ? [{ role: 'start_image', value: mediaId }] : [];
  (Array.isArray(ask.references) ? ask.references : []).forEach(function (id) {
    if (typeof id === 'string' && id) medias.push({ role: 'image_references', value: id });
  });
  if (medias.length > 0) params.medias = medias;
  return params;
}
