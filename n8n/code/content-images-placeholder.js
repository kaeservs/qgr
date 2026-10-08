// PLACEHOLDER for image generation (ChatGPT or Higgsfield). Every variant
// already carries an image_prompt. To connect: send each prompt to the image
// model, upload the result to Supabase Storage, and set image_url to its
// address. Until then image_url stays empty and the dashboard draws the
// branded text-on-indigo design instead.
const item = $input.first().json;
const variants = item.p_ad_set.variants.map(function (v) {
  return Object.assign({}, v, { image_url: null });
});
return [{ json: Object.assign({}, item, { p_ad_set: Object.assign({}, item.p_ad_set, { variants: variants }) }) }];
