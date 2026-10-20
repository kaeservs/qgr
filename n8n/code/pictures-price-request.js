// Higgsfield's price for one picture at a quality, asked by Settings and the
// studio before any picture is made: get_cost beside the params and inside
// them, which makes nothing. The words do not change the price; a short scene
// stands in.
const STAND_IN_SCENE = 'A calm city skyline at dusk, wide empty sky at the top.';
const body = ($input.first().json && $input.first().json.body) || {};
const params = higgsfieldPictureParams(picturePrompt({ prompt: STAND_IN_SCENE, look: null }), body.quality);
params.get_cost = true;
return [{ json: { quote_input: JSON.stringify({ params: params, get_cost: true }) } }];
