// Builds the n8n Workflow SDK source for the eleven QGR workflows from the
// Code-node scripts in ./code (tested by code.test.ts, pipeline.test.ts,
// publisher.test.ts, moments.test.ts, leads.test.ts, ai-video.test.ts and
// pictures-higgsfield.test.ts). The output in ./workflows is what gets validated and
// saved to n8n through its MCP server. Scripts are embedded with
// JSON.stringify so their backslashes survive.
//
//   node n8n/build-workflows.mjs [--ids=tracker=ID,strategist=ID,content=ID,pipeline=ID]

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
/** One script, or several joined into one (shared helpers first), as a JSON string. */
const code = (file, swap = {}) => {
  let src = (Array.isArray(file) ? file : [file]).map((f) => readFileSync(join(here, 'code', f), 'utf8')).join('\n');
  for (const [k, v] of Object.entries(swap)) src = src.replaceAll(k, v);
  return JSON.stringify(src);
};
const idsArg = process.argv.find((a) => a.startsWith('--ids='))?.slice(6) ?? '';
const ids = Object.fromEntries(idsArg.split(',').filter(Boolean).map((p) => p.split('=')));

const SUPABASE_RPC = 'https://tcinsdexwvzpznqlcpww.supabase.co/rest/v1/rpc';
const SUPABASE_STORAGE = 'https://tcinsdexwvzpznqlcpww.supabase.co/storage/v1';
/** Apify's Facebook Ads Library Scraper, run and answered in one call. */
const APIFY_ACTOR = 'https://api.apify.com/v2/acts/apify~facebook-ads-scraper';
const APIFY_LINKEDIN_ACTOR = 'https://api.apify.com/v2/acts/silva95gustavo~linkedin-ad-library-scraper';
const IMPORTS = "import { workflow, node, trigger, sticky, newCredential, ifElse, switchCase, expr } from '@n8n/workflow-sdk';";

// ---------------------------------------------------------------- shared pieces

// A function that answers with a bare value (an id, true or false) is read as
// text: n8n's HTTP step refuses a JSON reply that is not an object or a list,
// even after Supabase has done the work (the first live run, 2026-10-10).
const rpcNode = (varName, name, fn, body, output, extra = '', bare = false) => `
const ${varName} = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: {
    name: ${JSON.stringify(name)},${extra}
    parameters: {
      method: 'POST',
      url: '${SUPABASE_RPC}/${fn}',
      authentication: 'predefinedCredentialType',
      nodeCredentialType: 'supabaseApi',
      sendBody: true,
      contentType: 'json',
      specifyBody: 'json',
      jsonBody: expr(${JSON.stringify(body)}),
      options: ${bare ? "{ timeout: 30000, response: { response: { responseFormat: 'text', outputPropertyName: 'data' } } }" : '{ timeout: 30000 }'},
    },
    credentials: { supabaseApi: newCredential('Supabase QGR') },
  },
  output: [${output}],
});`;

const codeNode = (varName, name, src, output, extra = '') => `
const ${varName} = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: ${JSON.stringify(name)},${extra}
    parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: ${src} },
  },
  output: [${output}],
});`;

const claudeNode = (varName, name) => `
const ${varName} = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: {
    name: ${JSON.stringify(name)},
    onError: 'continueErrorOutput',
    parameters: {
      method: 'POST',
      url: 'https://api.anthropic.com/v1/messages',
      authentication: 'predefinedCredentialType',
      nodeCredentialType: 'anthropicApi',
      sendHeaders: true,
      headerParameters: {
        parameters: [
          { name: 'anthropic-version', value: '2023-06-01' },
          { name: 'anthropic-beta', value: 'server-side-fallback-2026-07-01' },
        ],
      },
      sendBody: true,
      contentType: 'json',
      specifyBody: 'json',
      jsonBody: expr('{{ JSON.stringify($json.body) }}'),
      options: { timeout: 600000 },
    },
    credentials: { anthropicApi: newCredential('Anthropic') },
  },
  output: [{ model: 'claude-haiku-5-5', stop_reason: 'end_turn', content: [{ type: 'text', text: '{}' }], usage: { input_tokens: 5000, output_tokens: 1500 } }],
});`;

const isOk = (varName, name) => `
const ${varName} = ifElse({
  version: 2.3,
  config: {
    name: ${JSON.stringify(name)},
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 },
        conditions: [{ leftValue: expr('{{ $json.ok }}'), rightValue: true, operator: { type: 'boolean', operation: 'true', singleValue: true } }],
        combinator: 'and',
      },
    },
  },
});`;

/** A boolean a database function returned: PostgREST answers a bare true, which n8n puts in data. */
const isTrue = (varName, name) => `
const ${varName} = ifElse({
  version: 2.3,
  config: {
    name: ${JSON.stringify(name)},
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 2 },
        conditions: [{ leftValue: expr('{{ String($json.data ?? $json.pipeline_next).trim() === "true" }}'), rightValue: true, operator: { type: 'boolean', operation: 'true', singleValue: true } }],
        combinator: 'and',
      },
    },
  },
});`;

/** An IF on any expression that comes out true or false. */
const ifTrue = (varName, name, expression) => `
const ${varName} = ifElse({
  version: 2.3,
  config: {
    name: ${JSON.stringify(name)},
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 2 },
        conditions: [{ leftValue: expr(${JSON.stringify(expression)}), rightValue: true, operator: { type: 'boolean', operation: 'true', singleValue: true } }],
        combinator: 'and',
      },
    },
  },
});`;

const setNode = (varName, name, assignments, output) => `
const ${varName} = node({
  type: 'n8n-nodes-base.set',
  version: 3.4,
  config: {
    name: ${JSON.stringify(name)},
    parameters: {
      mode: 'manual',
      includeOtherFields: false,
      assignments: {
        assignments: [
${assignments.map(([id, field, value, type]) => `          { id: '${id}', name: '${field}', value: ${value}, type: '${type}' },`).join('\n')}
        ],
      },
    },
  },
  output: [${output}],
});`;

/** The tail every agent shares: why it failed, record it, return { ok: false }. */
const failTail = (stage) => `
${codeNode('whyFailed', 'Why it failed', code('shared-fail-reason.js', { __STAGE__: stage }), `{ p_run_id: 'run-id', p_stage: '${stage}', p_error: 'Claude declined', p_usage: null }`)}
${rpcNode('markFailed', 'Record the failure', 'agent_fail', '{{ JSON.stringify({ p_run_id: $json.p_run_id, p_stage: $json.p_stage, p_error: $json.p_error, p_usage: $json.p_usage }) }}', '{}', "\n    onError: 'continueRegularOutput',")}
${setNode('failed', 'Failed', [
  ['ok', 'ok', 'false', 'boolean'],
  ['error', 'error', `expr('{{ $("Why it failed").first().json.p_error }}')`, 'string'],
], `{ ok: false, error: 'Claude declined' }`)}
${setNode('couldNotStart', 'Could not start', [
  ['ok', 'ok', 'false', 'boolean'],
  ['error', 'error', `expr('{{ "Could not start: " + ($json.error?.description ?? $json.error?.message ?? $json.error ?? "unknown error") }}')`, 'string'],
], `{ ok: false, error: 'Could not start: the stage is already running' }`)}
${setNode('done', 'Done', [
  ['ok', 'ok', 'true', 'boolean'],
  ['run', 'runId', `expr('{{ $("Begin: load the run").first().json.run.id }}')`, 'string'],
], `{ ok: true, runId: 'run-id' }`)}`;

const subTrigger = `
const start = trigger({
  type: 'n8n-nodes-base.executeWorkflowTrigger',
  version: 1.2,
  config: {
    name: 'When the pipeline calls',
    parameters: { inputSource: 'workflowInputs', workflowInputs: { values: [{ name: 'runId', type: 'string' }] } },
  },
  output: [{ runId: '00000000-0000-0000-0000-000000000000' }],
});`;

const beginNode = (stage) =>
  rpcNode(
    'begin',
    'Begin: load the run',
    'agent_begin',
    `{{ JSON.stringify({ p_run_id: $json.runId, p_stage: "${stage}" }) }}`,
    `{ stage: '${stage}', run: { id: 'run-id', kind: 'competitor', input: 'website', url: 'https://example.com/', title: 'example.com', platforms: ['meta', 'linkedin', 'x'], goal: 'consultations', excerpt: null, competitor_name: null, files: null, page: { ok: true, url: 'https://example.com/', title: 'Example', text: 'Example', words: 1 }, media_path: null, media: null }, brand: { company: 'Quantum Global Residency', guardrails: [], voice: [] }, report: null, strategy: null }`,
    "\n    onError: 'continueErrorOutput',",
  );

const sampleRun = `{ id: 'run-id', kind: 'competitor', input: 'website', url: 'https://example.com/', title: 'example.com', platforms: ['meta', 'linkedin', 'x'], goal: 'consultations' }`;

// ---------------------------------------------------------------- tracker

const tracker = `${IMPORTS}
${subTrigger}
${beginNode('tracker')}
${codeNode('plan', 'Plan the scan', code('tracker-plan.js'), `{ runId: 'run-id', input: 'website', url: 'https://example.com/', domain: 'example.com', competitorHint: 'example', websiteText: 'Example', files: [], platforms: ['meta'], adsSource: 'sample', library: null, guidance: null, brand: null }`, "\n    onError: 'continueErrorOutput',")}
${ifTrue('fromShots', 'Screenshots?', '{{ $json.screenshots.length > 0 }}')}

// The team's screenshots, signed for a quarter of an hour so Claude can fetch
// them from the private bucket.
const signShots = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: {
    name: 'Sign the screenshots',
    onError: 'continueRegularOutput',
    parameters: {
      method: 'POST',
      url: '${SUPABASE_STORAGE}/object/sign/competitor-shots',
      authentication: 'predefinedCredentialType',
      nodeCredentialType: 'supabaseApi',
      sendBody: true,
      contentType: 'json',
      specifyBody: 'json',
      jsonBody: expr('{{ JSON.stringify({ expiresIn: 900, paths: $json.screenshots }) }}'),
      options: { timeout: 30000, response: { response: { fullResponse: true, neverError: true } } },
    },
    credentials: { supabaseApi: newCredential('Supabase QGR') },
  },
  output: [{ statusCode: 200, body: [{ path: 'shots/user/file.png', signedURL: '/object/sign/competitor-shots/shots/user/file.png?token=token', error: null }] }],
});
${codeNode('shotAds', 'Screenshot ads', code('tracker-screenshot-ads.js', { __STORAGE__: SUPABASE_STORAGE }), `{ runId: 'run-id', dataSource: 'upload', ads: [], shots: [{ n: 1, path: 'shots/user/file.png', url: '${SUPABASE_STORAGE}/object/sign/competitor-shots/shots/user/file.png?token=token' }] }`, "\n    onError: 'continueErrorOutput',")}
${ifTrue('realAds', 'Real ads?', '{{ $json.adsSource === "apify" }}')}
${ifTrue('linkedinToo', 'LinkedIn too?', '{{ !!$json.linkedin }}')}
${ifTrue('metaToo', 'Meta too?', '{{ !!$("Plan the scan").first().json.library }}')}

const linkedinApify = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: {
    name: 'Apify: their LinkedIn ads',
    onError: 'continueRegularOutput',
    alwaysOutputData: true,
    parameters: {
      method: 'POST',
      url: '${APIFY_LINKEDIN_ACTOR}/run-sync-get-dataset-items',
      authentication: 'genericCredentialType',
      genericAuthType: 'httpCustomAuth',
      sendQuery: true,
      queryParameters: { parameters: [{ name: 'timeout', value: '240' }, { name: 'maxItems', value: '20' }] },
      sendBody: true,
      contentType: 'json',
      specifyBody: 'json',
      jsonBody: expr('{{ JSON.stringify({ startUrls: [{ url: $json.linkedin.url }], resultsLimit: 20, skipDetails: false }) }}'),
      options: { timeout: 300000 },
    },
    credentials: { httpCustomAuth: newCredential('Apify token') },
  },
  output: [{ adId: '1595563514', adLibraryUrl: 'https://www.linkedin.com/ad-library/detail/1595563514', advertiserName: 'Example Visa Partners', body: 'Hook', ctas: ['Learn more'], format: 'SINGLE_IMAGE', availability: { start: '2026-10-01', end: '2026-10-22' }, impressions: '10k-20k' }],
});

const apify = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: {
    name: 'Apify: their Meta ads',
    onError: 'continueErrorOutput',
    alwaysOutputData: true,
    executeOnce: true,
    parameters: {
      method: 'POST',
      url: '${APIFY_ACTOR}/run-sync-get-dataset-items',
      authentication: 'genericCredentialType',
      genericAuthType: 'httpCustomAuth',
      sendQuery: true,
      queryParameters: { parameters: [{ name: 'timeout', value: '240' }, { name: 'maxItems', value: '60' }] },
      sendBody: true,
      contentType: 'json',
      specifyBody: 'json',
      jsonBody: expr('{{ JSON.stringify({ startUrls: [{ url: $("Plan the scan").first().json.library.url }], resultsLimit: 60, activeStatus: "active" }) }}'),
      options: { timeout: 300000 },
    },
    credentials: { httpCustomAuth: newCredential('Apify token') },
  },
  output: [{ adArchiveID: '1234567890', pageName: 'Example Visa Partners', isActive: true, startDate: 1754000000, snapshot: { body: { text: 'Hook' }, ctaText: 'Book now', displayFormat: 'VIDEO' } }],
});
${codeNode('apifyAds', "Read Apify's ads", code('tracker-apify-ads.js'), `{ runId: 'run-id', dataSource: 'apify', ads: [] }`, "\n    onError: 'continueErrorOutput',")}
${codeNode('sampleAds', 'Sample ads', code('tracker-placeholder-ads.js'), `{ runId: 'run-id', dataSource: 'placeholder', ads: [] }`)}
${codeNode('prepareAds', 'Prepare the ads', code('tracker-prepare-ads.js'), `{ runId: 'run-id', dataSource: 'placeholder', ads: [{ id: 'a1', platform: 'meta', format: 'video', days_running: 63, text: 'Hook', hook_line: 'Hook' }] }`, "\n    onError: 'continueErrorOutput',")}
${codeNode('buildRequest', 'Build the Claude request', code('tracker-build-request.js'), `{ body: { model: 'claude-haiku-5-5', max_tokens: 16000 } }`, "\n    onError: 'continueErrorOutput',")}
${claudeNode('claude', 'Claude: read the ads')}
${codeNode('readAnswer', "Read Claude's answer", code('tracker-read-answer.js'), `{ ok: true, p_run_id: 'run-id', p_report: { hooks: [] }, p_usage: { model: 'claude-haiku-5-5' } }`, "\n    onError: 'continueErrorOutput',")}
${isOk('answerOk', 'Report ready?')}
${rpcNode('save', 'Save the report', 'agent_finish_tracker', '{{ JSON.stringify({ p_run_id: $json.p_run_id, p_report: $json.p_report, p_usage: $json.p_usage }) }}', `{ data: 'report-id' }`, "\n    onError: 'continueErrorOutput',", true)}
${failTail('tracker')}

const noteWebsite = sticky('## Their website\\nThe app read it when the run started (it checks the link is a public site, on every redirect) and stored it with the run. **Plan the scan** takes the page\\'s words from there: n8n never fetches a link someone pasted.', [plan], { color: 4 });
const noteApify = sticky('## Their ads: sample, or Apify\\n**Real ads?** follows the team\\'s choice in Settings, Agents. **Sample ads** are the same examples for every competitor, and the report says so.\\n\\nWith Apify on, Apify\\'s Facebook Ads Library Scraper reads the page of Meta\\'s Ad Library the plan names: the link pasted, or a search for the competitor\\'s name. **Read Apify\\'s ads** keeps their own ads and reads each field whichever way the actor names it.\\n\\nLinkedIn: a pasted LinkedIn Ad Library link, or a search by name (last 30 days), read by the LinkedIn Ads Scraper with its details: run dates and the impressions range LinkedIn publishes. Its step never fails the scan: the report goes on with Meta\\'s ads and says LinkedIn could not be read. It needs the **Apify token** credential (Custom Auth, JSON {"headers": {"Authorization": "Bearer <token>"}}, allowed domain api.apify.com); without it a scan stops and says why.', [realAds, linkedinToo, linkedinApify, metaToo, apify, apifyAds, sampleAds], { color: 3 });
const noteNumbers = sticky('## Numbers come from the data\\nClaude groups ads into hooks by id and names each ad\\'s angle. Days running, versions and angle counts are computed in code from the ads, never taken from the model.', [prepareAds, readAnswer], { color: 5 });
const noteShots = sticky('## Screenshots of their ads\\nA run the team started from screenshots (a feed, Meta\\'s Ad Library, LinkedIn) skips the ad sources: Storage signs the pictures for 15 minutes and Claude reads each ad out of them first. A screenshot rarely shows how long an ad has run, so days running are counted only from a start date the screenshot shows.', [fromShots, signShots, shotAds], { color: 4 });
const noteModel = sticky('## Claude\\nHaiku 5.5 while the app is being built (about a cent a run), medium effort, JSON constrained by a schema. A refusal stands: Haiku has no fallback model. No temperature. Usage is saved with every result.', [buildRequest, claude], { color: 6 });

export default workflow('qgr-competitor-tracker', 'QGR · Competitor Tracker')
  .add(start)
  .to(begin.onError(couldNotStart))
  .to(plan.onError(whyFailed))
  .to(fromShots.onTrue(signShots).onFalse(realAds.onTrue(linkedinToo.onTrue(linkedinApify).onFalse(metaToo)).onFalse(sampleAds)))
  .add(linkedinApify)
  .to(metaToo.onTrue(apify.onError(whyFailed)).onFalse(apifyAds))
  .add(apify)
  .to(apifyAds.onError(whyFailed))
  .to(prepareAds.onError(whyFailed))
  .to(buildRequest.onError(whyFailed))
  .to(claude.onError(whyFailed))
  .to(readAnswer.onError(whyFailed))
  .to(answerOk.onTrue(save.onError(whyFailed).to(done)).onFalse(whyFailed))
  .add(sampleAds)
  .to(prepareAds)
  .add(signShots)
  .to(shotAds.onError(whyFailed))
  .to(prepareAds)
  .add(whyFailed)
  .to(markFailed)
  .to(failed)
  .add(noteWebsite)
  .add(noteApify)
  .add(noteNumbers)
  .add(noteShots)
  .add(noteModel);
`;

// ---------------------------------------------------------------- strategist

const strategist = `${IMPORTS}
${subTrigger}
${beginNode('strategist')}
${codeNode('plan', 'Gather the material', code('strategist-plan.js'), `{ runId: 'run-id', run: ${sampleRun}, brand: { guardrails: [] }, report: null, page: null, clip: null, sourceText: '', sourceLabel: 'Podcast · Ep. 1' }`, "\n    onError: 'continueErrorOutput',")}
${codeNode('buildRequest', 'Build the Claude request', code('strategist-build-request.js'), `{ body: { model: 'claude-haiku-5-5', max_tokens: 16000 } }`, "\n    onError: 'continueErrorOutput',")}
${claudeNode('claude', 'Claude: write the strategy')}
${codeNode('readAnswer', "Read Claude's answer", code('strategist-read-answer.js'), `{ ok: true, p_run_id: 'run-id', p_strategy: { angles: [] }, p_usage: { model: 'claude-haiku-5-5' } }`, "\n    onError: 'continueErrorOutput',")}
${isOk('answerOk', 'Strategy ready?')}
${rpcNode('save', 'Save the strategy', 'agent_finish_strategist', '{{ JSON.stringify({ p_run_id: $json.p_run_id, p_strategy: $json.p_strategy, p_usage: $json.p_usage }) }}', `{ data: 'strategy-id' }`, "\n    onError: 'continueErrorOutput',", true)}
${failTail('strategist')}

const noteSource = sticky('## Custom runs\\nA blog post, podcast or video link was read by the app when the run started and stored with the run. A podcast or video page has **no transcript**: the strategist is told so. An uploaded clip comes with the words said in it: its transcript, read over by the team, or what they typed. Pasted text is used as it is.\\n\\n## What worked\\nThe material carries how the team\\'s own recent posts did (**QGR · Post results**), ranked by engagement per person reached, worked out in code. Without any, the request is exactly as before.', [plan], { color: 3 });
const noteModel = sticky('## Claude\\nHaiku 5.5 while the app is being built, high effort: the strategy is the judgement the rest of the run depends on. Budget shares are made to add up to 100 in code, and the brand guardrails always lead.', [buildRequest, claude, readAnswer], { color: 6 });

export default workflow('qgr-ad-strategist', 'QGR · Ad Strategist')
  .add(start)
  .to(begin.onError(couldNotStart))
  .to(plan.onError(whyFailed))
  .to(buildRequest.onError(whyFailed))
  .to(claude.onError(whyFailed))
  .to(readAnswer.onError(whyFailed))
  .to(answerOk.onTrue(save.onError(whyFailed).to(done)).onFalse(whyFailed))
  .add(whyFailed)
  .to(markFailed)
  .to(failed)
  .add(noteSource)
  .add(noteModel);
`;

// ---------------------------------------------------------------- content

const content = `${IMPORTS}
${subTrigger}
${beginNode('content')}
${codeNode('buildRequest', 'Build the Claude request', code('content-build-request.js'), `{ body: { model: 'claude-haiku-5-5', max_tokens: 16000 } }`, "\n    onError: 'continueErrorOutput',")}
${claudeNode('claude', 'Claude: write the ads')}
${codeNode('readAnswer', "Read Claude's answer", code('content-read-answer.js'), `{ ok: true, p_run_id: 'run-id', p_ad_set: { title: 'Q4', variants: [] }, p_usage: { model: 'claude-haiku-5-5' } }`, "\n    onError: 'continueErrorOutput',")}
${isOk('answerOk', 'Ads ready?')}
${rpcNode('save', 'Save the ads', 'agent_finish_content', '{{ JSON.stringify({ p_run_id: $json.p_run_id, p_ad_set: $json.p_ad_set, p_usage: $json.p_usage }) }}', `{ data: 'ad-set-id' }`, "\n    onError: 'continueErrorOutput',", true)}
${failTail('content')}

const notePictures = sticky('## Pictures\\nEvery ad but a clip\\'s carries an **image_prompt**. Pictures are made from it by **QGR · Pictures**, not here: when someone asks in the studio, or for every ad saved here once the team turns that on (Settings, Agents). Without one the dashboard draws the branded design.', [save], { color: 3 });
const noteGuardrails = sticky('## Guardrails\\nThe prompt carries the brand rules. This step also flags, never silently fixes, any "guarantee", "risk-free", promised timeline or X post over 280 characters, so a person sees it before approving.', [readAnswer], { color: 5 });

export default workflow('qgr-content-agent', 'QGR · Content Agent')
  .add(start)
  .to(begin.onError(couldNotStart))
  .to(buildRequest.onError(whyFailed))
  .to(claude.onError(whyFailed))
  .to(readAnswer.onError(whyFailed))
  .to(answerOk.onTrue(save.onError(whyFailed).to(done)).onFalse(whyFailed))
  .add(whyFailed)
  .to(markFailed)
  .to(failed)
  .add(notePictures)
  .add(noteGuardrails);
`;

// ---------------------------------------------------------------- the pipeline

const runAgent = (varName, name, id, label) => `
const ${varName} = node({
  type: 'n8n-nodes-base.executeWorkflow',
  version: 1.3,
  config: {
    name: ${JSON.stringify(name)},
    parameters: {
      mode: 'once',
      source: 'database',
      workflowId: { __rl: true, mode: 'id', value: ${JSON.stringify(id ?? `${label.toUpperCase()}_WORKFLOW_ID`)}, cachedResultName: ${JSON.stringify(`QGR · ${label}`)} },
      workflowInputs: {
        mappingMode: 'defineBelow',
        value: { runId: expr('{{ $("Read the request").first().json.runId }}') },
        matchingColumns: [],
        schema: [{ id: 'runId', displayName: 'runId', required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type: 'string' }],
        attemptToConvertTypes: false,
        convertFieldsToString: true,
      },
      options: { waitForSubWorkflow: true },
    },
  },
  output: [{ ok: true, runId: 'run-id' }],
});`;

const pipeline = `${IMPORTS}

const webhook = trigger({
  type: 'n8n-nodes-base.webhook',
  version: 2.1,
  config: {
    name: 'Run requested',
    parameters: {
      httpMethod: 'POST',
      path: 'qgr-run',
      authentication: 'headerAuth',
      responseMode: 'onReceived',
      options: { responseCode: { values: { responseCode: 'customCode', customCode: 202 } } },
    },
    credentials: { httpHeaderAuth: newCredential('QGR webhook secret') },
  },
  output: [{ body: { runId: '00000000-0000-0000-0000-000000000000', startAt: 'tracker' } }],
});
${setNode('readRequest', 'Read the request', [
  ['run', 'runId', `expr('{{ $json.body?.runId ?? $json.runId }}')`, 'string'],
  ['start', 'startAt', `expr('{{ $json.body?.startAt ?? $json.startAt ?? "tracker" }}')`, 'string'],
], `{ runId: 'run-id', startAt: 'tracker' }`)}

const whereToStart = switchCase({
  version: 3.4,
  config: {
    name: 'Where does the run start?',
    parameters: {
      mode: 'rules',
      rules: {
        values: [
          { outputKey: 'tracker', conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 }, conditions: [{ leftValue: expr('{{ $json.startAt }}'), rightValue: 'tracker', operator: { type: 'string', operation: 'equals' } }], combinator: 'and' } },
          { outputKey: 'strategist', conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 }, conditions: [{ leftValue: expr('{{ $json.startAt }}'), rightValue: 'strategist', operator: { type: 'string', operation: 'equals' } }], combinator: 'and' } },
          { outputKey: 'content', conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 }, conditions: [{ leftValue: expr('{{ $json.startAt }}'), rightValue: 'content', operator: { type: 'string', operation: 'equals' } }], combinator: 'and' } },
        ],
      },
      options: {},
    },
  },
});
${runAgent('runTracker', 'Competitor Tracker', ids.tracker, 'Competitor Tracker')}
${runAgent('runStrategist', 'Ad Strategist', ids.strategist, 'Ad Strategist')}
${runAgent('runContent', 'Content Agent', ids.content, 'Content Agent')}
${isOk('trackerOk', 'Tracker finished?')}
${isOk('strategistOk', 'Strategy finished?')}
${rpcNode('askStrategist', 'Start the strategist now?', 'pipeline_next', '{{ JSON.stringify({ p_run_id: $("Read the request").first().json.runId, p_stage: "strategist" }) }}', "{ data: 'true' }", '', true)}
${rpcNode('askContent', 'Write the ads now?', 'pipeline_next', '{{ JSON.stringify({ p_run_id: $("Read the request").first().json.runId, p_stage: "content" }) }}', "{ data: 'true' }", '', true)}
${isTrue('strategistOn', 'Strategist switched on?')}
${isTrue('contentOn', 'Content Agent switched on?')}

const fromScan = trigger({
  type: 'n8n-nodes-base.executeWorkflowTrigger',
  version: 1.2,
  config: {
    name: 'When a scheduled scan starts a run',
    parameters: { inputSource: 'workflowInputs', workflowInputs: { values: [{ name: 'runId', type: 'string' }, { name: 'startAt', type: 'string' }] } },
  },
  output: [{ runId: '00000000-0000-0000-0000-000000000000', startAt: 'tracker' }],
});

const noteFlow = sticky('## The run\\nThe app posts { runId, startAt } with the shared secret header and gets 202 at once; a scheduled scan hands its run in from **QGR · Scheduled scans**. A competitor run starts at the tracker; a custom run (podcast, blog, video, text) starts at the strategist; a go-ahead from the dashboard starts where the run waits. Each agent records its own success or failure on the run, so this workflow only decides what runs next.', [webhook, fromScan, readRequest, whereToStart], { color: 4 });
const noteSwitches = sticky('## The switches\\nBefore the strategist after a scan, and before the Content Agent after a strategy, the database is asked (**pipeline_next**). With that agent\\'s switch off on the dashboard, the run waits there for a person, and their go-ahead starts the pipeline again from that agent.', [askStrategist, askContent], { color: 5 });

export default workflow('qgr-run-pipeline', 'QGR · Run pipeline')
  .add(webhook)
  .to(readRequest)
  .to(whereToStart
    .onCase(0, runTracker.to(trackerOk.onTrue(askStrategist.to(strategistOn.onTrue(runStrategist)))))
    .onCase(1, runStrategist)
    .onCase(2, runContent))
  .add(fromScan)
  .to(readRequest)
  .add(runStrategist)
  .to(strategistOk.onTrue(askContent.to(contentOn.onTrue(runContent))))
  .add(noteFlow)
  .add(noteSwitches);
`;

// ---------------------------------------------------------------- the publisher

const placeNode = (varName, place, label) =>
  codeNode(varName, `${label} (stand-in)`, code('publisher-stand-in.js', { __PLACE_NAME__: label }), `{ ok: true, post_id: 'post-id', place: '${place}', remote_id: null, remote_url: null, stand_in: true }`);

const GRAPH = 'https://graph.facebook.com/v25.0';
const LINKEDIN_REST = 'https://api.linkedin.com/rest';
/** LinkedIn's reasons in plain words, put before each LinkedIn step's script. */
const LINKEDIN = 'shared-linkedin-refusal.js';
const LINKEDIN_HEADERS = [
  ['LinkedIn-Version', `expr('{{ $("Plan the LinkedIn post").item.json.version }}')`],
  ['X-Restli-Protocol-Version', "'2.0.0'"],
];

/**
 * A request to a platform, or to Storage for a file, whose whole answer
 * (status, headers, body) the next script reads. It never stops the run: a
 * refusal is an answer like any other, and a step that cannot start (its
 * credential not attached yet) hands its input on, which the next script reads
 * as "not asked". The platforms' credentials are attached by hand in n8n once
 * they exist: a node naming one that does not exist fails every run, the
 * stand-ins' too. A file is read without `neverError`, so an error page is
 * never sent on as the file.
 */
const callNode = (varName, name, o) => `
const ${varName} = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: {
    name: ${JSON.stringify(name)},
    onError: 'continueRegularOutput',
    parameters: {
      method: '${o.method}',
      url: ${o.url},${o.auth ? `
      authentication: 'predefinedCredentialType',
      nodeCredentialType: '${o.auth}',` : ''}${o.headers ? `
      sendHeaders: true,
      headerParameters: { parameters: [${o.headers.map(([k, v]) => `{ name: '${k}', value: ${v} }`).join(', ')}] },` : ''}${o.json ? `
      sendBody: true,
      contentType: 'json',
      specifyBody: 'json',
      jsonBody: expr(${JSON.stringify(o.json)}),` : ''}${o.binary ? `
      sendBody: true,
      contentType: 'binaryData',
      inputDataFieldName: 'data',` : ''}
      options: { timeout: ${o.timeout ?? 60000}, response: { response: ${o.file ? "{ responseFormat: 'file', outputPropertyName: 'data' }" : o.text ? "{ fullResponse: true, neverError: true, responseFormat: 'text', outputPropertyName: 'data' }" : '{ fullResponse: true, neverError: true }'} } },
    },${o.credentials ? `
    credentials: ${o.credentials},` : ''}
  },
  output: [${o.output}],
});`;

/** Higgsfield's own MCP, signed in with the team's Higgsfield account (the "Higgsfield" credential). */
const HIGGSFIELD_MCP = 'https://mcp.higgsfield.ai/mcp';
/** A script with the helpers it uses in front: reading Higgsfield's answers, writing its params, or both. */
const videoCode = (file, helpers = ['video-mcp.js']) => code([...helpers, file]);

/**
 * One call to a Higgsfield tool. It never stops the run: Higgsfield's refusal
 * comes on as { error }, and when n8n cannot reach Higgsfield at all the step
 * hands on the item it was given, which the next script reads as "not reached".
 */
const higgsfieldNode = (varName, name, tool, input, output, extra = '') => `
const ${varName} = node({
  type: '@n8n/n8n-nodes-langchain.mcpClient',
  version: 1.1,
  config: {
    name: ${JSON.stringify(name)},
    onError: 'continueRegularOutput',${extra}
    parameters: {
      serverTransport: 'httpStreamable',
      endpointUrl: '${HIGGSFIELD_MCP}',
      authentication: 'mcpOAuth2Api',
      tool: { __rl: true, mode: 'id', value: '${tool}' },
      inputMode: 'json',
      jsonInput: expr(${JSON.stringify(input)}),
      options: { convertToBinary: false, timeout: 120000 },
    },
    credentials: { mcpOAuth2Api: newCredential('Higgsfield') },
  },
  output: [${output}],
});`;

/**
 * Higgsfield offered one of its presets in place of the prompt: declined, and
 * the same request asked once more as written (video-as-written.js). Three
 * steps after a Higgsfield call: the script, a branch on what it found, and
 * the call again. Both ways lead to the same reader.
 */
const asWrittenNodes = (prefix, { decline, branch, call }, tool, source, key, output) => `
${codeNode(prefix + 'Decline', decline, code(['video-mcp.js', 'video-as-written.js'], { "$('Write the request')": `$('${source}')`, "const KEY = 'generate_input';": `const KEY = '${key}';` }), `{ as_written: true, ${key}: '{"params":{"declined_preset_id":"preset-id"}}' }`)}
${ifTrue(prefix + 'AsWritten', branch, '{{ $json.as_written === true }}')}
${higgsfieldNode(prefix + 'Again', call, tool, `{{ $json.${key} }}`, output)}`;

/** A switch on expressions that come out true or false, one output each, in order. */
const routeNode = (varName, name, routes) => `
const ${varName} = switchCase({
  version: 3.4,
  config: {
    name: ${JSON.stringify(name)},
    parameters: {
      mode: 'rules',
      rules: {
        values: [
${routes.map(([key, expression]) => `          { outputKey: '${key}', conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 2 }, conditions: [{ leftValue: expr(${JSON.stringify(expression)}), rightValue: true, operator: { type: 'boolean', operation: 'true', singleValue: true } }], combinator: 'and' } },`).join('\n')}
        ],
      },
      options: {},
    },
  },
});`;

/** Which place a post goes to: Facebook, Instagram or LinkedIn, in that order. */
const placeSwitch = (varName, name) => `
const ${varName} = switchCase({
  version: 3.4,
  config: {
    name: ${JSON.stringify(name)},
    parameters: {
      mode: 'rules',
      rules: {
        values: [
${['facebook', 'instagram', 'linkedin'].map((place) => `          { outputKey: '${place}', conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 }, conditions: [{ leftValue: expr('{{ $json.place }}'), rightValue: '${place}', operator: { type: 'string', operation: 'equals' } }], combinator: 'and' } },`).join('\n')}
        ],
      },
      options: {},
    },
  },
});`;

/**
 * A pause before asking whether a platform has prepared a file. Every item
 * waits as long as the longest asks (n8n waits once for them all), never less
 * than ten seconds. Under 65 seconds n8n keeps the run in memory.
 */
const waitNode = (varName, name) => `
const ${varName} = node({
  type: 'n8n-nodes-base.wait',
  version: 1.1,
  config: {
    name: ${JSON.stringify(name)},
    parameters: {
      resume: 'timeInterval',
      amount: expr('{{ $input.all().reduce((most, item) => Math.max(most, Number(item.json.wait) || 0), 10) }}'),
      unit: 'seconds',
    },
  },
  output: [{}],
});`;

const publishOrWait = [
  ['publish', '{{ $json.ok === true }}'],
  ['wait', '{{ $json.again === true }}'],
  ['stop', '{{ $json.ok !== true && $json.again !== true }}'],
];

const publisher = `${IMPORTS}

const everyMinute = trigger({
  type: 'n8n-nodes-base.scheduleTrigger',
  version: 1.4,
  config: {
    name: 'Every minute',
    parameters: { rule: { interval: [{ field: 'minutes', minutesInterval: 1 }] } },
  },
  output: [{}],
});

const postNow = trigger({
  type: 'n8n-nodes-base.webhook',
  version: 2.1,
  config: {
    name: 'Post now',
    parameters: {
      httpMethod: 'POST',
      path: 'qgr-publish',
      authentication: 'headerAuth',
      responseMode: 'onReceived',
      options: { responseCode: { values: { responseCode: 'customCode', customCode: 202 } } },
    },
    credentials: { httpHeaderAuth: newCredential('QGR webhook secret') },
  },
  output: [{ body: {} }],
});
${rpcNode('takeDue', 'Take the posts that are due', 'publisher_take_due', '{{ JSON.stringify({ p_limit: 10 }) }}', `{ post_id: 'post-id', place: 'facebook', text: 'Plan your EB-5 path.', media_path: 'posts/user/file.jpg', media_kind: 'image', page: { id: '1234567890', name: 'Quantum Global' }, live: false }`, "\n    executeOnce: true,")}
${codeNode('eachPlace', 'One item per place', code('shared-items.js'), `{ post_id: 'post-id', place: 'facebook', text: 'Plan your EB-5 path.', media_path: 'posts/user/file.jpg', media_kind: 'image', page: { id: '1234567890', name: 'Quantum Global' }, live: false }`)}
${ifTrue('forReal', 'Post for real?', '{{ $json.live === true }}')}
${placeSwitch('wherePost', 'Which place?')}
${placeNode('facebook', 'facebook', 'Facebook')}
${placeNode('instagram', 'instagram', 'Instagram')}
${placeNode('linkedin', 'linkedin', 'LinkedIn')}

// ---- for real: the file signed for an hour, so the platform (or n8n, for
// LinkedIn) can fetch it from the private bucket without a key.
${callNode('sign', 'Sign the file', {
  method: 'POST',
  url: `expr('${SUPABASE_STORAGE}/object/sign/post-media/{{ $json.media_path }}')`,
  auth: 'supabaseApi',
  json: '{{ JSON.stringify({ expiresIn: 3600 }) }}',
  timeout: 30000,
  credentials: "{ supabaseApi: newCredential('Supabase QGR') }",
  output: "{ statusCode: 200, body: { signedURL: '/object/sign/post-media/posts/user/file.jpg?token=token' } }",
})}
${codeNode('withLink', 'With its link', code('publisher-ready.js', { __STORAGE__: SUPABASE_STORAGE }), `{ ok: true, post_id: 'post-id', place: 'facebook', text: 'Plan your EB-5 path.', media_kind: 'image', media_url: '${SUPABASE_STORAGE}/object/sign/post-media/posts/user/file.jpg?token=token', page: { id: '1234567890', name: 'Quantum Global' } }`)}
${isOk('readyToSend', 'Ready to send?')}
${placeSwitch('whereReal', 'Which place, for real?')}

// ---- Facebook: one request, with the Page's access token.
${codeNode('planFacebook', 'Plan the Facebook post', code('publisher-facebook-plan.js'), `{ post_id: 'post-id', place: 'facebook', page_id: '1234567890', kind: 'image', url: '${GRAPH}/1234567890/photos', body: { url: 'https://example.com/file.jpg', message: 'Plan your EB-5 path.', published: true } }`)}
${callNode('facebookPost', 'Facebook: post', {
  method: 'POST',
  url: "expr('{{ $json.url }}')",
  auth: 'facebookGraphApi',
  json: '{{ JSON.stringify($json.body) }}',
  timeout: 300000,
  output: "{ statusCode: 200, body: { id: '555', post_id: '1234567890_555' } }",
})}
${codeNode('facebookAnswer', "Read Facebook's answer", code('publisher-facebook-answer.js'), `{ ok: true, post_id: 'post-id', place: 'facebook', remote_id: '1234567890_555', remote_url: 'https://www.facebook.com/1234567890_555', stand_in: false }`)}

// ---- Instagram: a container, checked until it is ready, then published.
${codeNode('planInstagram', 'Plan the Instagram post', code('publisher-instagram-plan.js'), `{ post_id: 'post-id', place: 'instagram', account: '17841400000000000', kind: 'image', url: '${GRAPH}/17841400000000000/media', body: { image_url: 'https://example.com/file.jpg', caption: 'Plan your EB-5 path.' }, wait: 10 }`)}
${callNode('container', 'Instagram: make the container', {
  method: 'POST',
  url: "expr('{{ $json.url }}')",
  auth: 'facebookGraphApi',
  json: '{{ JSON.stringify($json.body) }}',
  timeout: 120000,
  output: "{ statusCode: 200, body: { id: '9001' } }",
})}
${codeNode('readContainer', 'Read the container', code('publisher-instagram-container.js'), `{ ok: true, post_id: 'post-id', place: 'instagram', kind: 'image', wait: 10, tries: 0, creation_id: '9001', status_url: '${GRAPH}/9001?fields=status_code,status', publish_url: '${GRAPH}/17841400000000000/media_publish' }`)}
${isOk('containerMade', 'Container made?')}
${waitNode('instagramWait', 'Give Instagram time')}
${callNode('instagramStatus', 'Instagram: is it ready?', {
  method: 'GET',
  url: "expr('{{ $json.status_url }}')",
  auth: 'facebookGraphApi',
  timeout: 30000,
  output: "{ statusCode: 200, body: { status_code: 'FINISHED', id: '9001' } }",
})}
${codeNode('instagramReady', 'Ready to publish?', code('publisher-instagram-ready.js'), `{ post_id: 'post-id', place: 'instagram', ok: true, creation_id: '9001', publish_url: '${GRAPH}/17841400000000000/media_publish' }`)}
${routeNode('instagramNext', 'Publish, wait or stop?', publishOrWait)}
${callNode('instagramPublish', 'Instagram: publish', {
  method: 'POST',
  url: "expr('{{ $json.publish_url }}')",
  auth: 'facebookGraphApi',
  json: '{{ JSON.stringify({ creation_id: $json.creation_id }) }}',
  timeout: 120000,
  output: "{ statusCode: 200, body: { id: '17900000000000001' } }",
})}
${callNode('instagramLink', 'Instagram: its link', {
  method: 'GET',
  url: `expr('${GRAPH}/{{ $json.body && $json.body.id }}?fields=permalink')`,
  auth: 'facebookGraphApi',
  timeout: 30000,
  output: "{ statusCode: 200, body: { permalink: 'https://www.instagram.com/p/AbC123/', id: '17900000000000001' } }",
})}
${codeNode('instagramAnswer', "Read Instagram's answer", code('publisher-instagram-answer.js'), `{ ok: true, post_id: 'post-id', place: 'instagram', remote_id: '17900000000000001', remote_url: 'https://www.instagram.com/p/AbC123/', stand_in: false }`)}

// ---- LinkedIn: the picture or the video uploaded first, then the post names it.
${codeNode('planLinkedin', 'Plan the LinkedIn post', code('publisher-linkedin-plan.js'), `{ ok: true, post_id: 'post-id', place: 'linkedin', owner: 'urn:li:organization:98765', kind: 'image', version: '202609', media_url: 'https://example.com/file.jpg', post: { author: 'urn:li:organization:98765', commentary: 'Plan your EB-5 path.', visibility: 'PUBLIC', lifecycleState: 'PUBLISHED' } }`)}
${routeNode('linkedinUpload', 'Which LinkedIn upload?', [
  ['picture', '{{ $json.kind === "image" }}'],
  ['video', '{{ $json.kind === "video" }}'],
  ['words', '{{ $json.kind !== "image" && $json.kind !== "video" }}'],
])}
${callNode('startPicture', 'LinkedIn: start the picture', {
  method: 'POST',
  url: `'${LINKEDIN_REST}/images?action=initializeUpload'`,
  auth: 'linkedInCommunityManagementOAuth2Api',
  headers: LINKEDIN_HEADERS,
  json: '{{ JSON.stringify({ initializeUploadRequest: { owner: $json.owner } }) }}',
  output: "{ statusCode: 200, body: { value: { uploadUrl: 'https://www.linkedin.com/dms-uploads/abc', image: 'urn:li:image:C4E10AQ' } } }",
})}
${ifTrue('pictureStarted', 'Picture started?', '{{ $json.statusCode >= 200 && $json.statusCode < 300 && !!($json.body && $json.body.value && $json.body.value.uploadUrl) }}')}
${callNode('getPicture', 'Get the picture', {
  method: 'GET',
  url: `expr('{{ $("Plan the LinkedIn post").item.json.media_url }}')`,
  file: true,
  output: '{}',
})}
${callNode('sendPicture', 'LinkedIn: send the picture', {
  method: 'PUT',
  url: `expr('{{ $("LinkedIn: start the picture").item.json.body.value.uploadUrl }}')`,
  auth: 'linkedInCommunityManagementOAuth2Api',
  binary: true,
  timeout: 120000,
  output: "{ statusCode: 201, body: '' }",
})}
${codeNode('pictureSent', 'Picture sent?', code([LINKEDIN, 'publisher-linkedin-picture.js']), `{ ok: true, post_id: 'post-id', place: 'linkedin', version: '202609', post: { author: 'urn:li:organization:98765', content: { media: { id: 'urn:li:image:C4E10AQ' } } } }`)}
${callNode('videoSize', "Find the video's size", {
  method: 'GET',
  url: "expr('{{ $json.media_url }}')",
  headers: [['Range', "'bytes=0-0'"]],
  text: true,
  timeout: 30000,
  output: "{ statusCode: 206, headers: { 'content-range': 'bytes 0-0/6000001' }, data: 'x' }",
})}
${codeNode('sizeRead', 'How big is the video?', code([LINKEDIN, 'publisher-linkedin-size.js']), `{ ok: true, post_id: 'post-id', place: 'linkedin', size: 6000001 }`)}
${isOk('sizeKnown', 'Size known?')}
${callNode('startVideo', 'LinkedIn: start the video', {
  method: 'POST',
  url: `'${LINKEDIN_REST}/videos?action=initializeUpload'`,
  auth: 'linkedInCommunityManagementOAuth2Api',
  headers: LINKEDIN_HEADERS,
  json: '{{ JSON.stringify({ initializeUploadRequest: { owner: $("Plan the LinkedIn post").item.json.owner, fileSizeBytes: $json.size, uploadCaptions: false, uploadThumbnail: false } }) }}',
  output: "{ statusCode: 200, body: { value: { video: 'urn:li:video:C5F10AQ', uploadToken: '', uploadInstructions: [{ uploadUrl: 'https://www.linkedin.com/dms-uploads/abc', firstByte: 0, lastByte: 6000000 }] } } }",
})}
${codeNode('eachPart', 'One item per part', code([LINKEDIN, 'publisher-linkedin-parts.js']), `{ ok: true, post_id: 'post-id', place: 'linkedin', part: 0, parts: 1, media_url: 'https://example.com/file.mp4', range: 'bytes=0-6000000', upload_url: 'https://www.linkedin.com/dms-uploads/abc', video: 'urn:li:video:C5F10AQ', upload_token: '' }`)}
${isOk('partsToSend', 'Parts to send?')}
${callNode('getPart', 'Get the part', {
  method: 'GET',
  url: "expr('{{ $json.media_url }}')",
  headers: [['Range', "expr('{{ $json.range }}')"]],
  file: true,
  timeout: 120000,
  output: '{}',
})}
${callNode('sendPart', 'LinkedIn: send the part', {
  method: 'PUT',
  url: `expr('{{ $("One item per part").item.json.upload_url }}')`,
  auth: 'linkedInCommunityManagementOAuth2Api',
  headers: [['Content-Type', "'application/octet-stream'"]],
  binary: true,
  timeout: 120000,
  output: "{ statusCode: 200, headers: { etag: '/ama/one' }, body: '' }",
})}
${codeNode('gatherParts', 'Gather the parts', code([LINKEDIN, 'publisher-linkedin-gather.js']), `{ ok: true, post_id: 'post-id', place: 'linkedin', video: 'urn:li:video:C5F10AQ', upload_token: '', etags: ['/ama/one'] }`)}
${isOk('partsSent', 'Parts sent?')}
${callNode('finishVideo', 'LinkedIn: finish the video', {
  method: 'POST',
  url: `'${LINKEDIN_REST}/videos?action=finalizeUpload'`,
  auth: 'linkedInCommunityManagementOAuth2Api',
  headers: LINKEDIN_HEADERS,
  json: '{{ JSON.stringify({ finalizeUploadRequest: { video: $json.video, uploadToken: $json.upload_token, uploadedPartIds: $json.etags } }) }}',
  output: "{ statusCode: 200, body: '' }",
})}
${codeNode('videoSent', 'Video sent?', code([LINKEDIN, 'publisher-linkedin-video.js']), `{ ok: true, post_id: 'post-id', place: 'linkedin', version: '202609', video: 'urn:li:video:C5F10AQ', post: { author: 'urn:li:organization:98765', content: { media: { id: 'urn:li:video:C5F10AQ' } } }, tries: 0, wait: 20 }`)}
${isOk('videoTaken', 'Video taken?')}
${waitNode('linkedinWait', 'Give LinkedIn time')}
${callNode('videoStatus', 'LinkedIn: is the video ready?', {
  method: 'GET',
  url: `expr('${LINKEDIN_REST}/videos/{{ encodeURIComponent($json.video) }}')`,
  auth: 'linkedInCommunityManagementOAuth2Api',
  headers: [['LinkedIn-Version', "expr('{{ $json.version }}')"], ['X-Restli-Protocol-Version', "'2.0.0'"]],
  timeout: 30000,
  output: "{ statusCode: 200, body: { status: 'AVAILABLE', id: 'urn:li:video:C5F10AQ' } }",
})}
${codeNode('videoReady', 'Video ready?', code([LINKEDIN, 'publisher-linkedin-ready.js']), `{ ok: true, post_id: 'post-id', place: 'linkedin', version: '202609', post: { author: 'urn:li:organization:98765', content: { media: { id: 'urn:li:video:C5F10AQ' } } } }`)}
${routeNode('linkedinNext', 'Post, wait or stop?', publishOrWait)}
${isOk('readyToPost', 'Ready to post?')}
${callNode('linkedinPost', 'LinkedIn: post', {
  method: 'POST',
  url: `'${LINKEDIN_REST}/posts'`,
  auth: 'linkedInCommunityManagementOAuth2Api',
  headers: [['LinkedIn-Version', "expr('{{ $json.version }}')"], ['X-Restli-Protocol-Version', "'2.0.0'"]],
  json: '{{ JSON.stringify($json.post) }}',
  output: "{ statusCode: 201, headers: { 'x-restli-id': 'urn:li:share:7123' }, body: '' }",
})}
${codeNode('linkedinAnswer', "Read LinkedIn's answer", code([LINKEDIN, 'publisher-linkedin-answer.js']), `{ ok: true, post_id: 'post-id', place: 'linkedin', remote_id: 'urn:li:share:7123', remote_url: 'https://www.linkedin.com/feed/update/urn:li:share:7123', stand_in: false }`)}

// ---- every place's answer, stand-in or real, is recorded the same way.
${isOk('wentOut', 'Did it go out?')}
${rpcNode('finish', 'Record it posted', 'publisher_finish', '{{ JSON.stringify({ p_post_id: $json.post_id, p_place: $json.place, p_remote_id: $json.remote_id, p_remote_url: $json.remote_url, p_stand_in: $json.stand_in === true }) }}', `{ remove_media: 'posts/user/file.jpg' }`)}
${rpcNode('fail', 'Record why it did not', 'publisher_fail', '{{ JSON.stringify({ p_post_id: $json.post_id, p_place: $json.place, p_error: $json.error, p_unknown: $json.unknown === true }) }}', '{}')}

const fileToRemove = ifElse({
  version: 2.3,
  config: {
    name: 'A file no post needs?',
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 2 },
        conditions: [{ leftValue: expr('{{ $json.remove_media }}'), rightValue: '', operator: { type: 'string', operation: 'notEmpty', singleValue: true } }],
        combinator: 'and',
      },
    },
  },
});

const removeFile = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: {
    name: 'Remove the file from Storage',
    onError: 'continueRegularOutput',
    parameters: {
      method: 'DELETE',
      url: '${SUPABASE_STORAGE}/object/post-media',
      authentication: 'predefinedCredentialType',
      nodeCredentialType: 'supabaseApi',
      sendBody: true,
      contentType: 'json',
      specifyBody: 'json',
      jsonBody: expr('{{ JSON.stringify({ prefixes: [$json.remove_media] }) }}'),
      options: { timeout: 30000 },
    },
    credentials: { supabaseApi: newCredential('Supabase QGR') },
  },
  output: [{}],
});

const noteFlow = sticky('## Posting\\nEvery minute, and at once when the dashboard sends a post now, the database hands over the places that are due (**publisher_take_due**, never the same one twice). **Post for real?** follows each place\\'s switch in Settings, Where posts go: off, the place\\'s stand-in answers and nothing goes out; on, the file is signed for an hour so the platform can fetch it, and the place\\'s own steps post it. The result is recorded either way. A file goes from Storage once no post needs it: the platform keeps its own copy. A send cut off halfway is marked *check the Page* and never sent again by itself.', [everyMinute, postNow, takeDue, eachPlace, forReal], { color: 4 });
const noteStandIns = sticky('## Stand-ins\\nThe way taken while a place is not switched to post for real (Settings, Where posts go). They post nothing and say so: the dashboard shows the post as a stand-in, and nothing is read for results. They answer in the shape the real steps do.', [wherePost, facebook, instagram, linkedin], { color: 3 });
const noteFacebook = sticky('## Facebook\\nOne request to the Page (Graph API v25.0): a picture to /photos, a video to /videos on graph-video, or the words alone to /feed. Meta fetches the file from the signed link.\\n\\nThe token: a **Facebook Graph API** credential holding a Page access token with pages_manage_posts, pages_read_engagement and pages_show_list (a System User\\'s token in Meta Business Suite does not expire). Attach it to **Facebook: post** and to the four Instagram steps. Until then those steps do not run and the post says why.', [planFacebook, facebookPost, facebookAnswer], { color: 5 });
const noteInstagram = sticky('## Instagram\\nA container is made from the file (a picture, or a video as a Reel), checked after ten seconds (a minute for a video) and then once a minute for five minutes at most, as Meta asks, and published once it is FINISHED. The account set in Settings is the Instagram professional account\\'s id, linked to the Page; the token also needs instagram_basic and instagram_content_publish. Instagram takes 100 posts a day through its API.', [planInstagram, container, readContainer, containerMade, instagramWait, instagramStatus, instagramReady, instagramNext, instagramPublish, instagramLink, instagramAnswer], { color: 5 });
const noteLinkedin = sticky('## LinkedIn\\nThe picture or the video is uploaded first (a video in the parts LinkedIn asks for, read from Storage a part at a time, then checked once a minute until LinkedIn has processed it), then the post names it, as the Page (urn:li:organization). API version 202609, pinned: LinkedIn keeps one a year. The words are escaped for LinkedIn\\'s little text format, so they read as written.\\n\\nThe token: a **LinkedIn Community Management** credential (LinkedIn Community Management OAuth2 API) from an app LinkedIn has approved for the Community Management API, connected by an admin of the Page (w_organization_social, r_organization_social). Attach it to every LinkedIn step.', [planLinkedin, linkedinUpload, startPicture, pictureStarted, getPicture, sendPicture, pictureSent, videoSize, sizeRead, sizeKnown, startVideo, eachPart, partsToSend, getPart, sendPart, gatherParts, partsSent, finishVideo, videoSent, videoTaken, linkedinWait, videoStatus, videoReady, linkedinNext, readyToPost, linkedinPost, linkedinAnswer], { color: 5 });

export default workflow('qgr-publisher', 'QGR · Publisher')
  .add(everyMinute)
  .to(takeDue)
  .to(eachPlace)
  .to(forReal.onTrue(sign).onFalse(wherePost
    .onCase(0, facebook)
    .onCase(1, instagram)
    .onCase(2, linkedin)))
  .add(postNow)
  .to(takeDue)
  .add(facebook)
  .to(wentOut.onTrue(finish.to(fileToRemove.onTrue(removeFile))).onFalse(fail))
  .add(instagram)
  .to(wentOut)
  .add(linkedin)
  .to(wentOut)
  .add(sign)
  .to(withLink)
  .to(readyToSend.onTrue(whereReal
    .onCase(0, planFacebook)
    .onCase(1, planInstagram)
    .onCase(2, planLinkedin)).onFalse(wentOut))
  .add(planFacebook)
  .to(facebookPost)
  .to(facebookAnswer)
  .to(wentOut)
  .add(planInstagram)
  .to(container)
  .to(readContainer)
  .to(containerMade.onTrue(instagramWait).onFalse(wentOut))
  .add(instagramWait)
  .to(instagramStatus)
  .to(instagramReady)
  .to(instagramNext
    .onCase(0, instagramPublish)
    .onCase(1, instagramWait)
    .onCase(2, wentOut))
  .add(instagramPublish)
  .to(instagramLink)
  .to(instagramAnswer)
  .to(wentOut)
  .add(planLinkedin)
  .to(linkedinUpload
    .onCase(0, startPicture)
    .onCase(1, videoSize)
    .onCase(2, readyToPost))
  .add(startPicture)
  .to(pictureStarted.onTrue(getPicture).onFalse(pictureSent))
  .add(getPicture)
  .to(sendPicture)
  .to(pictureSent)
  .to(readyToPost.onTrue(linkedinPost).onFalse(wentOut))
  .add(videoSize)
  .to(sizeRead)
  .to(sizeKnown.onTrue(startVideo).onFalse(wentOut))
  .add(startVideo)
  .to(eachPart)
  .to(partsToSend.onTrue(getPart).onFalse(wentOut))
  .add(getPart)
  .to(sendPart)
  .to(gatherParts)
  .to(partsSent.onTrue(finishVideo).onFalse(wentOut))
  .add(finishVideo)
  .to(videoSent)
  .to(videoTaken.onTrue(linkedinWait).onFalse(wentOut))
  .add(linkedinWait)
  .to(videoStatus)
  .to(videoReady)
  .to(linkedinNext
    .onCase(0, readyToPost)
    .onCase(1, linkedinWait)
    .onCase(2, wentOut))
  .add(linkedinPost)
  .to(linkedinAnswer)
  .to(wentOut)
  .add(noteFlow)
  .add(noteStandIns)
  .add(noteFacebook)
  .add(noteInstagram)
  .add(noteLinkedin);
`;

// ---------------------------------------------------------------- scheduled scans

const scans = `${IMPORTS}

const everyHour = trigger({
  type: 'n8n-nodes-base.scheduleTrigger',
  version: 1.4,
  config: {
    name: 'Every hour',
    parameters: { rule: { interval: [{ field: 'hours', hoursInterval: 1, triggerAtMinute: 1 }] } },
  },
  output: [{}],
});
${rpcNode('startScans', 'Start the scans that are due', 'start_due_scans', '{{ JSON.stringify({ p_max: 10 }) }}', `{ run_id: 'run-id', competitor: 'Horizon Visa Partners' }`, "\n    executeOnce: true,")}
${codeNode('eachScan', 'One item per scan', code('shared-items.js'), `{ run_id: 'run-id', competitor: 'Horizon Visa Partners' }`)}

const runPipeline = node({
  type: 'n8n-nodes-base.executeWorkflow',
  version: 1.3,
  config: {
    name: 'Hand each scan to the pipeline',
    parameters: {
      mode: 'each',
      source: 'database',
      workflowId: { __rl: true, mode: 'id', value: ${JSON.stringify(ids.pipeline ?? 'PIPELINE_WORKFLOW_ID')}, cachedResultName: 'QGR · Run pipeline' },
      workflowInputs: {
        mappingMode: 'defineBelow',
        value: { runId: expr('{{ $json.run_id }}'), startAt: 'tracker' },
        matchingColumns: [],
        schema: [
          { id: 'runId', displayName: 'runId', required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type: 'string' },
          { id: 'startAt', displayName: 'startAt', required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type: 'string' },
        ],
        attemptToConvertTypes: false,
        convertFieldsToString: true,
      },
      options: { waitForSubWorkflow: false },
    },
  },
  output: [{}],
});

const noteFlow = sticky('## Scheduled scans\\nEvery hour the database is asked whether the team\\'s schedule (Settings, Agents) has fallen due (**start_due_scans**). When it has, it starts a scan of each tracked competitor that has a website, at most ten, with their website as the app last read it: n8n fetches nothing. Each run goes to **QGR · Run pipeline**, whose switches decide whether the strategist and the Content Agent follow by themselves.', [everyHour, startScans, runPipeline], { color: 4 });

export default workflow('qgr-scheduled-scans', 'QGR · Scheduled scans')
  .add(everyHour)
  .to(startScans)
  .to(eachScan)
  .to(runPipeline)
  .add(noteFlow);
`;

// ---------------------------------------------------------------- post results

const results = `${IMPORTS}

const everySixHours = trigger({
  type: 'n8n-nodes-base.scheduleTrigger',
  version: 1.4,
  config: {
    name: 'Every six hours',
    parameters: { rule: { interval: [{ field: 'hours', hoursInterval: 6, triggerAtMinute: 17 }] } },
  },
  output: [{}],
});
${rpcNode('takeDue', 'Take the posts to read', 'results_take_due', '{{ JSON.stringify({ p_limit: 50 }) }}', `{ post_id: 'post-id', place: 'facebook', remote_id: '1234567890_987654321', media_kind: 'image', posted_at: '2026-10-08T13:00:12+00:00', page: { id: '1234567890' } }`, "\n    executeOnce: true,")}
${codeNode('eachPlace', 'One item per place', code('shared-items.js'), `{ post_id: 'post-id', place: 'facebook', remote_id: '1234567890_987654321', media_kind: 'image', posted_at: '2026-10-08T13:00:12+00:00', page: { id: '1234567890' } }`)}
${codeNode('planRead', 'Plan the read', code('results-plan.js'), `{ post_id: 'post-id', place: 'facebook', kind: 'facebook-post', url: '${GRAPH}/1234567890_987654321?fields=shares' }`)}
${ifTrue('toLinkedin', 'LinkedIn?', '{{ $json.place === "linkedin" }}')}
${callNode('metaNumbers', 'Meta: its numbers', {
  method: 'GET',
  url: "expr('{{ $json.url }}')",
  auth: 'facebookGraphApi',
  timeout: 30000,
  output: "{ statusCode: 200, body: { shares: { count: 3 }, comments: { summary: { total_count: 7 } }, reactions: { summary: { total_count: 38 } }, insights: { data: [{ name: 'post_media_view', period: 'lifetime', values: [{ value: 1320 }] }] } } }",
})}
${callNode('linkedinNumbers', 'LinkedIn: its numbers', {
  method: 'GET',
  url: "expr('{{ $json.url }}')",
  auth: 'linkedInCommunityManagementOAuth2Api',
  headers: [['LinkedIn-Version', "expr('{{ $json.version }}')"], ['X-Restli-Protocol-Version', "'2.0.0'"]],
  timeout: 30000,
  output: "{ statusCode: 200, body: { elements: [{ totalShareStatistics: { uniqueImpressionsCount: 940, impressionCount: 1320, likeCount: 38, commentCount: 7, shareCount: 3, clickCount: 29 } }] } }",
})}
${codeNode('readNumbers', 'Read the numbers', code([LINKEDIN, 'results-read.js']), `{ ok: true, post_id: 'post-id', place: 'facebook', results: { reach: 940, views: 1320, reactions: 38, comments: 7, shares: 3, clicks: 29 } }`)}
${ifTrue('gotNumbers', 'Numbers back?', '{{ $json.ok === true && $json.results !== null && typeof $json.results === "object" }}')}
${ifTrue('refused', 'Refused?', '{{ $json.ok === false }}')}
${rpcNode('record', 'Record the numbers', 'results_record', '{{ JSON.stringify({ p_post_id: $json.post_id, p_place: $json.place, p_results: $json.results }) }}', '{}', "\n    onError: 'continueRegularOutput',")}
${rpcNode('recordWhy', 'Record why not', 'results_fail', '{{ JSON.stringify({ p_post_id: $json.post_id, p_place: $json.place, p_error: $json.error }) }}', '{}', "\n    onError: 'continueRegularOutput',")}

const noteFlow = sticky('## Results\\nEvery six hours the database hands over the posts that went out for real in the last four weeks and were not read in the last six hours (**results_take_due**). Each is asked for its numbers, which are recorded as counts (**results_record**). If a platform refuses, the reason is kept beside the last numbers (**results_fail**). A stand-in post has none: nothing was posted.', [everySixHours, takeDue, eachPlace], { color: 4 });
const noteReaders = sticky('## One request a post\\n**Plan the read** names it: on Facebook a post\\'s shares, comments, reactions and insights (post_media_view, post_total_media_view_unique, post_clicks), or a video\\'s video insights; on Instagram the media\\'s insights (reach, views, likes, comments, shares); on LinkedIn the post\\'s organizationalEntityShareStatistics. **Read the numbers** takes each by its name, and leaves a number the platform does not give empty.\\n\\nThe same tokens as the publisher: the **Facebook Graph API** credential on **Meta: its numbers** (with pages_read_engagement, pages_read_user_content and instagram_manage_insights), the **LinkedIn Community Management** credential on **LinkedIn: its numbers** (with rw_organization_admin). Until then each read says why, and nothing is recorded.', [planRead, toLinkedin, metaNumbers, linkedinNumbers, readNumbers], { color: 5 });

export default workflow('qgr-post-results', 'QGR · Post results')
  .add(everySixHours)
  .to(takeDue)
  .to(eachPlace)
  .to(planRead)
  .to(toLinkedin.onTrue(linkedinNumbers).onFalse(metaNumbers))
  .add(linkedinNumbers)
  .to(readNumbers)
  .to(gotNumbers.onTrue(record).onFalse(refused.onTrue(recordWhy)))
  .add(metaNumbers)
  .to(readNumbers)
  .add(noteFlow)
  .add(noteReaders);
`;

// ---------------------------------------------------------------- pictures

const pictureAsk = `{ variant_id: 'variant-id', label: 'A', prompt: 'A calm skyline at dusk, indigo and gold. No words, no people, no flags.', style: 'arcs', look: 'Warm natural light, indigo and gold accents.', model: 'stand-in', account: null, quality: 'low', path: 'pictures/variant-id/picture-id.png' }`;
const pictureJob = `{ id: 'sent-id', variant_id: 'variant-id', job_id: 'job-id', path: 'pictures/variant-id/picture-id.png' }`;
const referenceAsk = `{ id: 'reference-id', run_id: 'run-id', position: 0, path: 'refs/user-id/picture-id.png' }`;
/** Cloudflare Workers AI's FLUX.1 schnell, on the account the team names in Settings. */
const CLOUDFLARE_AI = 'https://api.cloudflare.com/client/v4/accounts';
/** A picture script with what it shares in front: the words to draw, Higgsfield's answers, or both. */
const pictureCode = (file, helpers) => code([...helpers, file]);

const pictures = `${IMPORTS}

const everyMinute = trigger({
  type: 'n8n-nodes-base.scheduleTrigger',
  version: 1.4,
  config: {
    name: 'Every minute',
    parameters: { rule: { interval: [{ field: 'minutes', minutesInterval: 1 }] } },
  },
  output: [{}],
});

const makeNow = trigger({
  type: 'n8n-nodes-base.webhook',
  version: 2.1,
  config: {
    name: 'Make now',
    parameters: {
      httpMethod: 'POST',
      path: 'qgr-picture',
      authentication: 'headerAuth',
      responseMode: 'onReceived',
      options: { responseCode: { values: { responseCode: 'customCode', customCode: 202 } } },
    },
    credentials: { httpHeaderAuth: newCredential('QGR webhook secret') },
  },
  output: [{ body: {} }],
});

const priceIt = trigger({
  type: 'n8n-nodes-base.webhook',
  version: 2.1,
  config: {
    name: 'Price',
    parameters: {
      httpMethod: 'POST',
      path: 'qgr-picture-price',
      authentication: 'headerAuth',
      responseMode: 'responseNode',
      options: {},
    },
    credentials: { httpHeaderAuth: newCredential('QGR webhook secret') },
  },
  output: [{ body: { quality: 'low' } }],
});

// ---- Higgsfield's price for one picture, asked by Settings and the studio
${codeNode('priceRequest', 'Price request', pictureCode('pictures-price-request.js', ['pictures-prompt.js']), `{ quote_input: '{"params":{"model":"gpt_image_2_5","get_cost":true},"get_cost":true}' }`)}
${higgsfieldNode('higgsPrice', 'Higgsfield: price', 'generate_image', '{{ $json.quote_input }}', `{ structuredContent: { cost: { credits: 0.25, credits_exact: 0.25 } }, content: [{ type: 'text', text: 'Cost preflight for gpt_image_2_5: 0.25 credits (0.25 exact). No job submitted.' }] }`)}
${codeNode('readPrice', 'Read the price', videoCode('video-read-quote.js'), `{ ok: true, credits: 0.25 }`)}
${higgsfieldNode('higgsBalance', 'Higgsfield: credits left', 'balance', '{}', `{ structuredContent: { credits: 280, subscription_plan_type: 'starter' }, content: [{ type: 'text', text: 'Credits: 280 | Plan: starter' }] }`, "\n    executeOnce: true,")}
${codeNode('answer', 'The answer', videoCode('video-answer.js'), `{ ok: true, credits: 0.25, balance: 280 }`)}

const respond = node({
  type: 'n8n-nodes-base.respondToWebhook',
  version: 1.5,
  config: {
    name: 'Answer the page',
    parameters: { respondWith: 'json', responseBody: expr('{{ JSON.stringify($json) }}'), options: {} },
  },
  output: [{}],
});

// ---- the asks
${rpcNode('takeDue', 'Take the pictures asked for', 'picture_take_due', '{{ JSON.stringify({ p_limit: 5 }) }}', pictureAsk, "\n    executeOnce: true,")}
${codeNode('eachAsk', 'One item per picture', code('shared-items.js'), pictureAsk)}
${codeNode('imageModel', 'Image model (stand-in)', code('pictures-stand-in.js'), `{ ok: true, variant_id: 'variant-id', path: null, stand_in: true }`)}
${isOk('made', 'Made?')}
${ifTrue('onHiggsfield', 'Higgsfield?', '{{ $json.model === "higgsfield" }}')}

// ---- Higgsfield: priced, recorded against the month's limit, sent once
${codeNode('higgsRequest', 'Write the Higgsfield request', pictureCode('pictures-higgsfield-request.js', ['pictures-prompt.js']), `{ variant_id: 'variant-id', label: 'A', path: 'pictures/variant-id/picture-id.png', quality: 'low', params: { model: 'gpt_image_2_5' }, quote_input: '{"params":{"model":"gpt_image_2_5","get_cost":true},"get_cost":true}' }`)}
${higgsfieldNode('higgsPricePicture', 'Higgsfield: price the picture', 'generate_image', '{{ $json.quote_input }}', `{ structuredContent: { cost: { credits: 0.25, credits_exact: 0.25 } }, content: [{ type: 'text', text: 'Cost preflight for gpt_image_2_5: 0.25 credits (0.25 exact). No job submitted.' }] }`)}
${codeNode('readPicturePrice', "Read the picture's price", videoCode('pictures-higgsfield-price.js'), `{ kind: 'priced', variant_id: 'variant-id', credits: 0.25, quality: 'low', path: 'pictures/variant-id/picture-id.png' }`)}
${routeNode('priced', 'Priced?', [
  ['priced', '{{ $json.kind === "priced" }}'],
  ['retry', '{{ $json.kind === "retry" }}'],
  ['refused', '{{ $json.kind === "refused" }}'],
])}
${rpcNode('begin', 'Record: about to send', 'picture_higgsfield_begin', '{{ JSON.stringify({ p_variant_id: $json.variant_id, p_credits: $json.credits, p_quality: $json.quality, p_path: $json.path }) }}', `{ begun: true, id: 'sent-id' }`, "\n    onError: 'continueRegularOutput',")}
${ifTrue('begun', 'Begun?', '{{ $json.begun === true }}')}
${rpcNode('releaseAsk', 'Take it again later', 'picture_release', '{{ JSON.stringify({ p_variant_id: $json.variant_id, p_error: $json.error }) }}', '{}', "\n    onError: 'continueRegularOutput',")}
${codeNode('pictureRequest', 'Write the picture request', code('pictures-higgsfield-send.js'), `{ id: 'sent-id', variant_id: 'variant-id', generate_input: '{"params":{"model":"gpt_image_2_5"}}' }`)}
${higgsfieldNode('makePicture', 'Higgsfield: make the picture', 'generate_image', '{{ $json.generate_input }}', `{ structuredContent: { job_id: 'job-id' } }`)}
${codeNode('readStart', 'Read the answer', code(['video-mcp.js', 'video-read-start.js'], { "$('Write the request')": "$('Write the picture request')" }), `{ kind: 'started', id: 'sent-id', job_id: 'job-id', credits: null }`)}
${routeNode('whatHappened', 'What happened?', [
  ['started', '{{ $json.kind === "started" }}'],
  ['refused', '{{ $json.kind === "refused" }}'],
  ['retry', '{{ $json.kind === "retry" }}'],
  ['unknown', '{{ $json.kind === "unknown" }}'],
])}
${rpcNode('recordStarted', 'Record: Higgsfield has it', 'picture_higgsfield_started', '{{ JSON.stringify(Object.assign({ p_id: $json.id, p_job_id: $json.job_id }, typeof $json.credits === "number" ? { p_credits: $json.credits } : {})) }}', '{}', "\n    onError: 'continueRegularOutput',")}
${rpcNode('recordNotMade', 'Record: not made', 'picture_higgsfield_fail', '{{ JSON.stringify({ p_id: $json.id, p_error: $json.error }) }}', '{}', "\n    onError: 'continueRegularOutput',")}
${rpcNode('recordRetry', 'Record: try again', 'picture_higgsfield_release', '{{ JSON.stringify({ p_id: $json.id, p_error: $json.error }) }}', '{}', "\n    onError: 'continueRegularOutput',")}
${rpcNode('recordUnknown', 'Record: may have been made', 'picture_higgsfield_unknown', '{{ JSON.stringify({ p_id: $json.id, p_error: $json.error }) }}', '{}', "\n    onError: 'continueRegularOutput',")}

// ---- a run's reference pictures, given to Higgsfield once
${rpcNode('takeRefs', 'Take the references for Higgsfield', 'reference_take_due', '{{ JSON.stringify({ p_limit: 8 }) }}', referenceAsk, "\n    executeOnce: true,")}
${codeNode('eachRef', 'One item per reference', code('shared-items.js'), referenceAsk)}
${callNode('signRef', 'Sign the reference', {
  method: 'POST',
  url: `expr('${SUPABASE_STORAGE}/object/sign/run-refs/{{ $json.path }}')`,
  auth: 'supabaseApi',
  json: '{{ JSON.stringify({ expiresIn: 900 }) }}',
  timeout: 30000,
  credentials: "{ supabaseApi: newCredential('Supabase QGR') }",
  output: `{ statusCode: 200, body: { signedURL: '/object/sign/run-refs/refs/user-id/picture-id.png?token=t' } }`,
})}
${codeNode('refLink', 'Reference link', code('references-link.js'), `{ id: 'reference-id', url: '${SUPABASE_STORAGE}/object/sign/run-refs/refs/user-id/picture-id.png?token=t' }`)}
${ifTrue('refLinked', 'Reference link made?', '{{ typeof $json.url === "string" && $json.url.length > 0 }}')}
${higgsfieldNode('importRef', 'Higgsfield: take the reference', 'media_import_url', '{{ JSON.stringify({ url: $json.url }) }}', `{ structuredContent: { media_id: 'media-id' } }`)}
${codeNode('readRef', "Read the reference's id", videoCode('references-read.js'), `{ kind: 'ready', id: 'reference-id', media_id: 'media-id' }`)}
${routeNode('refOutcome', 'Reference taken?', [
  ['ready', '{{ $json.kind === "ready" }}'],
  ['failed', '{{ $json.kind === "failed" }}'],
  ['retry', '{{ $json.kind === "retry" }}'],
])}
${rpcNode('refReady', 'Record: Higgsfield has the reference', 'reference_ready', '{{ JSON.stringify({ p_id: $json.id, p_media_id: $json.media_id }) }}', '{}', "\n    onError: 'continueRegularOutput',")}
${rpcNode('refFailed', 'Record: the reference was refused', 'reference_failed', '{{ JSON.stringify({ p_id: $json.id, p_error: $json.error }) }}', '{}', "\n    onError: 'continueRegularOutput',")}
${rpcNode('refRetry', 'Record: try the reference again', 'reference_release', '{{ JSON.stringify({ p_id: $json.id, p_error: $json.error }) }}', '{}', "\n    onError: 'continueRegularOutput',")}

// ---- Higgsfield's jobs: checked until the picture is stored
${rpcNode('takeMaking', 'Take the pictures being made', 'picture_take_making', '{{ JSON.stringify({ p_limit: 10 }) }}', pictureJob, "\n    executeOnce: true,")}
${codeNode('eachJob', 'One item per job', code('shared-items.js'), pictureJob)}
${higgsfieldNode('jobStatus', 'Higgsfield: how is the picture going?', 'job_status', '{{ JSON.stringify({ jobId: $json.job_id }) }}', `{ structuredContent: { status: 'completed', results: [{ url: 'https://cdn.higgsfield.ai/job-id/image.png' }] } }`)}
${codeNode('readJob', "Read the picture's job", videoCode('pictures-higgsfield-job.js'), `{ kind: 'done', id: 'sent-id', path: 'pictures/variant-id/picture-id.png', url: 'https://cdn.higgsfield.ai/job-id/image.png' }`)}
${routeNode('howIsItGoing', 'How is it going?', [
  ['done', '{{ $json.kind === "done" }}'],
  ['failed', '{{ $json.kind === "failed" }}'],
  ['unknown', '{{ $json.kind === "unknown" }}'],
])}
${callNode('download', 'Fetch the picture', { method: 'GET', url: "expr('{{ $json.url }}')", timeout: 60000, file: true, output: '{}' })}
${codeNode('readFile', 'Read the file', code('pictures-higgsfield-file.js'), `{ kind: 'picture', id: 'sent-id', path: 'pictures/variant-id/picture-id.png', mime: 'image/png' }`)}
${routeNode('aPicture', 'A picture?', [
  ['picture', '{{ $json.kind === "picture" }}'],
  ['failed', '{{ $json.kind === "failed" }}'],
])}
${callNode('store', 'Store the picture', {
  method: 'POST',
  url: `expr('${SUPABASE_STORAGE}/object/ad-pictures/{{ $json.path }}')`,
  auth: 'supabaseApi',
  headers: [['Content-Type', "expr('{{ $json.mime }}')"], ['x-upsert', "'true'"]],
  binary: true,
  timeout: 60000,
  credentials: "{ supabaseApi: newCredential('Supabase QGR') }",
  output: `{ statusCode: 200, body: { Key: 'ad-pictures/pictures/variant-id/picture-id.png' } }`,
})}
${codeNode('stored', 'Stored?', code('video-uploaded.js', { "$('Read the job')": "$('Read the file')" }), `{ kind: 'stored', id: 'sent-id', path: 'pictures/variant-id/picture-id.png' }`)}
${ifTrue('inStorage', 'In Storage?', '{{ $json.kind === "stored" }}')}
${rpcNode('recordHiggsfield', 'Record the Higgsfield picture', 'picture_higgsfield_finish', '{{ JSON.stringify({ p_id: $json.id, p_path: $json.path }) }}', `{ remove_picture: null }`, "\n    onError: 'continueRegularOutput',")}

const realPictures = ifElse({
  version: 2.3,
  config: {
    name: 'Real pictures?',
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 2 },
        conditions: [{ leftValue: expr('{{ $json.model === "cloudflare" && /^[0-9a-f]{32}$/.test($json.account || "") }}'), rightValue: true, operator: { type: 'boolean', operation: 'true', singleValue: true } }],
        combinator: 'and',
      },
    },
  },
});
${codeNode('writePrompt', 'Write the prompt', pictureCode('pictures-write-prompt.js', ['pictures-prompt.js']), `{ variant_id: 'variant-id', label: 'A', path: 'pictures/variant-id/picture-id.png', url: '${CLOUDFLARE_AI}/account-id/ai/run/@cf/black-forest-labs/flux-1-schnell', body: { prompt: 'A calm skyline at dusk.' } }`)}

// The token is the "Cloudflare Workers AI" credential (Bearer Auth), attached
// here by hand once it exists in n8n: a node naming a credential that does not
// exist fails every run, the stand-in's too.
const cloudflare = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: {
    name: 'Cloudflare: FLUX.1 schnell',
    onError: 'continueRegularOutput',
    parameters: {
      method: 'POST',
      url: expr('{{ $json.url }}'),
      authentication: 'genericCredentialType',
      genericAuthType: 'httpBearerAuth',
      sendBody: true,
      contentType: 'json',
      specifyBody: 'json',
      jsonBody: expr('{{ JSON.stringify($json.body) }}'),
      options: { timeout: 120000, response: { response: { fullResponse: true, neverError: true } } },
    },
  },
  output: [{ statusCode: 200, body: { success: true, result: { image: '/9j/4AAQSkZJRgABAQAAAQABAAD/2Q==' } } }],
});
${codeNode('readPicture', 'Read the picture', code('pictures-read-image.js'), `{ ok: true, variant_id: 'variant-id', path: 'pictures/variant-id/picture-id.jpg', mime: 'image/jpeg', file: 'picture-id.jpg', image: '/9j/4AAQSkZJRgABAQAAAQABAAD/2Q==' }`)}
${isOk('gotPicture', 'Got a picture?')}

const toFile = node({
  type: 'n8n-nodes-base.convertToFile',
  version: 1.1,
  config: {
    name: 'To a file',
    parameters: {
      operation: 'toBinary',
      sourceProperty: 'image',
      options: { mimeType: expr('{{ $json.mime }}'), fileName: expr('{{ $json.file }}') },
    },
  },
  output: [{}],
});

const upload = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: {
    name: 'Upload to Storage',
    onError: 'continueRegularOutput',
    parameters: {
      method: 'POST',
      url: expr('${SUPABASE_STORAGE}/object/ad-pictures/{{ $("Read the picture").item.json.path }}'),
      authentication: 'predefinedCredentialType',
      nodeCredentialType: 'supabaseApi',
      sendBody: true,
      contentType: 'binaryData',
      inputDataFieldName: 'data',
      options: { timeout: 60000, response: { response: { fullResponse: true, neverError: true } } },
    },
    credentials: { supabaseApi: newCredential('Supabase QGR') },
  },
  output: [{ statusCode: 200, body: { Key: 'ad-pictures/pictures/variant-id/picture-id.jpg' } }],
});
${codeNode('uploaded', 'Uploaded', code('pictures-uploaded.js'), `{ ok: true, variant_id: 'variant-id', path: 'pictures/variant-id/picture-id.jpg', stand_in: false }`)}
${rpcNode('finish', 'Record the picture', 'picture_finish', '{{ JSON.stringify({ p_variant_id: $json.variant_id, p_path: $json.path, p_stand_in: $json.stand_in === true }) }}', `{ remove_picture: null }`, "\n    onError: 'continueRegularOutput',")}
${rpcNode('fail', 'Record why not', 'picture_fail', '{{ JSON.stringify({ p_variant_id: $json.variant_id, p_error: $json.error }) }}', '{}', "\n    onError: 'continueRegularOutput',")}

const pictureToRemove = ifElse({
  version: 2.3,
  config: {
    name: 'A picture no variant shows?',
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 2 },
        conditions: [{ leftValue: expr('{{ $json.remove_picture }}'), rightValue: '', operator: { type: 'string', operation: 'notEmpty', singleValue: true } }],
        combinator: 'and',
      },
    },
  },
});

const removePicture = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: {
    name: 'Remove it from Storage',
    onError: 'continueRegularOutput',
    parameters: {
      method: 'DELETE',
      url: '${SUPABASE_STORAGE}/object/ad-pictures',
      authentication: 'predefinedCredentialType',
      nodeCredentialType: 'supabaseApi',
      sendBody: true,
      contentType: 'json',
      specifyBody: 'json',
      jsonBody: expr('{{ JSON.stringify({ prefixes: [$json.remove_picture] }) }}'),
      options: { timeout: 30000 },
    },
    credentials: { supabaseApi: newCredential('Supabase QGR') },
  },
  output: [{}],
});

const noteFlow = sticky('## Pictures\\nAt once when someone asks in the studio, and every minute for the ads that asked by themselves (the team\\'s switch in Settings, Agents), the database hands over the ads waiting for a picture (**picture_take_due**, claimed so two runs never make the same one; a claim lost for ten minutes is taken again, three times at most), each with its prompt, the brand\\'s picture style, the team\\'s image model and quality, and the path to upload to. The answer is recorded (**picture_finish** or **picture_fail**): the studio shows the picture under the ad\\'s words and keeps it with the variant\\'s others to choose again, and takes an approval back, since the ad changed. Past the eight a variant keeps, the oldest it does not show is removed from Storage.', [everyMinute, makeNow, takeDue, eachAsk], { color: 4 });
const noteHiggsfield = sticky('## Higgsfield\\nWith pictures set to Higgsfield in Settings, Agents, each ask goes to **GPT Image 2.5** (square, 1k, the team\\'s quality) through Higgsfield\\'s MCP with the **Higgsfield** credential, signed in with the team\\'s own account: every picture spends the plan\\'s credits. Its price is asked first (**get_cost**, which makes nothing) and recorded against the month\\'s Higgsfield limit (**picture_higgsfield_begin**, shared with AI video); past the limit nothing is sent and the studio says why.\\n\\nA picture is sent once. Not reached at all, it waits for the next minute (three tries). Refused, nothing was made. Any other trouble after sending is **unknown**: never sent again by itself, a person checks Higgsfield\\'s history. Jobs are checked every minute (**picture_take_making**); a finished one\\'s file is fetched, typed by what it is, stored in ad-pictures and recorded (**picture_higgsfield_finish**).', [onHiggsfield, higgsRequest, higgsPricePicture, readPicturePrice, priced, begin, begun, releaseAsk, pictureRequest, makePicture, readStart, whatHappened, takeMaking, eachJob, jobStatus, readJob, howIsItGoing, download, readFile, aPicture, store, stored, inStorage, recordHiggsfield], { color: 6 });
const noteReferences = sticky('## Reference pictures\\nA run can carry up to four reference pictures the team uploaded (bucket **run-refs**). Every minute the database hands over those Higgsfield does not have yet (**reference_take_due**, claimed so two runs never take the same one; three tries at most). Each is signed for 15 minutes and given to Higgsfield (**media_import_url**, which costs nothing), and its media id is kept (**reference_ready**). Every picture and video of the run then goes with those ids as image_references; a run\\'s pictures and videos wait until its references are in. Refused, the run goes on without that one and says why (**reference_failed**); not reached, it is taken again (**reference_release**).', [takeRefs, eachRef, signRef, refLink, refLinked, importRef, readRef, refOutcome, refReady, refFailed, refRetry], { color: 2 });
const notePrice = sticky('## Price\\nSettings and the studio ask what one picture costs at a quality before any is made: **generate_image** with **get_cost**, which makes nothing, and the credits left on the plan.', [priceIt, priceRequest, higgsPrice, readPrice, higgsBalance, answer, respond], { color: 7 });
const noteCloudflare = sticky('## Cloudflare Workers AI\\nWith pictures set to Cloudflare in Settings, Agents (with the account ID there), each ask goes to **FLUX.1 schnell**: the scene, the brand\\'s picture style from brand memory, and the rules (no words, no real people, no flags), 2,048 characters at most. The picture is read by its bytes, uploaded to ad-pictures with the **Supabase QGR** credential, and recorded.\\n\\nThe token: create a **Bearer Auth** credential named **Cloudflare Workers AI** holding an API token made from Cloudflare\\'s Workers AI template, then attach it to **Cloudflare: FLUX.1 schnell**. Until then that step does not run and the studio says why.\\n\\nFree: 10,000 neurons a day, about 170 pictures at 1024×1024. On Cloudflare\\'s free plan nothing is charged: past that a picture fails and says so until 00:00 UTC.', [realPictures, writePrompt, cloudflare, readPicture, gotPicture, toFile, upload, uploaded], { color: 5 });
const noteStandIn = sticky('## Stand-in\\nThe way taken while pictures are set to the stand-in (Settings, Agents). It makes nothing and says so: the studio says no picture was made, and the variant keeps what it shows. Its output is the shape the real way answers in: { ok: true, variant_id, path, stand_in }, or { ok: false, variant_id, error }.', [imageModel], { color: 3 });

export default workflow('qgr-pictures', 'QGR · Pictures')
  .add(priceIt)
  .to(priceRequest)
  .to(higgsPrice)
  .to(readPrice)
  .to(higgsBalance)
  .to(answer)
  .to(respond)
  .add(everyMinute)
  .to(takeDue)
  .add(makeNow)
  .to(takeDue)
  .add(takeDue)
  .to(eachAsk)
  .to(onHiggsfield.onTrue(higgsRequest).onFalse(realPictures.onTrue(writePrompt.to(cloudflare).to(readPicture).to(gotPicture.onTrue(toFile.to(upload).to(uploaded).to(made)).onFalse(made))).onFalse(imageModel)))
  .add(higgsRequest)
  .to(higgsPricePicture)
  .to(readPicturePrice)
  .to(priced.onCase(0, begin.to(begun.onTrue(pictureRequest.to(makePicture).to(readStart)))).onCase(1, releaseAsk).onCase(2, fail))
  .add(readStart)
  .to(whatHappened.onCase(0, recordStarted).onCase(1, recordNotMade).onCase(2, recordRetry).onCase(3, recordUnknown))
  .add(imageModel)
  .to(made.onTrue(finish.to(pictureToRemove.onTrue(removePicture))).onFalse(fail))
  .add(everyMinute)
  .to(takeRefs)
  .add(makeNow)
  .to(takeRefs)
  .add(takeRefs)
  .to(eachRef)
  .to(signRef)
  .to(refLink)
  .to(refLinked.onTrue(importRef.to(readRef).to(refOutcome.onCase(0, refReady).onCase(1, refFailed).onCase(2, refRetry))).onFalse(refRetry))
  .add(everyMinute)
  .to(takeMaking)
  .add(makeNow)
  .to(takeMaking)
  .add(takeMaking)
  .to(eachJob)
  .to(jobStatus)
  .to(readJob)
  .to(howIsItGoing.onCase(0, download.to(readFile).to(aPicture.onCase(0, store.to(stored).to(inStorage.onTrue(recordHiggsfield.to(pictureToRemove)))).onCase(1, recordNotMade))).onCase(1, recordNotMade).onCase(2, recordUnknown))
  .add(noteFlow)
  .add(noteHiggsfield)
  .add(noteReferences)
  .add(notePrice)
  .add(noteCloudflare)
  .add(noteStandIn);
`;

// ---------------------------------------------------------------- moments

const momentsAsk = `{ long_video_id: 'video-id', title: 'EB-5 webinar', duration: 1800, guidance: null, transcript: [{ start: 0, end: 9.5, text: 'Welcome, everyone.' }], brand: { company: 'Quantum Global Residency' } }`;

const moments = `${IMPORTS}

const everyFiveMinutes = trigger({
  type: 'n8n-nodes-base.scheduleTrigger',
  version: 1.4,
  config: {
    name: 'Every five minutes',
    parameters: { rule: { interval: [{ field: 'minutes', minutesInterval: 5 }] } },
  },
  output: [{}],
});

const lookNow = trigger({
  type: 'n8n-nodes-base.webhook',
  version: 2.1,
  config: {
    name: 'Look now',
    parameters: {
      httpMethod: 'POST',
      path: 'qgr-moments',
      authentication: 'headerAuth',
      responseMode: 'onReceived',
      options: { responseCode: { values: { responseCode: 'customCode', customCode: 202 } } },
    },
    credentials: { httpHeaderAuth: newCredential('QGR webhook secret') },
  },
  output: [{ body: {} }],
});
${rpcNode('takeDue', 'Take the videos waiting', 'moments_take_due', '{{ JSON.stringify({ p_limit: 2 }) }}', momentsAsk, "\n    executeOnce: true,")}
${codeNode('eachVideo', 'One item per video', code('shared-items.js'), momentsAsk)}
${codeNode('buildRequest', 'Build the Claude request', code('moments-build-request.js'), `{ long_video_id: 'video-id', body: { model: 'claude-haiku-5-5', max_tokens: 8000 } }`)}
${claudeNode('claude', 'Claude: pick the moments')}
${codeNode('readAnswer', 'Read the moments', code('moments-read-answer.js'), `{ ok: true, p_id: 'video-id', p_moments: [{ first: 3, last: 9, title: 'Why debt is repaid first', why: 'A plain answer.', hook: 'Debt gets repaid first.', warnings: [] }], p_usage: { model: 'claude-haiku-5-5', input_tokens: 40000, output_tokens: 1500 } }`)}
${isOk('found', 'Found any?')}
${rpcNode('finish', 'Record the moments', 'moments_finish', '{{ JSON.stringify({ p_id: $json.p_id, p_moments: $json.p_moments, p_usage: $json.p_usage }) }}', '{}', "\n    onError: 'continueRegularOutput',")}
${rpcNode('fail', 'Record why not', 'moments_fail', '{{ JSON.stringify({ p_id: $json.p_id, p_error: $json.p_error, p_usage: $json.p_usage }) }}', '{}', "\n    onError: 'continueRegularOutput',")}

const noteFlow = sticky('## Moments\\nA long video is heard in the browser, on the team\\'s own computer, and never uploaded: only its transcript is kept. At once when it is saved, and every five minutes, the database hands over the long videos waiting (**moments_take_due**, claimed so two runs never take the same one; a claim lost for ten minutes is taken again, three times at most), each with its transcript, the team\\'s direction and the brand.', [everyFiveMinutes, lookNow, takeDue, eachVideo], { color: 4 });
const noteClaude = sticky('## The pick\\nHaiku 5.5 reads the transcript one numbered line at a time and names five to ten moments by their first and last line, the strongest first. Times come from the transcript, never from the model: **Read the moments** drops a moment outside the transcript, under 8 seconds, over two and a half minutes or overlapping a stronger one, and flags (never rewrites) a hook against the guardrails. The database works the times out again (**moments_finish**). The usage is kept on failure too (**moments_fail**).', [buildRequest, claude, readAnswer, found, finish, fail], { color: 5 });

export default workflow('qgr-moments', 'QGR · Moments')
  .add(everyFiveMinutes)
  .to(takeDue)
  .to(eachVideo)
  .to(buildRequest)
  .to(claude.onError(readAnswer))
  .to(readAnswer)
  .to(found.onTrue(finish).onFalse(fail))
  .add(lookNow)
  .to(takeDue)
  .add(noteFlow)
  .add(noteClaude);
`;

// ---------------------------------------------------------------- leads

const leadAsk = `{ lead_id: 'lead-id', answers: [{ field: 'Investment budget', value: '$800,000 to $1M' }], platform: 'instagram', source: 'Facebook', criteria: 'A qualified lead can invest US$800,000 within a year.', examples: [], brand: { company: 'Quantum Global Residency' } }`;

const leads = `${IMPORTS}

const everyFifteenMinutes = trigger({
  type: 'n8n-nodes-base.scheduleTrigger',
  version: 1.4,
  config: {
    name: 'Every fifteen minutes',
    parameters: { rule: { interval: [{ field: 'minutes', minutesInterval: 15 }] } },
  },
  output: [{}],
});

const readNow = trigger({
  type: 'n8n-nodes-base.webhook',
  version: 2.1,
  config: {
    name: 'Read now',
    parameters: {
      httpMethod: 'POST',
      path: 'qgr-leads',
      authentication: 'headerAuth',
      responseMode: 'onReceived',
      options: { responseCode: { values: { responseCode: 'customCode', customCode: 202 } } },
    },
    credentials: { httpHeaderAuth: newCredential('QGR webhook secret') },
  },
  output: [{ body: {} }],
});
${rpcNode('whatToRead', 'What to read', 'leads_sync_plan', '{{ JSON.stringify({}) }}', `{ on: true, api: 'https://www.zohoapis.com', since: '2026-10-19T08:30:00+00:00' }`, "\n    executeOnce: true,")}
${ifTrue('zohoOn', 'Zoho on?', '{{ $json.on === true }}')}

// The Zoho login is the "Zoho" credential (Zoho OAuth2 API, in the region the
// team's Zoho is in), attached to both Zoho steps by hand once it exists in
// n8n: a node naming a credential that does not exist fails every run.
${callNode('zohoFields', 'Zoho: the lead fields', {
  method: 'GET',
  url: "expr('{{ $json.api }}/crm/v8/settings/fields?module=Leads')",
  auth: 'zohoOAuth2Api',
  timeout: 30000,
  output: "{ statusCode: 200, body: { fields: [{ api_name: 'First_Name', field_label: 'First Name', data_type: 'text', custom_field: false }, { api_name: 'Lead_Status', field_label: 'Lead Status', data_type: 'picklist', custom_field: false }] } }",
})}
${codeNode('planRead', 'Plan the read', code('leads-plan-read.js'), `{ ok: true, since: '2026-10-19T08:30:00+00:00', url: 'https://www.zohoapis.com/crm/v8/Leads?fields=First_Name%2CLead_Status&per_page=200&sort_by=Modified_Time&sort_order=asc', answers: [], attribution: {} }`)}
${isOk('fieldsRead', 'Fields read?')}
${callNode('zohoLeads', 'Zoho: the leads', {
  method: 'GET',
  url: "expr('{{ $json.url }}')",
  auth: 'zohoOAuth2Api',
  headers: [['If-Modified-Since', "expr('{{ $json.since }}')"]],
  timeout: 60000,
  output: "{ statusCode: 200, body: { data: [{ id: '5725767000000412001', First_Name: 'Asha', Last_Name: 'Rao', Lead_Status: 'Not Contacted', Created_Time: '2026-10-19T15:00:00+05:30', Modified_Time: '2026-10-19T15:00:00+05:30' }], info: { more_records: false } } }",
})}
${codeNode('readLeads', 'Read the leads', code('leads-read-zoho.js'), `{ ok: true, leads: [{ zoho_id: '5725767000000412001', name: 'Asha Rao', platform: 'other', campaign: {}, answers: [], created: '2026-10-19T15:00:00+05:30', modified: '2026-10-19T15:00:00+05:30' }], newest: '2026-10-19T15:00:00+05:30' }`)}
${isOk('leadsRead', 'Read?')}
${rpcNode('recordLeads', 'Record the leads', 'leads_record', '{{ JSON.stringify({ p_leads: $json.leads, p_newest: $json.newest }) }}', `{ data: '1' }`, "\n    onError: 'continueRegularOutput',", true)}
${rpcNode('syncFail', 'Record why Zoho was not read', 'leads_sync_fail', '{{ JSON.stringify({ p_error: $json.error }) }}', '{}', "\n    onError: 'continueRegularOutput',")}

${rpcNode('takeDue', 'Take the leads to judge', 'leads_take_due', '{{ JSON.stringify({ p_limit: 10 }) }}', leadAsk, "\n    executeOnce: true,")}
${codeNode('eachLead', 'One item per lead', code('shared-items.js'), leadAsk)}
${codeNode('buildRequest', 'Build the Claude request', code('leads-build-request.js'), `{ lead_id: 'lead-id', body: { model: 'claude-haiku-5-5', max_tokens: 4000 } }`)}
${claudeNode('claude', 'Claude: judge the lead')}
${codeNode('readAnswer', 'Read the verdict', code('leads-read-answer.js'), `{ ok: true, p_lead_id: 'lead-id', p_verdict: 'qualified', p_reasons: [{ text: 'Can invest the minimum.', field: 'Investment budget', quote: '$800,000 to $1M' }], p_usage: { model: 'claude-haiku-5-5', input_tokens: 900, output_tokens: 140 } }`)}
${isOk('judged', 'Judged?')}
${rpcNode('finish', 'Record the verdict', 'lead_judged', '{{ JSON.stringify({ p_lead_id: $json.p_lead_id, p_verdict: $json.p_verdict, p_reasons: $json.p_reasons, p_usage: $json.p_usage }) }}', '{}', "\n    onError: 'continueRegularOutput',")}
${rpcNode('fail', 'Record why not', 'lead_judge_fail', '{{ JSON.stringify({ p_lead_id: $json.p_lead_id, p_error: $json.p_error, p_usage: $json.p_usage }) }}', '{}', "\n    onError: 'continueRegularOutput',")}

const noteRead = sticky('## Reading Zoho\\nEvery fifteen minutes, and at once when the Leads page asks, the database says whether to read Zoho, in which region, and from when (**leads_sync_plan**: the newest change already read, or the last 90 days the first time). Off until the team switches it on (Leads, Setup).\\n\\n**Plan the read** asks Zoho for the module\\'s fields and picks 50 at most: the name, status, source and times; whatever says where a lead came from (UTM tags, Meta\\'s campaign and ad, the page it first visited); then what the lead said, the team\\'s own questions first. Email addresses, phone numbers and street addresses are never asked for. **Read the leads** keeps each answer by its label and ties a lead whose link or ad names a QGR run (qgr-<run>, <label>-<place>) to that variant. **leads_record** keeps them; **leads_sync_fail** keeps why not, for the page to show.\\n\\nThe login: create a **Zoho OAuth2 API** credential named **Zoho** for the region your Zoho is in, then attach it to **Zoho: the lead fields** and **Zoho: the leads**. Until then each read says Zoho is not connected.', [everyFifteenMinutes, readNow, whatToRead, zohoOn, zohoFields, planRead, fieldsRead, zohoLeads, readLeads, leadsRead, recordLeads, syncFail], { color: 4 });
const noteJudge = sticky('## Judging\\nThe database hands over up to ten leads waiting (**leads_take_due**, claimed so two runs never judge the same one; a claim lost for ten minutes is taken again, three times at most), each with what it said (never its name), the team\\'s criteria and up to eight of the team\\'s own verdicts with their reasons. Haiku 5.5 says qualified, not qualified or can\\'t tell. **Read the verdict** keeps only the reasons that quote the lead as written; a verdict left with none becomes can\\'t tell, for a person. **lead_judged** checks the quotes again. The usage is kept on failure too (**lead_judge_fail**).', [takeDue, eachLead, buildRequest, claude, readAnswer, judged, finish, fail], { color: 5 });

export default workflow('qgr-leads', 'QGR · Leads')
  .add(everyFifteenMinutes)
  .to(whatToRead)
  .to(zohoOn.onTrue(zohoFields.to(planRead).to(fieldsRead.onTrue(zohoLeads.to(readLeads).to(leadsRead.onTrue(recordLeads).onFalse(syncFail))).onFalse(syncFail))).onFalse(takeDue))
  .add(recordLeads)
  .to(takeDue)
  .add(syncFail)
  .to(takeDue)
  .add(takeDue)
  .to(eachLead)
  .to(buildRequest)
  .to(claude.onError(readAnswer))
  .to(readAnswer)
  .to(judged.onTrue(finish).onFalse(fail))
  .add(readNow)
  .to(whatToRead)
  .add(noteRead)
  .add(noteJudge);
`;

// ---------------------------------------------------------------- AI video

const videoAsk = `{ id: 'video-id', prompt: 'A slow drone shot over a quiet suburb at golden hour.', model: 'seedance_2_0_mini', seconds: 4, aspect: '9:16', quality: '480p', sound: false, picture_path: null, look: null, live: false, path: 'videos/video-id.mp4' }`;
const videoJob = `{ id: 'video-id', job_id: 'job-id', path: 'videos/video-id.mp4' }`;
const video = `${IMPORTS}

const everyMinute = trigger({
  type: 'n8n-nodes-base.scheduleTrigger',
  version: 1.4,
  config: {
    name: 'Every minute',
    parameters: { rule: { interval: [{ field: 'minutes', minutesInterval: 1 }] } },
  },
  output: [{}],
});

const makeNow = trigger({
  type: 'n8n-nodes-base.webhook',
  version: 2.1,
  config: {
    name: 'Make now',
    parameters: {
      httpMethod: 'POST',
      path: 'qgr-video',
      authentication: 'headerAuth',
      responseMode: 'onReceived',
      options: { responseCode: { values: { responseCode: 'customCode', customCode: 202 } } },
    },
    credentials: { httpHeaderAuth: newCredential('QGR webhook secret') },
  },
  output: [{ body: {} }],
});

const priceIt = trigger({
  type: 'n8n-nodes-base.webhook',
  version: 2.1,
  config: {
    name: 'Price',
    parameters: {
      httpMethod: 'POST',
      path: 'qgr-video-price',
      authentication: 'headerAuth',
      responseMode: 'responseNode',
      options: {},
    },
    credentials: { httpHeaderAuth: newCredential('QGR webhook secret') },
  },
  output: [{ body: { model: 'seedance_2_0_mini', seconds: 4, aspect: '9:16', quality: '480p', sound: false } }],
});

// ---- the price, asked before anyone presses Generate
${codeNode('priceRequest', 'Price request', videoCode('video-quote-request.js', ['video-params.js']), `{ quote_input: '{"params":{"model":"seedance_2_0_mini","get_cost":true},"get_cost":true}' }`)}
${higgsfieldNode('higgsPrice', 'Higgsfield: price', 'generate_video', '{{ $json.quote_input }}', `{ structuredContent: { cost: { credits: 2, credits_exact: 2 } }, content: [{ type: 'text', text: 'Cost preflight for seedance_2_0_mini: 2 credits (2 exact). No job submitted.' }] }`)}
${asWrittenNodes('price', { decline: 'Decline a preset (price)', branch: 'As written? (price)', call: 'Higgsfield: price, as written' }, 'generate_video', 'Price request', 'quote_input', `{ structuredContent: { cost: { credits: 2, credits_exact: 2 } }, content: [{ type: 'text', text: 'Cost preflight for seedance_2_0_mini: 2 credits (2 exact). No job submitted.' }] }`)}
${codeNode('readPrice', 'Read the price', videoCode('video-read-quote.js'), `{ ok: true, credits: 2 }`)}
${higgsfieldNode('higgsBalance', 'Higgsfield: credits left', 'balance', '{}', `{ structuredContent: { credits: 280, subscription_plan_type: 'starter' }, content: [{ type: 'text', text: 'Credits: 280 | Plan: starter' }] }`, "\n    executeOnce: true,")}
${codeNode('answer', 'The answer', videoCode('video-answer.js'), `{ ok: true, credits: 2, balance: 280 }`)}

const respond = node({
  type: 'n8n-nodes-base.respondToWebhook',
  version: 1.5,
  config: {
    name: 'Answer the page',
    parameters: { respondWith: 'json', responseBody: expr('{{ JSON.stringify($json) }}'), options: {} },
  },
  output: [{}],
});

// ---- a prompt from what is said around a point of a video being edited (Claude, never Higgsfield: nothing is made)
const writeIt = trigger({
  type: 'n8n-nodes-base.webhook',
  version: 2.1,
  config: {
    name: 'Write a prompt',
    parameters: {
      httpMethod: 'POST',
      path: 'qgr-video-prompt',
      authentication: 'headerAuth',
      responseMode: 'responseNode',
      options: {},
    },
    credentials: { httpHeaderAuth: newCredential('QGR webhook secret') },
  },
  output: [{ body: { long_video_id: null, at: 182, seconds: 5, aspect: '16:9', mode: 'cover', idea: '', lines: [{ start: 180, end: 184, text: 'Many of our families send a child to study in the U.S.' }], brand: { company: 'Quantum Global Residency', guardrails: [], look: null } } }],
});
${codeNode('buildPrompt', 'Build the prompt request', code('video-prompt-build-request.js'), `{ long_video_id: null, body: { model: 'claude-haiku-5-5', max_tokens: 1200 } }`)}
${claudeNode('claudePrompt', 'Claude: write the prompt')}
${codeNode('readPrompt', 'Read the prompt', code('video-prompt-read-answer.js'), `{ ok: true, prompt: 'A student walks across a sunny U.S. campus, seen from behind.', why: 'They talk about studying in the U.S.', long_video_id: null, model: 'claude-haiku-5-5', usage: { input_tokens: 900, output_tokens: 120 } }`)}
${rpcNode('promptUsed', 'Record what it cost', 'video_prompt_used', '{{ JSON.stringify({ p_long_video_id: $json.long_video_id, p_model: $json.model, p_usage: $json.usage }) }}', '{}', "\n    onError: 'continueRegularOutput',")}
${codeNode('promptAnswer', 'The prompt', code('video-prompt-answer.js'), `{ ok: true, prompt: 'A student walks across a sunny U.S. campus, seen from behind.', why: 'They talk about studying in the U.S.' }`)}

const respondPrompt = node({
  type: 'n8n-nodes-base.respondToWebhook',
  version: 1.5,
  config: {
    name: 'Answer the editor',
    parameters: { respondWith: 'json', responseBody: expr('{{ JSON.stringify($json) }}'), options: {} },
  },
  output: [{}],
});

// ---- the asks: sent once
${rpcNode('takeDue', 'Take the videos asked for', 'video_take_due', '{{ JSON.stringify({ p_limit: 3 }) }}', videoAsk, "\n    executeOnce: true,")}
${codeNode('eachAsk', 'One item per video', code('shared-items.js'), videoAsk)}
${ifTrue('forReal', 'Make it for real?', '{{ $json.live === true }}')}
${codeNode('standIn', 'Higgsfield (stand-in)', code('video-stand-in.js'), `{ kind: 'stand_in', id: 'video-id' }`)}
${rpcNode('recordStandIn', 'Record: nothing made', 'video_finish', '{{ JSON.stringify({ p_id: $json.id, p_path: null, p_stand_in: true }) }}', '{}', "\n    onError: 'continueRegularOutput',")}
${ifTrue('firstPicture', 'A first picture?', '{{ typeof $json.picture_path === "string" && $json.picture_path.length > 0 }}')}
${callNode('signPicture', 'Sign the first picture', {
  method: 'POST',
  url: `expr('${SUPABASE_STORAGE}/object/sign/video-refs/{{ $json.picture_path }}')`,
  auth: 'supabaseApi',
  json: '{{ JSON.stringify({ expiresIn: 900 }) }}',
  timeout: 30000,
  credentials: "{ supabaseApi: newCredential('Supabase QGR') }",
  output: `{ statusCode: 200, body: { signedURL: '/object/sign/video-refs/refs/user-id/picture-id.jpg?token=t' } }`,
})}
${codeNode('pictureLink', 'Picture link', code('video-picture-link.js'), `{ id: 'video-id', url: '${SUPABASE_STORAGE}/object/sign/video-refs/refs/user-id/picture-id.jpg?token=t' }`)}
${ifTrue('linkMade', 'Link made?', '{{ typeof $json.url === "string" && $json.url.length > 0 }}')}
${higgsfieldNode('importPicture', 'Higgsfield: take the picture', 'media_import_url', '{{ JSON.stringify({ url: $json.url }) }}', `{ structuredContent: { media_id: 'media-id' } }`)}
${codeNode('readMedia', 'Read the picture\'s id', videoCode('video-read-media.js'), `{ kind: 'go', id: 'video-id', media_id: 'media-id' }`)}
${ifTrue('pictureTaken', 'Picture taken?', '{{ $json.kind === "go" }}')}
${codeNode('writeRequest', 'Write the request', videoCode('video-build-request.js', ['video-params.js']), `{ id: 'video-id', generate_input: '{"params":{"model":"seedance_2_0_mini"}}' }`)}
${higgsfieldNode('makeIt', 'Higgsfield: make it', 'generate_video', '{{ $json.generate_input }}', `{ structuredContent: { job_id: 'job-id' } }`)}
${asWrittenNodes('make', { decline: 'Decline a preset', branch: 'As written?', call: 'Higgsfield: make it, as written' }, 'generate_video', 'Write the request', 'generate_input', `{ structuredContent: { job_id: 'job-id' } }`)}
${codeNode('readStart', 'Read the answer', videoCode('video-read-start.js'), `{ kind: 'started', id: 'video-id', job_id: 'job-id', credits: null }`)}
${codeNode('writeRequestPicture', 'Write the request (picture)', videoCode('video-build-request.js', ['video-params.js']), `{ id: 'video-id', generate_input: '{"params":{"model":"kling3_0"}}' }`)}
${higgsfieldNode('makeItPicture', 'Higgsfield: make it (picture)', 'generate_video', '{{ $json.generate_input }}', `{ structuredContent: { job_id: 'job-id' } }`)}
${asWrittenNodes('makePicture', { decline: 'Decline a preset (picture)', branch: 'As written? (picture)', call: 'Higgsfield: make it (picture), as written' }, 'generate_video', 'Write the request (picture)', 'generate_input', `{ structuredContent: { job_id: 'job-id' } }`)}
${codeNode('readStartPicture', 'Read the answer (picture)', code(['video-mcp.js', 'video-read-start.js'], { "$('Write the request')": "$('Write the request (picture)')" }), `{ kind: 'started', id: 'video-id', job_id: 'job-id', credits: null }`)}
${routeNode('whatHappened', 'What happened?', [
  ['started', '{{ $json.kind === "started" }}'],
  ['refused', '{{ $json.kind === "refused" }}'],
  ['retry', '{{ $json.kind === "retry" }}'],
  ['unknown', '{{ $json.kind === "unknown" }}'],
])}
${rpcNode('recordStarted', 'Record: started', 'video_started', '{{ JSON.stringify(Object.assign({ p_id: $json.id, p_job_id: $json.job_id }, typeof $json.credits === "number" ? { p_credits: $json.credits } : {})) }}', '{}', "\n    onError: 'continueRegularOutput',")}
${rpcNode('recordFailed', 'Record: not made', 'video_fail', '{{ JSON.stringify({ p_id: $json.id, p_error: $json.error }) }}', '{}', "\n    onError: 'continueRegularOutput',")}
${rpcNode('recordRetry', 'Record: try again', 'video_release', '{{ JSON.stringify({ p_id: $json.id, p_error: $json.error }) }}', '{}', "\n    onError: 'continueRegularOutput',")}
${rpcNode('recordUnknown', 'Record: may have been made', 'video_unknown', '{{ JSON.stringify({ p_id: $json.id, p_error: $json.error }) }}', '{}', "\n    onError: 'continueRegularOutput',")}

// ---- the jobs: checked until their video is stored
${rpcNode('takeMaking', 'Take the videos being made', 'video_take_making', '{{ JSON.stringify({ p_limit: 10 }) }}', videoJob, "\n    executeOnce: true,")}
${codeNode('eachJob', 'One item per job', code('shared-items.js'), videoJob)}
${higgsfieldNode('jobStatus', 'Higgsfield: how is it going?', 'job_status', '{{ JSON.stringify({ jobId: $json.job_id }) }}', `{ structuredContent: { status: 'completed', results: [{ url: 'https://cdn.higgsfield.ai/job-id/video.mp4' }] } }`)}
${codeNode('readJob', 'Read the job', videoCode('video-read-job.js'), `{ kind: 'done', id: 'video-id', path: 'videos/video-id.mp4', url: 'https://cdn.higgsfield.ai/job-id/video.mp4' }`)}
${routeNode('howIsItGoing', 'How is it going?', [
  ['done', '{{ $json.kind === "done" }}'],
  ['failed', '{{ $json.kind === "failed" }}'],
  ['unknown', '{{ $json.kind === "unknown" }}'],
])}
${callNode('download', 'Fetch the video', { method: 'GET', url: "expr('{{ $json.url }}')", timeout: 180000, file: true, output: '{}' })}
${callNode('upload', 'Upload to Storage', {
  method: 'POST',
  url: `expr('${SUPABASE_STORAGE}/object/ai-videos/{{ $("Read the job").item.json.path }}')`,
  auth: 'supabaseApi',
  headers: [['Content-Type', "'video/mp4'"], ['x-upsert', "'true'"]],
  binary: true,
  timeout: 180000,
  credentials: "{ supabaseApi: newCredential('Supabase QGR') }",
  output: `{ statusCode: 200, body: { Key: 'ai-videos/videos/video-id.mp4' } }`,
})}
${codeNode('uploaded', 'Stored?', code('video-uploaded.js'), `{ kind: 'stored', id: 'video-id', path: 'videos/video-id.mp4' }`)}
${ifTrue('stored', 'In Storage?', '{{ $json.kind === "stored" }}')}
${rpcNode('recordReady', 'Record: ready', 'video_finish', '{{ JSON.stringify({ p_id: $json.id, p_path: $json.path }) }}', '{}', "\n    onError: 'continueRegularOutput',")}

const noteFlow = sticky('## AI video\\nThe team asks on the AI video page. **Price** answers the page with Higgsfield\\'s price for the request (generate_video with **get_cost**, which makes nothing) and the credits left on the plan. Every minute, and at once when someone asks, the asks waiting (**video_take_due**, each sent once) go to Higgsfield, and the jobs being made (**video_take_making**) are checked until their video can be fetched, stored in ai-videos and recorded.', [everyMinute, makeNow, priceIt, takeDue, eachAsk, takeMaking, eachJob], { color: 4 });
const noteHiggsfield = sticky('## Higgsfield\\nCalled through its MCP (**mcp.higgsfield.ai**) with the **Higgsfield** credential (MCP OAuth2 API), signed in with the team\\'s own Higgsfield account: every video spends the plan\\'s credits, even on an Unlimited plan, and the team\\'s monthly limit in Settings holds them. A first picture is signed for 15 minutes and imported first (**media_import_url**).\\n\\nAn ask is sent once. Not reached at all, it waits for the next minute (three tries). Refused, nothing was made. Any other trouble after sending is **unknown**: never sent again by itself (Higgsfield: do not automatically resubmit), a person checks Higgsfield\\'s history.\\n\\nHiggsfield may offer one of its presets in place of the prompt: nothing is priced or made, so it is declined and the request asked once more as written (**declined_preset_id**). Offered again, nothing was made and the page says so.', [forReal, firstPicture, signPicture, pictureLink, linkMade, importPicture, readMedia, pictureTaken, writeRequest, makeIt, makeDecline, makeAsWritten, makeAgain, readStart, writeRequestPicture, makeItPicture, makePictureDecline, makePictureAsWritten, makePictureAgain, readStartPicture, whatHappened], { color: 5 });
const noteStandIn = sticky('## Stand-in\\nThe way taken while AI video is not switched on (Settings, AI video). Nothing is sent and nothing is spent: the page says no video was made and where to switch it on.', [standIn, recordStandIn], { color: 3 });
const notePrompt = sticky('## Write a prompt\\nThe video editor\\'s "Write it from what\\'s said here": the lines said around the playhead (and the team\\'s idea, if any) go to **Haiku 5.5** at low effort, which drafts one shot for an AI video that is inserted there or plays over the talk. People never with a face shown, no words or flags, no promised outcome. Nothing is sent to Higgsfield and nothing is made: the person reads the draft, sees Higgsfield\\'s price and presses Generate. What the call cost is kept (**video_prompt_used**), answered or not.', [writeIt, buildPrompt, claudePrompt, readPrompt, promptUsed, promptAnswer, respondPrompt], { color: 5 });

export default workflow('qgr-ai-video', 'QGR · AI video')
  .add(priceIt)
  .to(priceRequest)
  .to(higgsPrice)
  .to(priceDecline)
  .to(priceAsWritten.onTrue(priceAgain.to(readPrice)).onFalse(readPrice))
  .add(readPrice)
  .to(higgsBalance)
  .to(answer)
  .to(respond)
  .add(everyMinute)
  .to(takeDue)
  .add(makeNow)
  .to(takeDue)
  .add(takeDue)
  .to(eachAsk)
  .to(forReal.onTrue(firstPicture.onTrue(signPicture.to(pictureLink).to(linkMade.onTrue(importPicture.to(readMedia).to(pictureTaken.onTrue(writeRequestPicture.to(makeItPicture).to(makePictureDecline).to(makePictureAsWritten.onTrue(makePictureAgain.to(readStartPicture)).onFalse(readStartPicture))).onFalse(whatHappened))).onFalse(whatHappened))).onFalse(writeRequest.to(makeIt).to(makeDecline).to(makeAsWritten.onTrue(makeAgain.to(readStart)).onFalse(readStart)))).onFalse(standIn.to(recordStandIn)))
  .add(readStartPicture)
  .to(whatHappened)
  .add(readStart)
  .to(whatHappened.onCase(0, recordStarted).onCase(1, recordFailed).onCase(2, recordRetry).onCase(3, recordUnknown))
  .add(everyMinute)
  .to(takeMaking)
  .add(makeNow)
  .to(takeMaking)
  .add(takeMaking)
  .to(eachJob)
  .to(jobStatus)
  .to(readJob)
  .to(howIsItGoing.onCase(0, download.to(upload).to(uploaded).to(stored.onTrue(recordReady))).onCase(1, recordFailed).onCase(2, recordUnknown))
  .add(writeIt)
  .to(buildPrompt)
  .to(claudePrompt.onError(readPrompt))
  .to(readPrompt)
  .to(promptUsed)
  .to(promptAnswer)
  .to(respondPrompt)
  .add(noteFlow)
  .add(noteHiggsfield)
  .add(noteStandIn)
  .add(notePrompt);
`;

mkdirSync(join(here, 'workflows'), { recursive: true });
for (const [name, src] of Object.entries({ tracker, strategist, content, pipeline, publisher, scans, results, pictures, moments, leads, video })) {
  writeFileSync(join(here, 'workflows', `${name}.sdk.js`), src);
  console.log(name, src.length);
}
