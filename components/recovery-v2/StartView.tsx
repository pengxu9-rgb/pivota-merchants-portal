"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { Check } from "lucide-react";
import { useMerchantLanguage } from "@/components/portal/merchant-language-provider";
import { Badge, PageHead } from "@/components/recovery-v2/ui";
import type { StoreMode } from "@/lib/recovery-v2/mode";
import type { UrlAuditRequest } from "@/lib/audit/useUrlAuditRun";

export const START_PLATFORMS = [
  { key: "shopify", label: "Shopify" },
  { key: "woocommerce", label: "WooCommerce" },
  { key: "wix", label: "Wix" },
  { key: "bigcommerce", label: "BigCommerce" },
] as const;

export const MAX_LINKS_FREE = 5;
export const MAX_LINKS_PAID = 20;
const MAX_QUESTIONS = 8;

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

/** Build the run request from the form. Mirrors the URL check page: trimmed,
 * blank links dropped, questions de-duplicated, one per line. */
export function startRequest(form: { links: string[]; website: string; questions: string; questionsEnabled: boolean }): UrlAuditRequest {
  const questions = form.questionsEnabled
    ? [...new Set(form.questions.split("\n").map((q) => q.trim()).filter(Boolean))]
    : [];
  return {
    product_urls: form.links.map((u) => u.trim()).filter(Boolean),
    website: form.website.trim() || undefined,
    consumer_answer_queries: questions,
  };
}

function Yes({ children }: { children: ReactNode }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "var(--success)", fontWeight: 500 }}>
      <Check size={14} strokeWidth={2.5} aria-hidden="true" />
      {children}
    </span>
  );
}

export type StartViewProps = {
  mode: StoreMode;
  isPaid: boolean;
  canPurchase: boolean;
  questionsEnabled: boolean;
  onConnect: (platform: string) => void;
  onReview: (request: UrlAuditRequest) => void;
  initialLinks?: string[];
};

export function StartView({ mode, isPaid, canPurchase, questionsEnabled, onConnect, onReview, initialLinks }: StartViewProps) {
  const { t } = useMerchantLanguage();
  const maxLinks = isPaid ? MAX_LINKS_PAID : MAX_LINKS_FREE;
  const [links, setLinks] = useState<string[]>(initialLinks?.length ? initialLinks : ["", "", ""]);
  const [website, setWebsite] = useState("");
  const [questions, setQuestions] = useState("");
  const [touched, setTouched] = useState(false);

  const request = useMemo(() => startRequest({ links, website, questions, questionsEnabled }), [links, website, questions, questionsEnabled]);
  const invalidIndex = links.findIndex((link) => link.trim() && !isHttpUrl(link.trim()));
  const questionsError = request.consumer_answer_queries.length > MAX_QUESTIONS || request.consumer_answer_queries.some((q) => q.length > 1000);
  const tooMany = request.product_urls.length > maxLinks;
  const canReview = request.product_urls.length > 0 && invalidIndex < 0 && !questionsError && !tooMany;
  const connected = mode.kind === "connected" || mode.kind === "first_sync";

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setTouched(true);
    if (canReview) onReview(request);
  };

  return (
    <>
      <PageHead title={t("recovery.start.title")} subtitle={t("recovery.start.subtitle")} />

      <div className="rv-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(320px, 100%), 1fr))", gap: 20, alignItems: "stretch" }}>
        <section className="rv-card" style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16, borderColor: "var(--accent)", outline: "1px solid var(--accent)", outlineOffset: -2 }} aria-labelledby="rv-start-connect">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
            <h2 id="rv-start-connect" className="rv-h2" style={{ fontSize: 17 }}>{t("recovery.start.connect.title")}</h2>
            <Badge tone="brand">{t("recovery.start.connect.badge")}</Badge>
          </div>
          <p className="rv-muted" style={{ margin: 0, lineHeight: 1.5 }}>{t("recovery.start.connect.body")}</p>
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
            {["b1", "b2", "b3"].map((key) => (
              <li key={key} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                <Check size={15} strokeWidth={2.5} color="var(--success)" style={{ marginTop: 1, flex: "none" }} aria-hidden="true" />
                <span>{t(`recovery.start.connect.${key}`)}</span>
              </li>
            ))}
          </ul>
          <p className="rv-muted rv-small" style={{ margin: 0, lineHeight: 1.5 }}>{t("recovery.start.connect.publishNote")}</p>
          <div style={{ flex: 1 }} />
          {connected ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div className="rv-note" role="status">
                {mode.kind === "first_sync"
                  ? t("recovery.start.connect.firstSync", { platform: mode.platform })
                  : t("recovery.start.connect.connected", { platform: mode.platform })}
              </div>
              {mode.kind === "connected" ? (
                <Link className="rv-btn rv-primary" href="/dashboard/agent-center/ai-readiness">{t("recovery.start.connect.checkCatalog")}</Link>
              ) : null}
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8 }}>
              {START_PLATFORMS.map((platform, index) => (
                <button key={platform.key} type="button" className={`rv-btn${index === 0 ? " rv-primary" : ""}`} onClick={() => onConnect(platform.key)}>
                  {platform.label}
                </button>
              ))}
            </div>
          )}
          <p className="rv-muted rv-small" style={{ margin: 0, lineHeight: 1.5 }}>{t("recovery.start.connect.credentials")}</p>
        </section>

        <form className="rv-card" style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16 }} aria-labelledby="rv-start-links" onSubmit={submit} noValidate>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
            <h2 id="rv-start-links" className="rv-h2" style={{ fontSize: 17 }}>{t("recovery.start.links.title")}</h2>
            <Badge tone="ok">{t("recovery.start.noStoreNeeded")}</Badge>
          </div>
          <p className="rv-muted" style={{ margin: 0, lineHeight: 1.5 }}>{t("recovery.start.links.body")}</p>
          {links.map((value, index) => (
            <label key={index} className="rv-field">
              <span>{t("recovery.start.links.label", { n: index + 1 })}</span>
              <span style={{ display: "flex", gap: 6 }}>
                <input
                  className="rv-input"
                  type="url"
                  inputMode="url"
                  autoComplete="off"
                  placeholder={t("recovery.start.links.placeholder")}
                  value={value}
                  aria-invalid={touched && index === invalidIndex ? true : undefined}
                  onChange={(event) => setLinks((prev) => prev.map((v, i) => (i === index ? event.target.value : v)))}
                />
                {links.length > 1 ? (
                  <button type="button" className="rv-btn rv-ghost" aria-label={t("recovery.start.links.remove", { n: index + 1 })} onClick={() => setLinks((prev) => prev.filter((_, i) => i !== index))}>
                    ×
                  </button>
                ) : null}
              </span>
            </label>
          ))}
          {links.length < maxLinks ? (
            <button type="button" className="rv-btn rv-dashed" style={{ alignSelf: "flex-start" }} onClick={() => setLinks((prev) => [...prev, ""])}>
              {t("recovery.start.links.add")}
            </button>
          ) : null}
          <p className="rv-muted rv-small" style={{ margin: 0 }}>
            {isPaid || !canPurchase ? t("recovery.start.links.limitPaid", { count: maxLinks }) : t("recovery.start.links.limit", { count: maxLinks })}
          </p>
          <label className="rv-field">
            <span>{t("recovery.start.links.website")}</span>
            <input className="rv-input" type="url" inputMode="url" placeholder="https://yourstore.com" value={website} onChange={(event) => setWebsite(event.target.value)} />
          </label>
          {questionsEnabled ? (
            <label className="rv-field">
              <span>{t("recovery.start.links.questions")}</span>
              <textarea className="rv-input rv-textarea" rows={3} maxLength={8100} value={questions} onChange={(event) => setQuestions(event.target.value)} />
              <span className="rv-muted rv-small" style={{ fontWeight: 400 }}>{t("recovery.start.links.questionsHint")}</span>
              {questionsError ? <span role="alert" style={{ color: "var(--error)" }}>{t("recovery.start.links.questionsError")}</span> : null}
            </label>
          ) : null}
          {touched && invalidIndex >= 0 ? <div className="rv-alert rv-err" role="alert">{t("recovery.start.links.invalid", { n: invalidIndex + 1 })}</div> : null}
          <div style={{ flex: 1 }} />
          <button type="submit" className="rv-btn rv-primary" disabled={!canReview}>{t("recovery.start.links.cta")}</button>
          <p className="rv-muted rv-small" style={{ margin: 0, lineHeight: 1.5 }}>{t("recovery.start.links.footnote")}</p>
        </form>
      </div>

      <section className="rv-card" style={{ overflow: "hidden" }}>
        <div className="rv-card-head"><h2 className="rv-h2">{t("recovery.start.compare.title")}</h2></div>
        <div className="rv-scroll-x">
          <table className="rv-tbl rv-stack-phone">
            <thead>
              <tr>
                <th scope="col" style={{ width: "46%" }}><span className="rv-sr-only">{t("recovery.start.compare.title")}</span></th>
                <th scope="col">{t("recovery.start.compare.links")}</th>
                <th scope="col">{t("recovery.start.compare.store")}</th>
              </tr>
            </thead>
            <tbody>
              {[
                ["answers", null, <Yes key="a">{t("recovery.start.compare.included")}</Yes>, <Yes key="b">{t("recovery.start.compare.included")}</Yes>],
                ["sources", null, <Yes key="a">{t("recovery.start.compare.included")}</Yes>, <Yes key="b">{t("recovery.start.compare.included")}</Yes>],
                ["identity", "identityHint", <Yes key="a">{t("recovery.start.compare.forLinks")}</Yes>, <Yes key="b">{t("recovery.start.compare.included")}</Yes>],
                ["checkout", "checkoutHint", <span key="a" className="rv-muted">{t("recovery.start.compare.afterDomain")}</span>, <span key="b" className="rv-muted">{t("recovery.start.compare.afterDomain")}</span>],
                ["routing", "routingHint", <span key="a" className="rv-muted">{t("recovery.start.compare.needsStore")}</span>, <Yes key="b">{t("recovery.start.compare.included")}</Yes>],
                ["copy", null, <span key="a" className="rv-muted">{t("recovery.start.compare.actionPlan")}</span>, <Yes key="b">{t("recovery.start.compare.included")}</Yes>],
                ["count", null, <span key="a">{t("recovery.start.compare.count.links")}</span>, <span key="b">{t("recovery.start.compare.count.store")}</span>],
                ["apply", null, <span key="a">{t("recovery.start.compare.apply.links")}</span>, <span key="b">{t("recovery.start.compare.apply.store")}</span>],
                ["catalog", null, <span key="a" className="rv-muted">{t("recovery.start.compare.needsStore")}</span>, <Yes key="b">{t("recovery.start.compare.included")}</Yes>],
              ].map(([key, hint, linksCell, storeCell]) => (
                <tr key={key as string}>
                  <th scope="row">
                    {t(`recovery.start.compare.row.${key}`)}
                    {hint ? <div className="rv-muted rv-small" style={{ marginTop: 2, fontWeight: 400 }}>{t(`recovery.start.compare.row.${hint}`)}</div> : null}
                  </th>
                  <td>{linksCell}</td>
                  <td>{storeCell}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
