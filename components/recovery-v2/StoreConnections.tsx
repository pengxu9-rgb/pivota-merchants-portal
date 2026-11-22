"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { apiClient } from "@/lib/api-client";
import { useMerchantLanguage } from "@/components/portal/merchant-language-provider";
import { useRecovery } from "@/components/recovery-v2/RecoveryContext";
import { Badge, ButtonLink, EmptyState, Skeleton, formatDate, formatNumber } from "@/components/recovery-v2/ui";
import { RECOVERY_CONNECT_HREF } from "@/lib/recovery-v2/navigation";
import { platformLabel } from "@/lib/recovery-v2/mode";

/**
 * Settings → Store connections (v2). "Manage store connections" used to open the legacy
 * Integrations page, which leads with payment processors, PSP routing and API credentials: none of
 * that is the recovery product, and checkout runs at the merchant via UCP / ACP. This page keeps only
 * what a store connection needs: the stores, a sync, the primary store, and disconnect (with a
 * confirm step). /dashboard/integrations redirects here while the flag is on.
 */

export type ConnectedStore = {
  id: string;
  platform: string;
  name: string;
  domain: string;
  is_active: boolean;
  is_primary: boolean;
  product_count: number;
  last_sync: string | null;
};

export type StoreConnectionsState =
  | { kind: "loading" }
  | { kind: "error"; retry: () => void }
  | { kind: "ready"; stores: ConnectedStore[] };

export type StoreAction = { storeId: string; kind: "sync" | "primary" | "disconnect" } | null;

export type StoreNotice = { tone: "ok" | "err"; key: string } | null;

export function StoreConnectionsView({
  state,
  busy,
  confirming,
  confirmArmed = false,
  notice,
  onSync,
  onMakePrimary,
  onAskDisconnect,
  onCancelDisconnect,
  onDisconnect,
}: {
  state: StoreConnectionsState;
  busy: StoreAction;
  confirming: string | null;
  /** False for CONFIRM_ARM_MS after the confirm appears: the second click of a double-click on
   * "Disconnect" lands where "Yes, disconnect" now is, and must not disconnect the store. */
  confirmArmed?: boolean;
  notice: StoreNotice;
  onSync: (store: ConnectedStore) => void;
  onMakePrimary: (store: ConnectedStore) => void;
  onAskDisconnect: (store: ConnectedStore) => void;
  onCancelDisconnect: () => void;
  onDisconnect: (store: ConnectedStore) => void;
}) {
  const { t, language } = useMerchantLanguage();
  const head = (
    <div className="rv-head">
      <div style={{ minWidth: 0 }}>
        <Link href="/dashboard/settings" className="rv-link rv-small" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
          <ChevronLeft size={14} aria-hidden="true" />
          {t("recovery.orders.back")}
        </Link>
        <h1 className="rv-h1" style={{ marginTop: 6 }}>{t("recovery.stores.title")}</h1>
        <p className="rv-muted" style={{ margin: "4px 0 0" }}>{t("recovery.stores.subtitle")}</p>
      </div>
      <div className="rv-actions">
        <ButtonLink href={RECOVERY_CONNECT_HREF} primary>{t("recovery.settings.storeConnect")}</ButtonLink>
      </div>
    </div>
  );

  if (state.kind === "loading") {
    return (
      <>
        {head}
        <div className="rv-card" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }} aria-busy="true">
          {[0, 1].map((i) => <Skeleton key={i} />)}
        </div>
      </>
    );
  }
  if (state.kind === "error") {
    return (
      <>
        {head}
        <EmptyState
          title={t("recovery.stores.loadFailed")}
          body={t("recovery.stores.empty.body")}
          action={<button type="button" className="rv-btn" onClick={state.retry}>{t("recovery.stores.retry")}</button>}
        />
      </>
    );
  }
  if (state.stores.length === 0) {
    return (
      <>
        {head}
        <EmptyState
          title={t("recovery.stores.empty.title")}
          body={t("recovery.stores.empty.body")}
          action={<ButtonLink href={RECOVERY_CONNECT_HREF} primary>{t("recovery.settings.storeConnect")}</ButtonLink>}
        />
      </>
    );
  }

  const anyBusy = busy !== null;
  return (
    <>
      {head}
      {notice ? (
        <div className={`rv-alert ${notice.tone === "err" ? "rv-err" : ""}`} role={notice.tone === "err" ? "alert" : "status"}>
          {t(notice.key)}
        </div>
      ) : null}
      <section className="rv-card" style={{ overflow: "hidden" }}>
        <div className="rv-scroll-x">
          <table className="rv-tbl">
            <thead>
              <tr>
                <th scope="col">{t("recovery.stores.col.store")}</th>
                <th scope="col">{t("recovery.stores.col.platform")}</th>
                <th scope="col">{t("recovery.stores.col.products")}</th>
                <th scope="col">{t("recovery.stores.col.lastSync")}</th>
                <th scope="col"><span className="rv-sr-only">{t("recovery.stores.col.actions")}</span></th>
              </tr>
            </thead>
            <tbody>
              {state.stores.map((store) => {
                const isBusy = busy?.storeId === store.id;
                return (
                  <tr key={store.id}>
                    <td>
                      <span style={{ fontWeight: 500, display: "inline-flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        {store.name}
                        {store.is_primary ? <Badge tone="brand">{t("recovery.stores.primary")}</Badge> : null}
                        {store.is_active ? null : <Badge tone="neu">{t("recovery.stores.inactive")}</Badge>}
                      </span>
                      {store.domain && store.domain !== store.name ? <div className="rv-muted rv-small">{store.domain}</div> : null}
                    </td>
                    <td>{platformLabel(store.platform)}</td>
                    <td className="rv-num">{formatNumber(store.product_count, language)}</td>
                    <td className="rv-muted">{formatDate(store.last_sync, language) ?? t("recovery.stores.notSynced")}</td>
                    <td>
                      {confirming === store.id ? (
                        <div className="rv-actions" style={{ justifyContent: "flex-end" }}>
                          <span className="rv-small">{t("recovery.stores.disconnect.confirm")}</span>
                          <button type="button" className="rv-btn rv-sm" disabled={anyBusy || !confirmArmed} onClick={() => onDisconnect(store)}>
                            {isBusy && busy?.kind === "disconnect" ? t("recovery.stores.working") : t("recovery.stores.disconnect.yes")}
                          </button>
                          <button type="button" className="rv-btn rv-sm" disabled={anyBusy} onClick={onCancelDisconnect}>
                            {t("recovery.stores.disconnect.no")}
                          </button>
                        </div>
                      ) : (
                        <div className="rv-actions" style={{ justifyContent: "flex-end" }}>
                          <button type="button" className="rv-btn rv-sm" disabled={anyBusy || !store.is_active} onClick={() => onSync(store)}>
                            {isBusy && busy?.kind === "sync" ? t("recovery.stores.working") : t("recovery.stores.sync")}
                          </button>
                          {store.is_primary || !store.is_active ? null : (
                            <button type="button" className="rv-btn rv-sm" disabled={anyBusy} onClick={() => onMakePrimary(store)}>
                              {isBusy && busy?.kind === "primary" ? t("recovery.stores.working") : t("recovery.stores.makePrimary")}
                            </button>
                          )}
                          <button type="button" className="rv-btn rv-sm" disabled={anyBusy} onClick={() => onAskDisconnect(store)}>
                            {t("recovery.stores.disconnect")}
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
      <p className="rv-muted rv-small" style={{ margin: 0 }}>{t("recovery.stores.footnote")}</p>
    </>
  );
}

/** How long "Yes, disconnect" ignores clicks after the confirm appears (review of a208353: ~30% of the
 * Disconnect button sat under "Yes, disconnect", so a double-click disconnected the store). */
export const CONFIRM_ARM_MS = 600;

export type DisconnectConfirm = { storeId: string; askedAt: number } | null;

type ActKind = "sync" | "primary" | "disconnect";

/** The page's handlers, without React, so the confirm rule can be tested by calling them. */
export function storeActions(deps: {
  act: (store: ConnectedStore, kind: ActKind, run: () => Promise<unknown>, okKey: string, errKey: string) => void;
  api: { sync: (store: ConnectedStore) => Promise<unknown>; makePrimary: (storeId: string) => Promise<unknown>; disconnect: (storeId: string) => Promise<unknown> };
  getConfirm: () => DisconnectConfirm;
  setConfirm: (value: DisconnectConfirm) => void;
  setNotice: (value: StoreNotice) => void;
  now: () => number;
}) {
  return {
    onSync: (store: ConnectedStore) => deps.act(store, "sync", () => deps.api.sync(store), "recovery.stores.sync.done", "recovery.stores.sync.failed"),
    onMakePrimary: (store: ConnectedStore) =>
      deps.act(store, "primary", () => deps.api.makePrimary(store.id), "recovery.stores.primary.done", "recovery.stores.primary.failed"),
    onAskDisconnect: (store: ConnectedStore) => {
      deps.setNotice(null);
      deps.setConfirm({ storeId: store.id, askedAt: deps.now() });
    },
    onCancelDisconnect: () => deps.setConfirm(null),
    onDisconnect: (store: ConnectedStore) => {
      // Only an armed confirm for THIS store disconnects: never a click without one, never another
      // row's, never inside the arm window.
      const confirm = deps.getConfirm();
      if (!confirm || confirm.storeId !== store.id || deps.now() - confirm.askedAt < CONFIRM_ARM_MS) return;
      deps.act(store, "disconnect", () => deps.api.disconnect(store.id), "recovery.stores.disconnect.done", "recovery.stores.disconnect.failed");
    },
  };
}

export function StoreConnectionsPage() {
  const { merchantId, refresh } = useRecovery();
  const [state, setState] = useState<StoreConnectionsState>({ kind: "loading" });
  const [busy, setBusy] = useState<StoreAction>(null);
  const [confirm, setConfirmState] = useState<DisconnectConfirm>(null);
  const confirmRef = useRef<DisconnectConfirm>(null);
  const [armed, setArmed] = useState(false);
  const setConfirm = useCallback((value: DisconnectConfirm) => {
    confirmRef.current = value;
    setConfirmState(value);
  }, []);
  useEffect(() => {
    setArmed(false);
    if (!confirm) return;
    const timer = setTimeout(() => setArmed(true), CONFIRM_ARM_MS);
    return () => clearTimeout(timer);
  }, [confirm]);
  const [notice, setNotice] = useState<StoreNotice>(null);
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((value) => value + 1), []);

  useEffect(() => {
    if (!merchantId) {
      // A session without a merchant id can't list stores; say so instead of loading forever.
      setState({ kind: "error", retry: reload });
      return;
    }
    let cancelled = false;
    apiClient
      .getConnectedStores(merchantId)
      .then((stores: ConnectedStore[]) => {
        if (!cancelled) setState({ kind: "ready", stores: Array.isArray(stores) ? stores : [] });
      })
      .catch(() => {
        if (!cancelled) setState({ kind: "error", retry: reload });
      });
    return () => {
      cancelled = true;
    };
  }, [merchantId, tick, reload]);

  const act = async (store: ConnectedStore, kind: ActKind, run: () => Promise<unknown>, okKey: string, errKey: string) => {
    setBusy({ storeId: store.id, kind });
    setNotice(null);
    try {
      await run();
      setNotice({ tone: "ok", key: okKey });
      setConfirm(null);
      reload();
      refresh(); // the shell's store card follows the connection
    } catch {
      setNotice({ tone: "err", key: errKey });
    } finally {
      setBusy(null);
    }
  };

  const handlers = storeActions({
    act: (store, kind, run, okKey, errKey) => void act(store, kind, run, okKey, errKey),
    api: {
      sync: (store) => (store.platform === "shopify" ? apiClient.syncShopifyProducts(merchantId as string) : apiClient.syncPlatformProducts(store.platform)),
      makePrimary: (storeId) => apiClient.setPrimaryStore(storeId),
      disconnect: (storeId) => apiClient.deleteStore(storeId),
    },
    getConfirm: () => confirmRef.current,
    setConfirm,
    setNotice,
    now: () => Date.now(),
  });

  return (
    <StoreConnectionsView
      state={state}
      busy={busy}
      confirming={confirm?.storeId ?? null}
      confirmArmed={armed}
      notice={notice}
      {...handlers}
    />
  );
}
