"use client";

import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

interface ReplyChipProps {
  icon?: LucideIcon;
  variant?: "primary" | "secondary" | "ghost";
  onClick?: () => void;
  disabled?: boolean;
  children: ReactNode;
}

/**
 * Pill-shaped action chip used at the end of agent bubbles.
 *
 * Three variants per the design tokens:
 *   - primary: solid purple
 *   - secondary: white + hairline (default)
 *   - ghost: surface-muted fill, used for low-emphasis tertiary actions
 */
export function ReplyChip({
  icon: Icon,
  variant = "secondary",
  onClick,
  disabled,
  children,
}: ReplyChipProps) {
  const className =
    variant === "primary"
      ? "p-pill p-pill--primary"
      : variant === "ghost"
        ? "p-pill"
        : "p-pill p-pill--ghost";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={className}
      style={{ fontSize: 12, fontWeight: 500 }}
    >
      {Icon ? <Icon size={14} strokeWidth={1.8} /> : null}
      <span>{children}</span>
    </button>
  );
}
