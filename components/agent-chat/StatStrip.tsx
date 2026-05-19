/**
 * 3-column field-coverage strip used in Screen 04 (Trigger).
 *
 * v2.0: category-aware. Renders fashion fields (material/care/size_guide)
 * OR beauty fields (raw_inci/how_to_use_text/skin_concerns) based on the
 * category prop. Tints differ per category so the visual differentiation
 * is immediate.
 *
 * Each card: eyebrow label, big Cormorant missing-count number,
 * "/ total missing" muted, then a 3px tinted bar showing the missing fraction.
 */
import type { CategoryTab, FieldName } from "@/types/fashion-authoring";

const LABELS: Record<FieldName, string> = {
  material: "MATERIAL",
  care: "CARE",
  size_guide: "SIZE GUIDE",
  raw_inci: "INGREDIENTS",
  how_to_use_text: "HOW TO USE",
  skin_concerns: "SKIN CONCERNS",
  // v2.1 tools-shape
  tool_material: "MATERIAL",
  use_with: "USE WITH",
  care_instructions: "CARE",
};

const TINTS: Record<FieldName, { bg: string; bar: string }> = {
  // Fashion
  material: { bg: "var(--p-coral-bg)", bar: "var(--p-coral)" },
  care: { bg: "var(--p-tip-bg)", bar: "#c98a3a" },
  size_guide: { bg: "var(--p-teal-bg)", bar: "var(--p-teal)" },
  // Beauty — use the same semantic palette so the visual rhythm is
  // shared across categories; INCI is the most-asked field so it
  // takes coral (the highest-urgency tint).
  raw_inci: { bg: "var(--p-coral-bg)", bar: "var(--p-coral)" },
  how_to_use_text: { bg: "var(--p-tip-bg)", bar: "#c98a3a" },
  skin_concerns: { bg: "var(--p-teal-bg)", bar: "var(--p-teal)" },
  // v2.1 tools-shape — reuse the same palette
  tool_material: { bg: "var(--p-coral-bg)", bar: "var(--p-coral)" },
  use_with: { bg: "var(--p-tip-bg)", bar: "#c98a3a" },
  care_instructions: { bg: "var(--p-teal-bg)", bar: "var(--p-teal)" },
};

const FIELDS_BY_CATEGORY: Record<CategoryTab, FieldName[]> = {
  fashion: ["material", "care", "size_guide"],
  beauty_care: ["raw_inci", "how_to_use_text", "skin_concerns"],
  beauty_tools: ["tool_material", "use_with", "care_instructions"],
};

interface StatStripProps {
  /** populated count per field. */
  populated: Partial<Record<FieldName, number>>;
  /** total products in the active category. */
  total: number;
  /** Which tab's fields to render. */
  category: CategoryTab;
}

export function StatStrip({ populated, total, category }: StatStripProps) {
  const fields = FIELDS_BY_CATEGORY[category];
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr 1fr",
        gap: 10,
      }}
    >
      {fields.map((field) => {
        const pop = populated[field] ?? 0;
        const missing = Math.max(0, total - pop);
        const missingPct = total > 0 ? (missing / total) * 100 : 0;
        const tint = TINTS[field];
        return (
          <div
            key={field}
            style={{
              background: "var(--p-surface)",
              border: "0.5px solid var(--p-border)",
              borderRadius: 10,
              padding: "10px 12px",
            }}
          >
            <div className="p-eyebrow" style={{ marginBottom: 4 }}>
              {LABELS[field]}
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
              <span
                className="p-serif"
                style={{ fontSize: 20, color: "var(--p-neutral-900)" }}
              >
                {missing}
              </span>
              <span style={{ fontSize: 11, color: "var(--p-neutral-500)" }}>
                / {total} missing
              </span>
            </div>
            <div
              style={{
                marginTop: 8,
                height: 3,
                background: tint.bg,
                borderRadius: 999,
                overflow: "hidden",
              }}
              aria-hidden
            >
              <div
                style={{
                  height: "100%",
                  width: `${missingPct}%`,
                  background: tint.bar,
                  transition: "width 240ms var(--p-easing)",
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
