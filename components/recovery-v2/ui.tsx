"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import type { Tone } from "@/lib/recovery-v2/overview";

export function Badge({ tone = "neu", children }: { tone?: Tone | "brand"; children: ReactNode }) {
  return <span className={`rv-badge rv-${tone}`}>{children}</span>;
}

export function PageHead({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="rv-head">
      <div style={{ minWidth: 0 }}>
        <h1 className="rv-h1">{title}</h1>
        {subtitle ? <p className="rv-muted" style={{ margin: "4px 0 0" }}>{subtitle}</p> : null}
      </div>
      {actions ? <div className="rv-actions">{actions}</div> : null}
    </div>
  );
}

export function ButtonLink({ href, primary, small, children }: { href: string; primary?: boolean; small?: boolean; children: ReactNode }) {
  return (
    <Link href={href} className={`rv-btn${primary ? " rv-primary" : ""}${small ? " rv-sm" : ""}`}>
      {children}
    </Link>
  );
}

export function Bar({ value, label }: { value: number; label?: string }) {
  const width = `${Math.max(0, Math.min(100, Math.round(value * 100)))}%`;
  return (
    <span className="rv-bar" role="img" aria-label={label}>
      <i style={{ width }} />
    </span>
  );
}

export function EmptyState({ title, body, action }: { title: string; body: ReactNode; action?: ReactNode }) {
  return (
    <section className="rv-card" style={{ padding: 24, display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-start" }}>
      <h2 className="rv-h2">{title}</h2>
      <p className="rv-muted" style={{ margin: 0, maxWidth: 640, lineHeight: 1.5 }}>{body}</p>
      {action ? <div style={{ marginTop: 8 }}>{action}</div> : null}
    </section>
  );
}

export function Skeleton({ height = 14, width = "100%" }: { height?: number; width?: number | string }) {
  return <span className="rv-skeleton" style={{ display: "block", height, width }} aria-hidden="true" />;
}

export function formatDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const date = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(iso) ? iso : `${iso}Z`);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}
