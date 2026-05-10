import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  Brain,
  ClipboardCheck,
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
  labelKey?: string;
  descriptionKey?: string;
};

export const primaryNavigation: MerchantNavigationItem[] = [
  {
    label: "Overview",
    labelKey: "shell.nav.overview",
    href: "/dashboard",
    icon: LayoutDashboard,
    matchPrefixes: ["/dashboard"],
    description: "Attention now",
    descriptionKey: "shell.nav.overviewDesc",
  },
  {
    label: "Catalog",
    labelKey: "shell.nav.catalog",
    href: "/dashboard/products",
    icon: Package,
    matchPrefixes: ["/dashboard/products", "/dashboard/product-optimization"],
    description: "Products and content",
    descriptionKey: "shell.nav.catalogDesc",
  },
  {
    label: "Orders",
    labelKey: "shell.nav.orders",
    href: "/dashboard/orders",
    icon: ShoppingBag,
    matchPrefixes: ["/dashboard/orders"],
    description: "Sales and refunds",
    descriptionKey: "shell.nav.ordersDesc",
  },
  {
    label: "Promotions",
    labelKey: "shell.nav.promotions",
    href: "/dashboard/promotions",
    icon: Tag,
    matchPrefixes: ["/dashboard/promotions", "/portal/promotions"],
    description: "Campaign planning",
    descriptionKey: "shell.nav.promotionsDesc",
  },
  {
    label: "Analytics",
    labelKey: "shell.nav.analytics",
    href: "/dashboard/analytics",
    icon: BarChart3,
    matchPrefixes: ["/dashboard/analytics"],
    description: "Sales trends",
    descriptionKey: "shell.nav.analyticsDesc",
  },
  {
    label: "Payments",
    labelKey: "shell.nav.payments",
    href: "/dashboard/payouts",
    icon: Wallet,
    matchPrefixes: ["/dashboard/payouts", "/dashboard/commission"],
    description: "Payouts and settlement",
    descriptionKey: "shell.nav.paymentsDesc",
  },
  {
    label: "Integrations",
    labelKey: "shell.nav.integrations",
    href: "/dashboard/integrations",
    icon: Store,
    matchPrefixes: ["/dashboard/integrations"],
    description: "Channels and setup",
    descriptionKey: "shell.nav.integrationsDesc",
  },
];

export const settingsNavigationItem: MerchantNavigationItem = {
  label: "Portal settings",
  labelKey: "shell.nav.settings",
  href: "/dashboard/settings",
  icon: Settings,
  matchPrefixes: ["/dashboard/settings"],
  description: "Access and preferences",
  descriptionKey: "shell.nav.settingsDesc",
};

export const workflowNavigation: MerchantNavigationItem[] = [
  {
    label: "Catalog health",
    labelKey: "shell.nav.catalogHealth",
    href: "/dashboard/product-optimization",
    icon: Sparkles,
    matchPrefixes: ["/dashboard/product-optimization"],
    description: "Readiness actions",
    descriptionKey: "shell.nav.catalogHealthDesc",
  },
  {
    label: "AI Readiness Audit",
    href: "/dashboard/agent-center/ai-readiness",
    icon: Brain,
    matchPrefixes: ["/dashboard/agent-center/ai-readiness"],
    description: "Audit up to 5 SKUs against AI shopping agents",
  },
  {
    label: "Conversion funnel",
    href: "/dashboard/agent-center/funnel",
    icon: BarChart3,
    matchPrefixes: ["/dashboard/agent-center/funnel"],
    description: "Stage drop-off across AI / social / SEO / retail",
  },
  {
    label: "PDP status",
    href: "/dashboard/pdp-status",
    icon: ClipboardCheck,
    matchPrefixes: ["/dashboard/pdp-status"],
    description: "Shared PDP review",
  },
  {
    label: "Commission offers",
    labelKey: "shell.nav.commissionOffers",
    href: "/dashboard/commission",
    icon: CreditCard,
    matchPrefixes: ["/dashboard/commission"],
    description: "Merchant incentives",
    descriptionKey: "shell.nav.commissionOffersDesc",
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
