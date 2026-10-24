// The Claude request: Haiku 5.5 at high effort, because the strategy is the
// judgement the rest of the run depends on (high is Anthropic's advice for
// Haiku on knowledge work). JSON constrained by the schema; fallbacks for a
// declined request, which only Sonnet and Opus act on; no temperature.
const MODEL = 'claude-haiku-5-5';
const EFFORT = 'high';
const p = $input.first().json;
const run = p.run;
const GOALS = {
  consultations: 'Book free consultations',
  webinar: 'Webinar sign-ups',
  awareness: 'Brand awareness',
  guide: 'Guide downloads',
};

// The team's content rules for the words (Brand memory, "How content is
// made"): the Do's it follows and the Don'ts it never does, which win over the
// run's direction. Only when there are some; what keeps an ad legally safe is
// written above, in code.
function ruleList(list) {
  return (list || []).map(function (r) { return String(r || '').trim(); }).filter(Boolean);
}
const copyDo = ruleList(p.brand && p.brand.copy_rules);
const copyDont = ruleList(p.brand && p.brand.copy_donts);
const COPY_RULES = copyDo.length + copyDont.length > 0
  ? ["The team's content rules (Brand memory), for every angle, hook and the positioning; no guardrail of the strategy may break them."]
      .concat(copyDo.length > 0 ? ['Do:'].concat(copyDo.map(function (r) { return '- ' + r; })) : [])
      .concat(copyDont.length > 0 ? ['Never (hard rules, whatever the direction or the material says):'].concat(copyDont.map(function (r) { return '- ' + r; })) : [])
      .join('\n')
  : null;

const system = [
  "You are the ad strategist for Quantum Global Residency (Quantum Global), an EB-5 and U.S. residency advisory firm. From the material given (a report on a competitor's ads, or Quantum Global's own content), write the strategy Quantum Global's next ads follow.",
  '',
  "- positioning: one sentence Quantum Global can own, built on its real strengths in the brand profile. Never borrow a competitor's claim.",
  "- angles: exactly three, strongest first. For each: a short name; why it should work, naming the evidence (a competitor hook that keeps running, a gap no one covers, or a moment in the source); and one hook to test, in Quantum Global's voice. With a competitor report, set based_on_hook to the competitor hook the angle answers, word for word, or null when the angle exploits a gap. Without one, based_on_hook is null.",
  '- audiences: one to three, specific enough to target.',
  "- channels: one for each platform in the run, with its share of the budget, its role and the formats to use.",
  "- guardrails: at most two rules specific to this strategy; the brand's own guardrails always apply on top.",
  '- title: a short name for this push. summary: the strategy in under 90 characters.',
  '',
  'Nothing may promise an outcome, a timeline or a return.',
].join('\n');

// How Quantum Global's own recent posts did, from the platforms' numbers: engagement per
// person reached (per view where a platform gives no reach), computed here and
// never by the model. The dashboard computes it the same way (lib/results.ts).
// Only when there are some: without them the request is exactly as before.
const PLACE = { facebook: 'Facebook', instagram: 'Instagram', linkedin: 'LinkedIn' };
const has = function (n) { return n !== null && n !== undefined; };
function rate(r) {
  const base = has(r.reach) ? r.reach : r.views;
  if (!has(base) || base <= 0) return null;
  return ((r.reactions || 0) + (r.comments || 0) + (r.shares || 0) + (r.clicks || 0)) / base;
}
const measured = (p.results || [])
  .map(function (r) { return { r: r, rate: rate(r) }; })
  .filter(function (x) { return x.rate !== null; })
  .sort(function (a, b) { return b.rate - a.rate; });
// The best five and, past them, the weakest three.
const shown = measured.length > 8 ? measured.slice(0, 5).concat(measured.slice(-3)) : measured;
const pastPosts = shown.map(function (x) {
  return {
    angle: x.r.angle,
    hook: x.r.creative_text,
    headline: x.r.headline || null,
    platform: PLACE[x.r.place] || x.r.place,
    posted: String(x.r.posted_at).slice(0, 10),
    reached: has(x.r.reach) ? x.r.reach : x.r.views,
    engagement: (Math.round(x.rate * 1000) / 10).toFixed(1) + '%',
  };
});
// The team's direction for the run, in their words: the brief. Only when they
// gave one; without it the request is exactly as before.
const DIRECTION_RULE = "direction is the Quantum Global team's brief for this run, in their own words. Follow it where the material allows: the angles it asks for, the hooks it wants tested, what to leave out. Where it asks for a promise of an outcome, a timeline or a return, or for anything the team's content rules say never to do, those rules win.";
// Brand memory: what Quantum Global usually posts about (brand.topics) and the posts the
// team keeps as ones that work. Each rule only when there is something for it.
const examples = (p.examples || []).slice(0, 8).map(function (e) {
  const example = { place: e.place, text: e.text };
  if (e.note) example.why_it_worked = e.note;
  return example;
});
const TOPICS_RULE = 'brand.topics is what Quantum Global usually posts about: keep the angles within it unless the material points somewhere better, and say so in why.';
const EXAMPLES_RULE = 'posts_that_work are posts the team kept because they worked for Quantum Global: let them inform the angles and hooks, without copying them.';
// The competitor's ads the team picked for this run, from the report. Only
// when they picked some: without them the request is exactly as before.
const chosenAds = (p.chosenAds || []).map(function (a) {
  const ad = { platform: a.platform, format: a.format, text: a.text };
  if (a.headline) ad.headline = a.headline;
  if (a.cta) ad.cta = a.cta;
  if (a.angle) ad.angle = a.angle;
  if (a.days_running !== null && a.days_running !== undefined) ad.days_running = a.days_running;
  return ad;
});
const CHOSEN_RULE = "competitor_report.chosen_ads are the competitor's ads the Quantum Global team picked for this run. Build the angles on them first: each answers one where it can (a better version of its promise, or the gap it leaves), with based_on_hook set to that ad's opening words, word for word. The rest of the report is context.";
// A run from Quantum Global's own source (a clip, a page, the team's text): the ads are
// made from it, so the strategy is too. A clip run once got one angle from the
// clip and two from the brand's strengths, which read as generic (2026-10-22).
const SOURCE_RULE = "source is what this run's ads are made from (from a clip, the ads are that clip). Build the strategy on it: every angle comes from what the source says (a moment, a question it answers, a promise it makes, an event, date or place it names), and why quotes or names that moment. The brand's strengths may back an angle up but never stand in for one; brand.topics, posts_that_work and our_past_posts shape how the angles are said, not what they are about. Keep the source's specifics (who it speaks to, an event and its dates, what it offers) in the positioning, the audiences and the title.";
const RESULTS_RULE = "our_past_posts is how Quantum Global's own recent posts did, best engagement first. Build on the angles and hooks that engaged, and an angle may name one as its evidence; bring back one that did poorly only with a reason. These numbers are history, not a promise: no ad may quote them.";

const material = { brand: p.brand, goal: GOALS[run.goal], platforms: run.platforms };
if (run.guidance) material.direction = run.guidance;
if (pastPosts.length > 0) material.our_past_posts = pastPosts;
if (examples.length > 0) material.posts_that_work = examples;
if (p.report) {
  material.competitor_report = {
    competitor: p.report.competitor,
    summary: p.report.summary,
    insights: p.report.insights,
    angles_in_their_ads: p.report.angles,
    winning_hooks: p.report.hooks,
    website_summary: p.report.website_summary,
  };
  if (chosenAds.length > 0) material.competitor_report.chosen_ads = chosenAds;
} else {
  material.source = { type: run.input, title: (p.page && p.page.title) || run.title, text: p.sourceText || '' };
  if (run.url) material.source.url = run.url;
  if (p.page && p.page.description && p.sourceText.indexOf(p.page.description) === -1) {
    material.source.description = p.page.description;
  }
  if (p.clip) {
    const seconds = Math.round(p.clip.duration);
    const length = Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0');
    material.source.note = 'An uploaded video clip of ' + length + ', which the ads will use. ' + (p.clip.transcript
      ? 'The text is what is said in it: a transcript the team read over before the run started.'
      : 'There is no transcript: the text is the team\'s own description of what is said in it.');
  } else if (run.input === 'podcast' || run.input === 'video') {
    material.source.note = 'No transcript yet: this is the text of the episode or video page.';
  }
}

const schema = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'summary', 'positioning', 'audiences', 'angles', 'channels', 'guardrails'],
  properties: {
    title: { type: 'string' },
    summary: { type: 'string' },
    positioning: { type: 'string' },
    audiences: { type: 'array', items: { type: 'string' } },
    angles: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'why', 'hook', 'based_on_hook'],
        properties: {
          name: { type: 'string' },
          why: { type: 'string' },
          hook: { type: 'string' },
          based_on_hook: { anyOf: [{ type: 'string' }, { type: 'null' }] },
        },
      },
    },
    channels: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['platform', 'share', 'role', 'format'],
        properties: {
          platform: { type: 'string', enum: run.platforms },
          share: { type: 'integer' },
          role: { type: 'string' },
          format: { type: 'string' },
        },
      },
    },
    guardrails: { type: 'array', items: { type: 'string' } },
  },
};

return [{
  json: {
    body: {
      model: MODEL,
      max_tokens: 24000,
      fallbacks: 'default',
      output_config: { effort: EFFORT, format: { type: 'json_schema', schema: schema } },
      system: [system]
        .concat(
          COPY_RULES ? [COPY_RULES] : [],
          run.guidance ? [DIRECTION_RULE] : [],
          p.report && chosenAds.length > 0 ? [CHOSEN_RULE] : [],
          p.report ? [] : [SOURCE_RULE],
          p.brand && p.brand.topics && p.brand.topics.length > 0 ? [TOPICS_RULE] : [],
          examples.length > 0 ? [EXAMPLES_RULE] : [],
          pastPosts.length > 0 ? [RESULTS_RULE] : [],
        )
        .join('\n\n'),
      messages: [{ role: 'user', content: 'The material, as JSON:\n' + JSON.stringify(material) }],
    },
  },
}];
