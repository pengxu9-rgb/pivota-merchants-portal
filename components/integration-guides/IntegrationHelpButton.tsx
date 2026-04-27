"use client";

import { CircleAlert } from "lucide-react";
import { cx } from "@/lib/cx";

export function IntegrationHelpButton({
  label,
  onClick,
  className,
}: {
  label: string;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cx(
        "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[color:var(--merchant-line)] bg-white text-[color:var(--merchant-muted-strong)] transition hover:border-[color:var(--merchant-brand)] hover:text-[color:var(--merchant-brand)] focus:outline-none focus:ring-2 focus:ring-[color:var(--merchant-brand-soft)]",
        className,
      )}
    >
      <CircleAlert className="h-4 w-4" />
    </button>
  );
}

