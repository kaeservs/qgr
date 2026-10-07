// Turns raw ads into what Claude reads. Days running are computed here from
// each ad's start date: the model is never asked to count or estimate.
const src = $input.first().json;
const now = Date.now();
const day = 24 * 60 * 60 * 1000;
const ads = (src.ads || [])
  .filter(function (a) { return a.isActive !== false && a.text; })
  .slice(0, 60)
  .map(function (a, i) {
    const start = Date.parse(a.startDate);
    const text = String(a.text);
    return {
      id: 'a' + (i + 1),
      platform: a.platform,
      format: a.format,
      days_running: Number.isFinite(start) ? Math.max(0, Math.round((now - start) / day)) : 0,
      text: text.slice(0, 600),
      headline: a.headline || null,
      cta: a.cta || null,
      page_name: a.pageName || null,
      ad_url: a.adUrl || null,
      media_url: a.mediaUrl || null,
      hook_line: text.split(/(?<=[.!?])\s/)[0].slice(0, 140),
    };
  });
if (ads.length === 0) {
  throw new Error('No active ads were found for this competitor.');
}
return [{ json: Object.assign({}, src, { ads: ads }) }];
