// Reads the moments Claude picked, by line: each must be inside the
// transcript, between 8 seconds and two and a half minutes long by the
// transcript's own times, and clear of the ones before it (the stronger,
// since they come first). The rest are dropped, never stretched or moved.
// Hooks are flagged against the guardrails, never rewritten. One item per
// long video, matched to its request.
const MIN_SECONDS = 8;
const MAX_SECONDS = 150;
const MAX_MOMENTS = 10;
const RULES = [
  [/guarantee/i, 'says "guarantee"'],
  [/risk[\s-]?free/i, 'says "risk-free"'],
  [/\b100\s?%/, 'says "100%"'],
  [/\bassured\b/i, 'says "assured"'],
  [/\bin\s+\d+\s+(days|weeks|months)\b/i, 'promises a timeline'],
];

return $input.all().map(function (item, i) {
  const res = item.json || {};
  const video = $('One item per video').itemMatching(i).json;
  const id = video.long_video_id;
  const lines = video.transcript || [];
  const u = res.usage || {};
  const usage = {
    model: res.model || 'claude-haiku-5-5',
    input_tokens: u.input_tokens || 0,
    output_tokens: u.output_tokens || 0,
    cache_creation_input_tokens: u.cache_creation_input_tokens || 0,
    cache_read_input_tokens: u.cache_read_input_tokens || 0,
  };
  const fail = function (message) {
    return { json: { ok: false, p_id: id, p_error: message, p_usage: usage } };
  };

  if (res.error) {
    const e = res.error;
    return fail('Claude could not be asked for the moments (' + String((e && (e.description || e.message)) || e).slice(0, 200) + ').');
  }
  if (res.stop_reason === 'refusal') return fail('Claude declined to pick moments from this video.');
  if (res.stop_reason === 'max_tokens') return fail('Claude ran out of room before the moments were finished.');
  const block = (res.content || []).find(function (b) { return b.type === 'text'; });
  let answer;
  try {
    answer = JSON.parse(block ? block.text : '');
  } catch (e) {
    return fail('Claude did not return readable moments.');
  }

  const picked = [];
  (answer.moments || []).forEach(function (m) {
    if (picked.length >= MAX_MOMENTS || !m) return;
    const first = m.first;
    const last = m.last;
    if (typeof first !== 'number' || typeof last !== 'number' || first % 1 !== 0 || last % 1 !== 0) return;
    if (first < 0 || last < first || last >= lines.length) return;
    const length = lines[last].end - lines[first].start;
    if (length < MIN_SECONDS || length > MAX_SECONDS) return;
    const overlaps = picked.some(function (p) { return first <= p.last && last >= p.first; });
    if (overlaps) return;
    const title = String(m.title || '').trim().slice(0, 80);
    if (!title) return;
    const hook = String(m.hook || '').trim().slice(0, 200);
    const warnings = RULES.filter(function (r) { return r[0].test(hook); }).map(function (r) { return 'Hook ' + r[1]; });
    picked.push({ first: first, last: last, title: title, why: String(m.why || '').trim().slice(0, 400), hook: hook, warnings: warnings });
  });

  if (picked.length === 0) return fail('Claude picked no moment that stands on its own between 8 seconds and two and a half minutes.');
  return { json: { ok: true, p_id: id, p_moments: picked, p_usage: usage } };
});
