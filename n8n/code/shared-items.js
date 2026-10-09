// The rows a database function returned, one item each. n8n turns a JSON
// array answer into items by itself; this also takes one item holding the
// whole array, so the next node sees the same either way. Nothing due means
// no items, and the rest of the workflow does not run.
const out = [];
$input.all().forEach(function (item) {
  const json = item.json;
  let rows = [];
  if (Array.isArray(json)) rows = json;
  else if (json && Array.isArray(json.data)) rows = json.data;
  else if (json && typeof json === 'object' && Object.keys(json).length > 0) rows = [json];
  rows.forEach(function (row) {
    if (row && typeof row === 'object') out.push({ json: row });
  });
});
return out;
