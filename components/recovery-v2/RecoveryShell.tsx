"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
// Component styles ship with the shell (dynamically imported only when the
// flag is on): `.rv-*` classes, `.rv2`-scoped rules, and the re-skin of the
// pages without a board. The auth shell loads the same re-skin through
// RecoveryLegacyStyles so /login and /signup get it too.
import "../../styles/recovery-v2.css";
import "../../styles/recovery-v2-legacy.css";
import Link from "next/link";
import { LogOut, Menu, X } from "lucide-react";
import { useMerchantLanguage } from "@/components/portal/merchant-language-provider";
import { RecoveryProvider, useRecovery } from "@/components/recovery-v2/RecoveryContext";
import {
  RECOVERY_CONNECT_HREF,
  isRecoveryNavActive,
  isRecoveryWidePage,
  recoveryAccountNav,
  recoveryMainNav,
  type RecoveryNavItem,
} from "@/lib/recovery-v2/navigation";
import type { CreditsSummary, StoreMode } from "@/lib/recovery-v2/mode";
import { formatNumber } from "@/components/recovery-v2/ui";

type ShellUser = { business_name?: string; email?: string; merchant_id?: string } | null;

function initials(user: ShellUser): string {
  const source = (user?.business_name || user?.email || "").trim();
  if (!source) return "·";
  const words = source.split(/[\s@._-]+/).filter(Boolean);
  return ((words[0]?.[0] ?? "") + (words[1]?.[0] ?? "")).toUpperCase() || "·";
}

function NavLink({ item, pathname, onNavigate }: { item: RecoveryNavItem; pathname: string; onNavigate: () => void }) {
  const { t } = useMerchantLanguage();
  const active = isRecoveryNavActive(pathname, item);
  const Icon = item.icon;
  return (
    <Link className="rv-nav" href={item.href} aria-current={active ? "page" : undefined} onClick={onNavigate}>
      <Icon aria-hidden="true" strokeWidth={1.75} />
      {t(item.labelKey)}
    </Link>
  );
}

export function StoreStatusCard({ mode, linksCount }: { mode: StoreMode; linksCount: number | null }) {
  const { t, language } = useMerchantLanguage();
  if (mode.kind === "loading") {
    return <div className="rv-side-card rv-muted" role="status">{t("recovery.store.checking")}</div>;
  }
  if (mode.kind === "unknown") {
    return <div className="rv-side-card rv-muted">{t("recovery.store.unknown")}</div>;
  }
  if (mode.kind === "links") {
    return (
      <Link className="rv-side-card rv-dashed" href={RECOVERY_CONNECT_HREF}>
        <span style={{ fontWeight: 600 }}>{t("recovery.store.notConnected")}</span>
        <span style={{ color: "var(--accent-hover)" }}>
          {linksCount && linksCount > 0
            ? t("recovery.store.notConnectedLinks", { count: linksCount })
            : t("recovery.store.notConnectedNoLinks")}
        </span>
      </Link>
    );
  }
  if (mode.kind === "first_sync") {
    return (
      <div className="rv-side-card" style={{ flexDirection: "row", alignItems: "center", gap: 8 }} role="status">
        <span className="rv-dot rv-pending" aria-hidden="true" />
        <span>
          <span style={{ fontWeight: 600 }}>{t("recovery.store.connected", { platform: mode.platform })}</span>
          <span className="rv-muted"> · {t("recovery.store.firstSync")}</span>
        </span>
      </div>
    );
  }
  return (
    <div className="rv-side-card" style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
      <span className="rv-dot" aria-hidden="true" />
      <span>
        <span style={{ fontWeight: 600 }}>{t("recovery.store.connected", { platform: mode.platform })}</span>
        <span className="rv-muted"> · {t("recovery.store.connectedProducts", { count: formatNumber(mode.productCount, language) })}</span>
      </span>
    </div>
  );
}

export function CreditsCard({ credits }: { credits: CreditsSummary | null | "loading" }) {
  const { t, language } = useMerchantLanguage();
  if (credits === "loading") return null;
  return (
    <Link className="rv-side-card" href="/dashboard/billing" style={{ margin: "8px 4px", gap: 4, color: "var(--ink)" }}>
      <span style={{ fontWeight: 500 }}>{t("recovery.credits.title")}</span>
      {credits ? (
        <>
          {credits.available !== null ? (
            <span className="rv-num">{t("recovery.credits.available", { count: formatNumber(credits.available, language) })}</span>
          ) : null}
          {credits.allowance !== null ? (
            <span className="rv-muted rv-num">{t("recovery.credits.allowance", { count: formatNumber(credits.allowance, language) })}</span>
          ) : null}
        </>
      ) : (
        <span className="rv-muted">{t("recovery.credits.unavailable")}</span>
      )}
    </Link>
  );
}

function AccountMenu({ user, onLogout }: { user: ShellUser; onLogout: () => void }) {
  const { t } = useMerchantLanguage();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent ? event.key === "Escape" : !ref.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);
  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        type="button"
        className="rv-iconbtn rv-avatar"
        aria-label={t("recovery.shell.account")}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        {initials(user)}
      </button>
      {open ? (
        <div
          role="menu"
          className="rv-card"
          style={{ position: "absolute", right: 0, top: 36, minWidth: 220, padding: 6, zIndex: 40, display: "flex", flexDirection: "column", gap: 2 }}
        >
          {user?.email ? <div className="rv-muted rv-small" style={{ padding: "6px 10px", wordBreak: "break-all" }}>{user.email}</div> : null}
          <Link role="menuitem" className="rv-nav" href="/dashboard/settings" onClick={() => setOpen(false)}>
            {t("recovery.nav.settings")}
          </Link>
          <button role="menuitem" type="button" className="rv-nav" style={{ border: 0, background: "transparent", cursor: "pointer", width: "100%" }} onClick={onLogout}>
            <LogOut aria-hidden="true" strokeWidth={1.75} />
            {t("recovery.shell.logout")}
          </button>
        </div>
      ) : null}
    </div>
  );
}

export type RecoveryShellViewProps = {
  pathname: string;
  user: ShellUser;
  mode: StoreMode;
  credits: CreditsSummary | null | "loading";
  linksCount: number | null;
  onLogout: () => void;
  children: ReactNode;
};

/** 224px sidebar + 56px top bar (Foundations board). Search, notifications and
 * the store switcher are hidden: none has a backend yet (review M7). On phones
 * the sidebar stacks above the content and its nav folds behind "Menu". */
/** The account slot: the business name, else the connected store's name, else the sign-in email.
 * "Your store" only when none is known (it showed for merchants who never set a business name). */
export function accountName(user: { business_name?: string | null; email?: string | null } | null | undefined, mode: StoreMode): string | null {
  const clean = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : null);
  const storeName = mode.kind === "connected" || mode.kind === "first_sync" ? clean(mode.storeName) : null;
  return clean(user?.business_name) ?? storeName ?? clean(user?.email);
}

export function RecoveryShellView({ pathname, user, mode, credits, linksCount, onLogout, children }: RecoveryShellViewProps) {
  const { t } = useMerchantLanguage();
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => setMenuOpen(false), [pathname]);
  const closeMenu = () => setMenuOpen(false);
  return (
    <div className="rv-shell">
      <aside className="rv-sidebar" data-open={menuOpen ? "true" : "false"} aria-label={t("recovery.product")}>
        <div className="rv-account">
          <span className="rv-mark" aria-hidden="true" />
          <span style={{ display: "flex", flexDirection: "column", lineHeight: 1.25, minWidth: 0 }}>
            <span style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {accountName(user, mode) || t("recovery.shell.yourStore")}
            </span>
            <span className="rv-muted rv-tiny">{t("recovery.product")}</span>
          </span>
          <button
            type="button"
            className="rv-btn rv-sm rv-menu-toggle"
            aria-expanded={menuOpen}
            aria-controls="rv-sidebar-body"
            onClick={() => setMenuOpen((value) => !value)}
          >
            {menuOpen ? <X aria-hidden="true" size={14} /> : <Menu aria-hidden="true" size={14} />}
            {t("recovery.shell.menu")}
          </button>
          <span className="rv-phone-only">
            <AccountMenu user={user} onLogout={onLogout} />
          </span>
        </div>
        <div className="rv-sidebar-body" id="rv-sidebar-body">
          <nav aria-label={t("recovery.nav.main")} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {recoveryMainNav.map((item) => (
              <NavLink key={item.href} item={item} pathname={pathname} onNavigate={closeMenu} />
            ))}
          </nav>
          <div className="rv-nav-group" id="rv-nav-account">{t("recovery.nav.accountGroup")}</div>
          <nav aria-labelledby="rv-nav-account" style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {recoveryAccountNav.map((item) => (
              <NavLink key={item.href} item={item} pathname={pathname} onNavigate={closeMenu} />
            ))}
          </nav>
          <div style={{ flex: "1 1 24px" }} />
          <StoreStatusCard mode={mode} linksCount={linksCount} />
          <CreditsCard credits={credits} />
        </div>
      </aside>
      <div className="rv-main-col">
        <header className="rv-topbar rv-desktop-only">
          <div style={{ flex: 1 }} />
          <AccountMenu user={user} onLogout={onLogout} />
        </header>
        <main id="main" className={isRecoveryWidePage(pathname) ? "rv-content rv-wide rv-legacy" : "rv-content rv-legacy"}>
          {children}
        </main>
      </div>
    </div>
  );
}

function ConnectedShell(props: Omit<RecoveryShellViewProps, "mode" | "credits" | "linksCount">) {
  const { mode, credits, linksCount } = useRecovery();
  return <RecoveryShellView {...props} mode={mode} credits={credits} linksCount={linksCount} />;
}

export function RecoveryShell({ pathname, user, onLogout, children }: Omit<RecoveryShellViewProps, "mode" | "credits" | "linksCount">) {
  const merchantId = user?.merchant_id || (typeof window !== "undefined" ? localStorage.getItem("merchant_id") : null);
  return (
    <RecoveryProvider merchantId={merchantId}>
      <ConnectedShell pathname={pathname} user={user} onLogout={onLogout}>
        {children}
      </ConnectedShell>
    </RecoveryProvider>
  );
}
