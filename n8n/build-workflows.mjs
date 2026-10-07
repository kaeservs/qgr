// Builds the n8n Workflow SDK source for the four QGR workflows from the
// Code-node scripts in ./code (tested by code.test.ts). The output in
// ./workflows is what gets validated and saved to n8n through its MCP server.
// Scripts are embedded with JSON.stringify so their backslashes survive.
//
//   node n8n/build-workflows.mjs [--ids=tracker=ID,strategist=ID,content=ID]

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
    `{ stage: '${stage}', run: { id: 'run-id', kind: 'competitor', input: 'website', url: 'https://example.com/', title: 'example.com', platforms: ['meta', 'linkedin', 'x'], goal: 'consultations', excerpt: null, competitor_name: null, files: null }, brand: { company: 'Quantum Global Residency', guardrails: [], voice: [] }, report: null, strategy: null }`,
    "\n    onError: 'continueErrorOutput',",
  );

const sampleRun = `{ id: 'run-id', kind: 'competitor', input: 'website', url: 'https://example.com/', title: 'example.com', platforms: ['meta', 'linkedin', 'x'], goal: 'consultations' }`;

// ---------------------------------------------------------------- tracker

const tracker = `${IMPORTS}
${subTrigger}
${beginNode('tracker')}
${codeNode('plan', 'Plan the scan', code('tracker-plan.js'), `{ runId: 'run-id', input: 'website', url: 'https://example.com/', websiteUrl: 'https://example.com/', domain: 'example.com', competitorHint: 'example', files: [], platforms: ['meta'] }`, "\n    onError: 'continueErrorOutput',")}

const hasWebsite = ifElse({
  version: 2.3,
  config: {
    name: 'Has a website to read?',
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 },
        conditions: [{ leftValue: expr('{{ $json.websiteUrl }}'), rightValue: '', operator: { type: 'string', operation: 'notEmpty', singleValue: true } }],
        combinator: 'and',
      },
    },
  },
});

const readWebsite = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: {
    name: 'Read their website',
    onError: 'continueRegularOutput',
    parameters: {
      method: 'GET',
      url: expr('{{ $json.websiteUrl }}'),
      sendHeaders: true,
      headerParameters: { parameters: [{ name: 'User-Agent', value: 'QGR-Competitor-Tracker/1.0' }] },
      options: {
        timeout: 20000,
        redirect: { redirect: { followRedirects: true, maxRedirects: 5 } },
        response: { response: { responseFormat: 'text', outputPropertyName: 'data' } },
      },
    },
  },
  output: [{ data: '<html><body>Example</body></html>' }],
});
${codeNode('keepWebsiteText', 'Keep the website text', code('shared-page-text.js', { __PLAN__: 'Plan the scan', __FIELD__: 'websiteText' }), `{ runId: 'run-id', websiteText: 'Example' }`)}
${codeNode('placeholderAds', 'Apify: competitor ads (placeholder)', code('tracker-placeholder-ads.js'), `{ runId: 'run-id', dataSource: 'placeholder', ads: [] }`)}
${codeNode('prepareAds', 'Prepare the ads', code('tracker-prepare-ads.js'), `{ runId: 'run-id', dataSource: 'placeholder', ads: [{ id: 'a1', platform: 'meta', format: 'video', days_running: 63, text: 'Hook', hook_line: 'Hook' }] }`, "\n    onError: 'continueErrorOutput',")}
${codeNode('buildRequest', 'Build the Claude request', code('tracker-build-request.js'), `{ body: { model: 'claude-opus-5-5', max_tokens: 16000 } }`, "\n    onError: 'continueErrorOutput',")}
${claudeNode('claude', 'Claude: read the ads')}
${codeNode('readAnswer', "Read Claude's answer", code('tracker-read-answer.js'), `{ ok: true, p_run_id: 'run-id', p_report: { hooks: [] }, p_usage: { model: 'claude-opus-5-5' } }`, "\n    onError: 'continueErrorOutput',")}
${isOk('answerOk', 'Report ready?')}
${rpcNode('save', 'Save the report', 'agent_finish_tracker', '{{ JSON.stringify({ p_run_id: $json.p_run_id, p_report: $json.p_report, p_usage: $json.p_usage }) }}', `{ data: 'report-id' }`, "\n    onError: 'continueErrorOutput',")}
${failTail('tracker')}

const noteApify = sticky('## Apify goes here\\nThis node returns **sample ads** so the run works end to end, and the report is marked as sample data.\\n\\nTo connect Apify: replace it with an HTTP Request to your actor\\'s **run-sync-get-dataset-items** endpoint (an Apify token credential), then a Code node mapping each item to { id, platform, format, startDate, isActive, pageName, text, headline, cta, adUrl, mediaUrl } with dataSource \\'apify\\'.', [placeholderAds], { color: 3 });
const noteNumbers = sticky('## Numbers come from the data\\nClaude groups ads into hooks by id and names each ad\\'s angle. Days running, versions and angle counts are computed in code from the ads, never taken from the model.', [prepareAds, readAnswer], { color: 5 });
const noteModel = sticky('## Claude\\nOpus 5.5, medium effort, JSON constrained by a schema, server-side fallback on a refusal. No temperature: Opus 5.5 rejects it. Usage is saved with every result.', [buildRequest, claude], { color: 6 });

export default workflow('qgr-competitor-tracker', 'QGR · Competitor Tracker')
  .add(start)
  .to(begin.onError(couldNotStart))
  .to(plan.onError(whyFailed))
  .to(hasWebsite.onTrue(readWebsite.to(keepWebsiteText.to(placeholderAds))).onFalse(placeholderAds))
  .add(placeholderAds)
  .to(prepareAds.onError(whyFailed))
  .to(buildRequest.onError(whyFailed))
  .to(claude.onError(whyFailed))
  .to(readAnswer.onError(whyFailed))
  .to(answerOk.onTrue(save.onError(whyFailed).to(done)).onFalse(whyFailed))
  .add(whyFailed)
  .to(markFailed)
  .to(failed)
  .add(noteApify)
  .add(noteNumbers)
  .add(noteModel);
`;

// ---------------------------------------------------------------- strategist

const strategist = `${IMPORTS}
${subTrigger}
${beginNode('strategist')}
${codeNode('plan', 'Gather the material', code('strategist-plan.js'), `{ runId: 'run-id', run: ${sampleRun}, brand: { guardrails: [] }, report: null, needsSource: true, sourceUrl: 'https://example.com/ep-1', sourceText: '', sourceLabel: 'Podcast · Ep. 1' }`, "\n    onError: 'continueErrorOutput',")}

const needsSource = ifElse({
  version: 2.3,
  config: {
    name: 'Read the source first?',
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 },
        conditions: [{ leftValue: expr('{{ $json.needsSource }}'), rightValue: true, operator: { type: 'boolean', operation: 'true', singleValue: true } }],
        combinator: 'and',
      },
    },
  },
});

const readSource = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: {
    name: 'Read the source page',
    onError: 'continueRegularOutput',
    parameters: {
      method: 'GET',
      url: expr('{{ $json.sourceUrl }}'),
      sendHeaders: true,
      headerParameters: { parameters: [{ name: 'User-Agent', value: 'QGR-Ad-Strategist/1.0' }] },
      options: {
        timeout: 20000,
        redirect: { redirect: { followRedirects: true, maxRedirects: 5 } },
        response: { response: { responseFormat: 'text', outputPropertyName: 'data' } },
      },
    },
  },
  output: [{ data: '<html><body>Episode notes</body></html>' }],
});
${codeNode('keepSourceText', 'Keep the source text', code('shared-page-text.js', { __PLAN__: 'Gather the material', __FIELD__: 'sourceText' }), `{ runId: 'run-id', sourceText: 'Episode notes' }`)}
${codeNode('buildRequest', 'Build the Claude request', code('strategist-build-request.js'), `{ body: { model: 'claude-opus-5-5', max_tokens: 16000 } }`, "\n    onError: 'continueErrorOutput',")}
${claudeNode('claude', 'Claude: write the strategy')}
${codeNode('readAnswer', "Read Claude's answer", code('strategist-read-answer.js'), `{ ok: true, p_run_id: 'run-id', p_strategy: { angles: [] }, p_usage: { model: 'claude-opus-5-5' } }`, "\n    onError: 'continueErrorOutput',")}
${isOk('answerOk', 'Strategy ready?')}
${rpcNode('save', 'Save the strategy', 'agent_finish_strategist', '{{ JSON.stringify({ p_run_id: $json.p_run_id, p_strategy: $json.p_strategy, p_usage: $json.p_usage }) }}', `{ data: 'strategy-id' }`, "\n    onError: 'continueErrorOutput',")}
${failTail('strategist')}

const noteSource = sticky('## Custom runs\\nA blog post is read from its page. A podcast or video has **no transcript yet**: the strategist reads the episode page and is told so. Pasted text is used as it is.', [needsSource, readSource, keepSourceText], { color: 3 });
const noteModel = sticky('## Claude\\nOpus 5.5, high effort: the strategy is the judgement the rest of the run depends on. Budget shares are made to add up to 100 in code, and the brand guardrails always lead.', [buildRequest, claude, readAnswer], { color: 6 });

export default workflow('qgr-ad-strategist', 'QGR · Ad Strategist')
  .add(start)
  .to(begin.onError(couldNotStart))
  .to(plan.onError(whyFailed))
  .to(needsSource.onTrue(readSource.to(keepSourceText.to(buildRequest))).onFalse(buildRequest))
  .add(buildRequest.onError(whyFailed))
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
${codeNode('images', 'Images (placeholder)', code('content-images-placeholder.js'), `{ ok: true, p_run_id: 'run-id', p_ad_set: { title: 'Q4', variants: [] }, p_usage: { model: 'claude-opus-5-5' } }`)}
${rpcNode('save', 'Save the ads', 'agent_finish_content', '{{ JSON.stringify({ p_run_id: $json.p_run_id, p_ad_set: $json.p_ad_set, p_usage: $json.p_usage }) }}', `{ data: 'ad-set-id' }`, "\n    onError: 'continueErrorOutput',")}
${failTail('content')}

const noteImages = sticky('## Images go here (ChatGPT or Higgsfield)\\nEvery variant already has an **image_prompt**. To connect: send each prompt to the image model, upload the result to Supabase Storage and set **image_url**. Until then the dashboard draws the branded text-on-indigo design.', [images], { color: 3 });
const noteGuardrails = sticky('## Guardrails\\nThe prompt carries the brand rules. This step also flags, never silently fixes, any "guarantee", "risk-free", promised timeline or X post over 280 characters, so a person sees it before approving.', [readAnswer], { color: 5 });

export default workflow('qgr-content-agent', 'QGR · Content Agent')
  .add(start)
  .to(begin.onError(couldNotStart))
  .to(buildRequest.onError(whyFailed))
  .to(claude.onError(whyFailed))
  .to(readAnswer.onError(whyFailed))
  .to(answerOk.onTrue(images.to(save.onError(whyFailed).to(done))).onFalse(whyFailed))
  .add(whyFailed)
  .to(markFailed)
  .to(failed)
  .add(noteImages)
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

const noteFlow = sticky('## The run\\nThe app posts { runId, startAt } with the shared secret header and gets 202 at once. A competitor run starts at the tracker; a custom run (podcast, blog, video, text) starts at the strategist. Each agent records its own success or failure on the run, so this workflow only decides what runs next.', [webhook, readRequest, whereToStart], { color: 4 });

export default workflow('qgr-run-pipeline', 'QGR · Run pipeline')
  .add(webhook)
  .to(readRequest)
  .to(whereToStart
    .onCase(0, runTracker.to(trackerOk.onTrue(runStrategist)))
    .onCase(1, runStrategist)
    .onCase(2, runContent))
  .add(runStrategist)
  .to(strategistOk.onTrue(runContent))
  .add(noteFlow);
`;

mkdirSync(join(here, 'workflows'), { recursive: true });
for (const [name, src] of Object.entries({ tracker, strategist, content, pipeline })) {
  writeFileSync(join(here, 'workflows', `${name}.sdk.js`), src);
  console.log(name, src.length);
}
