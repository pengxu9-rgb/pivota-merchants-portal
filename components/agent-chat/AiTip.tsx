import { Info, AlertTriangle } from "lucide-react";
import type { ReactNode } from "react";

interface AiTipProps {
  /** info = purple primary-50 background, warn = yellow tip-bg. */
  variant?: "info" | "warn";
  title: string;
  children: ReactNode;
}

/**
 * Info / warn callout block used inside agent bubbles to surface a
 * secondary hint without taking a full conversation turn. See
 * Screen 05 ("Size guide is still empty for 4 of these") and
 * Screen 09 ("If you genuinely don't know the answer").
 */
export function AiTip({ variant = "info", title, children }: AiTipProps) {
  const Icon = variant === "info" ? Info : AlertTriangle;
  return (
    <div className={`p-tip ${variant === "info" ? "p-tip--info" : "p-tip--warn"}`}>
      <Icon size={14} strokeWidth={1.8} style={{ flex: "0 0 14px", marginTop: 2 }} />
      <div>
        <div className="p-tip-title">{title}</div>
        <div>{children}</div>
      </div>
    </div>
  );
}
