"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  RefreshCw,
  Store,
} from "lucide-react";
import { cx } from "@/lib/cx";
import { StatusBadge } from "@/components/ui/merchant-primitives";

export function getMerchantId() {
  if (typeof window === "undefined") return "merchant_demo";
  return localStorage.getItem("merchant_id") || "merchant_demo";
}

export async function agentFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers || {});
  headers.set("Content-Type", "application/json");
  headers.set("X-Merchant-Id", getMerchantId());
  const response = await fetch(path, {
    ...init,
    headers,
    cache: "no-store",
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error || "Agent Center request failed");
  }
  return data;
}

export function MetricTile({
  label,
  value,
  helper,
  tone = "neutral",
}: {
  label: string;
  value: ReactNode;
  helper?: string;
  tone?: "brand" | "success" | "warning" | "critical" | "neutral";
}) {
  const toneClass = {
    brand: "text-[color:var(--merchant-brand)]",
    success: "text-[color:var(--merchant-success)]",
    warning: "text-[color:var(--merchant-warning)]",
    critical: "text-[color:var(--merchant-critical)]",
    neutral: "text-[color:var(--merchant-ink)]",
  }[tone];

  return (
    <div className="border-b border-[color:var(--merchant-line)] px-5 py-4 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0">
      <p className="merchant-overline">{label}</p>
      <div className={cx("mt-2 text-2xl font-semibold tracking-tight", toneClass)}>
        {value}
      </div>
      {helper ? (
        <p className="mt-1 text-sm text-[color:var(--merchant-muted)]">{helper}</p>
      ) : null}
    </div>
  );
}

export function ScoreBar({
  value,
  label,
  inverse = false,
}: {
  value: number;
  label: string;
  inverse?: boolean;
}) {
  const tone =
    inverse && value >= 60
      ? "bg-[color:var(--merchant-critical)]"
      : value >= 70
        ? "bg-[color:var(--merchant-success)]"
        : value >= 40
          ? "bg-[color:var(--merchant-warning)]"
          : "bg-[color:var(--merchant-critical)]";

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="font-medium text-[color:var(--merchant-ink)]">{label}</span>
        <span className="text-[color:var(--merchant-muted)]">{Math.round(value)}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-[color:var(--merchant-surface-muted)]">
        <div className={cx("h-full rounded-full", tone)} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
      </div>
    </div>
  );
}

export function FixTargetBadge({ target }: { target: string }) {
  const label = target.replace(/_/g, " ");
  const tone =
    target.includes("human")
      ? "warning"
      : target.includes("both")
        ? "critical"
        : target.includes("pivota")
          ? "brand"
          : "success";
  return <StatusBadge tone={tone as any}>{label}</StatusBadge>;
}

export function IssueTypeBadge({ type }: { type: string }) {
  const tone =
    type === "ai_visibility_loss" || type === "competitor_substitution"
      ? "critical"
      : type === "missing_attribute"
        ? "warning"
        : "brand";
  return <StatusBadge tone={tone as any}>{type.replace(/_/g, " ")}</StatusBadge>;
}

export function StatusTimeline({
  progress,
}: {
  progress: Array<{ status: string; at: string }>;
}) {
  return (
    <div className="divide-y divide-[color:var(--merchant-line)]">
      {progress.map((item, index) => {
        const isDone = index < progress.length - 1 || item.status === "completed";
        const Icon = isDone ? CheckCircle2 : Clock;
        return (
          <div key={`${item.status}-${item.at}`} className="flex items-start gap-3 px-5 py-3">
            <Icon
              className={cx(
                "mt-0.5 h-4 w-4",
                isDone
                  ? "text-[color:var(--merchant-success)]"
                  : "text-[color:var(--merchant-muted)]"
              )}
            />
            <div>
              <p className="text-sm font-medium text-[color:var(--merchant-ink)]">
                {item.status.replace(/_/g, " ")}
              </p>
              <p className="text-xs text-[color:var(--merchant-muted)]">
                {new Date(item.at).toLocaleString()}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function EmptyAgentState({
  title,
  description,
  href,
  cta,
}: {
  title: string;
  description: string;
  href: string;
  cta: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 px-6 py-16 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[color:var(--merchant-brand-soft)] text-[color:var(--merchant-brand)]">
        <Store className="h-6 w-6" />
      </div>
      <div className="space-y-2">
        <h3 className="merchant-card-title">{title}</h3>
        <p className="merchant-text-muted max-w-md">{description}</p>
      </div>
      <Link href={href} className="merchant-button-primary">
        <span>{cta}</span>
      </Link>
    </div>
  );
}

export function LimitationList({ items }: { items: string[] }) {
  return (
    <div className="space-y-2">
      {items.map((item) => (
        <div key={item} className="flex items-start gap-2 text-sm text-[color:var(--merchant-muted-strong)]">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-[color:var(--merchant-warning)]" />
          <span>{item}</span>
        </div>
      ))}
    </div>
  );
}

export function RefreshButton({
  onClick,
  loading,
}: {
  onClick: () => void;
  loading?: boolean;
}) {
  return (
    <button type="button" className="merchant-button-secondary" onClick={onClick}>
      <RefreshCw className={cx("h-4 w-4", loading && "animate-spin")} />
      <span>Refresh</span>
    </button>
  );
}
