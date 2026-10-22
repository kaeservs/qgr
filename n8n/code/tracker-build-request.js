// The Claude request: Haiku 5.5 at medium effort (reading and grouping ads is
// not the hard part), JSON constrained by the schema below. Haiku while the
// app is being built (CLAUDE.md, n8n). fallbacks retries a request a safety
// classifier declines on another model, on Sonnet and Opus; on Haiku a
// refusal stands and the run says so. No temperature: Haiku 5.5 can reject it.
const MODEL = 'claude-haiku-5-5';
const EFFORT = 'medium';
const p = $input.first().json;
// A run from the team's screenshots: Claude reads the items out of the
// pictures first (ads_read): paid ads, organic posts, emails or web pages,
// each with the counts the screenshot shows copied as written (numbers are
// worked out of them in code, never estimated). Then it reports on them as
// on any ads.
const shots = Array.isArray(p.shots) ? p.shots : [];
const ANGLES = ['Timeline & urgency', 'Family & education', 'Due diligence', 'Investment safety', 'Career freedom', 'Process explained', 'Cost & pricing', 'Lifestyle', 'Social proof', 'Other'];

const READ = [
  'First read every piece of their marketing in the screenshots into ads_read, in order: one entry per item (a screenshot can show more than one). An item is a paid ad, an organic social post, an email (a newsletter) or a web page; leave out anything that is none of these.',
  '- id: a1, a2, a3 and so on, in the order read. shot: the number of the screenshot it is in.',
  '- kind: ad for a paid ad (it says Sponsored, or it is in an ad library), post for an organic post, email, or page.',
  '- platform: meta for Facebook and Instagram, linkedin, x, email for an email, web for a web page. format: video, image, carousel, document or text.',
  "- page_name: the advertiser or sender as it shows. text: the main text exactly as written, without its headline or button (an email: its subject, then its opening; a page: its heading, then its opening); where it is cut off (\"See more\"), up to the cut. headline and cta: as written, or an empty string.",
  "- started_on: the day it started running as YYYY-MM-DD, only when the screenshot shows it (Meta's Ad Library says \"Started running on\", or a range for an ad that stopped); otherwise an empty string. ended_on: the day it stopped, as YYYY-MM-DD, only when the screenshot shows a range that ends; otherwise an empty string. active: active or inactive when the screenshot says so; otherwise an empty string.",
  "- versions: the number in \"N ads use this creative and text\" when the screenshot shows it, as written; otherwise an empty string. placements: the places the ad library lists it on, from facebook, instagram, messenger, audience_network, threads and whatsapp; otherwise none.",
  '- reactions, comments, shares and views: each count exactly as the screenshot shows it (for example 1.2K or 347); an empty string when it is not shown. Never estimate one.',
  'Never guess words that are cut off or cannot be read.',
  '',
];
// Ads from LinkedIn's Ad Library carry what LinkedIn publishes: an
// impressions range, and whether it stopped showing in the last 30 days. Only
// then is Claude told so; without them the request is exactly as before.
const fromLinkedIn = shots.length === 0 && (p.ads || []).some(function (a) { return a.platform === 'linkedin'; });
const LINKEDIN_RULE = "Ads with platform linkedin come from LinkedIn's Ad Library, which publishes an impressions range for some ads (impressions, as written, for example 10k-20k): the one figure of reach you may cite, exactly as written. stopped marks an ad LinkedIn showed in the last 30 days and has stopped; its days_running is how long it ran.";
const system = [
  shots.length > 0
    ? "You analyse a competitor's marketing for Quantum Global Residency (QGR), an EB-5 and U.S. residency advisory firm. You get screenshots of the competitor's marketing that the QGR team saved, numbered: mostly paid ads, sometimes organic posts, emails or web pages; and sometimes text from their website."
    : "You analyse a competitor's paid social ads for Quantum Global Residency (QGR), an EB-5 and U.S. residency advisory firm. You get the competitor's active ads, each with an id, the number of days it has been running and, when Meta says, how many copies of it they run (versions) and where Meta shows it (placements); and sometimes text from their website.",
  '',
].concat(shots.length > 0 ? READ : [], [
  "Report what is working for them. The public signs of an ad that works are how long it has run, how many versions they run of it and how widely it is placed, and, on a screenshot, the reactions, comments and shares it shows; nothing else is known of an ad's results, so never claim spend, clicks or reach.",
]).concat(fromLinkedIn ? [LINKEDIN_RULE] : [], [
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
    const ad = { id: a.id, platform: a.platform, format: a.format, days_running: a.days_running, text: a.text, headline: a.headline, cta: a.cta, page_name: a.page_name };
    if (a.versions) ad.versions = a.versions;
    if (a.placements && a.placements.length > 0) ad.placements = a.placements;
    if (a.impressions) ad.impressions = a.impressions;
    if (a.active === false) ad.stopped = true;
    return ad;
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
  const READ_FIELDS = ['id', 'shot', 'kind', 'platform', 'format', 'page_name', 'text', 'headline', 'cta', 'started_on', 'ended_on', 'active', 'versions', 'placements', 'reactions', 'comments', 'shares', 'views'];
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
          kind: { type: 'string', enum: ['ad', 'post', 'email', 'page'] },
          platform: { type: 'string', enum: ['meta', 'linkedin', 'x', 'email', 'web'] },
          format: { type: 'string', enum: ['video', 'image', 'carousel', 'document', 'text'] },
          page_name: { type: 'string' },
          text: { type: 'string' },
          headline: { type: 'string' },
          cta: { type: 'string' },
          started_on: { type: 'string' },
          ended_on: { type: 'string' },
          active: { type: 'string', enum: ['active', 'inactive', ''] },
          versions: { type: 'string' },
          placements: { type: 'array', items: { type: 'string', enum: ['facebook', 'instagram', 'messenger', 'audience_network', 'threads', 'whatsapp'] } },
          reactions: { type: 'string' },
          comments: { type: 'string' },
          shares: { type: 'string' },
          views: { type: 'string' },
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
