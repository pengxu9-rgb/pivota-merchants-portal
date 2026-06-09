"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CreditCard, Wallet } from "lucide-react";
import { cx } from "@/lib/cx";

const items = [
  {
    label: "Payouts",
    href: "/dashboard/payouts",
    icon: Wallet,
    matchPrefixes: ["/dashboard/payouts"],
    description: "Settlements and payment proof",
  },
  {
    label: "Commission offers",
    href: "/dashboard/commission",
    icon: CreditCard,
    matchPrefixes: ["/dashboard/commission"],
    description: "Merchant-funded incentives",
  },
];

export function PaymentsNav() {
  const pathname = usePathname();

  return (
    <div className="merchant-panel merchant-panel-muted p-2">
      <div className="grid gap-2 sm:grid-cols-2">
        {items.map((item) => {
          const isActive = item.matchPrefixes.some((prefix) => pathname.startsWith(prefix));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cx(
                "rounded-[1.1rem] px-4 py-3 transition",
                isActive
                  ? "bg-white text-[color:var(--merchant-ink)] shadow-[var(--merchant-shadow-panel)]"
                  : "text-[color:var(--merchant-muted-strong)] hover:bg-white/70"
              )}
            >
              <div className="flex items-center gap-3">
                <item.icon className="h-4 w-4" />
                <div>
                  <div className="font-medium">{item.label}</div>
                  <div className="text-xs text-[color:var(--merchant-muted)]">
                    {item.description}
                  </div>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
