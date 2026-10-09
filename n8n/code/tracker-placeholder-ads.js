// SAMPLE ADS, read while the team's competitor ads are set to sample (Settings,
// Agents), as they are until Apify's token is in n8n. They come in the shape
// "Read Apify's ads" gives ({ id, platform, format, startDate, isActive,
// pageName, text, headline, cta, adUrl, mediaUrl }), flagged 'placeholder' so
// the report says its ads were samples, not this competitor's.
const plan = $input.first().json;
const hint = plan.competitorHint || 'competitor';
const pageName = hint.charAt(0).toUpperCase() + hint.slice(1);
const day = 24 * 60 * 60 * 1000;
const sample = [
  ['meta', 'video', 63, "Your kids shouldn't age out while you wait.", 'Plan your EB-5 timeline', 'Book now'],
  ['meta', 'video', 58, "Your kids shouldn't age out while you wait. Here's how families plan ahead.", 'Talk to an advisor', 'Book now'],
  ['meta', 'image', 41, "The H-1B lottery isn't a plan. This is.", 'EB-5, explained', 'Learn more'],
  ['meta', 'image', 37, "Still waiting on the H-1B lottery? There's another door.", 'See your options', 'Learn more'],
  ['linkedin', 'document', 34, 'What $800K actually buys: a timeline, not a promise.', 'The EB-5 cost guide', 'Download'],
  ['linkedin', 'carousel', 28, '3 questions to ask before you pick an EB-5 project.', 'Pick a project wisely', 'Learn more'],
  ['meta', 'image', 19, 'Rural or urban project? Here is what changes for you.', 'TEA projects explained', 'Learn more'],
  ['meta', 'video', 12, 'Meet the families who moved last year.', 'Their stories', 'Watch more'],
  ['x', 'text', 9, 'We read the visa bulletin so you do not have to.', 'This month, explained', 'Learn more'],
  ['linkedin', 'image', 6, 'Free webinar: EB-5 for Indian families.', 'Save your seat', 'Register'],
];
const ads = sample.map(function (a, i) {
  return {
    id: 'sample-' + (i + 1),
    platform: a[0],
    format: a[1],
    startDate: new Date(Date.now() - a[2] * day).toISOString(),
    isActive: true,
    pageName: pageName,
    text: a[3],
    headline: a[4],
    cta: a[5],
    adUrl: null,
    mediaUrl: null,
  };
});
return [{ json: Object.assign({}, plan, { dataSource: 'placeholder', ads: ads }) }];
