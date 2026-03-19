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
    description: "What needs attention now",
  },
  {
    label: "Catalog",
    href: "/dashboard/products",
    icon: Package,
    matchPrefixes: ["/dashboard/products", "/dashboard/product-optimization"],
    description: "Products, variants, and content",
  },
  {
    label: "Orders",
    href: "/dashboard/orders",
    icon: ShoppingBag,
    matchPrefixes: ["/dashboard/orders"],
    description: "Sales, fulfillment, and refunds",
  },
  {
    label: "Promotions",
    href: "/portal/promotions",
    icon: Tag,
    matchPrefixes: ["/portal/promotions"],
    description: "Campaigns and offers",
  },
  {
    label: "Analytics",
    href: "/dashboard/analytics",
    icon: BarChart3,
    matchPrefixes: ["/dashboard/analytics"],
    description: "Sales and performance trends",
  },
  {
    label: "Payments",
    href: "/dashboard/payouts",
    icon: Wallet,
    matchPrefixes: ["/dashboard/payouts", "/dashboard/commission"],
    description: "Payouts, commission, and settlement",
  },
  {
    label: "Integrations",
    href: "/dashboard/integrations",
    icon: Store,
    matchPrefixes: ["/dashboard/integrations"],
    description: "Sales channels and payment setup",
  },
  {
    label: "Settings",
    href: "/dashboard/settings",
    icon: Settings,
    matchPrefixes: ["/dashboard/settings"],
    description: "Portal access and preferences",
  },
];

export const workflowNavigation: MerchantNavigationItem[] = [
  {
    label: "Catalog health",
    href: "/dashboard/product-optimization",
    icon: Sparkles,
    matchPrefixes: ["/dashboard/product-optimization"],
    description: "Readiness issues and next actions",
  },
  {
    label: "Commission offers",
    href: "/dashboard/commission",
    icon: CreditCard,
    matchPrefixes: ["/dashboard/commission"],
    description: "Merchant-funded incentives",
  },
];

export const adminNavigation: MerchantNavigationItem[] = [
  {
    label: "MCP",
    href: "/dashboard/mcp",
    icon: Zap,
    matchPrefixes: ["/dashboard/mcp"],
    description: "Internal merchant control plane",
  },
  ...(FEATURE_FLAGS.PLATFORM_ONBOARDING_V2
    ? [
        {
          label: "Platform onboarding",
          href: "/dashboard/platform-onboarding",
          icon: Zap,
          matchPrefixes: ["/dashboard/platform-onboarding"],
          description: "Internal onboarding workflows",
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
          description: "Internal platform order view",
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

  return activeWorkflow?.label || "Merchant portal";
}
