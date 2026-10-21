// The Claude request for an AI video's prompt, drafted from what is said
// around a point of a video the team is editing ("Write it from what's said
// here"): Haiku 5.5 at low effort, a few seconds' work. The person reads the
// draft, changes it as they like and sees Higgsfield's price before anything
// is made, so nothing here spends credits. JSON held to a schema, no
// temperature. One item: the page's request.
const MODEL = 'claude-haiku-5-5';
const EFFORT = 'low';

function clock(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  return m + ':' + (s % 60 < 10 ? '0' : '') + (s % 60);
}

const SHAPE = { '9:16': 'vertical (9:16)', '1:1': 'square (1:1)', '16:9': 'wide (16:9)' };

return $input.all().map(function (item) {
  const r = (item.json && item.json.body) || {};
  const brand = r.brand || {};
  const rules = (brand.guardrails || []).join('; ');
  const cover = r.mode === 'cover';
  const system = [
    "You write the prompt for one short AI video (Higgsfield's video models) that goes into a video of Quantum Global Residency (QGR), an EB-5 and U.S. residency advisory firm, at a point the team chose." +
      (cover
        ? ' It plays over the video while the speaker goes on talking (B-roll), so it shows what they are talking about there.'
        : ' It is inserted at that point, between what comes before and after, so it carries the thought on from what was just said.'),
    '',
    '- prompt: one continuous shot of ' + (r.seconds || 5) + ' seconds, ' + (SHAPE[r.aspect] || 'wide') + ': what is seen, how the camera moves, the light. Concrete and visual, 30 to 90 words, in English.',
    '- Show what is said around the point: the place, the people\'s situation, the feeling. If the team gave an idea, build on it first.',
    '- People only seen from behind, in profile with the face not shown, at a distance or as hands: never an identifiable face, never a real or famous person.',
    '- No words, signs, logos, flags, money or documents with writing in the picture: the video\'s own words go over it later.',
    '- Nothing that promises an outcome: no approved papers, no green cards held up, no celebrations of a result. EB-5 is an investment with risk.' + (rules ? " QGR's rules: " + rules + '.' : ''),
    brand.look ? '- Keep to the brand\'s picture style: ' + brand.look : "- The brand's colours are indigo and warm gold: let them show in the light or the setting, never as text.",
    '- why: one short sentence saying what in the transcript the video shows, for the team.',
  ].join('\n');

  const lines = (r.lines || []).map(function (l) { return '[' + clock(l.start) + '] ' + l.text; });
  const material = {
    point: clock(r.at || 0),
    way: cover ? 'over the video while the talk goes on' : 'inserted at the point',
    company: brand.company || 'Quantum Global Residency',
    offer: brand.offer || undefined,
    audience: brand.audience || undefined,
  };
  if (r.idea) material.idea = r.idea;

  return {
    json: {
      long_video_id: r.long_video_id || null,
      body: {
        model: MODEL,
        max_tokens: 1200,
        output_config: {
          effort: EFFORT,
          format: {
            type: 'json_schema',
            schema: {
              type: 'object',
              additionalProperties: false,
              required: ['prompt', 'why'],
              properties: { prompt: { type: 'string' }, why: { type: 'string' } },
            },
          },
        },
        system: system,
        messages: [{ role: 'user', content: 'The point in the video, as JSON, then what is said around it:\n' + JSON.stringify(material) + '\n\n' + (lines.length > 0 ? lines.join('\n') : '(nothing is said here: write from the idea)') }],
      },
    },
  };
});
