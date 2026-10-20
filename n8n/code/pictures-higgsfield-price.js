// Higgsfield's price for each ad's picture, read:
//   priced   -> recorded against the month's limit, then sent
//   retry    -> Higgsfield was not reached: nothing was sent, and the ad is
//               taken again at the next run (three tries)
//   refused  -> nothing will be made, and the ad says why (one of Higgsfield's
//               presets offered in place of the prompt included: never seen
//               for a picture, and never taken)
return $input.all().map(function (item, i) {
  const asked = $('Write the Higgsfield request').itemMatching(i).json;
  const json = item.json;
  if (notReached(json, 'quote_input')) {
    return { json: { kind: 'retry', variant_id: asked.variant_id, error: 'Higgsfield could not be reached for its price' } };
  }
  const error = errorOf(json);
  if (error) return { json: { kind: 'refused', variant_id: asked.variant_id, error: 'Higgsfield would not price the picture: ' + error } };
  const preset = presetNotice(json);
  if (preset) return { json: { kind: 'refused', variant_id: asked.variant_id, error: presetSaid(preset) + ': nothing was made. Change the picture\'s prompt a little and ask again.' } };
  const answer = answerOf(json);
  if (findString(answer, ['job_id', 'jobId'], 0)) {
    return { json: { kind: 'refused', variant_id: asked.variant_id, error: 'Higgsfield started a picture when asked only its price: check its history before asking again.' } };
  }
  const credits = creditsOf(answer);
  if (credits === null) {
    const words = wordsOf(json);
    return { json: { kind: 'refused', variant_id: asked.variant_id, error: 'Higgsfield gave no price for the picture' + (words ? ': ' + words.slice(0, 200) : '.') } };
  }
  return { json: { kind: 'priced', variant_id: asked.variant_id, credits: credits, quality: asked.quality, path: asked.path } };
});
