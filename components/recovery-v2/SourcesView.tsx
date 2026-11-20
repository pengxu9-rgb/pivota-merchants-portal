"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import { useMerchantLanguage } from "@/components/portal/merchant-language-provider";
import { Badge, EmptyState, PageHead, Skeleton } from "@/components/recovery-v2/ui";
import { OUTREACH_STATE_LABEL_KEYS, inTab, tabCounts, type SourceRow, type SourcesTab } from "@/lib/recovery-v2/sources";

type T = (key: string, vars?: Record<string, string | number | undefined>) => string;

export type SourcesActions = {
  markSent: (row: SourceRow) => Promise<void>;
  draftPitch?: (row: SourceRow) => Promise<{ draft: string | null; charged?: number }>;
};

export type SourcesState =
  | { kind: "loading" }
  | { kind: "error"; retry: () => void }
  | { kind: "none" }
  | { kind: "ready"; rows: SourceRow[]; canDraft: boolean; canPurchase?: boolean };

const TABS: { key: SourcesTab; labelKey: string }[] = [
  { key: "all", labelKey: "recovery.sources.tab.all" },
  { key: "to_contact", labelKey: "recovery.sources.tab.toContact" },
  { key: "sent", labelKey: "recovery.sources.tab.sent" },
  { key: "mention", labelKey: "recovery.sources.tab.mention" },
];

function cited(t: T, count: number | null) {
  if (count == null) return "—";
  return count === 1 ? t("recovery.sources.citedInOne") : t("recovery.sources.citedIn", { count });
}

function OutreachBadge({ row, t }: { row: SourceRow; t: T }) {
  if (row.mentionsYou === "yes") return <Badge tone="ok">{t("recovery.sources.mentionBadge")}</Badge>;
  if (row.sent) return <Badge tone="warn">{t("recovery.sources.sentBadge")}</Badge>;
  return <Badge tone={row.state === "target_only" ? "neu" : "brand"}>{t(OUTREACH_STATE_LABEL_KEYS[row.state])}</Badge>;
}

function MentionCell({ value, t }: { value: SourceRow["mentionsYou"]; t: T }) {
  const color = value === "yes" ? "var(--success)" : value === "no" ? "var(--error)" : "var(--muted)";
  return <span style={{ color, fontWeight: 500 }}>{t(`recovery.sources.mention.${value}`)}</span>;
}

function Detail({ row, t, actions, canDraft, canPurchase, onClose }: { row: SourceRow; t: T; actions: SourcesActions; canDraft: boolean; canPurchase: boolean; onClose: () => void }) {
  const [sent, setSent] = useState<"idle" | "saving" | "done" | "error">(row.sent ? "done" : "idle");
  const [draft, setDraft] = useState<{ state: "idle" | "loading" | "done" | "error" | "credits"; text?: string | null; charged?: number }>({ state: "idle" });
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    setSent(row.sent ? "done" : "idle");
    setDraft({ state: "idle" });
  }, [row.host, row.sent]);

  const pitchText = row.pitch ? `${row.pitch.subject}\n\n${row.pitch.body}` : draft.text ?? null;
  const mailto = row.state === "draft_ready" && row.recipientEmail && pitchText
    // recipientEmail is already a validated single plain address (safeEmail),
    // so nothing in it can add headers or recipients; subject/body are encoded.
    ? `mailto:${row.recipientEmail}?subject=${encodeURIComponent(row.pitch?.subject ?? row.host)}&body=${encodeURIComponent((row.pitch?.body ?? draft.text ?? "").slice(0, 1800))}`
    : null;
  const reach =
    row.state === "draft_ready"
      ? row.recipientEmail ? t("recovery.sources.detail.reachEmail", { email: row.recipientEmail }) : t("recovery.sources.detail.reachEmailUnknown")
      : row.state === "submission_only"
        ? t("recovery.sources.detail.reachForm")
        : t("recovery.sources.detail.reachNone");

  const copy = async () => {
    if (!pitchText) return;
    try {
      await navigator.clipboard.writeText(pitchText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };
  const markSent = async () => {
    if (sent === "saving" || sent === "done") return;
    setSent("saving");
    try {
      await actions.markSent(row);
      setSent("done");
    } catch {
      setSent("error");
    }
  };
  const runDraft = async () => {
    if (!actions.draftPitch || draft.state === "loading") return;
    setDraft({ state: "loading" });
    try {
      const res = await actions.draftPitch(row);
      setDraft({ state: "done", text: res.draft, charged: res.charged });
    } catch (error) {
      const status = (error as { response?: { status?: number } })?.response?.status;
      setDraft({ state: status === 402 ? "credits" : "error" });
    }
  };

  return (
    <section className="rv-card" style={{ padding: 18, display: "flex", flexDirection: "column", gap: 16 }} aria-label={row.host}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="rv-label">{t("recovery.sources.detail.kicker", { type: t(row.typeKey), cited: cited(t, row.citedIn) })}</div>
          <h2 className="rv-mono" style={{ margin: "4px 0 0", fontSize: 15, fontWeight: 600, wordBreak: "break-all" }}>{row.host}</h2>
        </div>
        <button type="button" className="rv-iconbtn" aria-label={t("recovery.sources.detail.close")} onClick={onClose}>
          <X size={16} aria-hidden="true" />
        </button>
      </div>
      <div className="rv-kv">
        <span className="rv-muted">{t("recovery.sources.detail.mentions")}</span>
        <MentionCell value={row.mentionsYou} t={t} />
        <span className="rv-muted">{t("recovery.sources.detail.reach")}</span>
        <span style={{ wordBreak: "break-word" }}>{reach}</span>
      </div>
      {row.recipientNote && row.state !== "target_only" ? <p className="rv-muted rv-small" style={{ margin: 0, lineHeight: 1.5 }}>{row.recipientNote}</p> : null}
      {row.queries.length ? (
        <div>
          <div className="rv-label" style={{ marginBottom: 6 }}>{t("recovery.sources.detail.queries")}</div>
          <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.6 }}>
            {row.queries.slice(0, 6).map((q) => <li key={q}>“{q}”</li>)}
          </ul>
        </div>
      ) : null}

      {row.mentionsYou === "yes" ? (
        <div className="rv-note">{t("recovery.sources.detail.mentionsNow")}</div>
      ) : row.state === "target_only" ? (
        <div className="rv-note">{t("recovery.sources.detail.noContact")}</div>
      ) : (
        <>
          <div>
            <div className="rv-label" style={{ marginBottom: 6 }}>{t("recovery.sources.detail.pitch")}</div>
            {pitchText ? (
              <div style={{ padding: "12px 14px", borderRadius: 8, border: "1px solid var(--line)", lineHeight: 1.6, background: "var(--surface-muted)", whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: 280, overflowY: "auto" }}>
                {pitchText}
              </div>
            ) : canDraft && actions.draftPitch ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-start" }}>
                <p className="rv-muted rv-small" style={{ margin: 0, lineHeight: 1.5 }}>{t("recovery.sources.detail.draftCost")}</p>
                <button type="button" className="rv-btn" onClick={runDraft} disabled={draft.state === "loading"}>
                  {draft.state === "loading" ? t("recovery.sources.detail.drafting") : t("recovery.sources.detail.draft")}
                </button>
                {draft.state === "error" ? <div className="rv-alert rv-err" role="alert">{t("recovery.sources.detail.draftFailed")}</div> : null}
                {draft.state === "credits" ? <div className="rv-alert rv-warn" role="alert">{t(canPurchase ? "recovery.sources.detail.draftNoCredits" : "recovery.sources.detail.draftNoCreditsNoPurchase")}</div> : null}
                {draft.state === "done" && !draft.text ? <div className="rv-alert rv-warn" role="status">{t("recovery.sources.detail.draftNone")}</div> : null}
              </div>
            ) : row.hint ? (
              <p className="rv-muted" style={{ margin: 0, lineHeight: 1.5 }}>{row.hint}</p>
            ) : null}
            {draft.state === "done" && draft.charged !== undefined ? <p className="rv-muted rv-tiny" style={{ margin: "6px 0 0" }}>{t("recovery.sources.detail.draftCharged", { count: draft.charged })}</p> : null}
            {pitchText ? <p className="rv-muted rv-tiny" style={{ margin: "6px 0 0" }}>{t("recovery.sources.detail.pitchCheck")}</p> : null}
            <div className="rv-actions" style={{ marginTop: 10 }}>
              {pitchText ? <button type="button" className="rv-btn" onClick={copy}>{copied ? t("recovery.sources.detail.copied") : t("recovery.sources.detail.copy")}</button> : null}
              {mailto ? <a className="rv-btn rv-primary" href={mailto}>{t("recovery.sources.detail.openEmail")}</a> : null}
              {row.state === "submission_only" && row.submissionUrl ? (
                <a className="rv-btn rv-primary" href={row.submissionUrl} target="_blank" rel="noopener noreferrer">{t("recovery.sources.detail.openForm")}</a>
              ) : null}
            </div>
          </div>
          {row.queries.length === 0 && sent !== "done" ? null : (
          <div style={{ padding: 12, borderRadius: 8, border: "1px solid var(--line)", display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
            {sent === "done" ? (
              <div className="rv-muted" style={{ flex: "1 1 200px" }}>{t("recovery.sources.detail.alreadySent")}</div>
            ) : (
              <>
                <div style={{ flex: "1 1 200px" }}>
                  <div style={{ fontWeight: 500 }}>{t("recovery.sources.detail.sentTitle")}</div>
                  <div className="rv-muted rv-small" style={{ marginTop: 2 }}>{t("recovery.sources.detail.sentBody")}</div>
                </div>
                <button type="button" className="rv-btn" onClick={markSent} disabled={sent === "saving"}>
                  {sent === "saving" ? t("recovery.sources.detail.marking") : t("recovery.sources.detail.markSent")}
                </button>
                {sent === "error" ? <div className="rv-alert rv-err" role="alert" style={{ flexBasis: "100%" }}>{t("recovery.sources.detail.markFailed")}</div> : null}
              </>
            )}
          </div>
          )}
        </>
      )}
    </section>
  );
}

export function SourcesView({ state, actions, initialHost }: { state: SourcesState; actions: SourcesActions; initialHost?: string | null }) {
  const { t } = useMerchantLanguage();
  const [tab, setTab] = useState<SourcesTab>("all");
  const rows = state.kind === "ready" ? state.rows : [];
  const [selected, setSelected] = useState<string | null>(initialHost ?? null);
  const counts = useMemo(() => tabCounts(rows), [rows]);
  const visible = rows.filter((row) => inTab(row, tab));
  const current = rows.find((row) => row.host === selected) ?? null;
  const detailRef = useRef<HTMLDivElement>(null);
  const pick = (host: string) => {
    setSelected(host);
    // Phones stack the detail under the table: bring it into view.
    if (typeof window !== "undefined" && window.matchMedia?.("(max-width: 767px)").matches) {
      setTimeout(() => detailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    }
  };

  const head = <PageHead title={t("recovery.sources.title")} subtitle={t("recovery.sources.subtitle")} />;
  if (state.kind === "loading") {
    return (
      <>
        {head}
        <div className="rv-card" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }} aria-busy="true">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} />)}
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
  if (state.kind === "none" || rows.length === 0) {
    return (
      <>
        {head}
        <EmptyState title={t("recovery.sources.empty.title")} body={t("recovery.sources.empty.body")} />
      </>
    );
  }

  return (
    <>
      {head}
      <div role="tablist" aria-label={t("recovery.sources.tabs")} className="rv-tabs">
        {TABS.map((item) => (
          <button key={item.key} type="button" role="tab" className="rv-tab" aria-selected={tab === item.key} onClick={() => setTab(item.key)}>
            {t(item.labelKey)} <span className="rv-count">{counts[item.key]}</span>
          </button>
        ))}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "flex-start" }}>
        <section className="rv-card" style={{ flex: "3 1 540px", minWidth: 0, overflow: "hidden" }}>
          {visible.length === 0 ? (
            <p className="rv-muted" style={{ margin: 0, padding: 16 }}>{t("recovery.sources.emptyTab")}</p>
          ) : (
            <div className="rv-scroll-x">
              <table className="rv-tbl rv-compact">
                <thead>
                  <tr>
                    <th scope="col">{t("recovery.sources.col.site")}</th>
                    <th scope="col" className="rv-hide-phone">{t("recovery.sources.col.type")}</th>
                    <th scope="col" className="rv-hide-phone" title={t("recovery.sources.col.citedHint")}>{t("recovery.sources.col.cited")}</th>
                    <th scope="col" className="rv-hide-phone">{t("recovery.sources.col.mentions")}</th>
                    <th scope="col">{t("recovery.sources.col.outreach")}</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((row) => (
                    <tr
                      key={row.host}
                      className="rv-clickable"
                      aria-selected={row.host === selected}
                      onClick={() => pick(row.host)}
                    >
                      <th scope="row" className="rv-mono">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            pick(row.host);
                          }}
                          style={{ all: "unset", cursor: "pointer", fontWeight: row.host === selected ? 600 : 500 }}
                        >
                          {row.host}
                        </button>
                      </th>
                      <td className="rv-muted rv-hide-phone">{t(row.typeKey)}</td>
                      <td className="rv-num rv-hide-phone" style={{ whiteSpace: "nowrap" }}>{cited(t, row.citedIn)}</td>
                      <td className="rv-hide-phone"><MentionCell value={row.mentionsYou} t={t} /></td>
                      <td><OutreachBadge row={row} t={t} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="rv-card-foot">{t("recovery.sources.footer")}</div>
        </section>
        <div ref={detailRef} style={{ flex: "2 1 340px", minWidth: 0, scrollMarginTop: 16 }}>
          {current ? (
            <Detail row={current} t={t} actions={actions} canDraft={state.canDraft} canPurchase={state.canPurchase === true} onClose={() => setSelected(null)} />
          ) : (
            <section className="rv-card rv-muted" style={{ padding: 18 }}>{t("recovery.sources.pickRow")}</section>
          )}
        </div>
      </div>
    </>
  );
}
