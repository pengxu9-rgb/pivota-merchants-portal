import type { ReactNode } from "react";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ChevronRight } from "lucide-react";
import { cx } from "@/lib/cx";

type ButtonVariant = "primary" | "secondary" | "ghost";
type Tone = "brand" | "success" | "warning" | "critical" | "neutral";

export function buttonClassName(variant: ButtonVariant = "primary") {
  if (variant === "secondary") {
    return "merchant-button-secondary";
  }

  if (variant === "ghost") {
    return "merchant-button-ghost";
  }

  return "merchant-button-primary";
}

export function MerchantButton({
  children,
  className,
  variant = "primary",
  icon: Icon,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  icon?: LucideIcon;
}) {
  return (
    <button className={cx(buttonClassName(variant), className)} {...props}>
      {Icon ? <Icon className="h-4 w-4" /> : null}
      <span>{children}</span>
    </button>
  );
}

export function MerchantLinkButton({
  children,
  href,
  className,
  variant = "primary",
  icon: Icon,
}: {
  children: ReactNode;
  href: string;
  className?: string;
  variant?: ButtonVariant;
  icon?: LucideIcon;
}) {
  return (
    <Link href={href} className={cx(buttonClassName(variant), className)}>
      {Icon ? <Icon className="h-4 w-4" /> : null}
      <span>{children}</span>
    </Link>
  );
}

export function StatusBadge({
  children,
  className,
  tone = "neutral",
  icon: Icon,
}: {
  children: ReactNode;
  className?: string;
  tone?: Tone;
  icon?: LucideIcon;
}) {
  return (
    <span className={cx("merchant-status-badge", `merchant-status-${tone}`, className)}>
      {Icon ? <Icon className="h-3.5 w-3.5" /> : null}
      <span>{children}</span>
    </span>
  );
}

export function SectionHeader({
  title,
  description,
  action,
  className,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx("flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div className="space-y-1">
        <h2 className="merchant-section-title">{title}</h2>
        {description ? <p className="merchant-text-muted max-w-2xl">{description}</p> : null}
      </div>
      {action ? <div className="flex items-center gap-3">{action}</div> : null}
    </div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx("flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between", className)}>
      <div className="max-w-3xl space-y-3">
        {eyebrow ? <div className="merchant-overline">{eyebrow}</div> : null}
        <div className="space-y-2">
          <h1 className="merchant-page-title">{title}</h1>
          {description ? <p className="merchant-text-muted text-base sm:text-lg">{description}</p> : null}
        </div>
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-3">{actions}</div> : null}
    </div>
  );
}

export function SurfaceCard({
  children,
  className,
  eyebrow,
  title,
  description,
  action,
  strong = false,
}: {
  children?: ReactNode;
  className?: string;
  eyebrow?: string;
  title?: string;
  description?: string;
  action?: ReactNode;
  strong?: boolean;
}) {
  return (
    <section className={cx("merchant-panel", strong && "merchant-panel-strong", className)}>
      {title || eyebrow || description || action ? (
        <div className="flex flex-col gap-4 border-b border-[color:var(--merchant-line)] px-6 py-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            {eyebrow ? <div className="merchant-overline">{eyebrow}</div> : null}
            {title ? <h3 className="merchant-card-title">{title}</h3> : null}
            {description ? <p className="merchant-text-muted">{description}</p> : null}
          </div>
          {action ? <div className="flex items-center gap-2">{action}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon?: LucideIcon;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 px-6 py-16 text-center">
      {Icon ? (
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[color:var(--merchant-surface-muted)] text-[color:var(--merchant-muted)]">
          <Icon className="h-6 w-6" />
        </div>
      ) : null}
      <div className="space-y-2">
        <h3 className="merchant-card-title">{title}</h3>
        <p className="merchant-text-muted max-w-md">{description}</p>
      </div>
      {action ? <div className="pt-1">{action}</div> : null}
    </div>
  );
}

export function InlineLink({
  href,
  children,
  className,
}: {
  href: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cx(
        "inline-flex items-center gap-1 text-sm font-medium text-[color:var(--merchant-brand)] transition hover:text-[color:var(--merchant-brand-strong)]",
        className
      )}
    >
      <span>{children}</span>
      <ChevronRight className="h-4 w-4" />
    </Link>
  );
}
