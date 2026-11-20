#!/usr/bin/env node
/* Loopback-only mock of the merchant API for AI Revenue Recovery v2 local
 * screenshots and manual review. Serves the placeholder fixtures in
 * scripts/fixtures/recovery-v2/. Never proxies anywhere and binds 127.0.0.1.
 *
 *   node scripts/recovery-v2-mock-api.mjs            # port 8787
 *   NEXT_PUBLIC_API_URL=http://127.0.0.1:8787 NEXT_PUBLIC_FEATURE_RECOVERY_V2=true npm run dev
 *
 * Pick a scenario (store mode + run state) with:
 *   curl -X POST http://127.0.0.1:8787/__scenario/connected
 * Scenarios: links (default), connected, first-sync, no-runs, running, failed.
 * In the browser, set localStorage merchant_token / merchant_id first.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'recovery-v2');
const port = Number(process.env.PORT || 8787);
let scenario = process.env.SCENARIO || 'links';
const SCENARIOS = ['links', 'connected', 'first-sync', 'no-runs', 'running', 'failed'];

const load = (name) => {
  const file = path.join(dir, `${name}.json`);
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
};
const connected = () => scenario === 'connected' || scenario === 'first-sync';

function stores() {
  if (!connected()) return [];
  return [{
    id: 'store-placeholder-1', platform: 'shopify', name: 'Example Store', domain: 'example-store.example',
    status: 'active', is_active: true, is_primary: true,
    product_count: scenario === 'first-sync' ? 0 : 248,
    last_sync: scenario === 'first-sync' ? null : '2026-11-18T09:48:00Z',
    connected_at: '2026-11-01T12:00:00Z',
  }];
}

function runs(subjectType) {
  if (scenario === 'no-runs') return [];
  const status = scenario === 'running' ? 'running' : scenario === 'failed' ? 'failed' : 'succeeded';
  const urlRun = { run_id: 'run-links-placeholder', requested_at: '2026-11-18T09:00:00Z', completed_at: status === 'succeeded' ? '2026-11-18T09:22:00Z' : null, status, product_keys: ['link-1', 'link-2', 'link-3'], verdict_labels: [], visibility_score_avg: null, attribution_score_avg: null, category_visibility_score_avg: null, audited_via_pivota_canonical_count: 0 };
  const catalogRun = { ...urlRun, run_id: 'run-catalog-placeholder', product_keys: Array.from({ length: 50 }, (_, i) => `sku-${i + 1}`) };
  if (subjectType === 'merchant_url') return connected() ? [] : [urlRun];
  if (subjectType === 'merchant') return connected() ? [catalogRun] : [];
  return [connected() ? catalogRun : urlRun];
}

function recovery(runId) {
  const base = load(runId === 'run-catalog-placeholder' ? 'recovery-connected' : 'recovery-links');
  return base;
}

const routes = [
  ['GET', /^\/merchant\/settings\/preferences$/, () => ({ data: { portal_language: 'en' } })],
  ['GET', /^\/merchant\/[^/]+\/integrations$/, () => ({ data: { stores: stores() } })],
  ['GET', /^\/api\/billing\/me\/current-period$/, () => ({ tier: 'growth', allowance_credits: 4000, consumed_credits: 2760, available_credits: 1240, purchased_credits: 0, overage_count: 0, overage_total_usd_cents: 0, days_remaining: 11, period_start: '2026-11-01', period_end: '2026-12-01', in_overage: false })],
  ['GET', /^\/api\/billing\/me\/statements$/, () => ({ statements: [] })],
  ['GET', /^\/api\/billing\/plans$/, () => ({ plans: [] })],
  ['GET', /^\/api\/audits\/readiness$/, () => ({ data: { counts: { catalog_products: connected() && scenario !== 'first-sync' ? 248 : 0 } } })],
  ['GET', /^\/api\/audits$/, (url) => ({ data: runs(url.searchParams.get('subject_type')) })],
  ['GET', /^\/api\/audits\/products$/, () => ({ products: connected() ? (load('audit-products') ?? []) : [], next_offset: null })],
  ['GET', /^\/api\/audits\/([^/]+)$/, (url, m) => {
    if (scenario === 'running') return { status: 202, body: { data: { status: 'running' } } };
    if (scenario === 'failed') return { status: 200, body: { data: { stage: 'failed', error_message: 'Placeholder failure for review.' } } };
    const data = url.searchParams.get('audience') === 'revenue_recovery'
      ? recovery(m[1])
      : load(m[1] === 'run-catalog-placeholder' ? 'catalog-run' : 'url-run');
    return data ? { data } : { status: 404, body: { detail: 'not found' } };
  }],
  ['GET', /^\/api\/merchant-center\/audit\/url-readiness\/([^/]+)$/, () => {
    if (scenario === 'running') return { data: { status: 'running' } };
    return { data: load('url-run') ?? { status: 'succeeded' } };
  }],
  ['POST', /^\/api\/merchant-center\/audit\/url-readiness$/, () => (scenario === 'failed'
    ? { status: 402, body: { detail: { code: 'free_audit_limit_reached', message: 'Placeholder: free checks used.' } } }
    : { data: { status: 'running', run_id: 'run-links-placeholder' } })],
  ['POST', /^\/api\/merchant-center\/audit\/url-readiness\/quote$/, () => ({ data: { status: 'quoted', quote_id: 'quote-placeholder', credits: 120, base_credits: 60, providers: ['gemini'], product_count: 3, consumer_capture: { credits: 60, probe_count: 12 } } })],
  ['GET', /^\/api\/merchant-center\/audit\/tasks$/, () => load('tasks') ?? { tasks: [] }],
  ['POST', /^\/api\/merchant-center\/audit\/actions\/start$|^\/api\/merchant-center\/audit\/start-action$/, () => ({ data: { status: 'success', task_id: 'task-placeholder-2', draft: '[PLACEHOLDER DRAFT] A short pitch the merchant edits before sending.', credits_charged: 2 } })],
  ['POST', /^\/api\/merchant-center\/audit\/tasks\/outreach-pitch$/, () => ({ status: 'success', task_id: 'task-placeholder', title: 'Pitch sent' })],
];

function send(res, status, body) {
  res.writeHead(status, {
    'content-type': 'application/json',
    'access-control-allow-origin': res.req.headers.origin || '*',
    'access-control-allow-credentials': 'true',
    'access-control-allow-headers': 'authorization, content-type, x-api-key',
    'access-control-allow-methods': 'GET, POST, PATCH, PUT, DELETE, OPTIONS',
  });
  res.end(body === undefined ? '' : JSON.stringify(body));
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${port}`);
  if (req.method === 'OPTIONS') return send(res, 204);
  const pick = url.pathname.match(/^\/__scenario\/([a-z-]+)$/);
  if (pick && SCENARIOS.includes(pick[1])) { scenario = pick[1]; console.log(`scenario → ${scenario}`); return send(res, 200, { scenario }); }
  if (url.pathname === '/__scenario') return send(res, 200, { scenario, scenarios: SCENARIOS });
  for (const [method, pattern, handler] of routes) {
    const match = req.method === method && url.pathname.match(pattern);
    if (!match) continue;
    const out = handler(url, match);
    if (out && typeof out.status === 'number' && 'body' in out) return send(res, out.status, out.body);
    return send(res, 200, out);
  }
  return send(res, 404, { detail: `mock: no fixture for ${req.method} ${url.pathname}` });
});
server.listen(port, '127.0.0.1', () => console.log(`recovery-v2 mock API on http://127.0.0.1:${port} (scenario ${scenario})`));
