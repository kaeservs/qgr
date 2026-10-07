// The page's words without markup, capped so the prompt stays small.
// Used after "Read their website" (tracker) and "Read the source page" (strategist).
const plan = $('__PLAN__').first().json;
const html = String($input.first().json.data || '');
const text = html
  .replace(/<(script|style|noscript|svg|template)[\s\S]*?<\/\1>/gi, ' ')
  .replace(/<!--[\s\S]*?-->/g, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/g, ' ')
  .replace(/&amp;/g, '&')
  .replace(/&(rsquo|lsquo|#39);/g, "'")
  .replace(/&(rdquo|ldquo|quot);/g, '"')
  .replace(/&[a-z]+;|&#\d+;/gi, ' ')
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, 12000);
return [{ json: Object.assign({}, plan, { __FIELD__: text }) }];
