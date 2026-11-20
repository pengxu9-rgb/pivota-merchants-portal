import type { LucideIcon } from "lucide-react";
import { CreditCard, Globe, Home, Package, SlidersHorizontal } from "lucide-react";

/** AI Revenue Recovery v2 nav. Labels are translation keys (`labelKey`) so all
 * six portal locales keep working. Orders, analytics and integrations are not
 * here: checkout runs at the merchant via UCP/ACP. Each slice adds the item
 * for the screen it ships; Shopper questions is held (needs per-answer
 * `source_visible` from the backend). */
export type RecoveryNavItem = {
  labelKey: string;
  href: string;
  icon: LucideIcon;
  matchPrefixes?: string[];
};

/** Where "Connect" goes: the Start screen (connect, or start with links). */
export const RECOVERY_CONNECT_HREF = "/dashboard/start";

/** Where "Run new check" goes: Start, whose cost modal shows the cost first
 * (or says plainly that the backend gives none for this kind of check). */
export const RECOVERY_RUN_HREF = "/dashboard/start";

export const recoveryMainNav: RecoveryNavItem[] = [
  { labelKey: "recovery.nav.overview", href: "/dashboard", icon: Home },
  {
    labelKey: "recovery.nav.products",
    href: "/dashboard/products",
    icon: Package,
    matchPrefixes: ["/dashboard/products"],
  },
  {
    labelKey: "recovery.nav.sources",
    href: "/dashboard/sources",
    icon: Globe,
    matchPrefixes: ["/dashboard/sources"],
  },
];

export const recoveryAccountNav: RecoveryNavItem[] = [
  {
    labelKey: "recovery.nav.plan",
    href: "/dashboard/billing",
    icon: CreditCard,
    matchPrefixes: ["/dashboard/billing"],
  },
  {
    labelKey: "recovery.nav.settings",
    href: "/dashboard/settings",
    icon: SlidersHorizontal,
    matchPrefixes: ["/dashboard/settings"],
  },
];

export function isRecoveryNavActive(pathname: string, item: RecoveryNavItem): boolean {
  if (item.href === "/dashboard") return pathname === "/dashboard";
  return (item.matchPrefixes ?? [item.href]).some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

/** Pages drawn at the wide content cap (1280px); the rest use 1200px. */
const WIDE_PAGES = ["/dashboard/sources"];

export function isRecoveryWidePage(pathname: string): boolean {
  return WIDE_PAGES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}
