// The team's screenshots of the competitor's ads, signed by Storage for a
// quarter of an hour so Claude can fetch them from the private bucket
// without a key. There are no ads to read yet: Claude reads them out of the
// pictures, and "Read Claude's answer" makes them the report's ads. Days
// running are known only for an ad whose screenshot shows the day it started.
const STORAGE = '__STORAGE__';
const plan = $('Plan the scan').first().json;
const res = $input.first().json || {};
const signed = Array.isArray(res.body) ? res.body : [];
const byPath = {};
signed.forEach(function (s) {
  const link = s && (s.signedURL || s.signedUrl);
  if (s && s.path && typeof link === 'string' && !s.error) byPath[s.path] = link;
});
if (res.statusCode !== 200 || plan.screenshots.some(function (path) { return !byPath[path]; })) {
  throw new Error('The screenshots could not be read from storage (' + (res.statusCode || 'no answer') + '). Try the run again.');
}
const shots = plan.screenshots.map(function (path, i) {
  const link = byPath[path];
  return { n: i + 1, path: path, url: /^https?:\/\//.test(link) ? link : STORAGE + (link.charAt(0) === '/' ? '' : '/') + link };
});
return [{ json: Object.assign({}, plan, { dataSource: 'upload', ads: [], shots: shots }) }];
