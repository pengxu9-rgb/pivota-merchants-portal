const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const assert = require('node:assert/strict');
const ts = require('typescript');
const React = require('react');
function load(file, mocks) {
  const source = path.resolve(file), m = new Module(source, module);
  m.filename = source; m.paths = module.paths;
  const base = m.require.bind(m);
  m.require = id => Object.hasOwn(mocks, id) ? mocks[id] : base(id);
  m._compile(ts.transpileModule(fs.readFileSync(source, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText, source);
  return m.exports;
}
let reply;
const client = { interceptors: { request: { use() {} }, response: { use() {} } },
  async get(url, cfg) {
    assert.equal(url, '/api/merchant-center/audit/apm-config');
    if (reply instanceof Error) throw reply;
    if (!cfg.validateStatus(reply.status)) throw new Error('HTTP ' + reply.status);
    return reply;
  },
};
const { apiClient } = load('lib/api-client.ts', {
  axios: { create: () => client }, './config': { API_CONFIG: { BASE_URL: 'https://example.test' } }, './credit-errors': {},
});
function nodes(el) {
  if (!el || typeof el !== 'object') return [];
  return [el, ...React.Children.toArray(el.props?.children).flatMap(nodes)];
}
(async () => {
  reply = { status: 404, data: { detail: 'APM config not found' } };
  assert.equal(await apiClient.getApmConfig(), null);
  for (const response of [{ status: 404, data: { detail: 'Not Found' } }, { status: 500 }, { status: 200, data: {} }, new Error('network')]) {
    reply = response; await assert.rejects(() => apiClient.getApmConfig());
  }
  reply = { status: 200, data: { enabled: true, cadence_days: 7 } };
  assert.equal((await apiClient.getApmConfig()).enabled, true);
  for (const compact of [false, true]) {
    for (const response of [null, { enabled: true, cadence_days: 7 }, new Error('unavailable')]) {
      let state = [], index = 0, effects = [], reads = 0, writes = 0;
      const hooks = { ...React,
        useState(initial) { const i = index++; if (!(i in state)) state[i] = initial; return [state[i], v => { state[i] = v; }]; },
        useEffect(fn) { effects.push(fn); },
      };
      const { WeeklyReauditSwitch } = load('components/audit/WeeklyReauditSwitch.tsx', {
        react: hooks, '@/lib/api-client': { apiClient: {
          async getApmConfig() { reads++; if (response instanceof Error) throw response; return response; },
          async configureApm() { writes++; },
        } },
      });
      WeeklyReauditSwitch({ compact }); effects[0]();
      await new Promise(resolve => setImmediate(resolve));
      index = 0;
      const tree = WeeklyReauditSwitch({ compact });
      const button = nodes(tree).find(n => n.props?.role === 'switch');
      assert(button);
      assert.equal(button.props.disabled, response instanceof Error);
      assert.equal(button.props['aria-checked'], response?.enabled === true);
      if (response instanceof Error) {
        assert(JSON.stringify(tree).includes("Couldn't load the schedule"));
        await button.props.onClick();
      }
      assert.equal(reads, 1); assert.equal(writes, 0);
    }
  }
  console.log('PASS: expected absence vs 404/500/network failures; compact/full switches cannot write unknown state');
})().catch(e => { console.error(e); process.exitCode = 1; });
