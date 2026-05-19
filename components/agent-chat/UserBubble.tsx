import type { ReactNode } from "react";

/**
 * Merchant's reply bubble — solid purple, right-aligned. No avatar.
 * Capped at 480px width so long replies stay readable.
 */
export function UserBubble({ children }: { children: ReactNode }) {
  return (
    <div className="p-bubble p-bubble--user">
      <div className="p-bubble-body">{children}</div>
    </div>
  );
}
