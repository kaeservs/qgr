// Reads Claude's strategy and tidies what code can decide better than prose:
// one channel per requested platform with shares that add up to 100, and the
// brand's guardrails always first.
const res = $input.first().json;
const plan = $('Gather the material').first().json;
const run = plan.run;
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
  return fail('Claude declined to write this strategy' + (category ? ' (' + category + ')' : '') + '.');
}
if (res.stop_reason === 'max_tokens') {
  return fail('Claude ran out of room before the strategy was finished.');
}
const block = (res.content || []).find(function (b) { return b.type === 'text'; });
let s;
try {
  s = JSON.parse(block ? block.text : '');
} catch (e) {
  return fail('Claude did not return a readable strategy.');
}

const angles = (s.angles || []).slice(0, 3).map(function (a) {
  return {
    name: String(a.name || '').trim(),
    why: String(a.why || '').trim(),
    hook: String(a.hook || '').trim(),
    based_on_hook: a.based_on_hook ? String(a.based_on_hook).trim() : null,
  };
});
if (angles.length !== 3 || angles.some(function (a) { return !a.name || !a.hook; })) {
  return fail('Claude did not return three complete angles.');
}

// One channel per requested platform, in the run's order.
const given = {};
(s.channels || []).forEach(function (c) { if (run.platforms.indexOf(c.platform) !== -1 && !given[c.platform]) given[c.platform] = c; });
const channels = run.platforms.map(function (platform) {
  const c = given[platform] || {};
  return { platform: platform, share: Math.max(0, Number(c.share) || 0), role: String(c.role || '').trim(), format: String(c.format || '').trim() };
});
const total = channels.reduce(function (sum, c) { return sum + c.share; }, 0);
channels.forEach(function (c) { c.share = total > 0 ? Math.round((c.share * 100) / total) : Math.round(100 / channels.length); });
const drift = 100 - channels.reduce(function (sum, c) { return sum + c.share; }, 0);
if (drift !== 0) {
  const biggest = channels.reduce(function (a, b) { return b.share > a.share ? b : a; });
  biggest.share += drift;
}

// The brand's guardrails, then at most two of the strategy's own.
const guardrails = (plan.brand.guardrails || []).slice();
(s.guardrails || []).slice(0, 2).forEach(function (g) {
  const rule = String(g).trim();
  const known = guardrails.some(function (x) { return x.toLowerCase() === rule.toLowerCase(); });
  if (rule && !known) guardrails.push(rule);
});

const strategy = {
  title: String(s.title || run.title).trim(),
  summary: String(s.summary || '').trim(),
  positioning: String(s.positioning || '').trim(),
  audiences: (s.audiences || []).map(function (a) { return String(a).trim(); }).filter(Boolean).slice(0, 3),
  angles: angles,
  channels: channels,
  guardrails: guardrails,
  source_label: plan.sourceLabel,
};
if (!strategy.positioning || strategy.audiences.length === 0) {
  return fail('Claude did not return a positioning and an audience.');
}
return [{ json: { ok: true, p_run_id: run.id, p_strategy: strategy, p_usage: usage } }];
