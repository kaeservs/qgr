// How a job is going, read from Higgsfield's job_status:
//   done     -> its video's link, to copy into Storage
//   failed   -> why, as plainly as Higgsfield says it
//   waiting  -> nothing yet: asked again in a minute or so
// A job Higgsfield no longer knows is left to a person (unknown).
const DONE = /^(completed|complete|succeeded|success|done|finished|ready)$/;
const FAILED = /^(failed|failure|error|errored|canceled|cancelled|nsfw|rejected|expired|ip_detected|blocked|moderated|submission_failed)$/;

/** Every https link in an answer, at any depth. */
function links(value, out, depth) {
  if (depth > 6 || value === null || value === undefined) return out;
  if (typeof value === 'string') {
    if (/^https:\/\/\S+$/.test(value)) out.push(value);
    return out;
  }
  if (typeof value === 'object') {
    const inner = Array.isArray(value) ? value : Object.keys(value).map(function (k) { return value[k]; });
    inner.forEach(function (v) { links(v, out, depth + 1); });
  }
  return out;
}

/** The video's own link: an .mp4 first, else one that says video, else the first. */
function videoLink(answer) {
  const all = links(answer, [], 0);
  return all.filter(function (u) { return /\.mp4(\?|$)/i.test(u); })[0] || all.filter(function (u) { return /video/i.test(u); })[0] || all[0] || '';
}

function reason(status, answer, json) {
  if (status === 'ip_detected') return 'Higgsfield held it back: it may show protected material. If the team has the rights, reveal it on Higgsfield.';
  if (status === 'nsfw' || status === 'moderated' || status === 'blocked') return 'Higgsfield\'s safety check stopped it: change the prompt and ask again.';
  const said = findString(answer, ['error', 'message', 'reason', 'detail'], 0) || wordsOf(json);
  return 'Higgsfield could not make it (' + status + ')' + (said ? ': ' + said.slice(0, 200) : '.');
}

return $input.all().map(function (item, i) {
  const job = $('One item per job').itemMatching(i).json;
  const json = item.json;
  if (notReached(json, 'job_id')) return { json: { kind: 'waiting', id: job.id } };
  const error = errorOf(json);
  if (error) {
    return { json: /not found|unknown job|no such job|does not exist/i.test(error) ? { kind: 'unknown', id: job.id, error: 'Higgsfield no longer knows this job: ' + error } : { kind: 'waiting', id: job.id } };
  }
  const answer = answerOf(json);
  const status = (findString(answer, ['status', 'state'], 0) || '').toLowerCase();
  if (DONE.test(status)) {
    const url = videoLink(answer);
    if (!url) return { json: { kind: 'unknown', id: job.id, error: 'Higgsfield says it is made but gave no link to it: find it in Higgsfield\'s history.' } };
    return { json: { kind: 'done', id: job.id, path: job.path, url: url } };
  }
  if (FAILED.test(status)) return { json: { kind: 'failed', id: job.id, error: reason(status, answer, json) } };
  return { json: { kind: 'waiting', id: job.id } };
});
