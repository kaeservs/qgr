// The Claude request for a long video's moments: Haiku 5.5 at medium effort,
// reading the transcript line by line and naming the moments worth an ad by
// their line numbers. Times are never asked for: they are the transcript's,
// worked out after (moments-read-answer.js) and again in the database. JSON
// held to a schema, no temperature. One item per long video.
const MODEL = 'claude-haiku-5-5';
const EFFORT = 'medium';

function clock(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const pad = function (n) { return (n < 10 ? '0' : '') + n; };
  return (h > 0 ? h + ':' + pad(m) : String(m)) + ':' + pad(s % 60);
}

const DIRECTION_RULE = "direction is the Quantum Global team's brief for this video, in their own words: favour the moments it asks for. The rules above win wherever it conflicts with them.";

return $input.all().map(function (item) {
  const v = item.json;
  const brand = v.brand || {};
  const rules = (brand.guardrails || []).join('; ');
  // The team's content rules for the words (Brand memory): the Do's every hook follows and the Don'ts it never does, when there are some.
  const copyRules = (brand.copy_rules || []).map(function (r) { return String(r || '').trim(); }).filter(Boolean);
  const copyDonts = (brand.copy_donts || []).map(function (r) { return String(r || '').trim(); }).filter(Boolean);
  const system = [
    "You pick the moments in a long video of Quantum Global Residency (Quantum Global), an EB-5 and U.S. residency advisory firm, that would each make a short ad on their own: a webinar, a talk or an interview, given as its transcript, one numbered line at a time with the time it starts.",
    '',
    '- moments: five to ten, the strongest first, each named by its first and last line (both included).',
    '- Each runs about 15 to 90 seconds, starts where a thought starts and ends where it finishes, and makes sense to someone who has seen nothing else of the video.',
    '- Good moments: a clear answer to a question people ask about EB-5 or U.S. residency, a plain explanation, a short story, a strong line. Leave out greetings, housekeeping, questions about the session itself, and anything that leans on what came before.',
    '- Moments never overlap.',
    '- title: what the moment is, under 60 characters. why: why it would work as an ad, naming what is said in it. hook: one opening line for its ad, in Quantum Global\'s voice (' + ((brand.voice || []).join(', ') || 'calm, expert, plain English') + ').',
    '',
    'Never pick a moment for a promise of an outcome, a timeline or a return, and no hook makes one. Never name another company in a hook.' + (rules ? ' Quantum Global\'s rules: ' + rules + '.' : ''),
  ].concat(
    copyRules.length + copyDonts.length > 0 ? ['', "The team's content rules (Brand memory), for every hook."] : [],
    copyRules.length > 0 ? ['Do:'].concat(copyRules.map(function (r) { return '- ' + r; })) : [],
    copyDonts.length > 0 ? ['Never (hard rules, whatever the direction says):'].concat(copyDonts.map(function (r) { return '- ' + r; })) : [],
    v.guidance ? ['', DIRECTION_RULE] : [],
  ).join('\n');

  const lines = (v.transcript || []).map(function (l, i) { return i + ' [' + clock(l.start) + '] ' + l.text; });
  const material = {
    video: { title: v.title, length: clock(v.duration || 0), lines: lines.length },
    brand: { company: brand.company, offer: brand.offer, audience: brand.audience },
  };
  if (brand.topics && brand.topics.length > 0) material.brand.topics = brand.topics;
  // What the team says the video is about, only when they said: without it the request is as before.
  if (v.description) material.video.about = v.description;
  if (v.guidance) material.direction = v.guidance;

  const schema = {
    type: 'object',
    additionalProperties: false,
    required: ['moments'],
    properties: {
      moments: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['first', 'last', 'title', 'why', 'hook'],
          properties: {
            first: { type: 'integer' },
            last: { type: 'integer' },
            title: { type: 'string' },
            why: { type: 'string' },
            hook: { type: 'string' },
          },
        },
      },
    },
  };

  return {
    json: {
      long_video_id: v.long_video_id,
      body: {
        model: MODEL,
        max_tokens: 8000,
        fallbacks: 'default',
        output_config: { effort: EFFORT, format: { type: 'json_schema', schema: schema } },
        system: system,
        messages: [{ role: 'user', content: 'The video, as JSON, then its transcript:\n' + JSON.stringify(material) + '\n\n' + lines.join('\n') }],
      },
    },
  };
});
