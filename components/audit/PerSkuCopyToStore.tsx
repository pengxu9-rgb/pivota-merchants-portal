'use client';

import { useState } from 'react';
import { Check, Copy, ExternalLink, Loader2 } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import type { AgentCenterPerSkuReport } from '@/lib/types/ai-readiness';
import { PublishToStoreLane } from '@/components/audit/PublishToStoreLane';
import { parseAuditProductKey } from '@/lib/audit/productKey';

// Copy-back rung (Option B, lowest-risk middle path): surface the finished,
// factually-gated E1 copy so the merchant can PASTE it into their OWN store PDP,
// with a deep-link to that product in their store admin.
//
// RENDER + CLIPBOARD + outbound link ONLY. This card NEVER writes to the
// merchant's store — it must not call runMerchantReadinessAction or any mutation
// endpoint. The copy comes from the read-only GET /merchant/products/{platform}/
// {id} detail (the `enrichment` overlay + `platform_admin_url`); the merchant
// performs any paste/save themselves in their own store.


function storeAdminLabel(platform: string): string {
  const p = platform.toLowerCase();
  if (p === 'shopify') return 'Open in Shopify admin';
  if (p === 'wix') return 'Open in Wix admin';
  if (p === 'woocommerce') return 'Open in WooCommerce admin';
  if (p === 'bigcommerce') return 'Open in BigCommerce admin';
  return 'Open in store admin';
}

function asStr(v: unknown): string {
  return typeof v === 'string' ? v : '';
}
function asStrList(v: unknown): string[] {
  return Array.isArray(v)
    ? v.filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
    : [];
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  if (!text.trim()) return null;
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          /* clipboard unavailable — no-op */
        }
      }}
      className="inline-flex items-center gap-1 rounded border border-emerald-300 bg-white px-2 py-0.5 text-[11px] font-medium text-emerald-800 hover:bg-emerald-50"
    >
      {copied ? <Check className="h-3 w-3 text-green-600" /> : <Copy className="h-3 w-3" />}
      {copied ? 'Copied' : label}
    </button>
  );
}

function CopyField({
  label,
  text,
  multiline,
}: {
  label: string;
  text: string;
  multiline: boolean;
}) {
  return (
    <div className="rounded border border-emerald-200/70 bg-white p-2">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-emerald-700/80">
          {label}
        </span>
        <CopyButton text={text} label="Copy" />
      </div>
      <div className={`text-[11px] text-slate-700 ${multiline ? 'whitespace-pre-wrap' : ''}`}>
        {text}
      </div>
    </div>
  );
}

type CopyState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'empty' }
  | { kind: 'error' }
  | {
      kind: 'loaded';
      title: string;
      summary: string;
      description: string;
      bullets: string[];
      adminUrl: string | null;
    };

export function PerSkuCopyToStore({ report }: { report: AgentCenterPerSkuReport }) {
  const parsed = parseAuditProductKey(report?.product_key);
  const [state, setState] = useState<CopyState>({ kind: 'idle' });

  if (!parsed) return null; // can't resolve a store product -> no card
  const { platform, platformProductId } = parsed;

  async function load() {
    setState({ kind: 'loading' });
    try {
      const data = await apiClient.getMerchantProductDetail(platform, platformProductId);
      const enr = (data?.enrichment ?? {}) as Record<string, unknown>;
      const title = asStr(enr.title_override);
      const summary = asStr(enr.summary_short);
      const description = asStr(enr.description_markdown);
      const bullets = asStrList(enr.bullet_points);
      if (!title && !summary && !description && bullets.length === 0) {
        setState({ kind: 'empty' });
        return;
      }
      setState({
        kind: 'loaded',
        title,
        summary,
        description,
        bullets,
        adminUrl: asStr(data?.platform_admin_url) || null,
      });
    } catch {
      setState({ kind: 'error' });
    }
  }

  const copyAll =
    state.kind === 'loaded'
      ? [
          state.title,
          state.summary,
          state.description,
          state.bullets.map((b) => `• ${b}`).join('\n'),
        ]
          .filter((s) => s.trim())
          .join('\n\n')
      : '';

  return (
    <div className="mt-2.5 rounded-md border border-emerald-200 bg-emerald-50/50 p-2.5">
      <div className="text-xs font-semibold text-emerald-900">Copy this to your store PDP</div>
      <div className="mt-1 text-[11px] leading-relaxed text-emerald-900/80">
        Paste this AI-ready copy into your own product page. Render only — nothing is
        written to your store.
      </div>

      {state.kind === 'idle' ? (
        <button
          type="button"
          onClick={load}
          className="mt-2 inline-flex items-center gap-1 rounded border border-emerald-300 bg-white px-2.5 py-1 text-xs font-medium text-emerald-800 hover:bg-emerald-50"
        >
          Get suggested copy
        </button>
      ) : null}

      {state.kind === 'loading' ? (
        <div className="mt-2 inline-flex items-center gap-1.5 text-xs text-emerald-900/70">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
        </div>
      ) : null}

      {state.kind === 'empty' ? (
        <div className="mt-2 text-[11px] text-emerald-900/70">
          No suggested copy yet — run enrichment for this product first.
        </div>
      ) : null}

      {state.kind === 'error' ? (
        <div className="mt-2 text-[11px] text-red-700">
          Could not load suggested copy.{' '}
          <button type="button" onClick={load} className="underline">
            Retry
          </button>
        </div>
      ) : null}

      {state.kind === 'loaded' ? (
        <div className="mt-2 space-y-2">
          {state.title ? <CopyField label="Title" text={state.title} multiline={false} /> : null}
          {state.summary ? <CopyField label="Summary" text={state.summary} multiline /> : null}
          {state.description ? (
            <CopyField label="Description" text={state.description} multiline />
          ) : null}
          {state.bullets.length > 0 ? (
            <CopyField
              label="Bullets"
              text={state.bullets.map((b) => `• ${b}`).join('\n')}
              multiline
            />
          ) : null}
          <div className="flex flex-wrap items-center gap-2 pt-0.5">
            <CopyButton text={copyAll} label="Copy all" />
            {state.adminUrl ? (
              <a
                href={state.adminUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 rounded border border-emerald-300 px-2 py-0.5 text-[11px] font-medium text-emerald-800 hover:bg-emerald-50"
              >
                <ExternalLink className="h-3 w-3" />
                {storeAdminLabel(platform)}
              </a>
            ) : null}
          </div>
          <PublishToStoreLane platform={platform} platformProductId={platformProductId} />
        </div>
      ) : null}
    </div>
  );
}
