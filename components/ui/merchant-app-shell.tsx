"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  ChevronDown,
  LogOut,
  Menu,
  Store,
  X,
} from "lucide-react";
import { cx } from "@/lib/cx";
import {
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
  collapsible = false,
}: {
  label: string;
  items: typeof primaryNavigation;
  pathname: string;
  onNavigate: () => void;
  collapsible?: boolean;
}) {
  const hasActiveItem = items.some((item) => isNavigationItemActive(pathname, item));
  const [isOpen, setIsOpen] = useState(!collapsible || hasActiveItem);

  useEffect(() => {
    if (collapsible && hasActiveItem) {
      setIsOpen(true);
    }
  }, [collapsible, hasActiveItem]);

  return (
    <div className="space-y-1.5">
      {collapsible ? (
        <button
          type="button"
          className="flex w-full items-center justify-between px-[0.68rem] py-1 text-left"
          onClick={() => setIsOpen((value) => !value)}
          aria-expanded={isOpen}
        >
          <span className="merchant-nav-label !px-0">{label}</span>
          <ChevronDown
            className={cx(
              "h-3.5 w-3.5 text-[color:var(--merchant-muted)] transition-transform",
              isOpen ? "rotate-180" : ""
            )}
          />
        </button>
      ) : (
        <p className="merchant-nav-label">{label}</p>
      )}
      <div className={cx("space-y-0.5", !isOpen && "hidden")}>
        {items.map((item) => {
          const isActive = isNavigationItemActive(pathname, item);
          return (
            <Link
              key={item.label}
              href={item.href}
              onClick={onNavigate}
              className={cx("merchant-nav-link", isActive && "merchant-nav-link-active")}
            >
              <item.icon className="h-3.5 w-3.5 flex-shrink-0" />
              <div className="min-w-0 flex-1 font-medium leading-4.5">{item.label}</div>
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
          "fixed inset-y-0 left-0 z-50 flex w-[304px] flex-col border-r border-[color:var(--merchant-line)] bg-[color:var(--merchant-sidebar)] px-3 py-3 shadow-[var(--merchant-shadow-soft)] backdrop-blur transition-transform duration-300 lg:translate-x-0",
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="px-2 py-1">
          <div className="flex items-start justify-between gap-3">
            <Link href="/dashboard" className="flex min-w-0 items-start gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-[color:var(--merchant-brand-soft)] text-[color:var(--merchant-brand)]">
                <Store className="h-4.5 w-4.5" />
              </div>
              <div className="min-w-0 space-y-0.5">
                <p className="text-lg font-semibold tracking-[-0.03em] text-[color:var(--merchant-ink)]">
                  Pivota
                </p>
                <p className="text-[11px] text-[color:var(--merchant-muted)]">Merchant control center</p>
                <p className="truncate pt-1 text-[12px] text-[color:var(--merchant-muted-strong)]">
                  {user?.email || "merchant@pivota.cc"}
                </p>
                <div className="flex items-start gap-1.5 text-[10px] leading-4 text-[color:var(--merchant-muted)]">
                  <span className="merchant-overline shrink-0">ID</span>
                  <span className="break-all">{user?.merchant_id || "Pending"}</span>
                </div>
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
        </div>

        <nav className="mt-2 flex-1 space-y-4 overflow-y-auto pr-1">
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
        </nav>

        <div className="space-y-0.5 border-t border-[color:var(--merchant-line)] px-2 pt-3">
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
          <button
            type="button"
            onClick={onLogout}
            className="merchant-nav-link w-full text-left text-[color:var(--merchant-critical)]"
          >
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
