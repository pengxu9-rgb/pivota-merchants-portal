"use client";

import { ExternalLink, X } from "lucide-react";
import { useMerchantLanguage } from "@/components/portal/merchant-language-provider";
import {
  getIntegrationGuide,
  getIntegrationGuideUiText,
  type IntegrationGuideKey,
} from "@/lib/integration-guides";

function GuideList({ items, ordered = false }: { items: string[]; ordered?: boolean }) {
  const ListTag = ordered ? "ol" : "ul";

  return (
    <ListTag className={ordered ? "space-y-2 pl-5 text-sm" : "space-y-2 pl-5 text-sm"}>
      {items.map((item) => (
        <li key={item} className={ordered ? "list-decimal text-[color:var(--merchant-muted-strong)]" : "list-disc text-[color:var(--merchant-muted-strong)]"}>
          {item}
        </li>
      ))}
    </ListTag>
  );
}

export function IntegrationGuideDialog({
  guideKey,
  onClose,
  shopifyOAuthEnabled = false,
}: {
  guideKey: IntegrationGuideKey | null;
  onClose: () => void;
  shopifyOAuthEnabled?: boolean;
}) {
  const { language } = useMerchantLanguage();

  if (!guideKey) return null;

  const guide = getIntegrationGuide(language, guideKey);
  const uiText = getIntegrationGuideUiText(language);
  const optionalNotes =
    guideKey === "shopify" && !shopifyOAuthEnabled ? [] : guide.optionalNotes || [];

  const sections = [
    { title: uiText.sections.requiredFields, items: guide.requiredFields },
    { title: uiText.sections.fieldMappings, items: guide.fieldMappings },
    { title: uiText.sections.prerequisites, items: guide.prerequisites },
    { title: uiText.sections.steps, items: guide.steps, ordered: true },
    { title: uiText.sections.pitfalls, items: guide.pitfalls },
    { title: uiText.sections.validationNotes, items: guide.validationNotes },
    { title: uiText.sections.optionalNotes, items: optionalNotes },
  ].filter((section) => section.items.length > 0);

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-3 sm:p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="integration-guide-title"
        className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-[1.1rem] border border-[color:var(--merchant-line)] bg-white shadow-[var(--merchant-shadow-panel)]"
      >
        <div className="flex items-start justify-between gap-4 border-b border-[color:var(--merchant-line)] px-5 py-4">
          <div className="min-w-0 space-y-1">
            <div className="merchant-overline">{guide.name}</div>
            <h2 id="integration-guide-title" className="text-lg font-semibold text-[color:var(--merchant-ink)]">
              {guide.title}
            </h2>
            <p className="text-sm text-[color:var(--merchant-muted-strong)]">
              {guide.summary}
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

        <div className="overflow-y-auto px-5 py-4">
          <div className="grid gap-4 md:grid-cols-2">
            {sections.map((section) => (
              <section
                key={section.title}
                className="rounded-[0.9rem] border border-[color:var(--merchant-line)] bg-white/80 px-4 py-3"
              >
                <h3 className="mb-2 text-sm font-semibold text-[color:var(--merchant-ink)]">
                  {section.title}
                </h3>
                <GuideList items={section.items} ordered={section.ordered} />
              </section>
            ))}
          </div>

          {guide.officialLinks.length ? (
            <section className="mt-4 rounded-[0.9rem] border border-[color:var(--merchant-line)] bg-[color:var(--merchant-surface-muted)] px-4 py-3">
              <h3 className="mb-2 text-sm font-semibold text-[color:var(--merchant-ink)]">
                {uiText.sections.officialLinks}
              </h3>
              <div className="flex flex-wrap gap-2">
                {guide.officialLinks.map((link) => (
                  <a
                    key={link.href}
                    href={link.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 rounded-full border border-[color:var(--merchant-line)] bg-white px-3 py-1.5 text-sm font-medium text-[color:var(--merchant-muted-strong)] transition hover:text-[color:var(--merchant-brand)]"
                  >
                    <span>{link.label}</span>
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                ))}
              </div>
            </section>
          ) : null}
        </div>

        <div className="border-t border-[color:var(--merchant-line)] px-5 py-3 text-right">
          <button
            type="button"
            onClick={onClose}
            className="merchant-button-secondary px-4 py-2 text-sm"
          >
            {uiText.close}
          </button>
        </div>
      </div>
    </div>
  );
}

