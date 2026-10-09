import { workflow, node, trigger, sticky, newCredential, ifElse, switchCase, expr } from '@n8n/workflow-sdk';

const everyHour = trigger({
  type: 'n8n-nodes-base.scheduleTrigger',
  version: 1.4,
  config: {
    name: 'Every hour',
    parameters: { rule: { interval: [{ field: 'hours', hoursInterval: 1, triggerAtMinute: 1 }] } },
  },
  output: [{}],
});

const startScans = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: {
    name: "Start the scans that are due",
    executeOnce: true,
    parameters: {
      method: 'POST',
      url: 'https://tcinsdexwvzpznqlcpww.supabase.co/rest/v1/rpc/start_due_scans',
      authentication: 'predefinedCredentialType',
      nodeCredentialType: 'supabaseApi',
      sendBody: true,
      contentType: 'json',
      specifyBody: 'json',
      jsonBody: expr("{{ JSON.stringify({ p_max: 10 }) }}"),
      options: { timeout: 30000 },
    },
    credentials: { supabaseApi: newCredential('Supabase QGR') },
  },
  output: [{ run_id: 'run-id', competitor: 'Horizon Visa Partners' }],
});

const eachScan = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: "One item per scan",
    parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: "// The rows a database function returned, one item each. n8n turns a JSON\n// array answer into items by itself; this also takes one item holding the\n// whole array, so the next node sees the same either way. Nothing due means\n// no items, and the rest of the workflow does not run.\nconst out = [];\n$input.all().forEach(function (item) {\n  const json = item.json;\n  let rows = [];\n  if (Array.isArray(json)) rows = json;\n  else if (json && Array.isArray(json.data)) rows = json.data;\n  else if (json && typeof json === 'object' && Object.keys(json).length > 0) rows = [json];\n  rows.forEach(function (row) {\n    if (row && typeof row === 'object') out.push({ json: row });\n  });\n});\nreturn out;\n" },
  },
  output: [{ run_id: 'run-id', competitor: 'Horizon Visa Partners' }],
});

const runPipeline = node({
  type: 'n8n-nodes-base.executeWorkflow',
  version: 1.3,
  config: {
    name: 'Hand each scan to the pipeline',
    parameters: {
      mode: 'each',
      source: 'database',
      workflowId: { __rl: true, mode: 'id', value: "jZPgNf2YZJddmJ7y", cachedResultName: 'QGR · Run pipeline' },
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

const noteFlow = sticky('## Scheduled scans\nEvery hour the database is asked whether the team\'s schedule (Settings, Agents) has fallen due (**start_due_scans**). When it has, it starts a scan of each tracked competitor that has a website, at most ten, with their website as the app last read it: n8n fetches nothing. Each run goes to **QGR · Run pipeline**, whose switches decide whether the strategist and the Content Agent follow by themselves.', [everyHour, startScans, runPipeline], { color: 4 });

export default workflow('qgr-scheduled-scans', 'QGR · Scheduled scans')
  .add(everyHour)
  .to(startScans)
  .to(eachScan)
  .to(runPipeline)
  .add(noteFlow);
