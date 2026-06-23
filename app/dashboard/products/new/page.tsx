'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiClient } from '@/lib/api-client';

export default function NewBrandProductPage() {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [brand, setBrand] = useState('');
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [price, setPrice] = useState('');
  const [currency, setCurrency] = useState('');
  const [summaryShort, setSummaryShort] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = title.trim().length > 0 && !saving;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSaving(true);
    setError(null);
    try {
      const priceValue = price.trim() ? Number(price) : undefined;
      await apiClient.createMerchantProduct({
        title: title.trim(),
        brand: brand.trim() || undefined,
        category: category.trim() || undefined,
        description: description.trim() || undefined,
        image_url: imageUrl.trim() || undefined,
        price:
          typeof priceValue === 'number' && !Number.isNaN(priceValue)
            ? priceValue
            : undefined,
        currency: currency.trim() || undefined,
        summary_short: summaryShort.trim() || undefined,
      });
      // Land back on the catalog; the new product flows through the readiness
      // pipeline (un-served until it graduates/claims).
      router.push('/dashboard/products');
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      const message = Array.isArray(detail)
        ? detail[0]?.msg || 'Invalid input'
        : typeof detail === 'string'
          ? detail
          : err?.message || 'Could not create the product. Please try again.';
      setError(message);
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6 py-2">
      <div>
        <button
          type="button"
          onClick={() => router.push('/dashboard/products')}
          className="text-xs font-medium text-slate-500 hover:text-slate-800"
        >
          ← Back to catalog
        </button>
        <h1 className="mt-2 text-2xl font-bold text-gray-900">Add a product</h1>
        <p className="mt-1 max-w-prose text-sm text-slate-600">
          Add a product directly — no store connection required. It enters your
          catalog so you can enrich its content and add evidence; it stays
          private to agents until it&rsquo;s reviewed.
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="space-y-4 rounded-xl border bg-white p-5 shadow-sm"
      >
        <div>
          <label className="block text-sm font-medium text-slate-800">
            Product title <span className="text-rose-600">*</span>
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            placeholder="e.g. Hydrating Vitamin C Serum 30ml"
            className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-slate-800">Brand</label>
            <input
              type="text"
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
              className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-800">Category</label>
            <input
              type="text"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="e.g. Skincare / Serum"
              className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-800">
            Short summary
          </label>
          <input
            type="text"
            value={summaryShort}
            onChange={(e) => setSummaryShort(e.target.value)}
            placeholder="One line agents can quote"
            className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-800">
            Description
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={5}
            className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-800">
            Main image URL
          </label>
          <input
            type="url"
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
            placeholder="https://…"
            className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-slate-800">
              Price <span className="text-slate-400">(optional)</span>
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-800">
              Currency <span className="text-slate-400">(optional)</span>
            </label>
            <input
              type="text"
              value={currency}
              onChange={(e) => setCurrency(e.target.value.toUpperCase())}
              placeholder="USD"
              maxLength={3}
              className="mt-1 w-full rounded-md border px-3 py-2 text-sm uppercase"
            />
          </div>
        </div>

        {error && (
          <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800 ring-1 ring-rose-200">
            {error}
          </div>
        )}

        <div className="flex items-center justify-end gap-2 border-t pt-4">
          <button
            type="button"
            onClick={() => router.push('/dashboard/products')}
            className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!canSubmit}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? 'Adding…' : 'Add product'}
          </button>
        </div>
      </form>
    </div>
  );
}
