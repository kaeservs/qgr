// Reads Claude's three variants, names each after its strategy angle, and
// flags (never silently fixes) anything that breaks a guardrail, X's hard
// 280-character limit or what Instagram takes, so a person sees it before
// approving. Each variant must come with its post in full for every place the
// run posts to. The flags are lib/guardrails.ts's, in the same order.
const res = $input.first().json;
const ctx = $('Begin: load the run').first().json;
const run = ctx.run;
const angles = ctx.strategy.angles;
const u = res.usage || {};
const usage = {
  model: res.model || 'claude-haiku-5-5',
  input_tokens: u.input_tokens || 0,
  output_tokens: u.output_tokens || 0,
  cache_creation_input_tokens: u.cache_creation_input_tokens || 0,
  cache_read_input_tokens: u.cache_read_input_tokens || 0,
};
function fail(message) {
  return [{ json: { ok: false, p_run_id: run.id, p_error: message, p_usage: usage } }];
}

if (res.stop_reason === 'refusal') {
  const category = res.stop_details && res.stop_details.category;
  return fail('Claude declined to write these ads' + (category ? ' (' + category + ')' : '') + '.');
}
if (res.stop_reason === 'max_tokens') {
  return fail('Claude ran out of room before the ads were finished.');
}
const block = (res.content || []).find(function (b) { return b.type === 'text'; });
let answer;
try {
  answer = JSON.parse(block ? block.text : '');
} catch (e) {
  return fail('Claude did not return readable ads.');
}

const RULES = [
  [/guarantee/i, 'says "guarantee"'],
  [/risk[\s-]?free/i, 'says "risk-free"'],
  [/\b100\s?%/, 'says "100%"'],
  [/\bassured\b/i, 'says "assured"'],
  [/\bin\s+\d+\s+(days|weeks|months)\b/i, 'promises a timeline'],
];
const PLACE_PLATFORM = { facebook: 'meta', instagram: 'meta', linkedin: 'linkedin' };
const PLACE_NAME = { facebook: 'Facebook', instagram: 'Instagram', linkedin: 'LinkedIn' };
const places = ['facebook', 'instagram', 'linkedin'].filter(function (p) { return run.platforms.indexOf(PLACE_PLATFORM[p]) !== -1; });
function hashtags(text) {
  return (text.match(/(^|\s)#[^\s#]+/g) || []).length;
}
const byLabel = {};
(answer.variants || []).forEach(function (v) { if (!byLabel[v.label]) byLabel[v.label] = v; });

const variants = [];
const labels = ['A', 'B', 'C'];
for (let i = 0; i < labels.length; i += 1) {
  const v = byLabel[labels[i]];
  if (!v) return fail('Claude did not write variant ' + labels[i] + '.');
  const warnings = [];
  run.platforms.forEach(function (p) {
    const copy = v.copy && v.copy[p];
    if (!copy) return;
    ['text', 'headline', 'description'].forEach(function (field) {
      const value = copy[field];
      if (!value) return;
      RULES.forEach(function (rule) {
        if (rule[0].test(value)) warnings.push(p + ' ' + field + ' ' + rule[1]);
      });
    });
    if (p === 'x' && copy.text && copy.text.length > 280) {
      warnings.push('x text is ' + copy.text.length + ' characters; X allows 280');
    }
  });
  RULES.forEach(function (rule) {
    if (rule[0].test(v.creative_text || '')) warnings.push('image text ' + rule[1]);
  });
  const posts = {};
  for (let j = 0; j < places.length; j += 1) {
    const place = places[j];
    const post = String((v.posts && v.posts[place]) || '').trim();
    if (!post) return fail('Claude did not write variant ' + labels[i] + '\'s ' + PLACE_NAME[place] + ' post.');
    // Words are flagged, never cut: a post past what any place takes fails the run instead.
    if (post.length > 3000) return fail('Claude wrote variant ' + labels[i] + '\'s ' + PLACE_NAME[place] + ' post past 3,000 characters.');
    posts[place] = post;
    RULES.forEach(function (rule) {
      if (rule[0].test(posts[place])) warnings.push(place + ' post ' + rule[1]);
    });
    if (place === 'instagram' && posts[place].length > 2200) warnings.push('instagram post is ' + posts[place].length + ' characters; Instagram allows 2,200');
    if (place === 'instagram' && hashtags(posts[place]) > 30) warnings.push('instagram post has ' + hashtags(posts[place]) + ' hashtags; Instagram allows 30');
  }
  variants.push({
    label: labels[i],
    angle: angles[i].name,
    creative_text: String(v.creative_text || '').trim(),
    creative_style: v.creative_style,
    image_prompt: String(v.image_prompt || '').trim(),
    image_url: null,
    copy: v.copy,
    posts: posts,
    warnings: warnings,
  });
}
return [{ json: { ok: true, p_run_id: run.id, p_ad_set: { title: ctx.strategy.title, variants: variants }, p_usage: usage } }];
