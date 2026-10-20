// Reads the leads Zoho sent into what the dashboard keeps: the name, status,
// source and times; what the lead said, by the field's label (no contact
// details: they were never asked for); and where it came from. A QGR post's
// link carries utm_campaign qgr-<run> and utm_content <label>-<place>, and an
// ad in Ads Manager named "qgr-<run>-<label>" says the same, which ties the
// lead to that run's variant. Nothing is guessed: what a lead does not carry
// is left out. One item in (Zoho's answer), one out: the leads and the newest
// change among them, or why Zoho could not be read.
const MAX_ANSWERS = 40;
const MAX_VALUE = 500;

const plan = $('Plan the read').first().json;
const res = $input.first().json || {};

function refusal(r) {
  const status = r.statusCode;
  const body = r.body || {};
  const said = String(body.message || body.code || (r.error && (r.error.description || r.error.message)) || r.error || '').slice(0, 200);
  if (!status && (!said || /credential/i.test(said))) return 'Zoho is not connected in n8n yet: attach the Zoho credential to "Zoho: the leads" in QGR · Leads.';
  if (status === 401 || /invalid_?oauth|invalid_?token|credentials/i.test(said)) return 'Zoho refused the login while reading the leads: connect Zoho again in n8n (the Zoho credential on "QGR · Leads").';
  if (status === 403 || /scope/i.test(said)) return 'Zoho\'s login may not read the leads: the Zoho credential needs access to Leads.';
  if (status === 429) return 'Zoho asked us to slow down while reading the leads; the next read tries again.';
  return 'Zoho could not be asked for the leads' + (status ? ' (' + status + (said ? ': ' + said : '') + ')' : said ? ' (' + said + ')' : '') + '.';
}

if (res.statusCode === 204 || res.statusCode === 304) return [{ json: { ok: true, leads: [], newest: null } }];
if (res.error || !res.statusCode || res.statusCode >= 300) return [{ json: { ok: false, error: refusal(res) } }];
const records = (res.body && res.body.data) || [];
if (!Array.isArray(records)) return [{ json: { ok: false, error: 'Zoho\'s answer had no leads in it.' } }];

function text(v) {
  if (v === null || v === undefined) return '';
  if (Array.isArray(v)) return v.map(text).filter(Boolean).join(', ');
  if (typeof v === 'object') return text(v.name || v.display_value || v.value || '');
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  return String(v).replace(/\s+/g, ' ').trim();
}
const at = function (s) { const t = Date.parse(s); return isNaN(t) ? null : t; };
// A tag from a URL's query, without the URL class (n8n's Code node has none).
function param(url, name) {
  const m = new RegExp('[?&]' + name + '=([^&#]*)', 'i').exec(url || '');
  if (!m) return '';
  try { return decodeURIComponent(m[1].replace(/\+/g, ' ')).trim(); } catch (e) { return m[1].trim(); }
}

function platformOf(utm, campaign, source) {
  const s = (utm.source || '').toLowerCase();
  if (/^(fb|facebook)/.test(s)) return 'facebook';
  if (/^(ig|instagram)/.test(s)) return 'instagram';
  if (/linkedin|^li$/.test(s)) return 'linkedin';
  if (/^(x|twitter|t\.co)$/.test(s)) return 'x';
  const p = (campaign.platform || '').toLowerCase();
  if (/^(fb|facebook)$/.test(p)) return 'facebook';
  if (/^(ig|instagram)$/.test(p)) return 'instagram';
  const src = (source || '').toLowerCase();
  if (/facebook/.test(src)) return 'facebook';
  if (/instagram/.test(src)) return 'instagram';
  if (/linkedin/.test(src)) return 'linkedin';
  if (/twitter|^x$/.test(src)) return 'x';
  if (campaign.id || campaign.form || campaign.ad_id) return 'meta';
  if (/web|site|online|seo|google|chat/.test(src) || s) return 'website';
  return 'other';
}

const since = at(plan.since);
let newest = null;
let older = 0;
const leads = [];
records.forEach(function (r) {
  if (!r || !/^[0-9]{1,30}$/.test(String(r.id || ''))) return;
  const modified = r.Modified_Time || r.Created_Time;
  // Asked for what changed since the last read: anything older was read then.
  if (since !== null && at(modified) !== null && at(modified) < since) { older++; return; }
  if (newest === null || at(modified) > at(newest)) newest = modified;

  const a = plan.attribution || {};
  const get = function (k) { return a[k] ? text(r[a[k]]) : ''; };
  const pageUrl = get('page_url');
  const utm = {};
  ['source', 'medium', 'campaign', 'content', 'term'].forEach(function (k) {
    const v = get('utm_' + k) || param(pageUrl, 'utm_' + k);
    if (v) utm[k] = v.slice(0, 120);
  });
  const campaign = {};
  [['id', 'campaign_id'], ['name', 'campaign_name'], ['ad_id', 'ad_id'], ['ad_name', 'ad_name'], ['adset', 'adset'], ['form', 'form'], ['platform', 'ad_platform']].forEach(function (p) {
    const v = get(p[1]);
    if (v) campaign[p[0]] = v.slice(0, 160);
  });
  const referrer = get('referrer');
  if (referrer) campaign.referrer = referrer.slice(0, 200);
  if (Object.keys(utm).length > 0) campaign.utm = utm;

  const named = [utm.campaign, campaign.name, campaign.ad_name, campaign.adset].join(' ');
  const run = /qgr-([0-9a-f]{8})(?:-([abc])\b)?/i.exec(named);
  const content = /^([abc])-(facebook|instagram|linkedin|x)$/i.exec(utm.content || '');
  const lead = {
    zoho_id: String(r.id),
    name: (text(r.Full_Name) || [text(r.First_Name), text(r.Last_Name)].filter(Boolean).join(' ')).slice(0, 120),
    status: text(r.Lead_Status).slice(0, 80),
    source: text(r.Lead_Source).slice(0, 80),
    platform: platformOf(utm, campaign, text(r.Lead_Source)),
    campaign: campaign,
    answers: [],
    created: r.Created_Time,
    modified: modified,
  };
  if (run) {
    lead.run_code = run[1].toLowerCase();
    const label = content ? content[1] : run[2];
    if (label) lead.label = label.toUpperCase();
    if (content) lead.place = content[2].toLowerCase();
  }
  (plan.answers || []).forEach(function (f) {
    if (lead.answers.length >= MAX_ANSWERS) return;
    const v = text(r[f.api]);
    if (v) lead.answers.push({ field: f.label, value: v.slice(0, MAX_VALUE) });
  });
  if (campaign.platform) delete campaign.platform;
  leads.push(lead);
});

if (leads.length === 0 && older > 0) {
  return [{ json: { ok: false, error: 'Zoho sent ' + older + ' lead' + (older === 1 ? '' : 's') + ' changed before the last read, and none after it: it may not have kept to "changed since".' } }];
}
return [{ json: { ok: true, leads: leads, newest: newest } }];
