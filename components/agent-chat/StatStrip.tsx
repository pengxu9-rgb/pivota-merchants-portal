/**
 * 3-column field-coverage strip used in Screen 04 (Trigger).
 *
 * Each card: eyebrow label (MATERIAL / CARE / SIZE GUIDE), big Cormorant
 * number, "/ total" muted, then a 3px tinted bar showing the fraction
 * populated. Tinted with the brand semantics (coral / tip / teal).
 */
import type { FieldName } from "@/types/fashion-authoring";

const LABELS: Record<FieldName, string> = {
  material: "MATERIAL",
  care: "CARE",
  size_guide: "SIZE GUIDE",
};

const TINTS: Record<FieldName, { bg: string; bar: string }> = {
  material: { bg: "var(--p-coral-bg)", bar: "var(--p-coral)" },
  care: { bg: "var(--p-tip-bg)", bar: "#c98a3a" },
  size_guide: { bg: "var(--p-teal-bg)", bar: "var(--p-teal)" },
};

interface StatStripProps {
  /** populated count per field. */
  populated: Record<FieldName, number>;
  /** total fashion products. */
  total: number;
}

export function StatStrip({ populated, total }: StatStripProps) {
  const fields: FieldName[] = ["material", "care", "size_guide"];
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
            <div
              className="p-eyebrow"
              style={{ marginBottom: 4 }}
            >
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
