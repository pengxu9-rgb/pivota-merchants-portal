/**
 * Compact product row used in the trigger sample list.
 * 36×44 thumbnail, title + SKU, missing-field pills on the right.
 */
import type { FieldName, IncompleteProduct } from "@/types/fashion-authoring";

const FIELD_LABELS: Record<FieldName, string> = {
  material: "Material",
  care: "Care",
  size_guide: "Size guide",
};

export function ProductChip({ product }: { product: IncompleteProduct }) {
  const missingFields = (Object.entries(product.fields) as [FieldName, IncompleteProduct["fields"][FieldName]][])
    .filter(([, state]) => state.status === "missing")
    .map(([field]) => field);

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
      <div style={{ display: "flex", gap: 4 }}>
        {missingFields.map((f) => (
          <span key={f} className="p-pill p-pill--coral">
            {FIELD_LABELS[f]}
          </span>
        ))}
      </div>
    </div>
  );
}
