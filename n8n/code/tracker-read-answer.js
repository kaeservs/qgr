// Reads Claude's answer and builds the report. Every number here comes from
// the ads themselves: a hook's days running is its longest-running ad's, its
// versions are how many ads share it, an angle's count is how many ads use it.
const res = $input.first().json;
const prep = $('Prepare the ads').first().json;
const u = res.usage || {};
const usage = {
  model: res.model || 'claude-opus-5-5',
  input_tokens: u.input_tokens || 0,
  output_tokens: u.output_tokens || 0,
  cache_creation_input_tokens: u.cache_creation_input_tokens || 0,
  cache_read_input_tokens: u.cache_read_input_tokens || 0,
};
function fail(message) {
  return [{ json: { ok: false, p_run_id: prep.runId, p_error: message, p_usage: usage } }];
}

if (res.stop_reason === 'refusal') {
  const category = res.stop_details && res.stop_details.category;
  return fail('Claude declined to analyse these ads' + (category ? ' (' + category + ')' : '') + '.');
}
if (res.stop_reason === 'max_tokens') {
  return fail('Claude ran out of room before the report was finished.');
}
const block = (res.content || []).find(function (b) { return b.type === 'text'; });
let answer;
try {
  answer = JSON.parse(block ? block.text : '');
} catch (e) {
  return fail('Claude did not return a readable report.');
}

const byId = {};
prep.ads.forEach(function (a) { byId[a.id] = a; });
const used = {};
const hooks = (answer.hooks || [])
  .map(function (h) {
    const ads = (h.ad_ids || []).filter(function (id) { return byId[id] && !used[id]; }).map(function (id) { used[id] = true; return byId[id]; });
    if (ads.length === 0 || !h.text) return null;
    const lead = ads.reduce(function (a, b) { return b.days_running > a.days_running ? b : a; });
    return { text: String(h.text).trim(), platform: lead.platform, format: lead.format, days_running: lead.days_running, variations: ads.length };
  })
  .filter(Boolean)
  .sort(function (a, b) { return b.days_running - a.days_running || b.variations - a.variations; })
  .slice(0, 6);
if (hooks.length === 0) {
  return fail('Claude grouped none of the ads into hooks.');
}

const counts = {};
(answer.ad_angles || []).forEach(function (x) {
  if (byId[x.ad_id]) counts[x.angle] = (counts[x.angle] || 0) + 1;
});
const angles = Object.keys(counts)
  .map(function (label) { return { label: label, ads: counts[label] }; })
  .sort(function (a, b) { return b.ads - a.ads; });

const examples = prep.ads
  .slice()
  .sort(function (a, b) { return b.days_running - a.days_running; })
  .slice(0, 4)
  .map(function (a) {
    return { platform: a.platform, format: a.format, text: a.hook_line, days_running: a.days_running, ad_url: a.ad_url, media_url: a.media_url };
  });

const platforms = [];
prep.ads.forEach(function (a) { if (platforms.indexOf(a.platform) === -1) platforms.push(a.platform); });

const report = {
  competitor: { name: String(answer.competitor_name || prep.competitorHint || prep.domain || 'Competitor').trim(), domain: prep.domain },
  data_source: prep.dataSource,
  active_ads: prep.ads.length,
  platforms: platforms,
  summary: String(answer.summary || '').trim(),
  website_summary: String(answer.website_summary || '').trim() || null,
  insights: (answer.insights || []).map(function (s) { return String(s).trim(); }).filter(Boolean).slice(0, 5),
  angles: angles,
  hooks: hooks,
  ads: examples,
};
if (report.insights.length === 0) {
  return fail('Claude returned no insights.');
}
return [{ json: { ok: true, p_run_id: prep.runId, p_report: report, p_usage: usage } }];
