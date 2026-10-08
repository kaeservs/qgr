// What to scan, from the run the database handed back. The app read the
// competitor's website when the run started and stored it with the run
// (run.page): the agents never fetch a link themselves.
const ctx = $input.first().json;
const run = ctx.run;
const page = run.page && run.page.ok ? run.page : null;
// n8n's Code node has no URL class, so the host is read with a pattern.
let domain = null;
const host = run.input === 'website' && run.url ? /^https?:\/\/([^/:?#]+)/i.exec(run.url) : null;
if (host && host[1]) domain = host[1].replace(/^www\./, '').toLowerCase();
return [{
  json: {
    runId: run.id,
    input: run.input,
    url: run.url || null,
    domain: domain,
    competitorHint: run.competitor_name || (page && page.siteName) || (domain ? domain.split('.')[0] : null),
    websiteText: page ? [page.title, page.description, page.text].filter(Boolean).join('\n\n') : '',
    files: run.files || [],
    platforms: run.platforms,
  },
}];
