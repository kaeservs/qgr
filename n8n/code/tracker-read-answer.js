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
// A count as a screenshot shows it ("1.2K", "3,456", "2M", and the European
// "1,2K", "1.234", "1 234", "2,5 Mio."), worked out here: the model copies
// what it sees and never does the arithmetic. A word after it ("likes") and a
// "+" are let go. Null when it shows none, and never past two billion (the
// database's whole numbers).
const COUNT_MAX = 2000000000;
function count(v) {
  const m = /^\s*([0-9][0-9.,\s]*?)\s*(?:(k|tsd\.?|mio\.?|mil|mn|bn|m|b)(?![a-z]))?\s*\+?\s*[a-z]*\.?\s*$/i.exec(String(v || '')); // \s takes the no-break spaces some languages group thousands with
  if (!m) return null;
  let digits = m[1].replace(/\s+/g, ' ').trim();
  const unit = String(m[2] || '').toLowerCase().replace('.', '');
  const scale = unit === 'k' || unit === 'tsd' ? 1e3 : unit === 'm' || unit === 'mio' || unit === 'mil' || unit === 'mn' ? 1e6 : unit === 'b' || unit === 'bn' ? 1e9 : 1;
  if (/^\d{1,3}([ .,]\d{3})+$/.test(digits)) {
    // 1,234 · 1.234 · 1 234: thousands, whichever mark separates them.
    digits = digits.replace(/[ .,]/g, '');
  } else if (/^\d+,\d{1,2}$/.test(digits)) {
    // 1,2K · 2,5 Mio.: a decimal comma.
    digits = digits.replace(',', '.');
  } else if (!/^\d+(\.\d+)?$/.test(digits)) {
    return null;
  }
  const n = Number(digits) * scale;
  return Number.isFinite(n) ? Math.min(Math.round(n), COUNT_MAX) : null;
}
const PLACEMENTS = ['facebook', 'instagram', 'messenger', 'audience_network', 'threads', 'whatsapp'];
const KINDS = ['ad', 'post', 'email', 'page'];
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
      const dayOf = function (s) { return /^\d{4}-\d{2}-\d{2}$/.test(s || '') ? Date.parse(s + 'T00:00:00Z') : NaN; };
      const day = dayOf(a.started_on);
      const ended = dayOf(a.ended_on);
      // A stopped ad ran from its start to its end, never to today: without the end it shows, how long it ran is not known.
      const stopped = a.active === 'inactive' || Number.isFinite(ended);
      const until = stopped ? ended : Date.now();
      const known = Number.isFinite(day) && Number.isFinite(until) && day <= until && until <= Date.now() && day >= Date.parse('2010-01-01T00:00:00Z');
      const kind = KINDS.indexOf(a.kind) >= 0 ? a.kind : 'ad';
      // An email or a web page is where it is, whatever platform was given.
      const platform = kind === 'email' ? 'email' : kind === 'page' ? 'web' : a.platform;
      const versions = count(a.versions);
      return {
        id: id,
        platform: platform,
        format: a.format,
        kind: kind,
        versions: versions !== null && versions >= 1 ? Math.min(versions, 100000) : null,
        placements: (Array.isArray(a.placements) ? a.placements : []).filter(function (p, i, all) { return PLACEMENTS.indexOf(p) >= 0 && all.indexOf(p) === i; }),
        active: a.active === 'active' ? true : stopped ? false : null,
        reactions: count(a.reactions),
        comments: count(a.comments),
        shares: count(a.shares),
        views: count(a.views),
        days_running: known ? Math.max(0, Math.floor((until - day) / DAY)) : 0,
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
    // Say what Claude saw instead, so the team knows what to save next.
    const saw = String(answer.summary || '').trim();
    return fail('Claude found no ad, post, email or web page it could read in the screenshots' + (saw ? ': ' + saw : '.'));
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
      kind: a.kind || 'ad',
      versions: a.versions || null,
      placements: a.placements || [],
      active: a.active === undefined ? null : a.active,
    };
    ['reactions', 'comments', 'shares', 'views'].forEach(function (k) { if (typeof a[k] === 'number') ad[k] = a[k]; });
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
