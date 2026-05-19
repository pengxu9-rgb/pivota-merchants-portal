/**
 * Compact product row used in the trigger sample list.
 * 36×44 thumbnail, title + SKU, missing-field pills on the right.
 *
 * v2.0: handles both fashion and beauty products via the
 * discriminated union. Field labels cover both categories.
 */
import type { FieldName, IncompleteProduct } from "@/types/fashion-authoring";

const FIELD_LABELS: Record<FieldName, string> = {
  material: "Material",
  care: "Care",
  size_guide: "Size guide",
  raw_inci: "Ingredients",
  how_to_use_text: "How to use",
  skin_concerns: "Concerns",
};

/** Enumerate missing field names across either union arm. The
 *  per-category `fields` objects have different keys but identical
 *  value shapes, so iterating Object.entries gives us the right list. */
function missingFields(product: IncompleteProduct): FieldName[] {
  const entries = Object.entries(product.fields) as Array<[FieldName, { status: string }]>;
  return entries.filter(([, state]) => state.status === "missing").map(([f]) => f);
}

export function ProductChip({ product }: { product: IncompleteProduct }) {
  const missing = missingFields(product);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "8px 10px",
        background: "var(--p-surface)",
        border: "0.5px solid var(--p-border)",
        borderRadius: 10,
      }}
    >
      <div
        style={{
          width: 36,
          height: 44,
          borderRadius: 6,
          background: product.image_url
            ? `url(${product.image_url}) center/cover`
            : "linear-gradient(135deg, #efe7dc, #f4f4f2)",
          flex: "0 0 36px",
        }}
        aria-hidden
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 12.5,
            fontWeight: 500,
            color: "var(--p-neutral-900)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {product.title}
        </div>
        <div
          style={{
            fontSize: 10.5,
            color: "var(--p-neutral-500)",
            marginTop: 2,
          }}
          className="p-mono"
        >
          {product.sku || product.platform_product_id}
        </div>
      </div>
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
        {missing.map((f) => (
          <span key={f} className="p-pill p-pill--coral">
            {FIELD_LABELS[f]}
          </span>
        ))}
      </div>
    </div>
  );
}
