// What the strategy is built from: the tracker's report on a competitor run,
// or QGR's own content on a custom run.
const ctx = $input.first().json;
const run = ctx.run;
const KIND = { podcast: 'Podcast', blog: 'Blog post', video: 'Video', text: 'Text' };
const custom = run.kind === 'custom';
const needsSource = custom && run.input !== 'text';
return [{
  json: {
    runId: run.id,
    run: run,
    brand: ctx.brand,
    report: ctx.report,
    needsSource: needsSource,
    sourceUrl: needsSource ? run.url : '',
    sourceText: run.input === 'text' ? run.excerpt : '',
    sourceLabel: custom ? KIND[run.input] + ' · ' + run.title : null,
  },
}];
