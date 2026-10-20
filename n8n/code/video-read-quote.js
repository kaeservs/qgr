// Higgsfield's price, read: credits, or why there is none. A price that came
// back with a job means Higgsfield made a video when it was only asked its
// price: said plainly, so a person checks.
return $input.all().map(function (item) {
  const json = item.json;
  if (notReached(json, 'quote_input')) return { json: { ok: false, error: 'Higgsfield could not be reached just now: try again in a minute.' } };
  const error = errorOf(json);
  if (error) return { json: { ok: false, error: 'Higgsfield would not price it: ' + error } };
  const answer = answerOf(json);
  if (findString(answer, ['job_id', 'jobId'], 0)) return { json: { ok: false, error: 'Higgsfield started a video when asked only its price: check its history.' } };
  const credits = creditsOf(answer);
  if (credits === null) {
    const words = wordsOf(json);
    return { json: { ok: false, error: 'Higgsfield gave no price' + (words ? ': ' + words.slice(0, 200) : '.') } };
  }
  return { json: { ok: true, credits: credits } };
});
