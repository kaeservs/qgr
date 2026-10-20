// Shared by the scripts that read Higgsfield's answers, for AI video and for
// pictures (joined in front of each). Higgsfield is asked through its MCP,
// signed in with the team's own account, so every video and every picture
// spends the plan's credits.
//
// An MCP step answers in one of three ways, and each script must tell them
// apart:
//   - Higgsfield answered: { structuredContent, content: [{ type: 'text', text }] }
//   - Higgsfield refused the call: { error: { message } } (bad input, a model
//     it does not know, not enough credits). Nothing was made.
//   - n8n could not reach Higgsfield at all: the step hands on the item it was
//     given, unchanged. Nothing was sent.

/** What Higgsfield's answer carries: its structured content, else its text read as JSON, else {}. */
function answerOf(json) {
  if (!json || typeof json !== 'object') return {};
  if (json.structuredContent && typeof json.structuredContent === 'object') return json.structuredContent;
  const parts = Array.isArray(json.content) ? json.content : [];
  for (let i = 0; i < parts.length; i++) {
    const text = parts[i] && parts[i].text;
    if (text && typeof text === 'object') return text;
    if (typeof text === 'string' && /^\s*[{[]/.test(text)) {
      try {
        return JSON.parse(text);
      } catch (e) {
        // Not JSON: read as words below.
      }
    }
  }
  return {};
}

/** Higgsfield's words, for a reason shown to the team. */
function wordsOf(json) {
  const parts = json && Array.isArray(json.content) ? json.content : [];
  return parts
    .map(function (p) { return p && typeof p.text === 'string' ? p.text : ''; })
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** The error Higgsfield or the MCP step gave, as text, or ''. */
function errorOf(json) {
  if (!json || typeof json !== 'object' || !json.error) return '';
  const e = json.error;
  const message = typeof e === 'string' ? e : e.message || e.description || JSON.stringify(e);
  return String(message).replace(/\s+/g, ' ').trim().slice(0, 400);
}

/** n8n could not reach Higgsfield: the step handed on what it was given. */
function notReached(json, own) {
  if (!json || typeof json !== 'object') return true;
  if (json.structuredContent || json.content || json.error) return false;
  return Object.prototype.hasOwnProperty.call(json, own);
}

/** A refusal that means nothing was made (the request, the model, the credits, the content). */
function isRefusal(message) {
  return /input validation error|invalid request|invalid arguments|unknown model|not enough credits|insufficient|top up|balance is|out of credits|nsfw|moderation|content policy|not allowed|prohibited|rejected/i.test(message);
}

/** The first string found under any of these keys, at any depth. */
function findString(value, keys, depth) {
  if (depth > 5 || value === null || typeof value !== 'object') return '';
  const list = Array.isArray(value) ? value : [value];
  for (let i = 0; i < list.length; i++) {
    const v = list[i];
    if (!v || typeof v !== 'object') continue;
    if (!Array.isArray(v)) {
      for (let k = 0; k < keys.length; k++) {
        const found = v[keys[k]];
        if (typeof found === 'string' && found.trim()) return found.trim();
        if (typeof found === 'number') return String(found);
      }
    }
    const inner = Array.isArray(v) ? v : Object.keys(v).map(function (key) { return v[key]; });
    for (let j = 0; j < inner.length; j++) {
      const got = findString(inner[j], keys, depth + 1);
      if (got) return got;
    }
  }
  return '';
}

/**
 * Credits in an answer: { cost: { credits, credits_exact } }, { credits } or
 * { cost }. Higgsfield can quote two figures that differ (a picture at
 * "1 credit (0.5 exact)"), and which one the plan is charged is not said, so
 * the higher counts: the month's limit is never under-counted.
 */
function creditsOf(answer) {
  const cost = answer && answer.cost;
  const read = function (n) {
    const value = typeof n === 'string' ? parseFloat(n) : n;
    return typeof value === 'number' && isFinite(value) && value >= 0 ? value : null;
  };
  const figures = (cost && typeof cost === 'object' ? [cost.credits, cost.credits_exact] : [cost != null ? cost : answer && answer.credits]).map(read).filter(function (n) {
    return n !== null;
  });
  return figures.length ? Math.max.apply(null, figures) : null;
}

/** How a job stands, by Higgsfield's own words for it. */
const JOB_DONE = /^(completed|complete|succeeded|success|done|finished|ready)$/;
const JOB_FAILED = /^(failed|failure|error|errored|canceled|cancelled|nsfw|rejected|expired|ip_detected|blocked|moderated|submission_failed)$/;

/** A job's status, lower case, or ''. */
function jobStatus(answer) {
  return (findString(answer, ['status', 'state'], 0) || '').toLowerCase();
}

/** Every https link in an answer, at any depth. */
function allLinks(value, out, depth) {
  out = out || [];
  depth = depth || 0;
  if (depth > 6 || value === null || value === undefined) return out;
  if (typeof value === 'string') {
    if (/^https:\/\/\S+$/.test(value)) out.push(value);
    return out;
  }
  if (typeof value === 'object') {
    const inner = Array.isArray(value) ? value : Object.keys(value).map(function (k) { return value[k]; });
    inner.forEach(function (v) { allLinks(v, out, depth + 1); });
  }
  return out;
}

/** Why a job failed, as plainly as Higgsfield says it. */
function jobReason(status, answer, json) {
  if (status === 'ip_detected') return 'Higgsfield held it back: it may show protected material. If the team has the rights, reveal it on Higgsfield.';
  if (status === 'nsfw' || status === 'moderated' || status === 'blocked') return 'Higgsfield\'s safety check stopped it: change the prompt and ask again.';
  const said = findString(answer, ['error', 'message', 'reason', 'detail'], 0) || wordsOf(json);
  return 'Higgsfield could not make it (' + status + ')' + (said ? ': ' + said.slice(0, 200) : '.');
}
