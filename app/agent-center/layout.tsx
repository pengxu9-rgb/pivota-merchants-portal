"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { apiClient } from "@/lib/api-client";
import { MerchantAppShell } from "@/components/ui/merchant-app-shell";
import { useMerchantLanguage } from "@/components/portal/merchant-language-provider";

export default function AgentCenterLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<any>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [loading, setLoading] = useState(true);
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
          setUser(JSON.parse(userData));
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

      if (!cancelled) setLoading(false);
    }

    void initializeWorkspace();

    return () => {
      cancelled = true;
    };
  }, [router, setLanguage]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[color:var(--merchant-canvas)]">
        <div className="merchant-panel px-8 py-6">
          <div className="flex items-center gap-4">
            <div className="h-10 w-10 animate-spin rounded-full border-2 border-[color:var(--merchant-line-strong)] border-t-[color:var(--merchant-brand)]" />
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
      onLogout={() => apiClient.logout()}
      user={user}
    >
      {children}
    </MerchantAppShell>
  );
}
