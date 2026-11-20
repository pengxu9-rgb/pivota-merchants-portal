"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import { useMerchantLanguage } from "@/components/portal/merchant-language-provider";
import type { CreditsSummary } from "@/lib/recovery-v2/mode";
import type { UrlAuditErrorInfo, UrlAuditQuote, UrlAuditRequest } from "@/lib/audit/useUrlAuditRun";

export type CostModalPhase = "review" | "quoting" | "running" | "still_running" | "done";

export type CostModalProps = {
  request: UrlAuditRequest;
  phase: CostModalPhase;
  /** The quote for exactly this request, if any. */
  quote: UrlAuditQuote | null;
  /** A quote exists but for a different scope (the merchant edited the check). */
  quoteStale: boolean;
  error: UrlAuditErrorInfo | null;
  credits: CreditsSummary | null | "loading";
  elapsedSec: number;
  /** False unless the billing API confirmed this merchant may buy credits in
   * the portal (`off_platform_billing`); App Store / exempt merchants must
   * never see a purchase or upgrade path. Same gate as the URL check page. */
  canPurchase: boolean;
  onGetQuote: () => void;
  onStart: () => void;
  onClose: () => void;
};

/** Run-cost modal. The backend prices a check before it runs ONLY when shopper
 * (consumer-answer) questions are included; otherwise there is no pre-run
 * quote, and the modal says so instead of inventing a number. */
export function CostModal({ request, phase, quote, quoteStale, error, credits, elapsedSec, canPurchase, onGetQuote, onStart, onClose }: CostModalProps) {
  const { t } = useMerchantLanguage();
  const dialogRef = useRef<HTMLDivElement>(null);
  const busy = phase === "quoting" || phase === "running";
  useEffect(() => {
    dialogRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  const links = request.product_urls.length;
  const questions = request.consumer_answer_queries.length;
  const needsQuote = questions > 0;
  const available = credits && credits !== "loading" ? credits.available : null;

  return (
    <div className="rv-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
      <div ref={dialogRef} className="rv-modal" role="dialog" aria-modal="true" aria-labelledby="rv-cost-title" tabIndex={-1}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <h2 id="rv-cost-title" className="rv-h2" style={{ fontSize: 16 }}>{t("recovery.cost.title")}</h2>
          <button type="button" className="rv-iconbtn" aria-label={t("recovery.cost.close")} onClick={onClose} disabled={busy}>
            <X size={16} aria-hidden="true" />
          </button>
        </div>

        <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7 }}>
          <li>{links === 1 ? t("recovery.cost.scope.linkOne") : t("recovery.cost.scope.links", { count: links })}</li>
          {questions ? <li>{t("recovery.cost.scope.questions", { count: questions })}</li> : null}
          {request.website ? <li className="rv-muted" style={{ wordBreak: "break-all" }}>{t("recovery.cost.scope.website", { website: request.website })}</li> : null}
        </ul>

        <div className="rv-card" style={{ padding: 14, display: "flex", flexDirection: "column", gap: 6 }}>
          <span className="rv-label">{t("recovery.cost.noQuote.title")}</span>
          {needsQuote ? (
            quote ? (
              <>
                <span style={{ fontSize: 16, fontWeight: 600 }} className="rv-num">{t("recovery.cost.quote.total", { credits: quote.credits.toLocaleString("en-US") })}</span>
                <span className="rv-muted rv-small rv-num">
                  {t("recovery.cost.quote.breakdown", {
                    base: quote.base_credits,
                    capture: quote.consumer_capture?.credits ?? 0,
                    products: quote.product_count,
                    providers: quote.providers.join(", "),
                    probes: quote.consumer_capture?.probe_count ?? 0,
                  })}
                </span>
                <span className="rv-muted rv-tiny">{t("recovery.cost.quote.refund")}</span>
              </>
            ) : (
              <span className="rv-muted" style={{ lineHeight: 1.5 }}>
                {quoteStale ? t("recovery.cost.quote.stale") : t("recovery.cost.quote.needed")}
              </span>
            )
          ) : (
            <span className="rv-muted" style={{ lineHeight: 1.5 }}>{t("recovery.cost.noQuote.body")}</span>
          )}
          {available !== null ? <span className="rv-small rv-num">{t("recovery.cost.noQuote.available", { count: available.toLocaleString("en-US") })}</span> : null}
        </div>

        {error ? <CostError error={error} canPurchase={canPurchase} hasQuestions={questions > 0} /> : null}

        {phase === "running" ? (
          <div className="rv-note" role="status" aria-live="polite">
            <span>
              <strong style={{ color: "var(--ink)" }}>{t("recovery.cost.running", { seconds: elapsedSec })}</strong>
              <br />
              {t("recovery.cost.runningBody")}
            </span>
          </div>
        ) : null}
        {phase === "still_running" ? <div className="rv-note" role="status">{t("recovery.cost.stillRunning")}</div> : null}
        {phase === "done" ? <div className="rv-note" role="status">{t("recovery.cost.done")}</div> : null}

        <div className="rv-actions" style={{ justifyContent: "flex-end" }}>
          {phase === "still_running" || phase === "done" ? (
            <Link className="rv-btn rv-primary" href="/dashboard">{t("recovery.cost.toOverview")}</Link>
          ) : (
            <>
              <button type="button" className="rv-btn" onClick={onClose} disabled={busy}>{t("recovery.cost.cancel")}</button>
              {needsQuote && !quote ? (
                <button type="button" className="rv-btn rv-primary" onClick={onGetQuote} disabled={busy}>
                  {phase === "quoting" ? t("recovery.cost.quote.getting") : t("recovery.cost.quote.get")}
                </button>
              ) : (
                <button type="button" className="rv-btn rv-primary" onClick={onStart} disabled={busy}>
                  {quote ? t("recovery.cost.startCredits", { credits: quote.credits.toLocaleString("en-US") }) : t("recovery.cost.start")}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function CostError({ error, canPurchase, hasQuestions }: { error: UrlAuditErrorInfo; canPurchase: boolean; hasQuestions: boolean }) {
  const { t } = useMerchantLanguage();
  const lead =
    error.kind === "credits"
      ? t("recovery.cost.err.credits")
      : error.kind === "unresolved"
        ? t("recovery.cost.err.unresolved")
        : error.kind === "quote_required"
          ? t("recovery.cost.err.quote")
          : t("recovery.cost.err.other");
  return (
    <div className="rv-alert rv-err" role="alert" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <strong>{lead}</strong>
      {error.kind === "credits" && error.required !== null ? (
        <span>{t("recovery.cost.err.creditsDetail", { required: error.required, available: error.available ?? 0 })}</span>
      ) : null}
      {error.kind === "credits" ? (
        <span>
          {t(
            canPurchase
              ? hasQuestions ? "recovery.cost.err.creditsAction" : "recovery.cost.err.creditsActionNoQuestions"
              : hasQuestions ? "recovery.cost.err.creditsActionNoPurchase" : "recovery.cost.err.creditsActionConnect",
          )}
        </span>
      ) : null}
      {error.unresolved.length ? (
        <ul style={{ margin: 0, paddingLeft: 18, wordBreak: "break-all" }}>
          {error.unresolved.map((url) => <li key={url}>{url}</li>)}
        </ul>
      ) : null}
      {(error.kind === "other" || error.kind === "credits") && error.message ? <span>{t("recovery.cost.err.backend", { message: error.message })}</span> : null}
      {!canPurchase ? null : error.upgradePath ? (
        <Link className="rv-link" href={error.upgradePath.startsWith("/") ? error.upgradePath : "/dashboard/billing"}>{t("recovery.cost.err.upgrade")}</Link>
      ) : error.kind === "credits" ? (
        <Link className="rv-link" href="/dashboard/billing">{t("recovery.nav.plan")}</Link>
      ) : null}
    </div>
  );
}
