"use client";

import type { ReactNode } from "react";
import { useMerchantLanguage } from "@/components/portal/merchant-language-provider";
import { Badge, Bar, ButtonLink, EmptyState, PageHead, Skeleton, formatDate } from "@/components/recovery-v2/ui";
import { RECOVERY_CONNECT_HREF, RECOVERY_RUN_HREF } from "@/lib/recovery-v2/navigation";
import { isStoreConnected, type StoreMode } from "@/lib/recovery-v2/mode";
import { percent, type AnswerCell, type DimensionRow, type OverviewModel, type TierRow } from "@/lib/recovery-v2/overview";

type T = (key: string, vars?: Record<string, string | number | undefined>) => string;

export type OverviewState =
  | { kind: "loading" }
  | { kind: "none" }
  | { kind: "running" }
  | { kind: "failed" }
  | { kind: "error"; retry: () => void }
  | { kind: "legacy"; reportHref: string }
  | { kind: "ready"; model: OverviewModel; checkedAt: string | null };

function DimensionLine({ row, mode, t }: { row: DimensionRow; mode: StoreMode; t: T }) {
  let right: ReactNode;
  if (row.state === "needs_store") {
    right = isStoreConnected(mode)
      ? <span className="rv-muted rv-small">{t("recovery.dim.rerunWithCatalog")}</span>
      : <Badge tone="neu">{t("recovery.dim.needsStore")}</Badge>;
  } else if (row.state === "not_in_check") {
    right = <span className="rv-muted rv-small">{t("recovery.dim.notInCheck")}</span>;
  } else {
    const spread = row.p25 != null && row.p75 != null ? ` · ${t("recovery.dim.middle", { low: row.p25, high: row.p75 })}` : "";
    return (
      <div className="rv-row">
        <span style={{ minWidth: 0 }}>
          <span style={{ fontWeight: 500 }}>{t(row.labelKey)}</span>
          <span className="rv-mono rv-muted" style={{ display: "block", marginTop: 2, fontSize: 11 }}>
            {t("recovery.dim.median", { median: row.median ?? "—", count: row.n ?? "—" })}
            {spread}
          </span>
        </span>
        <Badge tone={row.tone}>{row.bandKey ? t(row.bandKey) : row.bandLabel || t("recovery.dim.notInCheck")}</Badge>
      </div>
    );
  }
  return (
    <div className="rv-row">
      <span style={{ fontWeight: 500 }}>{t(row.labelKey)}</span>
      {right}
    </div>
  );
}

function StageCard({ step, title, question, children }: { step: number; title: string; question: string; children: ReactNode }) {
  return (
    <section className="rv-card" style={{ display: "flex", flexDirection: "column", gap: 12, padding: "18px 20px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span className="rv-step">{step}</span>
        <h2 className="rv-h2">{title}</h2>
      </div>
      <p className="rv-muted" style={{ margin: 0 }}>{question}</p>
      <div>{children}</div>
    </section>
  );
}

function leftOut(t: T, unknown: number, failed: number): string | null {
  const parts = [
    unknown > 0 ? t("recovery.tier.unknownCount", { count: unknown }) : null,
    failed > 0 ? t("recovery.tier.failedCount", { count: failed }) : null,
  ].filter(Boolean);
  return parts.length ? t("recovery.tier.leftOut", { parts: parts.join(", ") }) : null;
}

function Cell({ cell, t }: { cell: AnswerCell; t: T }) {
  if (cell.kind === "not_measured_type") return <td className="rv-muted rv-small">{t("recovery.tier.notMeasuredType")}</td>;
  if (cell.kind === "not_measured_check") return <td className="rv-muted rv-small">{t("recovery.tier.notMeasuredCheck")}</td>;
  const out = leftOut(t, cell.unknown, cell.failed);
  if (cell.kind === "no_readable") {
    return (
      <td>
        <span className="rv-muted">{t("recovery.tier.noReadable")}</span>
        {out ? <div className="rv-muted rv-tiny rv-num" style={{ marginTop: 2 }}>{out}</div> : null}
        {cell.panel ? <div className="rv-muted rv-tiny" style={{ marginTop: 2 }}>{t("recovery.tier.usPanel")}</div> : null}
      </td>
    );
  }
  const of = t("recovery.tier.of", { positive: cell.positive, n: cell.n });
  return (
    <td>
      <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <Bar value={cell.rate} label={of} />
        <span className="rv-num">{of}</span>
      </span>
      <div className="rv-muted rv-tiny rv-num" style={{ marginTop: 2 }}>
        {cell.ci ? t("recovery.tier.range", { low: percent(cell.ci[0]), high: percent(cell.ci[1]) }) : t("recovery.tier.rangeNotReported")}
      </div>
      {out ? <div className="rv-muted rv-tiny rv-num">{out}</div> : null}
      {cell.panel ? <div className="rv-muted rv-tiny">{t("recovery.tier.usPanel")}</div> : null}
    </td>
  );
}

function TierTable({ model, t }: { model: OverviewModel; t: T }) {
  return (
    <section className="rv-card" style={{ overflow: "hidden" }}>
      <div className="rv-card-head">
        <h2 className="rv-h2">{t("recovery.tier.title")}</h2>
      </div>
      {model.unavailableReason ? (
        <div className="rv-alert rv-warn" style={{ margin: 16 }}>
          {t("recovery.tier.unavailable")} {model.unavailableReason}
        </div>
      ) : null}
      <div className="rv-scroll-x">
        <table className="rv-tbl">
          <thead>
            <tr>
              <th scope="col">{t("recovery.tier.col.question")}</th>
              <th scope="col">{t("recovery.tier.col.brand")}</th>
              <th scope="col">{t("recovery.tier.col.sources")}</th>
              <th scope="col">{t("recovery.tier.col.exact")}</th>
            </tr>
          </thead>
          <tbody>
            {model.tiers.map((row: TierRow) => (
              <tr key={row.tier}>
                <th scope="row">{t(row.labelKey)}</th>
                {row.kind === "not_asked" ? (
                  <td colSpan={3} className="rv-muted">{t("recovery.tier.notAsked")}</td>
                ) : (
                  <>
                    <Cell cell={row.brand} t={t} />
                    <Cell cell={row.sources} t={t} />
                    <Cell cell={row.exact} t={t} />
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="rv-card-foot">
        {t("recovery.tier.footer")}
        {model.mixedConditions ? <div style={{ marginTop: 6 }}>{t("recovery.tier.mixed")}</div> : null}
        {model.unclassified > 0 ? <div style={{ marginTop: 6 }}>{t("recovery.tier.unclassified", { count: model.unclassified })}</div> : null}
      </div>
    </section>
  );
}

function NextActions({ mode, t, extra }: { mode: StoreMode; t: T; extra?: ReactNode }) {
  const connected = isStoreConnected(mode);
  const items: { title: string; body: string; href: string; cta: string; primary?: boolean }[] = [
    connected
      ? { title: t("recovery.next.review.title"), body: t("recovery.next.review.body"), href: "/dashboard/products", cta: t("recovery.next.review.cta"), primary: true }
      : { title: t("recovery.next.connect.title"), body: t("recovery.next.connect.body"), href: RECOVERY_CONNECT_HREF, cta: t("recovery.next.connect.cta"), primary: true },
    { title: t("recovery.next.rerun.title"), body: t("recovery.next.rerun.body"), href: RECOVERY_RUN_HREF, cta: t("recovery.next.rerun.cta") },
  ];
  return (
    <section className="rv-card">
      <div className="rv-card-head">
        <h2 className="rv-h2">{t("recovery.next.title")}</h2>
      </div>
      <ol style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {items.map((item, index) => (
          <li key={item.title} style={{ display: "flex", gap: 14, alignItems: "center", padding: "14px 16px", borderTop: index ? "1px solid var(--divider)" : 0 }}>
            <span className={`rv-step${item.primary ? " rv-on" : ""}`}>{index + 1}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 500 }}>{item.title}</div>
              <div className="rv-muted rv-small" style={{ marginTop: 2 }}>{item.body}</div>
            </div>
            <ButtonLink href={item.href} primary={item.primary}>{item.cta}</ButtonLink>
          </li>
        ))}
      </ol>
      {extra}
    </section>
  );
}

export function LinksCallout({ count, t }: { count: number | null; t: T }) {
  return (
    <section className="rv-card rv-callout" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 16, padding: "16px 18px" }}>
      <div style={{ flex: "1 1 420px", minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontWeight: 600 }}>
            {count ? t("recovery.overview.linksCallout.title", { count }) : t("recovery.overview.linksCallout.titleNoCount")}
          </span>
          <Badge tone="brand">{t("recovery.overview.linksCallout.badge")}</Badge>
        </div>
        <div className="rv-muted" style={{ marginTop: 4, lineHeight: 1.5 }}>{t("recovery.overview.linksCallout.body")}</div>
      </div>
      <ButtonLink href={RECOVERY_CONNECT_HREF} primary>{t("recovery.overview.linksCallout.connect")}</ButtonLink>
    </section>
  );
}

export type OverviewViewProps = {
  state: OverviewState;
  mode: StoreMode;
  linksCount: number | null;
  /** Slot for later slices (e.g. the Sources card). */
  aside?: ReactNode;
  nextExtra?: ReactNode;
};

export function OverviewView({ state, mode, linksCount, aside, nextExtra }: OverviewViewProps) {
  const { t } = useMerchantLanguage();
  const runAction = (
    <ButtonLink href={RECOVERY_RUN_HREF} primary>
      {t("recovery.overview.runCheck")} <span style={{ opacity: 0.75, fontWeight: 400 }}>· {t("recovery.overview.seeCostFirst")}</span>
    </ButtonLink>
  );
  const linksMode = mode.kind === "links";

  if (state.kind === "loading") {
    return (
      <>
        <PageHead title={t("recovery.overview.title")} subtitle={t("recovery.state.loading")} />
        <div className="rv-grid rv-grid-stages" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className="rv-card" style={{ padding: 20, display: "flex", flexDirection: "column", gap: 10 }}>
              <Skeleton width="40%" />
              <Skeleton />
              <Skeleton />
            </div>
          ))}
        </div>
      </>
    );
  }

  if (state.kind !== "ready") {
    const body = {
      none: <EmptyState title={t("recovery.state.none.title")} body={t("recovery.state.none.body")} action={<ButtonLink href={RECOVERY_RUN_HREF} primary>{t("recovery.state.none.cta")}</ButtonLink>} />,
      running: <EmptyState title={t("recovery.state.running.title")} body={t("recovery.state.running.body")} />,
      failed: <EmptyState title={t("recovery.state.failed.title")} body={t("recovery.state.failed.body")} action={runAction} />,
      error: (
        <EmptyState
          title={t("recovery.state.error.title")}
          body={t("recovery.state.error.body")}
          action={state.kind === "error" ? <button type="button" className="rv-btn" onClick={state.retry}>{t("recovery.state.retry")}</button> : null}
        />
      ),
      legacy: <EmptyState title={t("recovery.state.legacy.title")} body={t("recovery.state.legacy.body")} action={state.kind === "legacy" ? <ButtonLink href={state.reportHref}>{t("recovery.state.legacy.cta")}</ButtonLink> : null} />,
    }[state.kind];
    return (
      <>
        <PageHead title={t("recovery.overview.title")} actions={state.kind === "running" ? null : runAction} />
        {linksMode ? <LinksCallout count={linksCount} t={t} /> : null}
        {body}
      </>
    );
  }

  const { model } = state;
  const date = formatDate(state.checkedAt);
  const scope = [
    model.productCount != null
      ? t(model.catalogAvailable ? "recovery.overview.scope.catalog" : "recovery.overview.scope.links", { date: date ?? "—", count: model.productCount })
      : date,
    model.observations != null ? t("recovery.overview.scope.answers", { count: model.observations }) : null,
    model.providers.length ? model.providers.map((p) => (p === "chatgpt" ? "ChatGPT" : p.charAt(0).toUpperCase() + p.slice(1))).join(", ") : null,
  ].filter(Boolean).join(" · ");

  return (
    <>
      <PageHead title={t("recovery.overview.title")} subtitle={scope || undefined} actions={runAction} />
      {linksMode ? <LinksCallout count={model.catalogAvailable ? null : model.productCount ?? linksCount} t={t} /> : null}
      {mode.kind === "first_sync" ? <div className="rv-note">{t("recovery.overview.firstSync")}</div> : null}

      <div className="rv-grid rv-grid-stages">
        <StageCard step={1} title={t("recovery.stage.selected.title")} question={t("recovery.stage.selected.question")}>
          {model.stage1.map((row) => <DimensionLine key={row.key} row={row} mode={mode} t={t} />)}
        </StageCard>
        <StageCard step={2} title={t("recovery.stage.cited.title")} question={t("recovery.stage.cited.question")}>
          {model.stage2.map((row) => <DimensionLine key={row.key} row={row} mode={mode} t={t} />)}
          <div className="rv-row">
            <span style={{ fontWeight: 500 }}>{t("recovery.stage.cited.sourcesRow")}</span>
            <span className="rv-muted rv-small">{t("recovery.stage.cited.sourcesHint")}</span>
          </div>
        </StageCard>
        <StageCard step={3} title={t("recovery.stage.convert.title")} question={t("recovery.stage.convert.question")}>
          <div className="rv-row" style={{ flexDirection: "column", alignItems: "flex-start", gap: 10 }}>
            <Badge tone="neu">{t("recovery.stage.convert.notRun")}</Badge>
            <span className="rv-muted rv-small" style={{ lineHeight: 1.5 }}>{t("recovery.stage.convert.body")}</span>
            <button type="button" className="rv-btn" disabled aria-disabled="true">{t("recovery.stage.convert.verifyUnavailable")}</button>
          </div>
        </StageCard>
      </div>
      <p className="rv-muted rv-small" style={{ margin: "-8px 0 0" }}>{t("recovery.dim.footnote")}</p>

      <TierTable model={model} t={t} />

      <div className="rv-grid rv-grid-halves">
        <NextActions mode={mode} t={t} extra={nextExtra} />
        {aside}
      </div>
    </>
  );
}
