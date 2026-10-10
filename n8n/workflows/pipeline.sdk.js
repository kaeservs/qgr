import { workflow, node, trigger, sticky, newCredential, ifElse, switchCase, expr } from '@n8n/workflow-sdk';

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

const readRequest = node({
  type: 'n8n-nodes-base.set',
  version: 3.4,
  config: {
    name: "Read the request",
    parameters: {
      mode: 'manual',
      includeOtherFields: false,
      assignments: {
        assignments: [
          { id: 'run', name: 'runId', value: expr('{{ $json.body?.runId ?? $json.runId }}'), type: 'string' },
          { id: 'start', name: 'startAt', value: expr('{{ $json.body?.startAt ?? $json.startAt ?? "tracker" }}'), type: 'string' },
        ],
      },
    },
  },
  output: [{ runId: 'run-id', startAt: 'tracker' }],
});

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

const runTracker = node({
  type: 'n8n-nodes-base.executeWorkflow',
  version: 1.3,
  config: {
    name: "Competitor Tracker",
    parameters: {
      mode: 'once',
      source: 'database',
      workflowId: { __rl: true, mode: 'id', value: "j94ykovP9OH96SxF", cachedResultName: "QGR · Competitor Tracker" },
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
});

const runStrategist = node({
  type: 'n8n-nodes-base.executeWorkflow',
  version: 1.3,
  config: {
    name: "Ad Strategist",
    parameters: {
      mode: 'once',
      source: 'database',
      workflowId: { __rl: true, mode: 'id', value: "8YaVuKkKlok2rX4K", cachedResultName: "QGR · Ad Strategist" },
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
});

const runContent = node({
  type: 'n8n-nodes-base.executeWorkflow',
  version: 1.3,
  config: {
    name: "Content Agent",
    parameters: {
      mode: 'once',
      source: 'database',
      workflowId: { __rl: true, mode: 'id', value: "iSwaVrynhCGWkqOg", cachedResultName: "QGR · Content Agent" },
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
});

const trackerOk = ifElse({
  version: 2.3,
  config: {
    name: "Tracker finished?",
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 },
        conditions: [{ leftValue: expr('{{ $json.ok }}'), rightValue: true, operator: { type: 'boolean', operation: 'true', singleValue: true } }],
        combinator: 'and',
      },
    },
  },
});

const strategistOk = ifElse({
  version: 2.3,
  config: {
    name: "Strategy finished?",
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 },
        conditions: [{ leftValue: expr('{{ $json.ok }}'), rightValue: true, operator: { type: 'boolean', operation: 'true', singleValue: true } }],
        combinator: 'and',
      },
    },
  },
});

const askStrategist = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: {
    name: "Start the strategist now?",
    parameters: {
      method: 'POST',
      url: 'https://tcinsdexwvzpznqlcpww.supabase.co/rest/v1/rpc/pipeline_next',
      authentication: 'predefinedCredentialType',
      nodeCredentialType: 'supabaseApi',
      sendBody: true,
      contentType: 'json',
      specifyBody: 'json',
      jsonBody: expr("{{ JSON.stringify({ p_run_id: $(\"Read the request\").first().json.runId, p_stage: \"strategist\" }) }}"),
      options: { timeout: 30000, response: { response: { responseFormat: 'text', outputPropertyName: 'data' } } },
    },
    credentials: { supabaseApi: newCredential('Supabase QGR') },
  },
  output: [{ data: 'true' }],
});

const askContent = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: {
    name: "Write the ads now?",
    parameters: {
      method: 'POST',
      url: 'https://tcinsdexwvzpznqlcpww.supabase.co/rest/v1/rpc/pipeline_next',
      authentication: 'predefinedCredentialType',
      nodeCredentialType: 'supabaseApi',
      sendBody: true,
      contentType: 'json',
      specifyBody: 'json',
      jsonBody: expr("{{ JSON.stringify({ p_run_id: $(\"Read the request\").first().json.runId, p_stage: \"content\" }) }}"),
      options: { timeout: 30000, response: { response: { responseFormat: 'text', outputPropertyName: 'data' } } },
    },
    credentials: { supabaseApi: newCredential('Supabase QGR') },
  },
  output: [{ data: 'true' }],
});

const strategistOn = ifElse({
  version: 2.3,
  config: {
    name: "Strategist switched on?",
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 2 },
        conditions: [{ leftValue: expr('{{ String($json.data ?? $json.pipeline_next).trim() === "true" }}'), rightValue: true, operator: { type: 'boolean', operation: 'true', singleValue: true } }],
        combinator: 'and',
      },
    },
  },
});

const contentOn = ifElse({
  version: 2.3,
  config: {
    name: "Content Agent switched on?",
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 2 },
        conditions: [{ leftValue: expr('{{ String($json.data ?? $json.pipeline_next).trim() === "true" }}'), rightValue: true, operator: { type: 'boolean', operation: 'true', singleValue: true } }],
        combinator: 'and',
      },
    },
  },
});

const fromScan = trigger({
  type: 'n8n-nodes-base.executeWorkflowTrigger',
  version: 1.2,
  config: {
    name: 'When a scheduled scan starts a run',
    parameters: { inputSource: 'workflowInputs', workflowInputs: { values: [{ name: 'runId', type: 'string' }, { name: 'startAt', type: 'string' }] } },
  },
  output: [{ runId: '00000000-0000-0000-0000-000000000000', startAt: 'tracker' }],
});

const noteFlow = sticky('## The run\nThe app posts { runId, startAt } with the shared secret header and gets 202 at once; a scheduled scan hands its run in from **QGR · Scheduled scans**. A competitor run starts at the tracker; a custom run (podcast, blog, video, text) starts at the strategist; a go-ahead from the dashboard starts where the run waits. Each agent records its own success or failure on the run, so this workflow only decides what runs next.', [webhook, fromScan, readRequest, whereToStart], { color: 4 });
const noteSwitches = sticky('## The switches\nBefore the strategist after a scan, and before the Content Agent after a strategy, the database is asked (**pipeline_next**). With that agent\'s switch off on the dashboard, the run waits there for a person, and their go-ahead starts the pipeline again from that agent.', [askStrategist, askContent], { color: 5 });

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
