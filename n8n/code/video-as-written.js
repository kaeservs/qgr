// Higgsfield sometimes answers with one of its presets in place of the
// prompt ("Ask the user whether to use that preset or generate literally"),
// and then nothing is priced or made. The team asked for its own prompt, so
// the preset is declined and the same request is asked once more as written:
// declined_preset_id, beside the params and inside them as get_cost is
// (checked on 2026-10-20: declined, the price came back). Every other answer
// goes on as it came. A preset offered again after that is read as nothing
// made, with the reason.
const KEY = 'generate_input';
return $input.all().map(function (item, i) {
  const notice = presetNotice(item.json);
  let input = null;
  try {
    input = JSON.parse($('Write the request').itemMatching(i).json[KEY]);
  } catch (e) {
    input = null;
  }
  if (!notice || !notice.id || !input || typeof input !== 'object' || input.declined_preset_id) {
    return { json: Object.assign({}, item.json, { as_written: false }), pairedItem: { item: i } };
  }
  input.declined_preset_id = notice.id;
  if (input.params && typeof input.params === 'object') input.params.declined_preset_id = notice.id;
  const out = { as_written: true };
  out[KEY] = JSON.stringify(input);
  return { json: out, pairedItem: { item: i } };
});
