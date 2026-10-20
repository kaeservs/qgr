// STAND-IN for Higgsfield: the way taken while AI video is not switched on
// (Settings, AI video). Nothing is sent and nothing is spent: the ask ends,
// and the page says no video was made and where to switch it on.
//
// The real way ("Make it for real?" true) sends the ask to Higgsfield through
// its MCP (generate_video), with its first picture imported first when it has
// one, and records what happened in the shape every reader answers in:
//   { kind: 'started', id, job_id, credits }   Higgsfield took it
//   { kind: 'refused', id, error }             nothing was made
//   { kind: 'retry', id, error }               Higgsfield was not reached: sent again next minute
//   { kind: 'unknown', id, error }             it may have been made: never sent again by itself
return $input.all().map(function (item) {
  return { json: { kind: 'stand_in', id: item.json.id } };
});
