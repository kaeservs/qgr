// Turns raw ads into what Claude reads. Days running are computed here from
// each ad's start date, to its end for one that stopped (LinkedIn's library
// keeps ads shown in the last 30 days): the model is never asked to count or
// estimate. LinkedIn's impressions range goes along as LinkedIn wrote it.
// Screenshots go on as they are: their ads are read out of the pictures.
const src = $input.first().json;
if (Array.isArray(src.shots) && src.shots.length > 0) {
  return [{ json: src }];
}
const now = Date.now();
const day = 24 * 60 * 60 * 1000;
// Up to 60 ads go to Claude, in the order they came: LinkedIn's (20 at most)
// are kept beside Meta's, never pushed out by them.
const usable = (src.ads || []).filter(function (a) { return a.text && (a.isActive !== false || a.endDate); });
const linkedinRoom = Math.min(20, usable.filter(function (a) { return a.platform === 'linkedin'; }).length);
let linkedinTaken = 0;
let othersTaken = 0;
const ads = usable
  .filter(function (a) {
    if (a.platform === 'linkedin') return linkedinTaken++ < linkedinRoom;
    return othersTaken++ < 60 - linkedinRoom;
  })
  .map(function (a, i) {
    const start = Date.parse(a.startDate);
    const end = a.isActive === false ? Date.parse(a.endDate) : NaN;
    const until = Number.isFinite(end) ? end : now;
    const text = String(a.text);
    const ad = {
      id: 'a' + (i + 1),
      platform: a.platform,
      format: a.format,
      days_running: Number.isFinite(start) ? Math.max(0, Math.round((until - start) / day)) : 0,
      kind: 'ad',
      versions: Number.isInteger(a.versions) && a.versions >= 1 ? a.versions : null,
      placements: Array.isArray(a.placements) ? a.placements : [],
      active: a.isActive !== false,
      text: text.slice(0, 600),
      headline: a.headline || null,
      cta: a.cta || null,
      page_name: a.pageName || null,
      ad_url: a.adUrl || null,
      media_url: a.mediaUrl || null,
      hook_line: text.split(/(?<=[.!?])\s/)[0].slice(0, 140),
    };
    if (!Number.isFinite(start)) ad.days_known = false;
    if (a.impressions) ad.impressions = a.impressions;
    return ad;
  });
if (ads.length === 0) {
  throw new Error('No ads were found for this competitor.');
}
return [{ json: Object.assign({}, src, { ads: ads }) }];
