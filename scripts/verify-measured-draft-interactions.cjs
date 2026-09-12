// Invoke the real component click handlers through a small state-hook harness.
// This catches a visible Retry button whose handler silently returns on done=true.
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const assert = require('node:assert/strict');
const ts = require('typescript');
const React = require('react');

function harness(file, component, responses) {
  let state = {}, calls = 0;
  const source = path.resolve(file);
  const mod = new Module(source, module);
  mod.paths = Module._nodeModulePaths(path.dirname(source));
  mod.require = (name) => {
    if (name === 'react') return { ...React, useState: () => [state, (next) => { state = typeof next === 'function' ? next(state) : next; }] };
    if (name === '@/lib/api-client') return { apiClient: { startAuditAction: async () => responses[calls++] } };
    if (name.startsWith('@/') || name.startsWith('./Measured')) return new Proxy({}, { get: () => () => null });
    return require(name);
  };
  mod._compile(ts.transpileModule(fs.readFileSync(source, 'utf8') + `\nexport { ${component} as TestComponent };`, {
    compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText, source);
  return { render: props => mod.exports.TestComponent(props), calls: () => calls };
}
function nodes(tree) {
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  if (!tree || typeof tree !== 'object') return [];
  return [tree, ...nodes(tree.props?.children)];
}
function text(tree) {
  if (Array.isArray(tree)) return tree.map(text).join('');
  if (tree === null || tree === undefined || typeof tree === 'boolean') return '';
  return typeof tree === 'object' ? text(tree.props?.children) : String(tree);
}
async function check(file, component, props, initialLabel) {
  const test = harness(file, component, [
    { status: 'success', task_id: 'same-task', draft: null, credits_charged: 0 },
    { status: 'exists', task_id: 'same-task', draft: 'Verified product facts.', credits_charged: 0.029568 },
  ]);
  const button = (label) => nodes(test.render(props)).find(n => n.type === 'button' && text(n) === label);
  assert(button(initialLabel));
  await button(initialLabel).props.onClick();
  assert.equal(test.calls(), 1);
  assert(button('Retry draft'), 'An empty tracked task must expose retry');
  await button('Retry draft').props.onClick();
  assert.equal(test.calls(), 2, 'Retry must call the API rather than return because the task already exists');
  const result = test.render(props);
  assert(text(result).includes('Verified product facts.'));
  assert(text(result).includes('0.029568 credits used'));
  assert(!button('Retry draft'), 'Successful result must replace retry');
  const reopen = harness(file, component, [{status:'exists', draft:'Saved draft.', credits_charged:0}]);
  const openButton = nodes(reopen.render(props)).find(n => n.type==='button' && text(n)===initialLabel);
  await openButton.props.onClick();
  assert(text(reopen.render(props)).includes('0 credits used'));
  console.log(`PASS ${component}: empty task -> retry -> draft and fractional receipt; saved result shows zero`);
}
(async () => {
  await check('components/audit/PrioritizedActionsPanel.tsx', 'ActionButton', {runId:'test-run', action:{headline:'Review product facts'}}, 'Draft on-page version');
  await check('components/audit/GetCitedPanel.tsx', 'ChannelRow', {runId:'test-run', kind:'media', title:'Example publisher', channelLever:'editorial', channelType:'media'}, 'Draft outreach');
})().catch(error => { console.error(error); process.exitCode=1; });
