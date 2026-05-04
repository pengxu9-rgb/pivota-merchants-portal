import Link from "next/link";
import { publicProductEntityIndexEntries } from "@/lib/agent-center/public-indexability";

export const metadata = {
  title: "Pivota Public Product Index",
  description:
    "Public index of canonical Pivota ProductEntity pages for search and agent discovery.",
  robots: {
    index: true,
    follow: true,
  },
};

export default function ProductIndexabilityPage() {
  const products = publicProductEntityIndexEntries();

  return (
    <main className="min-h-screen bg-white px-6 py-10 text-slate-950">
      <div className="mx-auto max-w-4xl">
        <header className="border-b border-slate-200 pb-6">
          <p className="text-sm font-medium uppercase tracking-[0.08em] text-slate-500">
            Pivota ProductEntity Index
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-normal">
            Public Pivota Product Pages
          </h1>
          <p className="mt-3 max-w-2xl text-base leading-7 text-slate-600">
            Canonical ProductEntity pages that expose Pivota agent-facing PDPs,
            verified merchant source references, and merchant offer readiness
            signals. External seed aliases are not listed as canonical URLs.
          </p>
        </header>

        <section className="divide-y divide-slate-200">
          {products.map((product) => (
            <article
              key={product.canonical_url}
              className="grid gap-2 py-5 sm:grid-cols-[1fr_auto]"
            >
              <div>
                <h2 className="text-lg font-semibold tracking-normal">
                  <Link href={product.canonical_url}>
                    {product.canonical_product_name}
                  </Link>
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  {[product.brand, product.category].filter(Boolean).join(" · ")}
                </p>
                <p className="mt-1 font-mono text-xs text-slate-500">
                  {product.product_entity_id}
                </p>
              </div>
              <Link
                href={product.canonical_url}
                className="self-center text-sm font-medium text-slate-900 underline"
              >
                Open canonical PDP
              </Link>
            </article>
          ))}
        </section>
      </div>
    </main>
  );
}

