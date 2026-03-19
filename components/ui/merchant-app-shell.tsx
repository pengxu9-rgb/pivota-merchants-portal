"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import {
  LogOut,
  Menu,
  Search,
  Store,
  X,
} from "lucide-react";
import { cx } from "@/lib/cx";
import {
  adminNavigation,
  getPrimaryNavigationLabel,
  isNavigationItemActive,
  primaryNavigation,
  workflowNavigation,
} from "@/lib/merchant-navigation";
import { InlineLink } from "@/components/ui/merchant-primitives";

type MerchantAppShellProps = {
  children: ReactNode;
  pathname: string;
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  onLogout: () => void;
  user?: {
    business_name?: string;
    email?: string;
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
              <div className="min-w-0">
                <div className="truncate font-medium">{item.label}</div>
                {item.description ? (
                  <div className="hidden truncate text-[11px] text-[color:var(--merchant-muted)] xl:block">
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
  const currentSection = getPrimaryNavigationLabel(pathname);

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
          "fixed inset-y-0 left-0 z-50 flex w-[292px] flex-col border-r border-[color:var(--merchant-line)] bg-[color:var(--merchant-sidebar)] px-4 py-4 shadow-[var(--merchant-shadow-soft)] backdrop-blur transition-transform duration-300 lg:translate-x-0",
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex items-center justify-between px-2 py-2">
          <Link href="/dashboard" className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[color:var(--merchant-brand-soft)] text-[color:var(--merchant-brand)]">
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

        <div className="merchant-panel merchant-panel-muted mt-4 px-4 py-4">
          <div className="merchant-overline">Workspace</div>
          <div className="mt-2 space-y-1">
            <p className="text-base font-semibold text-[color:var(--merchant-ink)]">
              {user?.business_name || "Merchant workspace"}
            </p>
            <p className="text-sm text-[color:var(--merchant-muted)]">
              {user?.email || "Catalog, orders, channels, and payments"}
            </p>
          </div>
          <div className="mt-4">
            <InlineLink href="/dashboard/settings">Portal settings</InlineLink>
          </div>
        </div>

        <nav className="mt-6 flex-1 space-y-6 overflow-y-auto pr-1">
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

        <div className="border-t border-[color:var(--merchant-line)] px-2 pt-4">
          <button type="button" onClick={onLogout} className="merchant-nav-link w-full text-left text-[color:var(--merchant-critical)]">
            <LogOut className="h-4 w-4" />
            <div className="font-medium">Log out</div>
          </button>
        </div>
      </aside>

      <div className="lg:pl-[292px]">
        <header className="sticky top-0 z-30 border-b border-[color:var(--merchant-line)] bg-[rgba(245,241,235,0.82)] backdrop-blur">
          <div className="merchant-page flex items-center justify-between py-4">
            <div className="flex items-center gap-3">
              <button
                type="button"
                className="merchant-icon-button lg:hidden"
                onClick={() => setSidebarOpen(true)}
              >
                <Menu className="h-4 w-4" />
              </button>
              <div className="space-y-0.5">
                <div className="merchant-overline">Merchant portal</div>
                <p className="text-sm font-medium text-[color:var(--merchant-ink)]">
                  {currentSection}
                </p>
              </div>
            </div>
            <div className="hidden items-center gap-3 lg:flex">
              <div className="merchant-search-pill">
                <Search className="h-4 w-4" />
                <span>Merchant workspace</span>
              </div>
              <div className="rounded-full border border-[color:var(--merchant-line-strong)] bg-white px-4 py-2 text-sm text-[color:var(--merchant-muted-strong)]">
                {user?.business_name || "Pivota merchant"}
              </div>
            </div>
          </div>
        </header>

        <main className="merchant-page pb-10 pt-8">{children}</main>
      </div>
    </div>
  );
}
