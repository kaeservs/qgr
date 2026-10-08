// The Claude request: Opus 5.5 at high effort, because this copy goes out in
// QGR's name. The schema asks only for the platforms this run selected, with
// each platform's own call-to-action buttons. Lengths are in the prompt; the
// editor flags anything long. No temperature.
const MODEL = 'claude-opus-5-5';
const EFFORT = 'high';
const ctx = $input.first().json;
const run = ctx.run;
const brand = ctx.brand;
const strategy = ctx.strategy;
if (!strategy || !strategy.angles || strategy.angles.length !== 3) {
  throw new Error('The strategy is missing its three angles.');
}

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

const schema = {
  type: 'object',
  additionalProperties: false,
  required: ['variants'],
  properties: {
    variants: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['label', 'creative_text', 'creative_style', 'image_prompt', 'copy'],
        properties: {
          label: { type: 'string', enum: ['A', 'B', 'C'] },
          creative_text: { type: 'string' },
          creative_style: { type: 'string', enum: ['arcs', 'split', 'spotlight'] },
          image_prompt: { type: 'string' },
          copy: { type: 'object', additionalProperties: false, required: run.platforms, properties: copyProps },
        },
      },
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
      '- creative_text: the words on the image, eight words at most.',
      '- creative_style: arcs, split or spotlight, each used once across the three variants.',
      '- image_prompt: a prompt for an image model describing the scene only: no words in the image, QGR indigo (#1C1B9D) and gold (#EFB74A), no real or identifiable people, no flags.',
    ];
const system = [
  'You write paid social ads for Quantum Global Residency (QGR), an EB-5 and U.S. residency advisory firm. Write three variants: A follows the strategy\'s first angle, B the second, C the third.',
  '',
  'For each variant:',
  '- copy for each of these platforms, written for that platform rather than one text cut down, within these lengths:',
  lengths,
].concat(creativeLines, [
  '',
  'Voice: ' + (brand.voice || []).join(', ') + '. Every ad leads to ' + GOALS[run.goal] + '.',
  'Rules every ad follows: ' + strategy.guardrails.join('; ') + '.',
  'Never say guaranteed, never promise approval, a timeline or a return, and never name a competitor. Processing times are estimates.',
]).join('\n');

const material = {
  brand: { company: brand.company, website: brand.website, offer: brand.offer, audience: brand.audience },
  strategy: { title: strategy.title, positioning: strategy.positioning, audiences: strategy.audiences, angles: strategy.angles, channels: strategy.channels },
};
if (clip) material.clip = { length: clipLength, what_is_said: run.excerpt || '' };

return [{
  json: {
    body: {
      model: MODEL,
      max_tokens: 16000,
      fallbacks: 'default',
      output_config: { effort: EFFORT, format: { type: 'json_schema', schema: schema } },
      system: system,
      messages: [{ role: 'user', content: 'The brand and the strategy, as JSON:\n' + JSON.stringify(material) }],
    },
  },
}];
