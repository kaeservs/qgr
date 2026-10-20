// The request for each picture recorded as being sent
// (picture_higgsfield_begin): the params its price was asked with, without
// get_cost, so this time it is made. Each is sent once.
return $input.all().map(function (item, i) {
  const asked = $('Write the Higgsfield request').itemMatching(i).json;
  return { json: { id: item.json.id, variant_id: asked.variant_id, generate_input: JSON.stringify({ params: asked.params }) } };
});
