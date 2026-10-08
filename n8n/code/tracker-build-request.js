// The Claude request: Opus 5.5 at medium effort (reading and grouping ads is
// not the hard part), JSON constrained by the schema below, and a server-side
// fallback model if a safety classifier declines. No temperature: Opus 5.5
// rejects it.
const MODEL = 'claude-opus-5-5';
const EFFORT = 'medium';
const p = $input.first().json;
const ANGLES = ['Timeline & urgency', 'Family & education', 'Due diligence', 'Investment safety', 'Career freedom', 'Process explained', 'Cost & pricing', 'Lifestyle', 'Social proof', 'Other'];

const system = [
  "You analyse a competitor's paid social ads for Quantum Global Residency (QGR), an EB-5 and U.S. residency advisory firm. You get the competitor's active ads, each with an id and the number of days it has been running, and sometimes text from their website.",
  '',
  'Report what is working for them:',
  '- hooks: group ads that open with the same idea and state that idea once, quoted from the ad that words it best (do not paraphrase). List every ad id in the group. At most six hooks; an ad belongs to at most one. The system works out how long each hook has run and how many versions it has from the ids, so give no numbers.',
  '- ad_angles: one angle for every ad id, from the allowed list.',
  '- insights: three observations a marketer could act on, one sentence each, each naming its evidence in the ads (for example "their four longest-running ads all lead with ..."). If the ads are few or thin, say so rather than guess.',
  '- summary: the single most useful finding, under 90 characters.',
  '- competitor_name: the advertiser as their ads name themselves.',
  '- website_summary: one or two sentences on how they position themselves, from the website text; an empty string when there is none.',
  '',
  'Work only from the material given.',
].join('\n');

const material = {
  competitor: { domain: p.domain, name_hint: p.competitorHint },
  website_text: p.websiteText || '',
  ads: p.ads.map(function (a) {
    return { id: a.id, platform: a.platform, format: a.format, days_running: a.days_running, text: a.text, headline: a.headline, cta: a.cta, page_name: a.page_name };
  }),
};

const schema = {
  type: 'object',
  additionalProperties: false,
  required: ['competitor_name', 'summary', 'website_summary', 'insights', 'hooks', 'ad_angles'],
  properties: {
    competitor_name: { type: 'string' },
    summary: { type: 'string' },
    website_summary: { type: 'string' },
    insights: { type: 'array', items: { type: 'string' } },
    hooks: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['text', 'ad_ids'],
        properties: { text: { type: 'string' }, ad_ids: { type: 'array', items: { type: 'string' } } },
      },
    },
    ad_angles: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['ad_id', 'angle'],
        properties: { ad_id: { type: 'string' }, angle: { type: 'string', enum: ANGLES } },
      },
    },
  },
};

return [{
  json: {
    body: {
      model: MODEL,
      max_tokens: 16000,
      fallbacks: 'default',
      output_config: { effort: EFFORT, format: { type: 'json_schema', schema: schema } },
      system: system,
      messages: [{ role: 'user', content: 'The competitor material, as JSON:\n' + JSON.stringify(material) }],
    },
  },
}];
