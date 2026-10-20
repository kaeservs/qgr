// Plans the read of Zoho's leads from the module's own list of fields, since
// every CRM names its form's questions its own way. Zoho returns only the
// fields asked for, 50 at most, so they are chosen here: the name, status,
// source and times; whatever says where the lead came from (tags, Meta's
// campaign and ad, the page it first visited); then what the lead said and
// what Zoho knows of them, custom fields first. Contact details are never
// asked for: email addresses, phone numbers, street addresses and the like
// stay in Zoho. One item in, one out: the URL to read, or why it cannot be.
const MAX_FIELDS = 50;
const ALWAYS = ['First_Name', 'Last_Name', 'Full_Name', 'Lead_Status', 'Lead_Source', 'Created_Time', 'Modified_Time'];
// Never read: how to reach the lead, and Zoho's own bookkeeping.
const NEVER = [
  'email', 'secondaryemail', 'phone', 'mobile', 'fax', 'street', 'city', 'zipcode', 'skypeid', 'twitter', 'website',
  'owner', 'createdby', 'modifiedby', 'tag', 'layout', 'recordimage', 'emailoptout', 'unsubscribedmode', 'unsubscribedtime',
  'converteddatetime', 'converteds', 'convertedaccount', 'convertedcontact', 'converteddeal', 'dataprocessingbasisdetails',
  'dataprocessingbasis', 'datasource', 'enrichstatuss', 'lockeds', 'lastactivitytime', 'leadconversiontime', 'changelogtimes',
  'lastenrichedtimes', 'salutation', 'id', 'visitorscore', 'averagetimespentminutes', 'daysvisited', 'firstvisitedtime',
  'lastvisitedtime', 'numberofchats', 'approvalstate', 'wizard',
];
const NEVER_TYPES = ['email', 'phone', 'fileupload', 'imageupload', 'profileimage', 'website', 'ownerlookup', 'userlookup', 'multiuserlookup', 'subform', 'consent_lookup'];
// What says where a lead came from, by its field's name with the punctuation taken out.
const ATTRIBUTION = [
  ['utm_source', /^utmsource$/],
  ['utm_medium', /^utmmedium$/],
  ['utm_campaign', /^utmcampaign$/],
  ['utm_content', /^utmcontent$/],
  ['utm_term', /^utmterm$/],
  ['campaign_id', /^(ad|fb|meta)?campaignid$/],
  ['campaign_name', /^(ad|fb|meta)?campaignname$/],
  ['ad_id', /^(fb|meta)?adid$/],
  ['ad_name', /^(fb|meta)?adname$/],
  ['adset', /^(fb|meta)?adset(id|name)$/],
  ['form', /^(fb|meta)?(lead)?(gen)?form(id|name)$/],
  ['ad_platform', /^(ad)?platform$/],
  ['page_url', /^(firstvisitedurl|landingpage(url)?|pageurl|sourceurl)$/],
  ['referrer', /^referrer$/],
];

const NOT_CONNECTED = 'Zoho is not connected in n8n yet: create a Zoho OAuth2 API credential for your Zoho\'s region and attach it to "Zoho: the lead fields" and "Zoho: the leads" in QGR · Leads.';

const plan = $('What to read').first().json;
const res = $input.first().json || {};
const key = function (s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, ''); };

function refusal(r, what) {
  const status = r.statusCode;
  const body = r.body || {};
  const said = String(body.message || body.code || (r.error && (r.error.description || r.error.message)) || r.error || '').slice(0, 200);
  // A step without its credential hands its input on, or says it has none.
  if (!status && (!said || /credential/i.test(said))) return NOT_CONNECTED;
  if (status === 401 || /invalid_?oauth|invalid_?token|credentials/i.test(said)) return 'Zoho refused the login while reading ' + what + ': connect Zoho again in n8n (the Zoho credential on "QGR · Leads").';
  if (status === 403 || /scope/i.test(said)) return 'Zoho\'s login may not read ' + what + ': the Zoho credential needs access to Leads and to their fields.';
  if (status === 429) return 'Zoho asked us to slow down while reading ' + what + '; the next read tries again.';
  return 'Zoho could not be asked for ' + what + (status ? ' (' + status + (said ? ': ' + said : '') + ')' : said ? ' (' + said + ')' : '') + '.';
}

if (res.error || !res.statusCode || res.statusCode >= 300) return [{ json: { ok: false, error: refusal(res, 'the leads\' fields') } }];
const fields = (res.body && res.body.fields) || [];
if (!Array.isArray(fields) || fields.length === 0) return [{ json: { ok: false, error: 'Zoho listed no fields for Leads.' } }];

const chosen = [];
const take = function (api) { if (chosen.indexOf(api) < 0 && chosen.length < MAX_FIELDS) chosen.push(api); };
const known = {};
fields.forEach(function (f) { if (f && f.api_name) known[f.api_name] = f; });
ALWAYS.forEach(function (api) { if (known[api]) take(api); });

const attribution = {};
fields.forEach(function (f) {
  if (!f || !f.api_name) return;
  const k1 = key(f.api_name);
  const k2 = key(f.field_label);
  ATTRIBUTION.forEach(function (a) {
    if (!attribution[a[0]] && (a[1].test(k1) || a[1].test(k2))) {
      attribution[a[0]] = f.api_name;
      take(f.api_name);
    }
  });
});

const used = Object.keys(attribution).map(function (k) { return attribution[k]; }).concat(ALWAYS);
const answers = [];
const candidates = fields.filter(function (f) {
  if (!f || !f.api_name || used.indexOf(f.api_name) >= 0) return false;
  if (NEVER.indexOf(key(f.api_name)) >= 0 || NEVER_TYPES.indexOf(String(f.data_type || '').toLowerCase()) >= 0) return false;
  return true;
});
// The team's own questions first, then what Zoho keeps on every lead.
candidates.filter(function (f) { return f.custom_field === true; }).concat(candidates.filter(function (f) { return f.custom_field !== true; })).forEach(function (f) {
  if (chosen.length >= MAX_FIELDS) return;
  take(f.api_name);
  answers.push({ api: f.api_name, label: String(f.field_label || f.api_name).slice(0, 80) });
});

return [{
  json: {
    ok: true,
    since: plan.since,
    url: plan.api + '/crm/v8/Leads?fields=' + encodeURIComponent(chosen.join(',')) + '&per_page=200&sort_by=Modified_Time&sort_order=asc',
    answers: answers,
    attribution: attribution,
  },
}];
