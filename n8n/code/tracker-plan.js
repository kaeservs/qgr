// What to scan, from the run the database handed back. The app read the
// competitor's website when the run started and stored it with the run
// (run.page): the agents never fetch a link themselves. With the team's ads
// switched to Apify (Settings, Agents), it also says which page of Meta's Ad
// Library Apify reads: the library link pasted, or else a search for the
// competitor's name, kept afterwards to their own ads. A run from screenshots
// of their ads (files in competitor-shots, uploaded by the team) reads those
// instead, whichever source the team chose. The team's direction for the
// run, if they gave one, and who QGR is (its brand memory) go along to the
// request.
const ctx = $input.first().json;
const run = ctx.run;
// Runs from before screenshots carried bare file names, with nothing to read.
const SHOT = /^shots\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(jpg|png|webp)$/;
const screenshots = run.input === 'upload' && Array.isArray(run.files) && run.files.length > 0 && run.files.every(function (f) { return SHOT.test(f); })
  ? run.files.slice(0, 10)
  : [];
const page = run.page && run.page.ok ? run.page : null;
// n8n's Code node has no URL class, so the host is read with a pattern.
let domain = null;
const host = run.input === 'website' && run.url ? /^https?:\/\/([^/:?#]+)/i.exec(run.url) : null;
if (host && host[1]) domain = host[1].replace(/^www\./, '').toLowerCase();
const competitorHint = run.competitor_name || (page && page.siteName) || (domain ? domain.split('.')[0] : null);
const adsSource = ctx.ads_source === 'apify' ? 'apify' : 'sample';

let library = null;
if (adsSource === 'apify' && screenshots.length === 0) {
  if (run.input === 'ad_link') {
    if (!/^https?:\/\/(www\.|m\.)?facebook\.com\/ads\/library\b/i.test(run.url || '')) {
      throw new Error("Apify reads Meta's Ad Library, and this link is to another one. Start the run from their website or a link to their ads in Meta's Ad Library.");
    }
    library = { url: run.url, keep: null };
  } else {
    const query = competitorHint || domain;
    if (!query) throw new Error('There is no name to look this competitor up by in Meta\'s Ad Library.');
    library = {
      url: 'https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=ALL&media_type=all&search_type=keyword_unordered&q=' + encodeURIComponent(query),
      query: query,
      keep: { name: competitorHint, domain: domain },
    };
  }
}

return [{
  json: {
    runId: run.id,
    input: run.input,
    url: run.url || null,
    domain: domain,
    competitorHint: competitorHint,
    websiteText: page ? [page.title, page.description, page.text].filter(Boolean).join('\n\n') : '',
    files: run.files || [],
    screenshots: screenshots,
    platforms: run.platforms,
    adsSource: adsSource,
    library: library,
    guidance: run.guidance || null,
    brand: ctx.brand ? { company: ctx.brand.company, offer: ctx.brand.offer, audience: ctx.brand.audience, topics: ctx.brand.topics || [] } : null,
  },
}];
