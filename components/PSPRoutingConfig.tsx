'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  CreditCard,
  Loader2,
  Save,
  ShieldCheck,
} from 'lucide-react';

import { apiClient } from '@/lib/api-client';
import {
  EmptyState,
  MerchantButton,
  StatusBadge,
  SurfaceCard,
} from '@/components/ui/merchant-primitives';

interface PSP {
  id: string;
  name: string;
  type?: string;
  is_active: boolean;
}

interface Props {
  connectedPSPs: PSP[];
}

type FlashState =
  | { tone: 'success' | 'warning' | 'critical'; text: string }
  | null;

export default function PSPRoutingConfig({ connectedPSPs }: Props) {
  const activePSPs = useMemo(
    () => connectedPSPs.filter((psp) => psp.is_active),
    [connectedPSPs]
  );
  const [primaryPSP, setPrimaryPSP] = useState('');
  const [fallbackChain, setFallbackChain] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [flash, setFlash] = useState<FlashState>(null);

  useEffect(() => {
    const loadRouting = async () => {
      if (activePSPs.length < 2) {
        setPrimaryPSP('');
        setFallbackChain([]);
        return;
      }

      try {
        setLoading(true);
        const data = await apiClient.getRoutingConfig();
        const providerToId = (provider: string): string | undefined => {
          const normalized = (provider || '').toLowerCase();
          return activePSPs.find((psp) => {
            const type = (psp.type || '').toLowerCase();
            const name = (psp.name || '').toLowerCase();
            return type === normalized || name === normalized;
          })?.id;
        };

        const priorityList = Array.isArray(data?.psp_priority)
          ? [...data.psp_priority].sort(
              (a: any, b: any) => (a?.priority || 999) - (b?.priority || 999)
            )
          : [];

        const selectedPrimaryId = providerToId(priorityList[0]?.psp || '');
        if (selectedPrimaryId) {
          setPrimaryPSP(selectedPrimaryId);
        } else if (activePSPs[0]?.id) {
          setPrimaryPSP(activePSPs[0].id);
        }

        const fallbackIds: string[] = [];
        priorityList.slice(1).forEach((entry: any) => {
          const id = providerToId(entry?.psp || '');
          if (id && !fallbackIds.includes(id)) {
            fallbackIds.push(id);
          }
        });
        setFallbackChain(fallbackIds);
      } catch (error) {
        console.error('Failed to load routing config', error);
        setFlash({
          tone: 'warning',
          text: 'Routing settings could not be loaded. The current active processor order is being used instead.',
        });
        if (activePSPs[0]?.id) {
          setPrimaryPSP(activePSPs[0].id);
        }
        setFallbackChain(activePSPs.slice(1).map((psp) => psp.id));
      } finally {
        setLoading(false);
      }
    };

    loadRouting();
  }, [activePSPs]);

  const selectedFlow = useMemo(() => {
    if (!primaryPSP) return [];
    return [primaryPSP, ...fallbackChain.filter((id) => id !== primaryPSP)];
  }, [primaryPSP, fallbackChain]);

  const availableFallbacks = activePSPs.filter(
    (psp) => psp.id !== primaryPSP && !fallbackChain.includes(psp.id)
  );

  const handlePrimaryChange = (pspId: string) => {
    setPrimaryPSP(pspId);
    setFallbackChain((current) => current.filter((id) => id !== pspId));
    setFlash(null);
  };

  const addFallback = (pspId: string) => {
    setFallbackChain((current) => [...current, pspId]);
    setFlash(null);
  };

  const removeFallback = (pspId: string) => {
    setFallbackChain((current) => current.filter((id) => id !== pspId));
    setFlash(null);
  };

  const moveFallback = (pspId: string, direction: 'up' | 'down') => {
    setFallbackChain((current) => {
      const index = current.indexOf(pspId);
      if (index === -1) return current;
      const targetIndex = direction === 'up' ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= current.length) return current;
      const next = [...current];
      [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
      return next;
    });
    setFlash(null);
  };

  const handleSave = async () => {
    if (!primaryPSP) {
      setFlash({
        tone: 'warning',
        text: 'Select a primary processor before saving routing.',
      });
      return;
    }

    try {
      setSaving(true);
      setFlash(null);
      const orderedIds = [primaryPSP, ...fallbackChain.filter((id) => id !== primaryPSP)];
      const psp_priority = orderedIds
        .map((id, index) => {
          const psp = activePSPs.find((item) => item.id === id);
          if (!psp) return null;
          const provider = ((psp.type || psp.name || '').trim() || '').toLowerCase();
          if (!provider) return null;
          return { psp: provider, priority: index + 1 };
        })
        .filter(Boolean) as { psp: string; priority: number }[];

      await apiClient.updateRoutingConfig({
        psp_priority,
        routing_strategy: 'priority',
        max_retries: Math.max(0, psp_priority.length - 1),
        timeout_ms: 30000,
      });

      setFlash({
        tone: 'success',
        text: 'Routing saved. Merchant payment execution now uses this primary and fallback order.',
      });
    } catch (error: any) {
      console.error('Failed to save routing configuration', error);
      setFlash({
        tone: 'critical',
        text:
          error?.response?.data?.detail ||
          error?.message ||
          'Failed to save routing configuration.',
      });
    } finally {
      setSaving(false);
    }
  };

  if (activePSPs.length < 2) {
    return (
      <EmptyState
        icon={ShieldCheck}
        title="Routing becomes available after a second processor is active"
        description="Merchant routing is limited to one primary processor plus an ordered fallback chain. Add another active processor to configure failover."
      />
    );
  }

  return (
    <div className="space-y-4">
      <SurfaceCard
        title="Routing"
        description="Choose one primary processor and the ordered fallback chain that should take over if the first path is unavailable."
        action={<StatusBadge tone="brand">Priority + fallback only</StatusBadge>}
      >
        <div className="space-y-5 p-5">
          <div className="rounded-[1rem] border border-[color:var(--merchant-line)] bg-white/78 px-4 py-3 text-sm text-[color:var(--merchant-muted-strong)]">
            Merchant routing currently supports real processor priority only. Smart, cost-based, success-rate, and geographic rules are intentionally hidden until runtime support is production-ready.
          </div>

          {flash ? (
            <div
              className={`rounded-[1rem] border px-4 py-3 text-sm ${
                flash.tone === 'success'
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                  : flash.tone === 'critical'
                    ? 'border-rose-200 bg-rose-50 text-rose-900'
                    : 'border-amber-200 bg-amber-50 text-amber-900'
              }`}
            >
              {flash.text}
            </div>
          ) : null}

          <div className="grid gap-4 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
            <div className="space-y-4">
              <div className="rounded-[1rem] border border-[color:var(--merchant-line)] bg-white/78 px-4 py-4">
                <label className="mb-2 block text-sm font-medium text-[color:var(--merchant-ink)]">
                  Primary processor
                </label>
                <select
                  value={primaryPSP}
                  onChange={(event) => handlePrimaryChange(event.target.value)}
                  className="merchant-input w-full"
                  disabled={loading || saving}
                >
                  <option value="">Select primary processor</option>
                  {activePSPs.map((psp) => (
                    <option key={psp.id} value={psp.id}>
                      {psp.name}
                    </option>
                  ))}
                </select>
                <p className="mt-2 text-sm text-[color:var(--merchant-muted)]">
                  This processor receives traffic first. If it is unavailable or unsupported, checkout falls through to the next configured processor.
                </p>
              </div>

              <div className="rounded-[1rem] border border-[color:var(--merchant-line)] bg-white/78 px-4 py-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium text-[color:var(--merchant-ink)]">
                      Available fallbacks
                    </div>
                    <div className="text-sm text-[color:var(--merchant-muted)]">
                      Add active processors to the fallback order.
                    </div>
                  </div>
                  <StatusBadge tone="neutral">
                    {availableFallbacks.length} available
                  </StatusBadge>
                </div>
                <div className="space-y-2">
                  {availableFallbacks.length > 0 ? (
                    availableFallbacks.map((psp) => (
                      <div
                        key={psp.id}
                        className="flex items-center justify-between gap-3 rounded-[0.95rem] border border-[color:var(--merchant-line)] bg-[color:var(--merchant-surface-muted)] px-3 py-3"
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <div className="rounded-xl bg-[color:var(--merchant-brand-soft)] p-2">
                            <CreditCard className="h-4 w-4 text-[color:var(--merchant-brand)]" />
                          </div>
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium text-[color:var(--merchant-ink)]">
                              {psp.name}
                            </div>
                            <div className="text-xs text-[color:var(--merchant-muted)]">
                              Active processor
                            </div>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => addFallback(psp.id)}
                          className="merchant-button-secondary px-3 py-2 text-sm"
                          disabled={saving}
                        >
                          Add fallback
                        </button>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-[0.95rem] border border-dashed border-[color:var(--merchant-line)] px-3 py-4 text-sm text-[color:var(--merchant-muted)]">
                      All active processors are already in the current routing order.
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="rounded-[1rem] border border-[color:var(--merchant-line)] bg-white/78 px-4 py-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium text-[color:var(--merchant-ink)]">
                      Fallback order
                    </div>
                    <div className="text-sm text-[color:var(--merchant-muted)]">
                      Reorder the processors that should take over after the primary path.
                    </div>
                  </div>
                  <StatusBadge tone="success">
                    {selectedFlow.length} total path{selectedFlow.length === 1 ? '' : 's'}
                  </StatusBadge>
                </div>

                <div className="space-y-2">
                  {primaryPSP ? (
                    <div className="flex items-center justify-between gap-3 rounded-[0.95rem] border border-[color:var(--merchant-brand-soft)] bg-[color:var(--merchant-brand-soft)]/55 px-3 py-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="rounded-xl bg-white p-2">
                          <ShieldCheck className="h-4 w-4 text-[color:var(--merchant-brand)]" />
                        </div>
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold text-[color:var(--merchant-ink)]">
                            {activePSPs.find((psp) => psp.id === primaryPSP)?.name}
                          </div>
                          <div className="text-xs text-[color:var(--merchant-muted)]">
                            Primary processor
                          </div>
                        </div>
                      </div>
                      <StatusBadge tone="brand">Primary</StatusBadge>
                    </div>
                  ) : null}

                  {fallbackChain.length > 0 ? (
                    fallbackChain.map((pspId, index) => {
                      const psp = activePSPs.find((item) => item.id === pspId);
                      if (!psp) return null;
                      return (
                        <div
                          key={pspId}
                          className="flex items-center justify-between gap-3 rounded-[0.95rem] border border-[color:var(--merchant-line)] bg-[color:var(--merchant-surface-muted)] px-3 py-3"
                        >
                          <div className="flex min-w-0 items-center gap-3">
                            <div className="rounded-xl bg-white p-2">
                              <CreditCard className="h-4 w-4 text-[color:var(--merchant-brand)]" />
                            </div>
                            <div className="min-w-0">
                              <div className="truncate text-sm font-medium text-[color:var(--merchant-ink)]">
                                {psp.name}
                              </div>
                              <div className="text-xs text-[color:var(--merchant-muted)]">
                                Fallback {index + 1}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => moveFallback(pspId, 'up')}
                              className="merchant-button-secondary px-2.5 py-2"
                              disabled={saving || index === 0}
                              aria-label={`Move ${psp.name} up`}
                            >
                              <ArrowUp className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => moveFallback(pspId, 'down')}
                              className="merchant-button-secondary px-2.5 py-2"
                              disabled={saving || index === fallbackChain.length - 1}
                              aria-label={`Move ${psp.name} down`}
                            >
                              <ArrowDown className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => removeFallback(pspId)}
                              className="merchant-button-secondary px-3 py-2 text-sm"
                              disabled={saving}
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="rounded-[0.95rem] border border-dashed border-[color:var(--merchant-line)] px-3 py-4 text-sm text-[color:var(--merchant-muted)]">
                      No fallback processors selected yet.
                    </div>
                  )}
                </div>
              </div>

              <div className="rounded-[1rem] border border-[color:var(--merchant-line)] bg-white/78 px-4 py-4">
                <div className="text-sm font-medium text-[color:var(--merchant-ink)]">
                  Runtime flow
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-[color:var(--merchant-muted-strong)]">
                  {selectedFlow.length > 0 ? (
                    selectedFlow.map((pspId, index) => {
                      const psp = activePSPs.find((item) => item.id === pspId);
                      if (!psp) return null;
                      return (
                        <div key={pspId} className="flex items-center gap-2">
                          <span className="rounded-full border border-[color:var(--merchant-line)] bg-white px-3 py-1.5 font-medium text-[color:var(--merchant-ink)]">
                            {index === 0 ? `Primary: ${psp.name}` : `Fallback ${index}: ${psp.name}`}
                          </span>
                          {index < selectedFlow.length - 1 ? (
                            <span className="text-[color:var(--merchant-muted)]">→</span>
                          ) : null}
                        </div>
                      );
                    })
                  ) : (
                    <span>Select a primary processor to define the routing path.</span>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-3">
            {loading ? (
              <div className="flex items-center gap-2 text-sm text-[color:var(--merchant-muted)]">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Loading current routing…</span>
              </div>
            ) : null}
            <MerchantButton
              type="button"
              onClick={handleSave}
              icon={Save}
              disabled={saving || loading || !primaryPSP}
            >
              {saving ? 'Saving routing…' : 'Save routing'}
            </MerchantButton>
          </div>
        </div>
      </SurfaceCard>
    </div>
  );
}
