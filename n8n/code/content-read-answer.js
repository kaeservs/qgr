// Reads Claude's three variants, names each after its strategy angle, and
// flags (never silently fixes) anything that breaks a guardrail or X's hard
// 280-character limit, so a person sees it before approving.
const res = $input.first().json;
const ctx = $('Begin: load the run').first().json;
const run = ctx.run;
const angles = ctx.strategy.angles;
const u = res.usage || {};
const usage = {
  model: res.model || 'claude-opus-5-5',
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
  variants.push({
    label: labels[i],
    angle: angles[i].name,
    creative_text: String(v.creative_text || '').trim(),
    creative_style: v.creative_style,
    image_prompt: String(v.image_prompt || '').trim(),
    image_url: null,
    copy: v.copy,
    warnings: warnings,
  });
}
return [{ json: { ok: true, p_run_id: run.id, p_ad_set: { title: ctx.strategy.title, variants: variants }, p_usage: usage } }];
