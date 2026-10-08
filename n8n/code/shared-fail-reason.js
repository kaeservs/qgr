// Why the agent stopped, from whichever step failed: a step that reports
// { ok: false, p_error } or a node's error output ({ error }).
const item = $input.first().json;
const ctx = $('Begin: load the run').first().json;
let message = item.p_error;
if (!message) {
  const e = item.error;
  message = typeof e === 'string' ? e : (e && (e.description || e.message)) || 'Unknown error';
}
return [{
  json: {
    p_run_id: ctx.run.id,
    p_stage: '__STAGE__',
    p_error: String(message).slice(0, 500),
    p_usage: item.p_usage || null,
  },
}];
