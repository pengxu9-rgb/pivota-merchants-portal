"use client";

import { useState, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { apiClient } from "@/lib/api-client";
import { MerchantAppShell } from "@/components/ui/merchant-app-shell";

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

  useEffect(() => {
    // Check authentication
    const token = localStorage.getItem("merchant_token");
    const userData = localStorage.getItem("merchant_user");

    if (!token) {
      router.push("/login");
      return;
    }

    if (userData) {
      setUser(JSON.parse(userData));
    }

    setLoading(false);
  }, [router]);

  const handleLogout = () => {
    apiClient.logout();
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[color:var(--merchant-canvas)]">
        <div className="merchant-panel px-8 py-6">
          <div className="flex items-center gap-4">
            <div className="animate-spin rounded-full h-10 w-10 border-2 border-[color:var(--merchant-line-strong)] border-t-[color:var(--merchant-brand)]"></div>
            <div className="space-y-1">
              <p className="text-sm font-medium text-[color:var(--merchant-ink)]">
                Loading merchant workspace
              </p>
              <p className="text-sm text-[color:var(--merchant-muted)]">
                Preparing catalog, orders, and payment context.
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
    >
      {children}
    </MerchantAppShell>
  );
}
