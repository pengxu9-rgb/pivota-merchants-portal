"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { apiClient } from "@/lib/api-client";
import { useMerchantLanguage } from "@/components/portal/merchant-language-provider";
import { useRecovery } from "@/components/recovery-v2/RecoveryContext";
import { Badge, ButtonLink, EmptyState, PageHead, Skeleton, formatDate } from "@/components/recovery-v2/ui";
import { RECOVERY_CONNECT_HREF, RECOVERY_RUN_HREF } from "@/lib/recovery-v2/navigation";
import { isStoreConnected } from "@/lib/recovery-v2/mode";
import { runPhase } from "@/lib/recovery-v2/overview";
import type { AuditRunSummary } from "@/lib/types/ai-readiness";

/** Checkout: names the storefront check and keeps it apart from Convert, the
 * agent checkout test on the Overview (which stays "Not run yet"). */
export function RecoveryCheckoutHeader() {
  const { t } = useMerchantLanguage();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <PageHead title={t("recovery.nav.checkout")} subtitle={t("recovery.checkout.subtitle")} />
      <div className="rv-note">{t("recovery.checkout.note")}</div>
    </div>
  );
}

export function RecoveryOrdersHeader() {
  const { t } = useMerchantLanguage();
  return (
    <div>
      <Link href="/dashboard/settings" className="rv-link rv-small" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
        <ChevronLeft size={14} aria-hidden="true" />
        {t("recovery.orders.back")}
      </Link>
      <h1 className="rv-h1" style={{ marginTop: 6 }}>{t("recovery.orders.title")}</h1>
      <p className="rv-muted" style={{ margin: "4px 0 0" }}>{t("recovery.settings.ordersBody")}</p>
    </div>
  );
}

/** Settings: store connection and Past orders & refunds, above the existing
 * settings (profile, password, language). */
export function RecoverySettingsHeader() {
  const { t } = useMerchantLanguage();
  const { mode } = useRecovery();
  const connected = isStoreConnected(mode);
  return (
    <div className="rv-grid rv-grid-halves">
      <section className="rv-card" style={{ padding: 18, display: "flex", flexDirection: "column", gap: 10 }}>
        <h2 className="rv-h2">{t("recovery.settings.store")}</h2>
        {connected && (mode.kind === "connected" || mode.kind === "first_sync") ? (
          <p style={{ margin: 0 }}>
            {mode.kind === "first_sync" ? t("recovery.store.firstSync") : t("recovery.store.connected", { platform: mode.platform })}
          </p>
        ) : (
          <p className="rv-muted" style={{ margin: 0 }}>{t("recovery.settings.storeNone")}</p>
        )}
        <div className="rv-actions">
          {connected ? null : <ButtonLink href={RECOVERY_CONNECT_HREF} primary>{t("recovery.settings.storeConnect")}</ButtonLink>}
          <ButtonLink href="/dashboard/settings/stores">{t("recovery.settings.storeManage")}</ButtonLink>
        </div>
      </section>
      <section className="rv-card" style={{ padding: 18, display: "flex", flexDirection: "column", gap: 10 }}>
        <h2 className="rv-h2">{t("recovery.settings.orders")}</h2>
        <p className="rv-muted" style={{ margin: 0, lineHeight: 1.5 }}>{t("recovery.settings.ordersBody")}</p>
        <div><ButtonLink href="/dashboard/settings/orders">{t("recovery.settings.ordersOpen")}</ButtonLink></div>
      </section>
    </div>
  );
}

export type ReportRow = { run: AuditRunSummary; kind: "links" | "catalog" };

export type ReportsState =
  | { kind: "loading" }
  | { kind: "error"; retry: () => void }
  | { kind: "ready"; rows: ReportRow[] };

export function ReportsView({ state }: { state: ReportsState }) {
  const { t, language } = useMerchantLanguage();
  const head = <PageHead title={t("recovery.reports.title")} subtitle={t("recovery.reports.subtitle")} actions={<ButtonLink href={RECOVERY_RUN_HREF} primary>{t("recovery.overview.runCheck")}</ButtonLink>} />;
  if (state.kind === "loading") {
    return (
      <>
        {head}
        <div className="rv-card" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }} aria-busy="true">
          {[0, 1, 2].map((i) => <Skeleton key={i} />)}
        </div>
      </>
    );
  }
  if (state.kind === "error") {
    return (
      <>
        {head}
        <EmptyState title={t("recovery.state.error.title")} body={t("recovery.state.error.body")} action={<button type="button" className="rv-btn" onClick={state.retry}>{t("recovery.state.retry")}</button>} />
      </>
    );
  }
  if (state.rows.length === 0) {
    return (
      <>
        {head}
        <EmptyState title={t("recovery.reports.empty.title")} body={t("recovery.reports.empty.body")} action={<ButtonLink href={RECOVERY_RUN_HREF} primary>{t("recovery.state.none.cta")}</ButtonLink>} />
      </>
    );
  }
  return (
    <>
      {head}
      <section className="rv-card" style={{ overflow: "hidden" }}>
        <div className="rv-scroll-x">
          <table className="rv-tbl">
            <thead>
              <tr>
                <th scope="col">{t("recovery.reports.col.date")}</th>
                <th scope="col">{t("recovery.reports.col.kind")}</th>
                <th scope="col" className="rv-hide-phone">{t("recovery.reports.col.products")}</th>
                <th scope="col">{t("recovery.reports.col.status")}</th>
                <th scope="col"><span className="rv-sr-only">{t("recovery.reports.open")}</span></th>
              </tr>
            </thead>
            <tbody>
              {state.rows.map(({ run, kind }) => {
                const phase = runPhase(run);
                return (
                  <tr key={run.run_id ?? run.requested_at ?? Math.random()}>
                    <th scope="row" className="rv-num">{formatDate(run.completed_at ?? run.requested_at, language) ?? "—"}</th>
                    <td>{t(kind === "links" ? "recovery.reports.kind.links" : "recovery.reports.kind.catalog")}</td>
                    <td className="rv-num rv-hide-phone">{Array.isArray(run.product_keys) ? run.product_keys.length : "—"}</td>
                    <td>
                      <Badge tone={phase === "done" ? "ok" : phase === "failed" ? "err" : "warn"}>
                        {t(phase === "done" ? "recovery.reports.status.done" : phase === "failed" ? "recovery.reports.status.failed" : "recovery.reports.status.running")}
                      </Badge>
                    </td>
                    <td style={{ textAlign: "right" }}>
                      {phase === "done" ? (
                        <Link className="rv-btn rv-sm" href={kind === "links" ? "/dashboard/agent-center/url-audit" : "/dashboard/agent-center/ai-readiness"} title={t("recovery.reports.openHint")} aria-label={t("recovery.reports.open")}>
                          {t("recovery.settings.ordersOpen")}
                        </Link>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="rv-card-foot">
          {t("recovery.reports.latestOnOverview")} {t("recovery.reports.openHint")} {t("recovery.reports.share")}
        </div>
      </section>
    </>
  );
}

export function RecoveryReports() {
  const [state, setState] = useState<ReportsState>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => {
    setState({ kind: "loading" });
    setAttempt((value) => value + 1);
  }, []);
  useEffect(() => {
    let cancelled = false;
    Promise.all([apiClient.listAuditRuns(20, "merchant_url"), apiClient.listAuditRuns(20, "merchant")])
      .then(([links, catalog]) => {
        if (cancelled) return;
        const rows: ReportRow[] = [
          ...links.map((run) => ({ run, kind: "links" as const })),
          ...catalog.map((run) => ({ run, kind: "catalog" as const })),
        ].sort((a, b) => String(b.run.requested_at ?? "").localeCompare(String(a.run.requested_at ?? "")));
        setState({ kind: "ready", rows });
      })
      .catch(() => {
        if (!cancelled) setState({ kind: "error", retry });
      });
    return () => {
      cancelled = true;
    };
  }, [attempt, retry]);
  return <ReportsView state={state} />;
}
