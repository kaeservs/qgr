// Builds the n8n Workflow SDK source for the eight QGR workflows from the
// Code-node scripts in ./code (tested by code.test.ts, pipeline.test.ts and
// publisher.test.ts). The output in ./workflows is what gets validated and
// saved to n8n through its MCP server. Scripts are embedded with
// JSON.stringify so their backslashes survive.
//
//   node n8n/build-workflows.mjs [--ids=tracker=ID,strategist=ID,content=ID,pipeline=ID]

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const code = (file, swap = {}) => {
  let src = readFileSync(join(here, 'code', file), 'utf8');
  for (const [k, v] of Object.entries(swap)) src = src.replaceAll(k, v);
  return JSON.stringify(src);
};
const idsArg = process.argv.find((a) => a.startsWith('--ids='))?.slice(6) ?? '';
const ids = Object.fromEntries(idsArg.split(',').filter(Boolean).map((p) => p.split('=')));

const SUPABASE_RPC = 'https://tcinsdexwvzpznqlcpww.supabase.co/rest/v1/rpc';
const SUPABASE_STORAGE = 'https://tcinsdexwvzpznqlcpww.supabase.co/storage/v1';
/** Apify's Facebook Ads Library Scraper, run and answered in one call. */
const APIFY_ACTOR = 'https://api.apify.com/v2/acts/apify~facebook-ads-scraper';
const IMPORTS = "import { workflow, node, trigger, sticky, newCredential, ifElse, switchCase, expr } from '@n8n/workflow-sdk';";

// ---------------------------------------------------------------- shared pieces

const rpcNode = (varName, name, fn, body, output, extra = '') => `
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
      options: { timeout: 30000 },
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
  output: [{ model: 'claude-opus-5-5', stop_reason: 'end_turn', content: [{ type: 'text', text: '{}' }], usage: { input_tokens: 5000, output_tokens: 1500 } }],
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
        conditions: [{ leftValue: expr('{{ $json.data ?? $json.pipeline_next }}'), rightValue: true, operator: { type: 'boolean', operation: 'true', singleValue: true } }],
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
${codeNode('plan', 'Plan the scan', code('tracker-plan.js'), `{ runId: 'run-id', input: 'website', url: 'https://example.com/', domain: 'example.com', competitorHint: 'example', websiteText: 'Example', files: [], platforms: ['meta'], adsSource: 'sample', library: null }`, "\n    onError: 'continueErrorOutput',")}
${ifTrue('realAds', 'Real ads?', '{{ $json.adsSource === "apify" }}')}

const apify = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: {
    name: 'Apify: their Meta ads',
    onError: 'continueErrorOutput',
    alwaysOutputData: true,
    parameters: {
      method: 'POST',
      url: '${APIFY_ACTOR}/run-sync-get-dataset-items',
      authentication: 'genericCredentialType',
      genericAuthType: 'httpTemplatedCustomAuth',
      sendQuery: true,
      queryParameters: { parameters: [{ name: 'timeout', value: '240' }, { name: 'maxItems', value: '60' }] },
      sendBody: true,
      contentType: 'json',
      specifyBody: 'json',
      jsonBody: expr('{{ JSON.stringify({ startUrls: [{ url: $json.library.url }], resultsLimit: 60, activeStatus: "active" }) }}'),
      options: { timeout: 300000 },
    },
    credentials: { httpTemplatedCustomAuth: newCredential('Apify token') },
  },
  output: [{ adArchiveID: '1234567890', pageName: 'Example Visa Partners', isActive: true, startDate: 1754000000, snapshot: { body: { text: 'Hook' }, ctaText: 'Book now', displayFormat: 'VIDEO' } }],
});
${codeNode('apifyAds', "Read Apify's ads", code('tracker-apify-ads.js'), `{ runId: 'run-id', dataSource: 'apify', ads: [] }`, "\n    onError: 'continueErrorOutput',")}
${codeNode('sampleAds', 'Sample ads', code('tracker-placeholder-ads.js'), `{ runId: 'run-id', dataSource: 'placeholder', ads: [] }`)}
${codeNode('prepareAds', 'Prepare the ads', code('tracker-prepare-ads.js'), `{ runId: 'run-id', dataSource: 'placeholder', ads: [{ id: 'a1', platform: 'meta', format: 'video', days_running: 63, text: 'Hook', hook_line: 'Hook' }] }`, "\n    onError: 'continueErrorOutput',")}
${codeNode('buildRequest', 'Build the Claude request', code('tracker-build-request.js'), `{ body: { model: 'claude-opus-5-5', max_tokens: 16000 } }`, "\n    onError: 'continueErrorOutput',")}
${claudeNode('claude', 'Claude: read the ads')}
${codeNode('readAnswer', "Read Claude's answer", code('tracker-read-answer.js'), `{ ok: true, p_run_id: 'run-id', p_report: { hooks: [] }, p_usage: { model: 'claude-opus-5-5' } }`, "\n    onError: 'continueErrorOutput',")}
${isOk('answerOk', 'Report ready?')}
${rpcNode('save', 'Save the report', 'agent_finish_tracker', '{{ JSON.stringify({ p_run_id: $json.p_run_id, p_report: $json.p_report, p_usage: $json.p_usage }) }}', `{ data: 'report-id' }`, "\n    onError: 'continueErrorOutput',")}
${failTail('tracker')}

const noteWebsite = sticky('## Their website\\nThe app read it when the run started (it checks the link is a public site, on every redirect) and stored it with the run. **Plan the scan** takes the page\\'s words from there: n8n never fetches a link someone pasted.', [plan], { color: 4 });
const noteApify = sticky('## Their ads: sample, or Apify\\n**Real ads?** follows the team\\'s choice in Settings, Agents. **Sample ads** are the same examples for every competitor, and the report says so.\\n\\nWith Apify on, Apify\\'s Facebook Ads Library Scraper reads the page of Meta\\'s Ad Library the plan names: the link pasted, or a search for the competitor\\'s name. **Read Apify\\'s ads** keeps their own ads and reads each field whichever way the actor names it. It needs the **Apify token** credential (Templated Custom Auth, the header Authorization: Bearer {{api_key}}, with the token as api_key); without it a scan stops and says why.', [realAds, apify, apifyAds, sampleAds], { color: 3 });
const noteNumbers = sticky('## Numbers come from the data\\nClaude groups ads into hooks by id and names each ad\\'s angle. Days running, versions and angle counts are computed in code from the ads, never taken from the model.', [prepareAds, readAnswer], { color: 5 });
const noteModel = sticky('## Claude\\nOpus 5.5, medium effort, JSON constrained by a schema, server-side fallback on a refusal. No temperature: Opus 5.5 rejects it. Usage is saved with every result.', [buildRequest, claude], { color: 6 });

export default workflow('qgr-competitor-tracker', 'QGR · Competitor Tracker')
  .add(start)
  .to(begin.onError(couldNotStart))
  .to(plan.onError(whyFailed))
  .to(realAds.onTrue(apify.onError(whyFailed)).onFalse(sampleAds))
  .add(apify)
  .to(apifyAds.onError(whyFailed))
  .to(prepareAds.onError(whyFailed))
  .to(buildRequest.onError(whyFailed))
  .to(claude.onError(whyFailed))
  .to(readAnswer.onError(whyFailed))
  .to(answerOk.onTrue(save.onError(whyFailed).to(done)).onFalse(whyFailed))
  .add(sampleAds)
  .to(prepareAds)
  .add(whyFailed)
  .to(markFailed)
  .to(failed)
  .add(noteWebsite)
  .add(noteApify)
  .add(noteNumbers)
  .add(noteModel);
`;

// ---------------------------------------------------------------- strategist

const strategist = `${IMPORTS}
${subTrigger}
${beginNode('strategist')}
${codeNode('plan', 'Gather the material', code('strategist-plan.js'), `{ runId: 'run-id', run: ${sampleRun}, brand: { guardrails: [] }, report: null, page: null, clip: null, sourceText: '', sourceLabel: 'Podcast · Ep. 1' }`, "\n    onError: 'continueErrorOutput',")}
${codeNode('buildRequest', 'Build the Claude request', code('strategist-build-request.js'), `{ body: { model: 'claude-opus-5-5', max_tokens: 16000 } }`, "\n    onError: 'continueErrorOutput',")}
${claudeNode('claude', 'Claude: write the strategy')}
${codeNode('readAnswer', "Read Claude's answer", code('strategist-read-answer.js'), `{ ok: true, p_run_id: 'run-id', p_strategy: { angles: [] }, p_usage: { model: 'claude-opus-5-5' } }`, "\n    onError: 'continueErrorOutput',")}
${isOk('answerOk', 'Strategy ready?')}
${rpcNode('save', 'Save the strategy', 'agent_finish_strategist', '{{ JSON.stringify({ p_run_id: $json.p_run_id, p_strategy: $json.p_strategy, p_usage: $json.p_usage }) }}', `{ data: 'strategy-id' }`, "\n    onError: 'continueErrorOutput',")}
${failTail('strategist')}

const noteSource = sticky('## Custom runs\\nA blog post, podcast or video link was read by the app when the run started and stored with the run. A podcast or video page has **no transcript**: the strategist is told so. An uploaded clip comes with the words said in it: its transcript, read over by the team, or what they typed. Pasted text is used as it is.\\n\\n## What worked\\nThe material carries how the team\\'s own recent posts did (**QGR · Post results**), ranked by engagement per person reached, worked out in code. Without any, the request is exactly as before.', [plan], { color: 3 });
const noteModel = sticky('## Claude\\nOpus 5.5, high effort: the strategy is the judgement the rest of the run depends on. Budget shares are made to add up to 100 in code, and the brand guardrails always lead.', [buildRequest, claude, readAnswer], { color: 6 });

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
${codeNode('buildRequest', 'Build the Claude request', code('content-build-request.js'), `{ body: { model: 'claude-opus-5-5', max_tokens: 16000 } }`, "\n    onError: 'continueErrorOutput',")}
${claudeNode('claude', 'Claude: write the ads')}
${codeNode('readAnswer', "Read Claude's answer", code('content-read-answer.js'), `{ ok: true, p_run_id: 'run-id', p_ad_set: { title: 'Q4', variants: [] }, p_usage: { model: 'claude-opus-5-5' } }`, "\n    onError: 'continueErrorOutput',")}
${isOk('answerOk', 'Ads ready?')}
${rpcNode('save', 'Save the ads', 'agent_finish_content', '{{ JSON.stringify({ p_run_id: $json.p_run_id, p_ad_set: $json.p_ad_set, p_usage: $json.p_usage }) }}', `{ data: 'ad-set-id' }`, "\n    onError: 'continueErrorOutput',")}
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
${rpcNode('askStrategist', 'Start the strategist now?', 'pipeline_next', '{{ JSON.stringify({ p_run_id: $("Read the request").first().json.runId, p_stage: "strategist" }) }}', '{ data: true }')}
${rpcNode('askContent', 'Write the ads now?', 'pipeline_next', '{{ JSON.stringify({ p_run_id: $("Read the request").first().json.runId, p_stage: "content" }) }}', '{ data: true }')}
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
${rpcNode('takeDue', 'Take the posts that are due', 'publisher_take_due', '{{ JSON.stringify({ p_limit: 10 }) }}', `{ post_id: 'post-id', place: 'facebook', text: 'Plan your EB-5 path.', media_path: 'posts/user/file.jpg', media_kind: 'image', page: { id: '1234567890', name: 'Quantum Global' } }`, "\n    executeOnce: true,")}
${codeNode('eachPlace', 'One item per place', code('shared-items.js'), `{ post_id: 'post-id', place: 'facebook', text: 'Plan your EB-5 path.', media_path: 'posts/user/file.jpg', media_kind: 'image', page: { id: '1234567890', name: 'Quantum Global' } }`)}

const wherePost = switchCase({
  version: 3.4,
  config: {
    name: 'Which place?',
    parameters: {
      mode: 'rules',
      rules: {
        values: [
          { outputKey: 'facebook', conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 }, conditions: [{ leftValue: expr('{{ $json.place }}'), rightValue: 'facebook', operator: { type: 'string', operation: 'equals' } }], combinator: 'and' } },
          { outputKey: 'instagram', conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 }, conditions: [{ leftValue: expr('{{ $json.place }}'), rightValue: 'instagram', operator: { type: 'string', operation: 'equals' } }], combinator: 'and' } },
          { outputKey: 'linkedin', conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 }, conditions: [{ leftValue: expr('{{ $json.place }}'), rightValue: 'linkedin', operator: { type: 'string', operation: 'equals' } }], combinator: 'and' } },
        ],
      },
      options: {},
    },
  },
});
${placeNode('facebook', 'facebook', 'Facebook')}
${placeNode('instagram', 'instagram', 'Instagram')}
${placeNode('linkedin', 'linkedin', 'LinkedIn')}
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

const noteFlow = sticky('## Posting\\nEvery minute, and at once when the dashboard sends a post now, the database hands over the places that are due (**publisher_take_due**, never the same one twice). Each goes to its place, and the result is recorded. A file goes from Storage once no post needs it: the platform keeps its own copy. A send cut off halfway is marked *check the Page* and never sent again by itself.', [everyMinute, postNow, takeDue, eachPlace], { color: 4 });
const noteStandIns = sticky('## Stand-ins until the keys are in\\nThese three post nothing and say so. Each is replaced by real steps with the same output (see the note in its code):\\n- **Facebook**: POST /{page-id}/photos (url, message) or /{page-id}/videos (file_url, description) with a Page access token.\\n- **Instagram**: POST /{ig-user-id}/media (image_url or video_url with media_type REELS, caption), wait for status FINISHED, then POST /{ig-user-id}/media_publish.\\n- **LinkedIn**: initializeUpload on /rest/images or /rest/videos, PUT the file, then POST /rest/posts as urn:li:organization:{id}.\\nThe file goes to Meta as a link Storage signs for a few minutes; LinkedIn is sent the bytes.', [facebook, instagram, linkedin], { color: 3 });

export default workflow('qgr-publisher', 'QGR · Publisher')
  .add(everyMinute)
  .to(takeDue)
  .to(eachPlace)
  .to(wherePost
    .onCase(0, facebook)
    .onCase(1, instagram)
    .onCase(2, linkedin))
  .add(postNow)
  .to(takeDue)
  .add(facebook)
  .to(wentOut.onTrue(finish.to(fileToRemove.onTrue(removeFile))).onFalse(fail))
  .add(instagram)
  .to(wentOut)
  .add(linkedin)
  .to(wentOut)
  .add(noteFlow)
  .add(noteStandIns);
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

const resultsNode = (varName, place, label) =>
  codeNode(varName, `${label} results (stand-in)`, code('results-stand-in.js', { __PLACE_NAME__: label }), `{ ok: true, post_id: 'post-id', place: '${place}', results: null, stand_in: true }`);

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

const whichPlace = switchCase({
  version: 3.4,
  config: {
    name: 'Which place?',
    parameters: {
      mode: 'rules',
      rules: {
        values: [
          { outputKey: 'facebook', conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 }, conditions: [{ leftValue: expr('{{ $json.place }}'), rightValue: 'facebook', operator: { type: 'string', operation: 'equals' } }], combinator: 'and' } },
          { outputKey: 'instagram', conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 }, conditions: [{ leftValue: expr('{{ $json.place }}'), rightValue: 'instagram', operator: { type: 'string', operation: 'equals' } }], combinator: 'and' } },
          { outputKey: 'linkedin', conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 }, conditions: [{ leftValue: expr('{{ $json.place }}'), rightValue: 'linkedin', operator: { type: 'string', operation: 'equals' } }], combinator: 'and' } },
        ],
      },
      options: {},
    },
  },
});
${resultsNode('facebook', 'facebook', 'Facebook')}
${resultsNode('instagram', 'instagram', 'Instagram')}
${resultsNode('linkedin', 'linkedin', 'LinkedIn')}
${ifTrue('gotNumbers', 'Numbers back?', '{{ $json.ok === true && $json.results !== null && typeof $json.results === "object" }}')}
${ifTrue('refused', 'Refused?', '{{ $json.ok === false }}')}
${rpcNode('record', 'Record the numbers', 'results_record', '{{ JSON.stringify({ p_post_id: $json.post_id, p_place: $json.place, p_results: $json.results }) }}', '{}', "\n    onError: 'continueRegularOutput',")}
${rpcNode('recordWhy', 'Record why not', 'results_fail', '{{ JSON.stringify({ p_post_id: $json.post_id, p_place: $json.place, p_error: $json.error }) }}', '{}', "\n    onError: 'continueRegularOutput',")}

const noteFlow = sticky('## Results\\nEvery six hours the database hands over the posts that went out for real in the last four weeks and were not read in the last six hours (**results_take_due**). Each place is asked for its numbers, which are recorded as counts (**results_record**). If a platform refuses, the reason is kept beside the last numbers (**results_fail**). A stand-in post has none: nothing was posted.', [everySixHours, takeDue, eachPlace], { color: 4 });
const noteStandIns = sticky('## Stand-ins until the keys are in\\nThese read nothing. Each is replaced by a request with the same output, using the same tokens as the publisher (check the metric names against each platform\\'s current docs):\\n- **Facebook**: the post\\'s insights (reach, views, reactions, clicks) and its comments and shares.\\n- **Instagram**: the media\\'s insights (reach, views, likes, comments, shares). A feed post has no clicks: null.\\n- **LinkedIn**: organizationalEntityShareStatistics for the share (unique impressions, impressions, likes, comments, shares, clicks).', [facebook, instagram, linkedin], { color: 3 });

export default workflow('qgr-post-results', 'QGR · Post results')
  .add(everySixHours)
  .to(takeDue)
  .to(eachPlace)
  .to(whichPlace
    .onCase(0, facebook)
    .onCase(1, instagram)
    .onCase(2, linkedin))
  .add(facebook)
  .to(gotNumbers.onTrue(record).onFalse(refused.onTrue(recordWhy)))
  .add(instagram)
  .to(gotNumbers)
  .add(linkedin)
  .to(gotNumbers)
  .add(noteFlow)
  .add(noteStandIns);
`;

// ---------------------------------------------------------------- pictures

const pictureAsk = `{ variant_id: 'variant-id', label: 'A', prompt: 'A calm skyline at dusk, indigo and gold. No words, no people, no flags.', style: 'arcs', path: 'pictures/variant-id/picture-id.png' }`;

const pictures = `${IMPORTS}

const everyFiveMinutes = trigger({
  type: 'n8n-nodes-base.scheduleTrigger',
  version: 1.4,
  config: {
    name: 'Every five minutes',
    parameters: { rule: { interval: [{ field: 'minutes', minutesInterval: 5 }] } },
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
${rpcNode('takeDue', 'Take the pictures asked for', 'picture_take_due', '{{ JSON.stringify({ p_limit: 5 }) }}', pictureAsk, "\n    executeOnce: true,")}
${codeNode('eachAsk', 'One item per picture', code('shared-items.js'), pictureAsk)}
${codeNode('imageModel', 'Image model (stand-in)', code('pictures-stand-in.js'), `{ ok: true, variant_id: 'variant-id', path: null, stand_in: true }`)}
${isOk('made', 'Made?')}
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

const noteFlow = sticky('## Pictures\\nAt once when someone asks in the studio, and every five minutes for the ads that asked by themselves (the team\\'s switch in Settings, Agents), the database hands over the ads waiting for a picture (**picture_take_due**, claimed so two runs never make the same one; a claim lost for ten minutes is taken again, three times at most). Each goes to the image model with its prompt and the path to upload to, and the answer is recorded (**picture_finish** or **picture_fail**). The studio shows the picture under the ad\\'s words, and takes an approval back, since the ad changed. A picture no variant shows any more is removed from Storage.', [everyFiveMinutes, makeNow, takeDue, eachAsk], { color: 4 });
const noteStandIn = sticky('## Stand-in until the key is in\\nThis makes nothing and says so: the studio keeps the drawn design and says no picture was made. To connect an image model (ChatGPT\\'s images API or Higgsfield), replace it with steps that keep its output (see the note in its code):\\n- send the item\\'s **prompt** and take the picture back;\\n- upload it with the **Supabase QGR** credential: POST /storage/v1/object/ad-pictures/{path} with its content type (a JPEG or WebP to the same path ending .jpg or .webp);\\n- answer { ok: true, variant_id, path }, or { ok: false, variant_id, error } when the model made nothing.', [imageModel], { color: 3 });

export default workflow('qgr-pictures', 'QGR · Pictures')
  .add(everyFiveMinutes)
  .to(takeDue)
  .to(eachAsk)
  .to(imageModel)
  .to(made.onTrue(finish.to(pictureToRemove.onTrue(removePicture))).onFalse(fail))
  .add(makeNow)
  .to(takeDue)
  .add(noteFlow)
  .add(noteStandIn);
`;

mkdirSync(join(here, 'workflows'), { recursive: true });
for (const [name, src] of Object.entries({ tracker, strategist, content, pipeline, publisher, scans, results, pictures })) {
  writeFileSync(join(here, 'workflows', `${name}.sdk.js`), src);
  console.log(name, src.length);
}
