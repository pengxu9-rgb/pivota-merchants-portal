"use client";

import { useState } from "react";
import { Info } from "lucide-react";
import { useMerchantLanguage } from "@/components/portal/merchant-language-provider";
import { Badge, ButtonLink, EmptyState, PageHead, Skeleton, formatDate } from "@/components/recovery-v2/ui";
import { RECOVERY_CONNECT_HREF, RECOVERY_RUN_HREF } from "@/lib/recovery-v2/navigation";
import { isStoreConnected, type StoreMode } from "@/lib/recovery-v2/mode";
import type { BandCell, ProductRow, SuggestedCopy } from "@/lib/recovery-v2/products";

type T = (key: string, vars?: Record<string, string | number | undefined>) => string;

export type ProductsState =
  | { kind: "loading" }
  | { kind: "error"; retry: () => void }
  | { kind: "none" }
  | { kind: "ready"; rows: ProductRow[]; catalogRun: boolean };

export type CopyState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "none" }
  | { kind: "error" }
  | { kind: "no_ref" }
  | { kind: "ready"; copy: SuggestedCopy };

export type ProductsViewProps = {
  state: ProductsState;
  mode: StoreMode;
  linksCount: number | null;
  selectedKey: string | null;
  copy: CopyState;
  sync: "idle" | "running" | "started" | "failed";
  onSelect: (row: ProductRow) => void;
  onClose: () => void;
  onSync: () => void;
};

function BandBadge({ cell, t }: { cell: BandCell; t: T }) {
  if (cell.kind === "unscored") return <Badge tone="neu">{t("recovery.products.unscored")}</Badge>;
  if (cell.kind === "missing") return <span className="rv-muted">—</span>;
  return <Badge tone={cell.tone}>{cell.bandKey ? t(cell.bandKey) : cell.bandLabel}</Badge>;
}

function CopyField({ label, text, t }: { label: string; text: string; t: T }) {
  const [copied, setCopied] = useState(false);
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 6 }}>
        <span className="rv-label">{label}</span>
        <button
          type="button"
          className="rv-btn rv-sm"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(text);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            } catch {
              /* clipboard unavailable */
            }
          }}
        >
          {copied ? t("recovery.products.copy.copied") : t("recovery.products.copy.copy")}
        </button>
      </div>
      <div style={{ padding: "10px 12px", borderRadius: 8, border: "1px solid var(--accent-line)", lineHeight: 1.55, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{text}</div>
    </div>
  );
}

function CopyPanel({ row, copy, t, onClose }: { row: ProductRow; copy: CopyState; t: T; onClose: () => void }) {
  return (
    <section className="rv-card" style={{ padding: 20, display: "flex", flexDirection: "column", gap: 16 }} aria-label={row.title}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="rv-label">{t("recovery.products.copy.kicker")}</div>
          <h2 className="rv-h2" style={{ margin: "4px 0 0", fontSize: 16 }}>{row.title}</h2>
        </div>
        <button type="button" className="rv-btn rv-ghost" style={{ flex: "none" }} onClick={onClose} aria-label={t("recovery.sources.detail.close")}>×</button>
      </div>
      <div className="rv-actions">
        {copy.kind === "ready" && copy.copy.adminUrl ? (
          <a className="rv-btn" href={copy.copy.adminUrl} target="_blank" rel="noopener noreferrer">{t("recovery.products.copy.openAdmin")}</a>
        ) : null}
        <button type="button" className="rv-btn rv-primary" disabled aria-disabled="true" title={t("recovery.products.copy.publishOff")}>
          {t("recovery.products.copy.publish")}
        </button>
      </div>
      <Gaps row={row} t={t} />
      {copy.kind === "loading" || copy.kind === "idle" ? (
        <div aria-busy="true" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <span className="rv-muted">{t("recovery.products.copy.loading")}</span>
          <Skeleton />
          <Skeleton width="70%" />
        </div>
      ) : copy.kind === "none" ? (
        <p className="rv-muted" style={{ margin: 0 }}>{t("recovery.products.copy.none")}</p>
      ) : copy.kind === "no_ref" ? (
        <p className="rv-muted" style={{ margin: 0 }}>{t("recovery.products.copy.noRef")}</p>
      ) : copy.kind === "error" ? (
        <div className="rv-alert rv-err" role="alert">{t("recovery.products.copy.failed")}</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {copy.copy.title ? <CopyField label={t("recovery.products.copy.titleField")} text={copy.copy.title} t={t} /> : null}
          {copy.copy.summary ? <CopyField label={t("recovery.products.copy.summaryField")} text={copy.copy.summary} t={t} /> : null}
          {copy.copy.description ? <CopyField label={t("recovery.products.copy.descriptionField")} text={copy.copy.description} t={t} /> : null}
          {copy.copy.bullets.length ? <CopyField label={t("recovery.products.copy.bulletsField")} text={copy.copy.bullets.map((b) => `• ${b}`).join("\n")} t={t} /> : null}
        </div>
      )}
      <div className="rv-note">
        <Info size={16} aria-hidden="true" style={{ flex: "none", marginTop: 2 }} />
        <span>{t("recovery.products.copy.publishOff")}</span>
      </div>
    </section>
  );
}

function Gaps({ row, t }: { row: ProductRow; t: T }) {
  if (!row.gaps.length) return null;
  return (
    <div>
      <div className="rv-label" style={{ marginBottom: 6 }}>{t("recovery.products.gaps")}</div>
      <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.6 }}>
        {row.gaps.map((gap) => (
          <li key={gap.label}>
            <span style={{ fontWeight: 500 }}>{gap.label}</span>
            {gap.why ? <span className="rv-muted"> — {gap.why}</span> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

function ActionPlan({ row, t, onClose }: { row: ProductRow; t: T; onClose: () => void }) {
  return (
    <section className="rv-card" style={{ padding: 20, display: "flex", flexDirection: "column", gap: 16 }} aria-label={row.title}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <div className="rv-label">{t("recovery.products.plan.kicker")}</div>
          <h2 className="rv-h2" style={{ margin: "4px 0 0", fontSize: 16 }}>{row.title}</h2>
          <div className="rv-muted" style={{ marginTop: 4 }}>{t("recovery.products.plan.intro")}</div>
        </div>
        <button type="button" className="rv-btn rv-ghost" onClick={onClose} aria-label={t("recovery.sources.detail.close")}>×</button>
      </div>
      <Gaps row={row} t={t} />
      <div style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: 12, border: "1px solid var(--line)", borderRadius: 8 }}>
        <span className="rv-step rv-on">1</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 500 }}>{t("recovery.products.plan.sources.title")}</div>
          <div className="rv-muted rv-small" style={{ marginTop: 2 }}>{t("recovery.products.plan.sources.body")}</div>
        </div>
        <ButtonLink href="/dashboard/sources">{t("recovery.products.plan.sources.cta")}</ButtonLink>
      </div>
      <div style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: 12, border: "1px solid var(--accent-line)", borderRadius: 8, background: "var(--accent-wash)" }}>
        <span className="rv-step rv-solid">2</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 500 }}>{t("recovery.products.plan.connect.title")}</div>
          <div className="rv-muted rv-small" style={{ marginTop: 2 }}>{t("recovery.products.plan.connect.body")}</div>
        </div>
        <ButtonLink href={RECOVERY_CONNECT_HREF} primary>{t("recovery.products.plan.connect.cta")}</ButtonLink>
      </div>
    </section>
  );
}

export function ProductsView({ state, mode, linksCount, selectedKey, copy, sync, onSelect, onClose, onSync }: ProductsViewProps) {
  const { t } = useMerchantLanguage();
  const connected = isStoreConnected(mode);
  const scope =
    mode.kind === "connected"
      ? t("recovery.products.scope.connected", { platform: mode.platform, count: mode.productCount.toLocaleString("en-US"), when: formatDate(mode.lastSync) ?? "—" })
      : mode.kind === "first_sync"
        ? t("recovery.products.scope.connectedNoSync", { platform: mode.platform })
        : linksCount
          ? t("recovery.products.scope.links", { count: linksCount })
          : t("recovery.products.scope.linksNoCount");
  const actions = connected ? (
    <button type="button" className="rv-btn" onClick={onSync} disabled={sync === "running" || mode.kind === "first_sync"}>
      {sync === "running" ? t("recovery.products.syncing") : t("recovery.products.sync")}
    </button>
  ) : (
    <>
      <ButtonLink href={RECOVERY_RUN_HREF}>{t("recovery.products.addLinks")}</ButtonLink>
      <ButtonLink href={RECOVERY_CONNECT_HREF} primary>{t("recovery.products.connect")}</ButtonLink>
    </>
  );
  const head = <PageHead title={t("recovery.products.title")} subtitle={scope} actions={actions} />;
  const syncNote =
    sync === "started" ? <div className="rv-note" role="status">{t("recovery.products.synced")}</div>
      : sync === "failed" ? <div className="rv-alert rv-err" role="alert">{t("recovery.products.syncFailed")}</div>
        : null;

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
  if (state.kind === "none" || state.rows.length === 0) {
    return (
      <>
        {head}
        {syncNote}
        <EmptyState title={t("recovery.products.empty.title")} body={t("recovery.products.empty.body")} action={<ButtonLink href={RECOVERY_RUN_HREF} primary>{t("recovery.products.empty.cta")}</ButtonLink>} />
      </>
    );
  }

  const selected = state.rows.find((row) => row.key === selectedKey) ?? null;
  const copyMode = connected && state.catalogRun;
  const select = (row: ProductRow) => {
    onSelect(row);
    // Phones stack the detail under the table: bring it into view.
    if (typeof window !== "undefined" && window.matchMedia?.("(max-width: 767px)").matches) {
      setTimeout(() => document.getElementById("rv-product-detail")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    }
  };
  return (
    <>
      {head}
      {syncNote}
      <section className="rv-card" style={{ overflow: "hidden" }}>
        <div className="rv-scroll-x">
          <table className="rv-tbl">
            <thead>
              <tr>
                <th scope="col">{t("recovery.products.col.product")}</th>
                <th scope="col">{t("recovery.dim.identity")}</th>
                <th scope="col">{t("recovery.dim.content")}</th>
                <th scope="col">{t("recovery.dim.citation")}</th>
                <th scope="col" className="rv-hide-phone">{t("recovery.products.col.next")}</th>
                <th scope="col" className="rv-hide-phone"><span className="rv-sr-only">{t("recovery.products.review")}</span></th>
              </tr>
            </thead>
            <tbody>
              {state.rows.map((row) => (
                <tr key={row.key} aria-selected={row.key === selectedKey}>
                  <th scope="row">
                    <button type="button" onClick={() => select(row)} style={{ all: "unset", cursor: "pointer", fontWeight: 500 }}>
                      {row.title}
                    </button>
                  </th>
                  <td><BandBadge cell={row.identity} t={t} /></td>
                  <td><BandBadge cell={row.content} t={t} /></td>
                  <td><BandBadge cell={row.citation} t={t} /></td>
                  <td className="rv-hide-phone"><Badge tone="brand">{copyMode ? t("recovery.products.next.copy") : t("recovery.products.next.plan")}</Badge></td>
                  <td style={{ textAlign: "right" }} className="rv-hide-phone">
                    <button type="button" className="rv-btn rv-sm" onClick={() => select(row)}>{t("recovery.products.review")}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="rv-card-foot" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12 }}>
          <span style={{ flex: "1 1 320px" }}>
            {copyMode
              ? t("recovery.products.footer.connected", { count: state.rows.length })
              : t("recovery.products.footer.links", { count: state.rows.length })}
          </span>
          {!connected ? <ButtonLink href={RECOVERY_CONNECT_HREF}>{t("recovery.products.connect")}</ButtonLink> : null}
        </div>
      </section>
      <div id="rv-product-detail" style={{ scrollMarginTop: 16 }}>
        {selected ? (
          copyMode ? <CopyPanel row={selected} copy={copy} t={t} onClose={onClose} /> : <ActionPlan row={selected} t={t} onClose={onClose} />
        ) : (
          <p className="rv-muted" style={{ margin: 0 }}>{t("recovery.products.pick")}</p>
        )}
      </div>
    </>
  );
}
