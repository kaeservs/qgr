// What the strategy is built from: the tracker's report on a competitor run,
// or QGR's own content on a custom run. A link's page was read by the app when
// the run started (run.page); an uploaded clip comes with the words said in it
// (run.excerpt): its transcript, read over by the team, or what they typed.
// How the team's own recent posts did comes along too (ctx.results).
const ctx = $input.first().json;
const run = ctx.run;
const KIND = { podcast: 'Podcast', blog: 'Blog post', video: 'Video', text: 'Text' };
const custom = run.kind === 'custom';
const page = run.page && run.page.ok ? run.page : null;
const clip = run.media_path ? run.media : null;

let sourceText = '';
if (run.input === 'text' || clip) sourceText = run.excerpt || '';
else if (page) sourceText = page.text || '';

return [{
  json: {
    runId: run.id,
    run: run,
    brand: ctx.brand,
    report: ctx.report,
    page: page ? { title: page.title || null, description: page.description || null, type: page.type || null } : null,
    clip: clip ? { duration: clip.duration, transcript: Array.isArray(clip.transcript) && clip.transcript.length > 0 } : null,
    results: Array.isArray(ctx.results) ? ctx.results : [],
    sourceText: sourceText,
    sourceLabel: custom ? (clip ? 'Uploaded clip' : KIND[run.input]) + ' · ' + run.title : null,
  },
}];
