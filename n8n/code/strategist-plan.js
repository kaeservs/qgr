// What the strategy is built from: the tracker's report on a competitor run,
// or QGR's own content on a custom run. A link's page was read by the app when
// the run started (run.page); an uploaded clip comes with the words said in it
// (run.excerpt): its transcript, read over by the team, or what they typed.
// How the team's own recent posts did comes along too (ctx.results), and the
// posts the team keeps in brand memory as ones that work (ctx.examples). A run
// built on a few of a report's ads, chosen by a person, brings them too
// (ctx.chosen_ads), with the report they came from, and so do the angles the
// last runs used (ctx.recent_angles), so this run finds new ones.
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
    examples: Array.isArray(ctx.examples) ? ctx.examples : [],
    chosenAds: Array.isArray(ctx.chosen_ads) ? ctx.chosen_ads : [],
    recentAngles: Array.isArray(ctx.recent_angles) ? ctx.recent_angles : [],
    sourceText: sourceText,
    sourceLabel: custom ? (clip ? 'Uploaded clip' : KIND[run.input]) + ' · ' + run.title : null,
  },
}];
