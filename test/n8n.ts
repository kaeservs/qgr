import { runInNewContext } from 'node:vm';

/**
 * Runs a Code-node script as n8n does: a function body given $input and $, in
 * a sandbox with JavaScript's own built-ins and nothing from Node or the web.
 * There is no URL, Buffer, fetch or setTimeout in n8n's Code node: a script
 * that leans on one passes in plain Node and fails in n8n.
 */
export function inN8n(code: string, $input: unknown, $: unknown): unknown {
  return runInNewContext(`(function ($input, $) {\n${code}\n})`, { console })($input, $);
}
