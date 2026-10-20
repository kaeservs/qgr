// Reads Claude's verdict on a lead. Every reason for qualified or not
// qualified must quote one of the lead's answers, copied as written; a reason
// that does not is dropped, never mended. A verdict left with no reason it
// can show becomes "can't tell", for a person to look at. A can't-tell may
// say what is missing without a quote. One item per lead, matched to its
// request.
const MAX_REASONS = 4;

return $input.all().map(function (item, i) {
  const res = item.json || {};
  const lead = $('One item per lead').itemMatching(i).json;
  const id = lead.lead_id;
  const u = res.usage || {};
  const usage = {
    model: res.model || 'claude-haiku-5-5',
    input_tokens: u.input_tokens || 0,
    output_tokens: u.output_tokens || 0,
    cache_creation_input_tokens: u.cache_creation_input_tokens || 0,
    cache_read_input_tokens: u.cache_read_input_tokens || 0,
  };
  const fail = function (message) {
    return { json: { ok: false, p_lead_id: id, p_error: message, p_usage: usage } };
  };

  if (res.error) {
    const e = res.error;
    return fail('Claude could not be asked about this lead (' + String((e && (e.description || e.message)) || e).slice(0, 200) + ').');
  }
  if (res.stop_reason === 'refusal') return fail('Claude declined to judge this lead.');
  if (res.stop_reason === 'max_tokens') return fail('Claude ran out of room before its verdict was finished.');
  const block = (res.content || []).find(function (b) { return b.type === 'text'; });
  let answer;
  try {
    answer = JSON.parse(block ? block.text : '');
  } catch (e) {
    return fail('Claude did not return a readable verdict.');
  }
  let verdict = answer.verdict;
  if (['qualified', 'not_qualified', 'unclear'].indexOf(verdict) < 0) return fail('Claude did not say whether the lead is qualified.');

  const answers = lead.answers || [];
  const reasons = [];
  (answer.reasons || []).forEach(function (r) {
    if (!r || reasons.length >= MAX_REASONS) return;
    const text = String(r.text || '').replace(/\s+/g, ' ').trim().slice(0, 300);
    if (!text) return;
    const quote = String(r.quote || '').trim().replace(/^["'“‘]+|["'”’]+$/g, '').replace(/(\.\.\.|…)+$/, '').trim();
    if (!quote) {
      if (verdict === 'unclear') reasons.push({ text: text, field: null, quote: null });
      return;
    }
    // The answer it names, or failing that the one it quotes.
    const field = String(r.field || '').trim().toLowerCase();
    const found = answers.find(function (a) { return a.field.toLowerCase() === field && a.value.toLowerCase().indexOf(quote.toLowerCase()) >= 0; })
      || answers.find(function (a) { return a.value.toLowerCase().indexOf(quote.toLowerCase()) >= 0; });
    if (!found) return;
    reasons.push({ text: text, field: found.field, quote: quote.slice(0, 300) });
  });

  if (verdict !== 'unclear' && reasons.length === 0) {
    verdict = 'unclear';
    reasons.push({ text: 'Claude said ' + (answer.verdict === 'qualified' ? 'qualified' : 'not qualified') + ' but gave no reason it could quote from the lead, so a person should look.', field: null, quote: null });
  }
  if (reasons.length === 0) reasons.push({ text: 'The lead does not say enough to tell.', field: null, quote: null });
  return { json: { ok: true, p_lead_id: id, p_verdict: verdict, p_reasons: reasons, p_usage: usage } };
});
