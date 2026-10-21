// Reads the prompt Claude drafted for an AI video: one that can be asked of
// Higgsfield (20 to 2,000 characters), or why there is none. What the call
// spent goes on with it to be kept (video_prompt_used), answered or not.
return $input.all().map(function (item) {
  const res = item.json || {};
  const asked = $('Build the prompt request').first().json;
  const u = res.usage || {};
  const usage = {
    input_tokens: u.input_tokens || 0,
    output_tokens: u.output_tokens || 0,
    cache_creation_input_tokens: u.cache_creation_input_tokens || 0,
    cache_read_input_tokens: u.cache_read_input_tokens || 0,
  };
  const base = { long_video_id: asked.long_video_id || null, model: res.model || 'claude-haiku-5-5', usage: usage };
  const fail = function (message) {
    return { json: Object.assign({ ok: false, error: message }, base) };
  };

  if (res.error) {
    const e = res.error;
    return fail('Claude could not be asked for the prompt (' + String((e && (e.description || e.message)) || e).slice(0, 200) + '). Write it yourself, or try again.');
  }
  if (res.stop_reason === 'refusal') return fail('Claude declined to write a prompt for this point: write it yourself.');
  const block = (res.content || []).find(function (b) { return b.type === 'text'; });
  let answer;
  try {
    answer = JSON.parse(block ? block.text : '');
  } catch (e) {
    return fail('Claude did not return a readable prompt: try again.');
  }
  const prompt = String((answer && answer.prompt) || '').replace(/\s+/g, ' ').trim().slice(0, 2000);
  if (prompt.length < 20) return fail('Claude wrote no prompt: write it yourself.');
  const why = String((answer && answer.why) || '').replace(/\s+/g, ' ').trim().slice(0, 300);
  return { json: Object.assign({ ok: true, prompt: prompt, why: why }, base) };
});
