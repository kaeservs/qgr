// How each picture's job is going, read from Higgsfield's job_status:
//   done     -> the picture's link, to fetch and store
//   failed   -> why, as plainly as Higgsfield says it
//   waiting  -> nothing yet: checked again at the next run
// A job Higgsfield no longer knows is left to a person (unknown).

/** The picture's own link: one ending as a picture does, else the first. */
function pictureLink(answer) {
  const all = allLinks(answer);
  return all.filter(function (u) { return /\.(png|jpe?g|webp)(\?|$)/i.test(u); })[0] || all[0] || '';
}

return $input.all().map(function (item, i) {
  const job = $('One item per job').itemMatching(i).json;
  const json = item.json;
  if (notReached(json, 'job_id')) return { json: { kind: 'waiting', id: job.id } };
  const error = errorOf(json);
  if (error) {
    return { json: /not found|unknown job|no such job|does not exist/i.test(error) ? { kind: 'unknown', id: job.id, error: 'Higgsfield no longer knows this picture\'s job: ' + error } : { kind: 'waiting', id: job.id } };
  }
  const answer = answerOf(json);
  const status = jobStatus(answer);
  if (JOB_DONE.test(status)) {
    const url = pictureLink(answer);
    if (!url) return { json: { kind: 'unknown', id: job.id, error: 'Higgsfield says the picture is made but gave no link to it: find it in Higgsfield\'s history.' } };
    return { json: { kind: 'done', id: job.id, path: job.path, url: url } };
  }
  if (JOB_FAILED.test(status)) return { json: { kind: 'failed', id: job.id, error: jobReason(status, answer, json) } };
  return { json: { kind: 'waiting', id: job.id } };
});
