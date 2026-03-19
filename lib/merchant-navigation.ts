import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  CreditCard,
  LayoutDashboard,
  Package,
  Settings,
  ShoppingBag,
  Sparkles,
  Store,
  Tag,
  Wallet,
  Zap,
} from "lucide-react";
import { FEATURE_FLAGS } from "@/lib/config";

export type MerchantNavigationItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  matchPrefixes?: string[];
  description?: string;
};

export const primaryNavigation: MerchantNavigationItem[] = [
  {
    label: "Overview",
    href: "/dashboard",
    icon: LayoutDashboard,
    matchPrefixes: ["/dashboard"],
    description: "Attention now",
  },
  {
    label: "Catalog",
    href: "/dashboard/products",
    icon: Package,
    matchPrefixes: ["/dashboard/products", "/dashboard/product-optimization"],
    description: "Products and content",
  },
  {
    label: "Orders",
    href: "/dashboard/orders",
    icon: ShoppingBag,
    matchPrefixes: ["/dashboard/orders"],
    description: "Sales and refunds",
  },
  {
    label: "Promotions",
    href: "/portal/promotions",
    icon: Tag,
    matchPrefixes: ["/portal/promotions"],
    description: "Campaign planning",
  },
  {
    label: "Analytics",
    href: "/dashboard/analytics",
    icon: BarChart3,
    matchPrefixes: ["/dashboard/analytics"],
    description: "Sales trends",
  },
  {
    label: "Payments",
    href: "/dashboard/payouts",
    icon: Wallet,
    matchPrefixes: ["/dashboard/payouts", "/dashboard/commission"],
    description: "Payouts and settlement",
  },
  {
    label: "Integrations",
    href: "/dashboard/integrations",
    icon: Store,
    matchPrefixes: ["/dashboard/integrations"],
    description: "Channels and setup",
  },
];

export const settingsNavigationItem: MerchantNavigationItem = {
  label: "Portal settings",
  href: "/dashboard/settings",
  icon: Settings,
  matchPrefixes: ["/dashboard/settings"],
  description: "Access and preferences",
};

export const workflowNavigation: MerchantNavigationItem[] = [
  {
    label: "Catalog health",
    href: "/dashboard/product-optimization",
    icon: Sparkles,
    matchPrefixes: ["/dashboard/product-optimization"],
    description: "Readiness actions",
  },
  {
    label: "Commission offers",
    href: "/dashboard/commission",
    icon: CreditCard,
    matchPrefixes: ["/dashboard/commission"],
    description: "Merchant incentives",
  },
];

export const adminNavigation: MerchantNavigationItem[] = [
  {
    label: "MCP",
    href: "/dashboard/mcp",
    icon: Zap,
    matchPrefixes: ["/dashboard/mcp"],
    description: "Control plane",
  },
  ...(FEATURE_FLAGS.PLATFORM_ONBOARDING_V2
    ? [
        {
          label: "Platform onboarding",
          href: "/dashboard/platform-onboarding",
          icon: Zap,
          matchPrefixes: ["/dashboard/platform-onboarding"],
          description: "Onboarding ops",
        },
      ]
    : []),
  ...(FEATURE_FLAGS.PLATFORM_ORDERS_V1
    ? [
        {
          label: "Platform orders",
          href: "/dashboard/platform-orders",
          icon: ShoppingBag,
          matchPrefixes: ["/dashboard/platform-orders"],
          description: "Internal orders",
        },
      ]
    : []),
];

export function isNavigationItemActive(
  pathname: string,
  item: MerchantNavigationItem
) {
  if (item.href === "/dashboard") {
    return pathname === "/dashboard";
  }

  return (item.matchPrefixes || [item.href]).some((prefix) =>
    pathname.startsWith(prefix)
  );
}

export function getPrimaryNavigationLabel(pathname: string) {
  const activePrimary = primaryNavigation.find((item) =>
    isNavigationItemActive(pathname, item)
  );

  if (activePrimary) {
    return activePrimary.label;
  }

  const activeWorkflow = workflowNavigation.find((item) =>
    isNavigationItemActive(pathname, item)
  );

  if (isNavigationItemActive(pathname, settingsNavigationItem)) {
    return settingsNavigationItem.label;
  }

  return activeWorkflow?.label || "Merchant portal";
}
