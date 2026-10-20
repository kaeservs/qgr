// Higgsfield's price for a video, asked by the AI video page before anyone
// presses Generate. get_cost:true asks for the price alone ("No job
// submitted"): it is sent both beside params and inside them, so whichever
// Higgsfield reads, nothing is made (checked on 2026-10-20: the balance stood
// at 280 credits before and after five prices). The prompt does not change the
// price; a short one stands in until the team has written theirs.
const STAND_IN_PROMPT = 'A quiet street at golden hour, the camera moving slowly forward.';
return $input.all().map(function (item) {
  const body = (item.json && item.json.body) || item.json || {};
  const prompt = typeof body.prompt === 'string' && body.prompt.trim().length >= 20 ? body.prompt : STAND_IN_PROMPT;
  const params = videoParams({ model: body.model, prompt: prompt, aspect: body.aspect, seconds: body.seconds, quality: body.quality, sound: body.sound === true, look: null });
  params.get_cost = true;
  return { json: { quote_input: JSON.stringify({ params: params, get_cost: true }) } };
});
