// The Claude request: Opus 5.5 at high effort, because the strategy is the
// judgement the rest of the run depends on. JSON constrained by the schema;
// server-side fallback if a classifier declines; no temperature.
const MODEL = 'claude-opus-5-5';
const EFFORT = 'high';
const p = $input.first().json;
const run = p.run;
const GOALS = {
  consultations: 'Book free consultations',
  webinar: 'Webinar sign-ups',
  awareness: 'Brand awareness',
  guide: 'Guide downloads',
};

const system = [
  "You are the ad strategist for Quantum Global Residency (QGR), an EB-5 and U.S. residency advisory firm. From the material given (a report on a competitor's ads, or QGR's own content), write the strategy QGR's next ads follow.",
  '',
  "- positioning: one sentence QGR can own, built on its real strengths in the brand profile. Never borrow a competitor's claim.",
  "- angles: exactly three, strongest first. For each: a short name; why it should work, naming the evidence (a competitor hook that keeps running, a gap no one covers, or a moment in the source); and one hook to test, in QGR's voice. With a competitor report, set based_on_hook to the competitor hook the angle answers, word for word, or null when the angle exploits a gap. Without one, based_on_hook is null.",
  '- audiences: one to three, specific enough to target.',
  "- channels: one for each platform in the run, with its share of the budget, its role and the formats to use.",
  "- guardrails: at most two rules specific to this strategy; the brand's own guardrails always apply on top.",
  '- title: a short name for this push. summary: the strategy in under 90 characters.',
  '',
  'EB-5 is an investment with risk: nothing may promise an outcome, a timeline or a return.',
].join('\n');

// How QGR's own recent posts did, from the platforms' numbers: engagement per
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
const RESULTS_RULE = "our_past_posts is how QGR's own recent posts did, best engagement first. Build on the angles and hooks that engaged, and an angle may name one as its evidence; bring back one that did poorly only with a reason. These numbers are history, not a promise: no ad may quote them.";

const material = { brand: p.brand, goal: GOALS[run.goal], platforms: run.platforms };
if (pastPosts.length > 0) material.our_past_posts = pastPosts;
if (p.report) {
  material.competitor_report = {
    competitor: p.report.competitor,
    summary: p.report.summary,
    insights: p.report.insights,
    angles_in_their_ads: p.report.angles,
    winning_hooks: p.report.hooks,
    website_summary: p.report.website_summary,
  };
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
      max_tokens: 16000,
      fallbacks: 'default',
      output_config: { effort: EFFORT, format: { type: 'json_schema', schema: schema } },
      system: pastPosts.length > 0 ? system + '\n\n' + RESULTS_RULE : system,
      messages: [{ role: 'user', content: 'The material, as JSON:\n' + JSON.stringify(material) }],
    },
  },
}];
