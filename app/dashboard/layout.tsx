"use client";

import { useState, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { apiClient } from "@/lib/api-client";
import { MerchantAppShell } from "@/components/ui/merchant-app-shell";
import { useMerchantLanguage } from "@/components/portal/merchant-language-provider";

const INTERNAL_ONLY_PREFIXES = [
  "/dashboard/mcp",
  "/dashboard/platform-onboarding",
  "/dashboard/platform-orders",
];

const INTERNAL_ALLOWED_ROLES = new Set([
  "admin",
  "super_admin",
  "employee",
  "outsourced",
  "operator",
  "internal",
]);

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<any>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [routeAllowed, setRouteAllowed] = useState(true);
  // Sync-gate signal for the sidebar ("Readiness audit" locks until a catalog
  // exists). null = unknown → nav fails open (no false lock). Fetched once.
  const [catalogSynced, setCatalogSynced] = useState<boolean | null>(null);
  const { setLanguage, t } = useMerchantLanguage();

  useEffect(() => {
    let cancelled = false;

    async function initializeWorkspace() {
      const token = localStorage.getItem("merchant_token");
      const userData = localStorage.getItem("merchant_user");

      if (!token) {
        router.push("/login");
        return;
      }

      if (userData) {
        try {
          const parsed = JSON.parse(userData);
          const role = String(parsed?.role || "merchant").toLowerCase();
          const isInternalOnlyRoute = INTERNAL_ONLY_PREFIXES.some((prefix) =>
            pathname.startsWith(prefix)
          );

          setUser(parsed);

          if (isInternalOnlyRoute && !INTERNAL_ALLOWED_ROLES.has(role)) {
            setRouteAllowed(false);
            router.replace("/dashboard");
            return;
          }
        } catch {
          setUser(null);
        }
      }

      try {
        const preferences = await apiClient.getSettingsPreferences();
        if (!cancelled && preferences?.portal_language) {
          setLanguage(preferences.portal_language);
        }
      } catch {
        // Keep local language selection when preference fetch is unavailable.
      }

      if (!cancelled) {
        setRouteAllowed(true);
        setLoading(false);
      }
    }

    void initializeWorkspace();

    return () => {
      cancelled = true;
    };
  }, [pathname, router, setLanguage]);

  // Sync status for the sidebar gate — fetched once, independent of route
  // changes. Reuses the audit readiness probe (cheap counts). Soft-fails to
  // unknown so a blip never falsely locks the nav.
  useEffect(() => {
    let cancelled = false;
    if (!localStorage.getItem("merchant_token")) return;
    (async () => {
      try {
        const r = await apiClient.getAuditReadiness();
        if (!cancelled) {
          setCatalogSynced((r?.counts?.catalog_products ?? 0) > 0);
        }
      } catch {
        // Leave null — fail open (no lock) on an unavailable readiness probe.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleLogout = () => {
    apiClient.logout();
  };

  if (loading || !routeAllowed) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[color:var(--merchant-canvas)]">
        <div className="merchant-panel px-8 py-6">
          <div className="flex items-center gap-4">
            <div className="animate-spin rounded-full h-10 w-10 border-2 border-[color:var(--merchant-line-strong)] border-t-[color:var(--merchant-brand)]"></div>
            <div className="space-y-1">
              <p className="text-sm font-medium text-[color:var(--merchant-ink)]">
                {t("shell.loadingTitle")}
              </p>
              <p className="text-sm text-[color:var(--merchant-muted)]">
                {t("shell.loadingDescription")}
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <MerchantAppShell
      pathname={pathname}
      sidebarOpen={sidebarOpen}
      setSidebarOpen={setSidebarOpen}
      onLogout={handleLogout}
      user={user}
      catalogSynced={catalogSynced}
    >
      {children}
    </MerchantAppShell>
  );
}
