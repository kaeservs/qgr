// What to scan, from the run the database handed back.
const ctx = $input.first().json;
const run = ctx.run;
let domain = null;
if (run.input === 'website' && run.url) {
  domain = new URL(run.url).hostname.replace(/^www\./, '').toLowerCase();
}
return [{
  json: {
    runId: run.id,
    input: run.input,
    url: run.url || null,
    websiteUrl: run.input === 'website' ? run.url : '',
    domain: domain,
    competitorHint: run.competitor_name || (domain ? domain.split('.')[0] : null),
    files: run.files || [],
    platforms: run.platforms,
  },
}];
