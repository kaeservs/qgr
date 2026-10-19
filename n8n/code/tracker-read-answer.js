// Reads Claude's answer and builds the report. Every number here comes from
// the ads themselves: a hook's days running is its longest-running ad's, its
// versions are how many ads share it, an angle's count is how many ads use it.
// From screenshots, the ads are what Claude read out of them, and an ad's days
// running are counted here from the day it started, when the screenshot shows
// one; otherwise they are not known, and the report says nothing in their place.
// The report keeps every ad, longest-running first, for a person to choose from.
const res = $input.first().json;
const prep = $('Prepare the ads').first().json;
const u = res.usage || {};
const usage = {
  model: res.model || 'claude-haiku-5-5',
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

const DAY = 24 * 60 * 60 * 1000;
const shots = Array.isArray(prep.shots) ? prep.shots : [];
let ads = prep.ads;
if (shots.length > 0) {
  const seen = {};
  ads = (answer.ads_read || [])
    .map(function (a) {
      const shot = shots[Number(a.shot) - 1];
      const text = String(a.text || '').replace(/\s+/g, ' ').trim();
      const id = String(a.id || '');
      if (!shot || !text || !id || seen[id]) return null;
      seen[id] = true;
      const day = /^\d{4}-\d{2}-\d{2}$/.test(a.started_on || '') ? Date.parse(a.started_on + 'T00:00:00Z') : NaN;
      const known = Number.isFinite(day) && day <= Date.now() && day >= Date.parse('2010-01-01T00:00:00Z');
      return {
        id: id,
        platform: a.platform,
        format: a.format,
        days_running: known ? Math.max(0, Math.floor((Date.now() - day) / DAY)) : 0,
        days_known: known,
        text: text.slice(0, 600),
        headline: String(a.headline || '').trim() || null,
        cta: String(a.cta || '').trim() || null,
        page_name: String(a.page_name || '').trim() || null,
        ad_url: null,
        media_url: null,
        screenshot_path: shot.path,
      };
    })
    .filter(Boolean)
    .slice(0, 60);
  if (ads.length === 0) {
    return fail('Claude found no ads it could read in the screenshots.');
  }
}

const byId = {};
ads.forEach(function (a) { byId[a.id] = a; });
const known = function (a) { return a.days_known !== false; };
const used = {};
const hooks = (answer.hooks || [])
  .map(function (h) {
    const group = (h.ad_ids || []).filter(function (id) { return byId[id] && !used[id]; }).map(function (id) { used[id] = true; return byId[id]; });
    if (group.length === 0 || !h.text) return null;
    const lead = group.reduce(function (a, b) { return b.days_running > a.days_running ? b : a; });
    const hook = { text: String(h.text).trim(), platform: lead.platform, format: lead.format, days_running: lead.days_running, variations: group.length };
    if (!known(lead)) hook.days_known = false;
    return hook;
  })
  .filter(Boolean)
  .sort(function (a, b) { return b.days_running - a.days_running || b.variations - a.variations; })
  .slice(0, 6);
if (hooks.length === 0) {
  return fail('Claude grouped none of the ads into hooks.');
}

const counts = {};
const angleOf = {};
(answer.ad_angles || []).forEach(function (x) {
  if (byId[x.ad_id] && !angleOf[x.ad_id]) {
    angleOf[x.ad_id] = x.angle;
    counts[x.angle] = (counts[x.angle] || 0) + 1;
  }
});
const angles = Object.keys(counts)
  .map(function (label) { return { label: label, ads: counts[label] }; })
  .sort(function (a, b) { return b.ads - a.ads; });

const kept = ads
  .slice()
  .sort(function (a, b) { return b.days_running - a.days_running; })
  .map(function (a) {
    const ad = {
      platform: a.platform,
      format: a.format,
      text: a.text,
      days_running: a.days_running,
      ad_url: a.ad_url,
      media_url: a.media_url,
      headline: a.headline || null,
      cta: a.cta || null,
      page_name: a.page_name || null,
      angle: angleOf[a.id] || null,
    };
    if (!known(a)) ad.days_known = false;
    if (a.screenshot_path) ad.screenshot_path = a.screenshot_path;
    return ad;
  });

const platforms = [];
ads.forEach(function (a) { if (platforms.indexOf(a.platform) === -1) platforms.push(a.platform); });

const report = {
  // From screenshots, the competitor is who the team named.
  competitor: { name: String((shots.length > 0 && prep.competitorHint) || answer.competitor_name || prep.competitorHint || prep.domain || 'Competitor').trim(), domain: prep.domain },
  data_source: prep.dataSource,
  active_ads: ads.length,
  platforms: platforms,
  summary: String(answer.summary || '').trim(),
  website_summary: String(answer.website_summary || '').trim() || null,
  insights: (answer.insights || []).map(function (s) { return String(s).trim(); }).filter(Boolean).slice(0, 5),
  angles: angles,
  hooks: hooks,
  ads: kept,
};
if (report.insights.length === 0) {
  return fail('Claude returned no insights.');
}
return [{ json: { ok: true, p_run_id: prep.runId, p_report: report, p_usage: usage } }];
