"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import {
  LogOut,
  Menu,
  Store,
  X,
} from "lucide-react";
import { cx } from "@/lib/cx";
import {
  adminNavigation,
  isNavigationItemActive,
  primaryNavigation,
  settingsNavigationItem,
  workflowNavigation,
} from "@/lib/merchant-navigation";

type MerchantAppShellProps = {
  children: ReactNode;
  pathname: string;
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  onLogout: () => void;
  user?: {
    business_name?: string;
    email?: string;
    merchant_id?: string;
  } | null;
};

function NavigationGroup({
  label,
  items,
  pathname,
  onNavigate,
}: {
  label: string;
  items: typeof primaryNavigation;
  pathname: string;
  onNavigate: () => void;
}) {
  return (
    <div className="space-y-2">
      <p className="merchant-nav-label">{label}</p>
      <div className="space-y-1">
        {items.map((item) => {
          const isActive = isNavigationItemActive(pathname, item);
          return (
            <Link
              key={item.label}
              href={item.href}
              onClick={onNavigate}
              className={cx("merchant-nav-link", isActive && "merchant-nav-link-active")}
            >
              <item.icon className="h-4 w-4 flex-shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="font-medium leading-5">{item.label}</div>
                {item.description ? (
                  <div className="mt-0.5 text-[11px] leading-4 text-[color:var(--merchant-muted)]">
                    {item.description}
                  </div>
                ) : null}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

export function MerchantAppShell({
  children,
  pathname,
  sidebarOpen,
  setSidebarOpen,
  onLogout,
  user,
}: MerchantAppShellProps) {
  return (
    <div className="min-h-screen bg-[color:var(--merchant-canvas)]">
      {sidebarOpen ? (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-[rgba(34,28,22,0.36)] backdrop-blur-sm lg:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-label="Close sidebar"
        />
      ) : null}

      <aside
        className={cx(
          "fixed inset-y-0 left-0 z-50 flex w-[304px] flex-col border-r border-[color:var(--merchant-line)] bg-[color:var(--merchant-sidebar)] px-4 py-4 shadow-[var(--merchant-shadow-soft)] backdrop-blur transition-transform duration-300 lg:translate-x-0",
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex items-center justify-between px-2 py-1.5">
          <Link href="/dashboard" className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[color:var(--merchant-brand-soft)] text-[color:var(--merchant-brand)]">
              <Store className="h-5 w-5" />
            </div>
            <div className="space-y-0.5">
              <p className="text-lg font-semibold tracking-[-0.03em] text-[color:var(--merchant-ink)]">
                Pivota
              </p>
              <p className="text-xs text-[color:var(--merchant-muted)]">Merchant control center</p>
            </div>
          </Link>
          <button
            type="button"
            className="merchant-icon-button lg:hidden"
            onClick={() => setSidebarOpen(false)}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-3 px-2 pb-2">
          <div className="space-y-1.5 rounded-[1rem] border border-[color:var(--merchant-line)] bg-white/48 px-3 py-3">
            <p className="text-sm text-[color:var(--merchant-muted-strong)]">
              {user?.email || "merchant@pivota.cc"}
            </p>
            <div className="flex items-start gap-2 text-[11px] leading-4 text-[color:var(--merchant-muted)]">
              <span className="merchant-overline shrink-0">ID</span>
              <span className="break-all">{user?.merchant_id || "Pending"}</span>
            </div>
          </div>
        </div>

        <nav className="mt-3 flex-1 space-y-5 overflow-y-auto pr-1">
          <NavigationGroup
            label="Navigate"
            items={primaryNavigation}
            pathname={pathname}
            onNavigate={() => setSidebarOpen(false)}
          />
          <NavigationGroup
            label="Workflows"
            items={workflowNavigation}
            pathname={pathname}
            onNavigate={() => setSidebarOpen(false)}
          />
          {adminNavigation.length > 0 ? (
            <NavigationGroup
              label="Internal"
              items={adminNavigation}
              pathname={pathname}
              onNavigate={() => setSidebarOpen(false)}
            />
          ) : null}
        </nav>

        <div className="space-y-1 border-t border-[color:var(--merchant-line)] px-2 pt-4">
          <Link
            href={settingsNavigationItem.href}
            onClick={() => setSidebarOpen(false)}
            className={cx(
              "merchant-nav-link",
              isNavigationItemActive(pathname, settingsNavigationItem) &&
                "merchant-nav-link-active"
            )}
          >
            <settingsNavigationItem.icon className="h-4 w-4 flex-shrink-0" />
            <div className="font-medium">{settingsNavigationItem.label}</div>
          </Link>
          <button type="button" onClick={onLogout} className="merchant-nav-link w-full text-left text-[color:var(--merchant-critical)]">
            <LogOut className="h-4 w-4" />
            <div className="font-medium">Log out</div>
          </button>
        </div>
      </aside>

      <div className="lg:pl-[304px]">
        <main className="merchant-page pb-8 pt-4 sm:pt-5 lg:pt-6">
          <div className="mb-4 lg:hidden">
            <button
              type="button"
              className="merchant-icon-button"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open sidebar"
            >
              <Menu className="h-4 w-4" />
            </button>
          </div>
          {children}
        </main>
      </div>
    </div>
  );
}
