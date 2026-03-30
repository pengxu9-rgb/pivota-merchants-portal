"use client";

import { Languages } from "lucide-react";
import { cx } from "@/lib/cx";
import {
  PORTAL_LANGUAGE_OPTIONS,
  type MerchantPortalLanguage,
} from "@/lib/i18n/merchant-portal";
import { useMerchantLanguage } from "@/components/portal/merchant-language-provider";

type PortalLanguageSwitcherProps = {
  variant?: "compact" | "grid";
  value?: MerchantPortalLanguage;
  onChange?: (language: MerchantPortalLanguage) => void;
  disabled?: boolean;
};

export function PortalLanguageSwitcher({
  variant = "compact",
  value,
  onChange,
  disabled = false,
}: PortalLanguageSwitcherProps) {
  const { language, setLanguage, t } = useMerchantLanguage();
  const selectedLanguage = value || language;
  const handleChange = onChange || setLanguage;

  if (variant === "grid") {
    return (
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {PORTAL_LANGUAGE_OPTIONS.map((option) => {
          const isActive = selectedLanguage === option.value;

          return (
            <button
              key={option.value}
              type="button"
              disabled={disabled}
              onClick={() => handleChange(option.value)}
              className={cx(
                "rounded-[1rem] border px-4 py-3 text-left transition",
                isActive
                  ? "border-[color:var(--merchant-brand)] bg-[color:var(--merchant-brand-soft)]"
                  : "border-[color:var(--merchant-line)] bg-white/65 hover:border-[color:var(--merchant-line-strong)]",
                disabled && "cursor-not-allowed opacity-60",
              )}
            >
              <div className="text-sm font-semibold text-[color:var(--merchant-ink)]">
                {option.nativeLabel}
              </div>
              <div className="mt-1 text-xs text-[color:var(--merchant-muted)]">
                {option.label}
              </div>
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <label className="inline-flex items-center gap-2 rounded-full border border-[color:var(--merchant-line-strong)] bg-white/72 px-3 py-2 text-xs text-[color:var(--merchant-muted-strong)] shadow-[var(--merchant-shadow-panel)]">
      <Languages className="h-3.5 w-3.5 text-[color:var(--merchant-brand)]" />
      <span className="sr-only">{t("settings.languageCardTitle")}</span>
      <select
        value={selectedLanguage}
        onChange={(event) =>
          handleChange(event.target.value as MerchantPortalLanguage)
        }
        disabled={disabled}
        className="bg-transparent font-medium outline-none"
        aria-label={t("settings.languageCardTitle")}
      >
        {PORTAL_LANGUAGE_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.nativeLabel}
          </option>
        ))}
      </select>
    </label>
  );
}
