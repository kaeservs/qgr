// The Claude request: Haiku 5.5 at high effort, because this copy goes out in
// QGR's name under strict rules (high is Anthropic's advice for Haiku on
// strict instruction following). The schema asks only for the platforms this
// run selected, with each platform's own call-to-action buttons, and a post in
// full for each place those platforms post to. Lengths are in the prompt; the
// editor flags anything long. No temperature. The Content Agent reads the
// whole chain: the strategy, what it came from (the competitor report or
// QGR's own source), and the brand memory.
const MODEL = 'claude-haiku-5-5';
const EFFORT = 'high';
const ctx = $input.first().json;
const run = ctx.run;
const brand = ctx.brand;
const strategy = ctx.strategy;
if (!strategy || !strategy.angles || strategy.angles.length !== 3) {
  throw new Error('The strategy is missing its three angles.');
}
// The angles the team picked, when it picked some (their positions, from
// agent_begin): the three variants are spread over them, so one angle picked
// gets three takes and two get two and one. Without picks, A, B and C follow
// the strategy's three angles and the request is exactly as before. The same
// spread names the variants in "Read Claude's answer".
const LABELS = ['A', 'B', 'C'];
let picked = null;
if (Array.isArray(ctx.chosen_angles) && ctx.chosen_angles.length > 0) {
  picked = strategy.angles.filter(function (a) { return ctx.chosen_angles.indexOf(a.position) !== -1; });
  if (picked.length === 0) throw new Error('The angles picked are not in the strategy.');
  if (picked.length === strategy.angles.length) picked = null;
}
const spread = picked
  ? LABELS.map(function (l, i) { return picked[Math.floor(i * picked.length / 3)]; })
  : strategy.angles;
function inWords(list) {
  return list.length === 1 ? list[0] : list.slice(0, -1).join(', ') + ' and ' + list[list.length - 1];
}
const whatToWrite = picked
  ? 'Write three variants from the angles the QGR team picked: ' + picked.map(function (a) {
      const labels = LABELS.filter(function (l, i) { return spread[i] === a; });
      return inWords(labels) + (labels.length === 1 ? ' follows' : ' follow') + ' the angle "' + a.name + '"';
    }).join(', ') + '. Variants that share an angle are each a different take on it, with their own hook and words.'
  : 'Write three variants: A follows the strategy\'s first angle, B the second, C the third.';

const NAMES = { meta: 'Meta', linkedin: 'LinkedIn', x: 'X' };
const LIMITS = {
  meta: 'primary text up to 125 characters, headline up to 40, description up to 30',
  linkedin: 'introductory text up to 150 characters, headline up to 70',
  x: 'post up to 280 characters (a hard limit), card title up to 70',
};
const CTAS = {
  meta: ['Book now', 'Learn more', 'Sign up', 'Contact us', 'Get quote', 'Download'],
  linkedin: ['Learn more', 'Register', 'Sign up', 'Request demo', 'Download', 'Apply'],
};
const GOALS = {
  consultations: 'booking a free consultation',
  webinar: 'registering for the webinar',
  awareness: 'finding out more',
  guide: 'downloading the guide',
};
// The places a run posts to, by the platform whose copy each stands beside,
// and what a post in full is on each.
const PLACE_PLATFORM = { facebook: 'meta', instagram: 'meta', linkedin: 'linkedin' };
const POSTS = {
  facebook: 'facebook: two or three short paragraphs, 60 to 150 words, ending with one clear next step',
  instagram: 'instagram: a caption of 40 to 120 words in short lines with a blank line between, then 3 to 8 relevant hashtags on the last line (Instagram takes 2,200 characters and 30 hashtags at most)',
  linkedin: 'linkedin: a post of 100 to 220 words for professionals: a strong first line, short paragraphs, at most three hashtags',
};
const places = ['facebook', 'instagram', 'linkedin'].filter(function (p) { return run.platforms.indexOf(PLACE_PLATFORM[p]) !== -1; });

const copyProps = {};
run.platforms.forEach(function (p) {
  if (p === 'meta') {
    copyProps.meta = {
      type: 'object', additionalProperties: false, required: ['text', 'headline', 'description', 'cta'],
      properties: { text: { type: 'string' }, headline: { type: 'string' }, description: { type: 'string' }, cta: { type: 'string', enum: CTAS.meta } },
    };
  } else if (p === 'linkedin') {
    copyProps.linkedin = {
      type: 'object', additionalProperties: false, required: ['text', 'headline', 'cta'],
      properties: { text: { type: 'string' }, headline: { type: 'string' }, cta: { type: 'string', enum: CTAS.linkedin } },
    };
  } else if (p === 'x') {
    copyProps.x = {
      type: 'object', additionalProperties: false, required: ['text', 'headline'],
      properties: { text: { type: 'string' }, headline: { type: 'string' } },
    };
  }
});

const variantProps = {
  label: { type: 'string', enum: ['A', 'B', 'C'] },
  creative_text: { type: 'string' },
  creative_style: { type: 'string', enum: ['arcs', 'split', 'spotlight'] },
  image_prompt: { type: 'string' },
  copy: { type: 'object', additionalProperties: false, required: run.platforms, properties: copyProps },
};
// A video run's ads each get an AI video from Higgsfield, made from the
// variant's video_prompt; their words go over it. Only then is it asked for.
const aiVideo = run.ai_media === 'video' && run.ai_video ? run.ai_video : null;
if (aiVideo) variantProps.video_prompt = { type: 'string' };
if (places.length > 0) {
  const postProps = {};
  places.forEach(function (p) { postProps[p] = { type: 'string' }; });
  variantProps.posts = { type: 'object', additionalProperties: false, required: places, properties: postProps };
}
const schema = {
  type: 'object',
  additionalProperties: false,
  required: ['variants'],
  properties: {
    variants: {
      type: 'array',
      items: { type: 'object', additionalProperties: false, required: Object.keys(variantProps), properties: variantProps },
    },
  },
};

const lengths = run.platforms.map(function (p) { return '  ' + NAMES[p] + ': ' + LIMITS[p]; }).join('\n');

// A run from the team's own clip uses that video as the creative: the words go
// over it, and no image needs describing.
const clip = run.media_path ? run.media : null;
const clipLength = clip ? Math.floor(Math.round(clip.duration) / 60) + ':' + String(Math.round(clip.duration) % 60).padStart(2, '0') : null;
const creativeLines = clip
  ? [
      '- creative_text: the line shown over the team\'s video clip (' + clipLength + '), eight words at most. Each ad uses that clip; the copy can invite people to watch it.',
      '- creative_style: arcs, split or spotlight, each used once across the three variants.',
      '- image_prompt: an empty string. No image is needed: the clip is the creative.',
    ]
  : [
      aiVideo ? '- creative_text: the words shown over the ad\'s video, eight words at most.' : '- creative_text: the words on the image, eight words at most.',
      '- creative_style: arcs, split or spotlight, each used once across the three variants.',
      '- image_prompt: the ad\'s picture, described for an image model as a real photograph that tells a story: real-looking people interacting with each other in a moment the audience lives or hopes for (a parent lifting a child onto their shoulders, a family laughing together on a waterfront walk, a father playing with his children in a park, a couple hugging their grown-up child, a student greeted on arrival), chosen for this variant\'s angle and showing the feeling behind it: hope, relief, pride, togetherness. They touch, play, hug or talk to each other, never pose at the camera. The people are Indian (Indian families, parents, children, students and professionals), as most of QGR\'s clients are. Say who is in it (ages, family, what they are doing together), the emotion on their faces, the place, the light and the camera (candid, eye level, warm golden-hour light, shallow depth of field). A U.S. landmark such as the Statue of Liberty or a city skyline may sit softly in the background. Each variant its own people and scene. The people are made up, never real or famous. A U.S. flag in the room, or passports, a folder or a gavel on a table, may sit in the scene as quiet symbols of the journey, never with readable writing on them. No words or signs in the image, and nothing that shows a promised outcome (a green card or visa held up as approved, money, a guaranteed result). QGR indigo (#1C1B9D) and gold (#EFB74A) only as small natural touches (clothing, a cushion, evening light), never a tint over the picture.' +
        (brand.picture_style ? ' Keep to picture_style.' : ''),
    ].concat(aiVideo
      ? ['- video_prompt: the ad\'s video, for a video model making ' + aiVideo.seconds + ' seconds at ' + aiVideo.aspect + ': one continuous shot, the scene and how the camera moves, in under 600 characters. No words, captions or logos in it (the words go over it later), no real or identifiable people, no flags. Each variant\'s video is its own.']
      : []);
const postLines = places.length > 0
  ? ['- posts: the same idea written in full as an organic post for each place, not the ad copy cut down:'].concat(places.map(function (p) { return '  ' + POSTS[p]; }))
  : [];

// How QGR's own recent posts did, from the platforms' numbers: engagement per
// person reached (per view where a platform gives no reach), computed here and
// never by the model, as the strategist's code and lib/results.ts do. The best
// three, with their words, are examples to write like.
const has = function (n) { return n !== null && n !== undefined; };
function rate(r) {
  const base = has(r.reach) ? r.reach : r.views;
  if (!has(base) || base <= 0) return null;
  return ((r.reactions || 0) + (r.comments || 0) + (r.shares || 0) + (r.clicks || 0)) / base;
}
const bestPosts = (ctx.results || [])
  .map(function (r) { return { r: r, rate: rate(r) }; })
  .filter(function (x) { return x.rate !== null && x.r.text; })
  .sort(function (a, b) { return b.rate - a.rate; })
  .slice(0, 3)
  .map(function (x) { return { place: x.r.place, text: x.r.text, engagement: (Math.round(x.rate * 1000) / 10).toFixed(1) + '%' }; });
const examples = (ctx.examples || []).slice(0, 8).map(function (e) {
  const example = { place: e.place, text: e.text };
  if (e.note) example.why_it_worked = e.note;
  return example;
});
// Format notes for the places this run writes for, and X when it does.
const formats = {};
places.concat(run.platforms.indexOf('x') !== -1 ? ['x'] : []).forEach(function (p) {
  if (brand.post_formats && brand.post_formats[p]) formats[p] = brand.post_formats[p];
});
const hasMemory = Object.keys(formats).length > 0 || examples.length > 0 || bestPosts.length > 0;
// The team's reference pictures for the image model, by number, with what each shows.
const references = clip ? [] : (Array.isArray(ctx.references) ? ctx.references : []).map(function (r) {
  return r.note ? { number: r.number, shows: r.note } : { number: r.number };
});

const system = [
  'You write paid social ads for Quantum Global Residency (QGR), an EB-5 and U.S. residency advisory firm. ' + whatToWrite,
  '',
  'For each variant:',
  '- copy for each of these platforms, written for that platform rather than one text cut down, within these lengths:',
  lengths,
].concat(creativeLines, postLines, [
  '',
  'Voice: ' + (brand.voice || []).join(', ') + '. Every ad leads to ' + GOALS[run.goal] + '.',
  'Rules every ad follows: ' + strategy.guardrails.join('; ') + '.',
  'Never say guaranteed, never promise approval, a timeline or a return, and never name a competitor. Processing times are estimates.',
  "Positive marketing only: say what QGR does for families, never knock other advisors or programs and never sell by fear. Do not write that EB-5 is an investment with risk or that QGR turns projects down. Write U.S., never US.",
  '',
  'The material holds the strategy and what it came from: the competitor report, or QGR\'s own source. Use their specifics (a question the source answers, a gap in the competitor\'s ads), never a competitor\'s claim or name.',
]).concat(hasMemory
  ? ['Brand memory: follow post_formats for each place, and write like posts_that_work and our_best_posts (their format, length and tone) without copying their words.']
  : []).concat(references.length > 0
  ? ['references are the QGR team\'s reference pictures, which the image model is given with every picture' + (aiVideo ? ' and video' : '') + ' of this run, each with what it shows where the team said. Write ' + (aiVideo ? 'image_prompt and video_prompt' : 'image_prompt') + ' to use them where they fit, naming each as reference 1, reference 2 and so on.']
  : []).join('\n');

// The team's direction for the run, in their words. Only when they gave one;
// without it the request is exactly as before.
const DIRECTION_RULE = "direction is the QGR team's brief for this run, in their own words: follow it in the ads (the hooks, the focus, what to leave out) within the strategy. The rules above win wherever it conflicts with them.";
// A run from QGR's own clip or source: the ads say what it says.
const CLIP_RULE = "clip.what_is_said is what is said in the team's video, which every ad shows. Write each variant from it: its words, its moments, and any event, date, place or offer it names, so the copy and posts match what people see and hear. Do not add claims it does not make.";
const SOURCE_RULE = "source is QGR's own material this run is made from. Write each variant from it: its specifics (what it explains, who it is for, any event, date, place or offer it names), not generic EB-5 lines.";

const material = {
  brand: { company: brand.company, website: brand.website, offer: brand.offer, audience: brand.audience },
  strategy: { title: strategy.title, positioning: strategy.positioning, audiences: strategy.audiences, angles: picked || strategy.angles, channels: strategy.channels },
};
if (brand.topics && brand.topics.length > 0) material.brand.topics = brand.topics;
if (ctx.report) {
  material.competitor_report = {
    competitor: ctx.report.competitor,
    summary: ctx.report.summary,
    insights: ctx.report.insights,
    winning_hooks: (ctx.report.hooks || []).map(function (h) { return { text: h.text, days_running: h.days_running, variations: h.variations }; }),
  };
  // The competitor's ads the team picked for this run, when they picked some.
  if (Array.isArray(ctx.chosen_ads) && ctx.chosen_ads.length > 0) {
    material.competitor_report.chosen_ads = ctx.chosen_ads.map(function (a) {
      return a.headline ? { text: a.text, headline: a.headline } : { text: a.text };
    });
  }
}
const page = run.page && run.page.ok ? run.page : null;
if (clip) {
  material.clip = { length: clipLength, what_is_said: run.excerpt || '' };
} else if (run.kind === 'custom') {
  const text = run.input === 'text' ? run.excerpt || '' : (page && page.text) || '';
  if (text) material.source = { type: run.input, title: (page && page.title) || run.title, text: text.slice(0, 12000) };
}
if (run.guidance) material.direction = run.guidance;
if (Object.keys(formats).length > 0) material.post_formats = formats;
if (brand.picture_style && !clip) material.picture_style = brand.picture_style;
if (examples.length > 0) material.posts_that_work = examples;
if (bestPosts.length > 0) material.our_best_posts = bestPosts;
if (references.length > 0) material.references = references;

return [{
  json: {
    body: {
      model: MODEL,
      max_tokens: 32000,
      fallbacks: 'default',
      output_config: { effort: EFFORT, format: { type: 'json_schema', schema: schema } },
      system: [system].concat(
        material.clip ? [CLIP_RULE] : material.source ? [SOURCE_RULE] : [],
        run.guidance ? [DIRECTION_RULE] : [],
      ).join('\n\n'),
      messages: [{ role: 'user', content: 'The brand, the strategy and what it came from, as JSON:\n' + JSON.stringify(material) }],
    },
  },
}];
