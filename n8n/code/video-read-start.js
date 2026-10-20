// Higgsfield's answer to an ask, read once and recorded once:
//   took it        -> started, with its job (and its price, when it says one)
//   refused it     -> refused: nothing was made
//   not reached    -> retry: nothing was sent, so it is sent again next minute
//   anything else  -> unknown: it may have been made, so it is never sent
//                     again by itself (Higgsfield: "do not automatically
//                     resubmit"); a person checks its history first.
return $input.all().map(function (item, i) {
  const sent = $('Write the request').itemMatching(i).json;
  const json = item.json;
  if (notReached(json, 'generate_input')) return { json: { kind: 'retry', id: sent.id, error: 'Could not connect to Higgsfield' } };
  const error = errorOf(json);
  if (error) {
    return {
      json: isRefusal(error)
        ? { kind: 'refused', id: sent.id, error: 'Higgsfield refused it: ' + error }
        : { kind: 'unknown', id: sent.id, error: 'Higgsfield may have started it (' + error + '). Check its history before asking again.' },
    };
  }
  const answer = answerOf(json);
  const words = wordsOf(json);
  const fromWords = words.match(/job[_ -]?id[\s:="']+([A-Za-z0-9_-]{6,})/i);
  const job = findString(answer, ['job_id', 'jobId'], 0) || findString(answer && answer.jobs, ['job_id', 'jobId', 'id'], 0) || (fromWords ? fromWords[1] : '') || findString(answer, ['id'], 0);
  if (!job) {
    return { json: { kind: 'unknown', id: sent.id, error: 'Higgsfield answered without a job (' + (words.slice(0, 200) || 'no words') + '). Check its history before asking again.' } };
  }
  return { json: { kind: 'started', id: sent.id, job_id: job, credits: creditsOf(answer) } };
});
