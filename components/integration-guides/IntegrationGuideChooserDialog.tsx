"use client";

import { CreditCard, Store, X } from "lucide-react";
import { useMerchantLanguage } from "@/components/portal/merchant-language-provider";
import {
  getIntegrationGuide,
  getIntegrationGuideUiText,
  PAYMENT_SETUP_GUIDE_KEYS,
  SALES_CHANNEL_GUIDE_KEYS,
  type IntegrationGuideCategory,
  type IntegrationGuideKey,
} from "@/lib/integration-guides";

export function IntegrationGuideChooserDialog({
  category,
  onClose,
  onSelect,
}: {
  category: IntegrationGuideCategory | null;
  onClose: () => void;
  onSelect: (guideKey: IntegrationGuideKey) => void;
}) {
  const { language } = useMerchantLanguage();

  if (!category) return null;

  const uiText = getIntegrationGuideUiText(language);
  const guideKeys =
    category === "sales_channels" ? SALES_CHANNEL_GUIDE_KEYS : PAYMENT_SETUP_GUIDE_KEYS;
  const Icon = category === "sales_channels" ? Store : CreditCard;

  return (
    <div className="fixed inset-0 z-[65] flex items-center justify-center bg-black/50 p-3 sm:p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="integration-guide-chooser-title"
        className="max-h-[88vh] w-full max-w-xl overflow-hidden rounded-[1.1rem] border border-[color:var(--merchant-line)] bg-white shadow-[var(--merchant-shadow-panel)]"
      >
        <div className="flex items-start justify-between gap-4 border-b border-[color:var(--merchant-line)] px-5 py-4">
          <div className="min-w-0 space-y-1">
            <div className="flex items-center gap-2 text-[color:var(--merchant-brand)]">
              <Icon className="h-4 w-4" />
              <span className="merchant-overline">{uiText.viewGuide}</span>
            </div>
            <h2 id="integration-guide-chooser-title" className="text-lg font-semibold text-[color:var(--merchant-ink)]">
              {uiText.chooserTitle[category]}
            </h2>
            <p className="text-sm text-[color:var(--merchant-muted-strong)]">
              {uiText.chooserDescription[category]}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={uiText.close}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[color:var(--merchant-line)] text-[color:var(--merchant-muted)] transition hover:bg-[color:var(--merchant-surface-muted)] hover:text-[color:var(--merchant-ink)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[62vh] overflow-y-auto p-5">
          <div className="grid gap-3">
            {guideKeys.map((guideKey) => {
              const guide = getIntegrationGuide(language, guideKey);

              return (
                <button
                  type="button"
                  key={guideKey}
                  onClick={() => onSelect(guideKey)}
                  className="rounded-[0.9rem] border border-[color:var(--merchant-line)] bg-white px-4 py-3 text-left transition hover:border-[color:var(--merchant-brand)] hover:bg-[color:var(--merchant-surface-muted)]"
                >
                  <div className="text-sm font-semibold text-[color:var(--merchant-ink)]">
                    {guide.name}
                  </div>
                  <div className="mt-1 line-clamp-2 text-sm text-[color:var(--merchant-muted-strong)]">
                    {guide.summary}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

