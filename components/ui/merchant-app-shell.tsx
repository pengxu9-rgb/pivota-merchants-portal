"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  ChevronsLeft,
  ChevronsRight,
  ChevronDown,
  LogOut,
  Menu,
  X,
} from "lucide-react";
import { cx } from "@/lib/cx";
import {
  aiReadinessNavigation,
  isNavigationItemActive,
  type MerchantNavigationItem,
  primaryNavigation,
  settingsNavigationItem,
  workflowNavigation,
} from "@/lib/merchant-navigation";
import { useMerchantLanguage } from "@/components/portal/merchant-language-provider";

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

const SIDEBAR_COLLAPSED_STORAGE_KEY = "merchant_sidebar_collapsed";

function NavigationGroup({
  label,
  items,
  pathname,
  onNavigate,
  collapsible = false,
  collapsed = false,
}: {
  label: string;
  items: MerchantNavigationItem[];
  pathname: string;
  onNavigate: () => void;
  collapsible?: boolean;
  collapsed?: boolean;
}) {
  const { t } = useMerchantLanguage();
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
          className={cx(
            "flex w-full items-center justify-between px-[0.68rem] py-1 text-left",
            collapsed && "lg:hidden"
          )}
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
        <p className={cx("merchant-nav-label", collapsed && "lg:hidden")}>{label}</p>
      )}
      <div className={cx("space-y-0.5", !isOpen && "hidden")}>
        {items.map((item) => {
          const isActive = isNavigationItemActive(pathname, item);
          const translatedLabel = item.labelKey ? t(item.labelKey) : item.label;
          return (
          <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className={cx(
                "merchant-nav-link",
                isActive && "merchant-nav-link-active",
                collapsed && "lg:justify-center lg:px-0 lg:py-2.5"
              )}
              title={translatedLabel}
              aria-label={translatedLabel}
            >
              <item.icon className="h-3.5 w-3.5 flex-shrink-0" />
              <div
                className={cx(
                  "min-w-0 flex-1 font-medium leading-4.5",
                  collapsed && "lg:hidden"
                )}
              >
                {translatedLabel}
              </div>
              {item.badge ? (
                <span
                  className={cx(
                    "flex-shrink-0 rounded-full border border-[color:var(--merchant-line)] px-1.5 py-0.5 text-[11px] font-medium leading-none text-[color:var(--merchant-muted)]",
                    collapsed && "lg:hidden"
                  )}
                >
                  {item.badge}
                </span>
              ) : null}
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
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const { t } = useMerchantLanguage();

  useEffect(() => {
    try {
      const savedState = localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY);
      setSidebarCollapsed(savedState === "true");
    } catch {
      // no-op
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(
        SIDEBAR_COLLAPSED_STORAGE_KEY,
        sidebarCollapsed ? "true" : "false"
      );
    } catch {
      // no-op
    }
  }, [sidebarCollapsed]);

  return (
    <div className="min-h-screen bg-[color:var(--merchant-canvas)]">
      {sidebarOpen ? (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-[rgba(34,28,22,0.36)] backdrop-blur-sm lg:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-label={t("shell.closeSidebar")}
        />
      ) : null}

      <aside
        className={cx(
          "fixed inset-y-0 left-0 z-50 flex w-[304px] flex-col border-r border-[color:var(--merchant-line)] bg-[color:var(--merchant-sidebar)] px-3 py-3 shadow-[var(--merchant-shadow-soft)] backdrop-blur transition-[width,transform] duration-300 lg:translate-x-0",
          sidebarCollapsed ? "lg:w-[92px]" : "lg:w-[304px]",
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="px-2 py-1">
          <div className="flex items-start justify-between gap-3">
            <Link
              href="/dashboard"
              className={cx(
                "flex min-w-0 items-start gap-3",
                sidebarCollapsed && "lg:justify-center lg:gap-0"
              )}
              title={`Pivota ${t("auth.shell.portalWordmark")}`}
            >
              <span className="pv-logo pv-logo--gradient pv-logo--md" aria-hidden="true" />
              <div
                className={cx(
                  "min-w-0 space-y-0.5",
                  sidebarCollapsed && "lg:hidden"
                )}
              >
                <p className="pv-wordmark pv-wordmark--sm">
                  Pivota
                </p>
                <p className="text-[11px] text-[color:var(--merchant-muted)]">{t("shell.controlCenter")}</p>
                <p className="truncate pt-1 text-[12px] text-[color:var(--merchant-muted-strong)]">
                  {user?.email || "merchant@pivota.cc"}
                </p>
                <div className="flex items-start gap-1.5 text-[10px] leading-4 text-[color:var(--merchant-muted)]">
                  <span className="merchant-overline shrink-0">{t("shell.id")}</span>
                  <span className="break-all">{user?.merchant_id || t("shell.pending")}</span>
                </div>
              </div>
            </Link>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="merchant-icon-button hidden lg:inline-flex"
                onClick={() => setSidebarCollapsed((value) => !value)}
                aria-label={sidebarCollapsed ? t("shell.expandSidebar") : t("shell.collapseSidebar")}
                title={sidebarCollapsed ? t("shell.expandSidebar") : t("shell.collapseSidebar")}
              >
                {sidebarCollapsed ? (
                  <ChevronsRight className="h-4 w-4" />
                ) : (
                  <ChevronsLeft className="h-4 w-4" />
                )}
              </button>
              <button
                type="button"
                className="merchant-icon-button lg:hidden"
                onClick={() => setSidebarOpen(false)}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        <nav className="mt-2 flex-1 space-y-4 overflow-y-auto pr-1">
          <NavigationGroup
            label={t("shell.navigate")}
            items={primaryNavigation}
            pathname={pathname}
            onNavigate={() => setSidebarOpen(false)}
            collapsed={sidebarCollapsed}
          />
          <NavigationGroup
            label="AI readiness"
            items={aiReadinessNavigation}
            pathname={pathname}
            onNavigate={() => setSidebarOpen(false)}
            collapsed={sidebarCollapsed}
          />
          <NavigationGroup
            label={t("shell.workflows")}
            items={workflowNavigation}
            pathname={pathname}
            onNavigate={() => setSidebarOpen(false)}
            collapsed={sidebarCollapsed}
          />
        </nav>

        <div className="space-y-0.5 border-t border-[color:var(--merchant-line)] px-2 pt-3">
          <Link
            href={settingsNavigationItem.href}
            onClick={() => setSidebarOpen(false)}
            className={cx(
              "merchant-nav-link",
              sidebarCollapsed && "lg:justify-center lg:px-0 lg:py-2.5",
              isNavigationItemActive(pathname, settingsNavigationItem) &&
                "merchant-nav-link-active"
            )}
            title={settingsNavigationItem.labelKey ? t(settingsNavigationItem.labelKey) : settingsNavigationItem.label}
            aria-label={settingsNavigationItem.labelKey ? t(settingsNavigationItem.labelKey) : settingsNavigationItem.label}
          >
            <settingsNavigationItem.icon className="h-4 w-4 flex-shrink-0" />
            <div className={cx("font-medium", sidebarCollapsed && "lg:hidden")}>
              {settingsNavigationItem.labelKey ? t(settingsNavigationItem.labelKey) : settingsNavigationItem.label}
            </div>
          </Link>
          <button
            type="button"
            onClick={onLogout}
            className={cx(
              "merchant-nav-link w-full text-left text-[color:var(--merchant-critical)]",
              sidebarCollapsed && "lg:justify-center lg:px-0 lg:py-2.5"
            )}
            title={t("shell.logout")}
            aria-label={t("shell.logout")}
          >
            <LogOut className="h-4 w-4" />
            <div className={cx("font-medium", sidebarCollapsed && "lg:hidden")}>
              {t("shell.logout")}
            </div>
          </button>
        </div>
      </aside>

      <div className={cx(sidebarCollapsed ? "lg:pl-[92px]" : "lg:pl-[304px]")}>
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
