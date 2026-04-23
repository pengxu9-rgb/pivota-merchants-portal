'use client';

import { useMemo, useState } from 'react';
import { CheckCircle2, ClipboardCheck, Loader2, Send, XCircle } from 'lucide-react';
import { apiClient } from '@/lib/api-client';

type ModuleStatus = {
  module_key: string;
  status: string;
  risk_level: string;
  requires_human: boolean;
  published_payload?: unknown;
  current?: {
    last_reviewer?: {
      actor_type?: string | null;
      actor_id?: string | null;
      model?: string | null;
    } | null;
    review_actor_type?: string | null;
    review_decision?: string | null;
    source_refs?: unknown[];
  } | null;
  staged?: unknown;
  source_refs?: unknown[];
  review_actor_type?: string | null;
  review_decision?: string | null;
};

const MODULE_OPTIONS = ['copy', 'gallery', 'variants', 'offers', 'reviews', 'pivota_insights', 'external_sources', 'quality'];

function statusClass(status: string) {
  if (status === 'published') return 'border-emerald-200 bg-emerald-50 text-emerald-800';
  if (status === 'needs_human_review') return 'border-amber-200 bg-amber-50 text-amber-800';
  if (status === 'reject' || status === 'rejected') return 'border-red-200 bg-red-50 text-red-800';
  if (status === 'draft' || status === 'approved') return 'border-blue-200 bg-blue-50 text-blue-800';
  return 'border-gray-200 bg-gray-50 text-gray-700';
}

function jsonText(value: unknown) {
  return JSON.stringify(value ?? {}, null, 2);
}

export default function MerchantPdpStatusPage() {
  const [platform, setPlatform] = useState('shopify');
  const [platformProductId, setPlatformProductId] = useState('');
  const [market, setMarket] = useState('US');
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [moduleKey, setModuleKey] = useState('copy');
  const [payloadText, setPayloadText] = useState('{\n  "title": "",\n  "description": ""\n}');
  const [notes, setNotes] = useState('');

  const modules: ModuleStatus[] = data?.modules || [];
  const summary = useMemo(() => {
    return {
      published: modules.filter((module) => module.current).length,
      staged: modules.filter((module) => module.staged).length,
      human: modules.filter((module) => module.requires_human || module.status === 'needs_human_review').length,
    };
  }, [modules]);

  const loadStatus = async () => {
    if (!platformProductId.trim()) return;
    setLoading(true);
    setError('');
    try {
      const resp = await apiClient.getMerchantPdpStatus(platform.trim(), platformProductId.trim(), market.trim() || 'US');
      setData(resp);
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Failed to load PDP status');
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  const submitContribution = async () => {
    setSubmitting(true);
    setError('');
    try {
      const payload = JSON.parse(payloadText || '{}');
      await apiClient.submitMerchantPdpContribution(platform.trim(), platformProductId.trim(), {
        module_key: moduleKey,
        payload,
        notes: notes.trim() || undefined,
        market: market.trim() || 'US',
      });
      setNotes('');
      await loadStatus();
    } catch (err: any) {
      setError(err instanceof SyntaxError ? 'Contribution payload is not valid JSON' : err?.response?.data?.detail || 'Failed to submit contribution');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <ClipboardCheck className="h-5 w-5 text-slate-800" />
            <h1 className="text-2xl font-semibold text-slate-950">PDP status</h1>
          </div>
          <p className="mt-1 text-sm text-slate-600">Shared PDP projection status and merchant contribution queue.</p>
        </div>
      </div>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-[180px_1fr_120px_auto]">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-600">Platform</span>
            <input
              value={platform}
              onChange={(event) => setPlatform(event.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-600">Platform product ID</span>
            <input
              value={platformProductId}
              onChange={(event) => setPlatformProductId(event.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-sm"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-600">Market</span>
            <input
              value={market}
              onChange={(event) => setMarket(event.target.value.toUpperCase())}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
          <button
            type="button"
            onClick={loadStatus}
            disabled={loading || !platformProductId.trim()}
            className="mt-5 inline-flex items-center justify-center rounded-md bg-slate-950 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50 md:mt-6"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Load'}
          </button>
        </div>
      </section>

      {error ? <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">{error}</div> : null}

      {data?.pdp ? (
        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="min-w-0">
              <h2 className="text-lg font-semibold text-slate-950">{data.pdp.title || data.pdp.subject_ref}</h2>
              <div className="mt-1 font-mono text-xs text-slate-500 break-all">{data.pdp.pdp_id}</div>
              <div className="mt-2 flex flex-wrap gap-2 text-xs">
                <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1">{data.pdp.subject_type}</span>
                <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1">{data.pdp.seller_count ?? 0} sellers</span>
                {data.pdp.external_only ? (
                  <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-amber-800">external-only</span>
                ) : null}
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <div className="rounded border border-slate-200 bg-slate-50 px-3 py-2">
                <div className="text-slate-500">Published</div>
                <div className="mt-1 text-base font-semibold text-slate-950">{summary.published}</div>
              </div>
              <div className="rounded border border-slate-200 bg-slate-50 px-3 py-2">
                <div className="text-slate-500">Staged</div>
                <div className="mt-1 text-base font-semibold text-slate-950">{summary.staged}</div>
              </div>
              <div className="rounded border border-slate-200 bg-slate-50 px-3 py-2">
                <div className="text-slate-500">Human</div>
                <div className="mt-1 text-base font-semibold text-slate-950">{summary.human}</div>
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {modules.length ? (
        <section className="rounded-lg border border-slate-200 bg-white overflow-hidden">
          <div className="border-b border-slate-200 px-4 py-3">
            <h2 className="font-semibold text-slate-950">Modules</h2>
          </div>
          <div className="divide-y divide-slate-200">
            {modules.map((module) => (
              <div key={module.module_key} className="grid grid-cols-1 gap-4 px-4 py-4 lg:grid-cols-[240px_1fr]">
                <div>
                  <div className="font-medium text-slate-950">{module.module_key}</div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <span className={`rounded-full border px-2 py-0.5 text-[11px] ${statusClass(module.status)}`}>{module.status}</span>
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] text-slate-700">
                      {module.risk_level}
                    </span>
                    {module.requires_human ? (
                      <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] text-amber-800">
                        human review
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-3 text-xs text-slate-500">
                    <div>Reviewer: {module.current?.last_reviewer?.actor_type || module.review_actor_type || 'none'}</div>
                    <div>Decision: {module.current?.review_decision || module.review_decision || 'none'}</div>
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div>
                    <div className="mb-1 text-xs font-medium text-slate-600">Published payload</div>
                    <pre className="max-h-64 overflow-auto rounded border border-slate-200 bg-slate-50 p-3 text-xs">{jsonText(module.published_payload)}</pre>
                  </div>
                  <div>
                    <div className="mb-1 text-xs font-medium text-slate-600">Source refs</div>
                    <pre className="max-h-64 overflow-auto rounded border border-slate-200 bg-slate-50 p-3 text-xs">{jsonText(module.current?.source_refs || module.source_refs || [])}</pre>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {data?.pdp ? (
        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="flex items-center gap-2">
            <Send className="h-4 w-4 text-slate-800" />
            <h2 className="font-semibold text-slate-950">Submit contribution</h2>
          </div>
          <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-[220px_1fr]">
            <div className="space-y-3">
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-600">Module</span>
                <select
                  value={moduleKey}
                  onChange={(event) => setModuleKey(event.target.value)}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                >
                  {MODULE_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-600">Notes</span>
                <textarea
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  className="h-32 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                />
              </label>
            </div>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-600">Payload JSON</span>
              <textarea
                value={payloadText}
                onChange={(event) => setPayloadText(event.target.value)}
                className="h-56 w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-xs"
                spellCheck={false}
              />
            </label>
          </div>
          <div className="mt-3 flex justify-end">
            <button
              type="button"
              onClick={submitContribution}
              disabled={submitting || !platformProductId.trim()}
              className="inline-flex items-center gap-2 rounded-md bg-slate-950 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Submit to review
            </button>
          </div>
        </section>
      ) : (
        <div className="rounded-lg border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
          Load a product to view its shared PDP status.
        </div>
      )}

      {data?.contributions?.length ? (
        <section className="rounded-lg border border-slate-200 bg-white overflow-hidden">
          <div className="border-b border-slate-200 px-4 py-3">
            <h2 className="font-semibold text-slate-950">Contribution history</h2>
          </div>
          <div className="divide-y divide-slate-200">
            {data.contributions.map((item: any) => (
              <div key={item.id} className="flex items-start justify-between gap-3 px-4 py-3 text-sm">
                <div>
                  <div className="font-medium text-slate-950">{item.module_key}</div>
                  <div className="mt-1 text-xs text-slate-500">{item.notes || 'No notes'}</div>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  {item.review_decision === 'reject' ? <XCircle className="h-4 w-4 text-red-600" /> : null}
                  <span className={`rounded-full border px-2 py-0.5 ${statusClass(item.status)}`}>{item.status}</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
