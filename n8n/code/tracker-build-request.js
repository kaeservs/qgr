// The Claude request: Haiku 5.5 at medium effort (reading and grouping ads is
// not the hard part), JSON constrained by the schema below. Haiku while the
// app is being built (CLAUDE.md, n8n). fallbacks retries a request a safety
// classifier declines on another model, on Sonnet and Opus; on Haiku a
// refusal stands and the run says so. No temperature: Haiku 5.5 can reject it.
const MODEL = 'claude-haiku-5-5';
const EFFORT = 'medium';
const p = $input.first().json;
// A run from the team's screenshots: Claude reads the ads out of the pictures
// first (ads_read), then reports on them as on any others.
const shots = Array.isArray(p.shots) ? p.shots : [];
const ANGLES = ['Timeline & urgency', 'Family & education', 'Due diligence', 'Investment safety', 'Career freedom', 'Process explained', 'Cost & pricing', 'Lifestyle', 'Social proof', 'Other'];

const READ = [
  'First read every ad in the screenshots into ads_read, in order: one entry per ad (a screenshot can show more than one).',
  '- id: a1, a2, a3 and so on, in the order read. shot: the number of the screenshot it is in.',
  '- platform: meta for Facebook and Instagram, linkedin or x. format: video, image, carousel, document or text.',
  "- page_name: the advertiser's name as the ad shows it. text: the ad's main text exactly as written, without its headline or button; where it is cut off (\"See more\"), up to the cut. headline and cta: as written, or an empty string.",
  "- started_on: the day it started running as YYYY-MM-DD, only when the screenshot shows it (Meta's Ad Library says \"Started running on\"); otherwise an empty string.",
  'Never guess words that are cut off or cannot be read, and leave out anything that is not an ad.',
  '',
];
const system = [
  shots.length > 0
    ? "You analyse a competitor's paid social ads for Quantum Global Residency (QGR), an EB-5 and U.S. residency advisory firm. You get screenshots of the competitor's ads that the QGR team saved, numbered, and sometimes text from their website."
    : "You analyse a competitor's paid social ads for Quantum Global Residency (QGR), an EB-5 and U.S. residency advisory firm. You get the competitor's active ads, each with an id and the number of days it has been running, and sometimes text from their website.",
  '',
].concat(shots.length > 0 ? READ : [], [
  'Report what is working for them:',
  '- hooks: group ads that open with the same idea and state that idea once, quoted from the ad that words it best (do not paraphrase). List every ad id in the group. At most six hooks; an ad belongs to at most one. The system works out how long each hook has run and how many versions it has from the ids, so give no numbers.',
  '- ad_angles: one angle for every ad id, from the allowed list.',
  '- insights: three observations a marketer could act on, one sentence each, each naming its evidence in the ads (for example "their four longest-running ads all lead with ..."). If the ads are few or thin, say so rather than guess.',
  '- summary: the single most useful finding, under 90 characters.',
  '- competitor_name: the advertiser as their ads name themselves.',
  '- website_summary: one or two sentences on how they position themselves, from the website text; an empty string when there is none.',
  '',
  'Work only from the material given.',
]).join('\n');

// Who reads the report: QGR, as its brand memory has it. The insights are for it to act on.
const BRAND_RULE = 'our_brand is QGR, who reads this report: make the insights ones QGR can act on with what it offers and posts about, never claims the ads do not show.';

// The team's direction for the run, in their words: what to look for. Only when
// they gave one; without it the request is exactly as before.
const DIRECTION_RULE = "direction is the QGR team's note on what to look for in these ads. Let it decide which hooks and insights come first, but report only what the ads show.";

const material = {
  competitor: { domain: p.domain, name_hint: p.competitorHint },
  website_text: p.websiteText || '',
};
if (shots.length > 0) {
  material.screenshots = shots.length;
} else {
  material.ads = p.ads.map(function (a) {
    return { id: a.id, platform: a.platform, format: a.format, days_running: a.days_running, text: a.text, headline: a.headline, cta: a.cta, page_name: a.page_name };
  });
}
if (p.brand) material.our_brand = p.brand;
if (p.guidance) material.direction = p.guidance;

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
if (shots.length > 0) {
  const READ_FIELDS = ['id', 'shot', 'platform', 'format', 'page_name', 'text', 'headline', 'cta', 'started_on'];
  schema.required = ['ads_read'].concat(schema.required);
  schema.properties = Object.assign({
    ads_read: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: READ_FIELDS,
        properties: {
          id: { type: 'string' },
          shot: { type: 'integer' },
          platform: { type: 'string', enum: ['meta', 'linkedin', 'x'] },
          format: { type: 'string', enum: ['video', 'image', 'carousel', 'document', 'text'] },
          page_name: { type: 'string' },
          text: { type: 'string' },
          headline: { type: 'string' },
          cta: { type: 'string' },
          started_on: { type: 'string' },
        },
      },
    },
  }, schema.properties);
}

// The material as JSON, then each screenshot after its number.
const intro = 'The competitor material, as JSON:\n' + JSON.stringify(material);
const content = shots.length > 0
  ? [{ type: 'text', text: intro }].concat(...shots.map(function (shot) {
      return [{ type: 'text', text: 'Screenshot ' + shot.n + ':' }, { type: 'image', source: { type: 'url', url: shot.url } }];
    }))
  : intro;

return [{
  json: {
    body: {
      model: MODEL,
      max_tokens: 16000,
      fallbacks: 'default',
      output_config: { effort: EFFORT, format: { type: 'json_schema', schema: schema } },
      system: [system].concat(p.brand ? [BRAND_RULE] : [], p.guidance ? [DIRECTION_RULE] : []).join('\n\n'),
      messages: [{ role: 'user', content: content }],
    },
  },
}];
