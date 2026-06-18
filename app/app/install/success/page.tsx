import Link from 'next/link';
import { ArrowRight, CheckCircle2, ExternalLink, Store } from 'lucide-react';

type SearchParams = Record<string, string | string[] | undefined>;

const firstParam = (value: string | string[] | undefined) => {
  if (Array.isArray(value)) return value[0] || '';
  return value || '';
};

export default async function MarketplaceInstallSuccessPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const platform =
    (firstParam(params.platform) || firstParam(params.installed)).toLowerCase() || 'store';
  const platformLabel =
    platform === 'shopify' ? 'Shopify' : platform === 'wix' ? 'Wix' : 'Store';
  const storeLabel =
    firstParam(params.shop) ||
    firstParam(params.site_id) ||
    firstParam(params.instance_id) ||
    'Connected store';
  const merchantId = firstParam(params.merchant_id);
  const storeId = firstParam(params.store_id);

  const loginQuery = new URLSearchParams();
  loginQuery.set('from', 'marketplace-install');
  if (platform) loginQuery.set('platform', platform);

  const signupQuery = new URLSearchParams(loginQuery);
  if (merchantId) signupQuery.set('merchant_id', merchantId);

  const detailRows = [
    ['Platform', platformLabel],
    ['Store', storeLabel],
    merchantId ? ['Merchant ID', merchantId] : null,
    storeId ? ['Store ID', storeId] : null,
  ].filter((row): row is [string, string] => Boolean(row));

  return (
    <main className="min-h-screen bg-[#f7f8fb] text-[color:var(--merchant-ink)]">
      <section className="mx-auto flex min-h-screen w-full max-w-5xl flex-col justify-center px-6 py-12">
        <div className="mb-6 inline-flex w-fit items-center gap-2 rounded-lg border border-[color:var(--merchant-line)] bg-white px-3 py-2 text-sm font-medium text-[color:var(--merchant-muted-strong)]">
          <Store className="h-4 w-4" />
          <span>Pivota Merchant Portal</span>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr] lg:items-start">
          <div className="rounded-lg border border-[color:var(--merchant-line)] bg-white p-6 shadow-sm">
            <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-lg bg-[color:var(--merchant-success-soft)] text-[color:var(--merchant-success)]">
              <CheckCircle2 className="h-7 w-7" />
            </div>
            <p className="merchant-overline">Install complete</p>
            <h1 className="mt-3 text-3xl font-semibold tracking-normal text-[color:var(--merchant-ink)]">
              Pivota is connected to {platformLabel}
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-[color:var(--merchant-muted-strong)]">
              The authorization succeeded and the store connection has been saved.
              Continue to the merchant portal to manage catalog, orders, and channel settings.
            </p>

            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href={`/login?${loginQuery.toString()}`}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-[color:var(--merchant-brand)] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[color:var(--merchant-brand-strong)]"
              >
                <span>Sign in</span>
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href={`/signup?${signupQuery.toString()}`}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-[color:var(--merchant-line-strong)] bg-white px-4 py-2.5 text-sm font-semibold text-[color:var(--merchant-ink)] transition hover:border-[color:var(--merchant-brand)] hover:text-[color:var(--merchant-brand)]"
              >
                <span>Create merchant access</span>
                <ExternalLink className="h-4 w-4" />
              </Link>
            </div>
          </div>

          <div className="rounded-lg border border-[color:var(--merchant-line)] bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-[color:var(--merchant-ink)]">
                Connection details
              </h2>
              <span className="rounded-lg bg-[color:var(--merchant-success-soft)] px-2.5 py-1 text-xs font-medium text-[color:var(--merchant-success)]">
                Active
              </span>
            </div>
            <dl className="divide-y divide-[color:var(--merchant-line)]">
              {detailRows.map(([label, value]) => (
                <div key={label} className="grid grid-cols-[110px_1fr] gap-3 py-3 text-sm">
                  <dt className="text-[color:var(--merchant-muted)]">{label}</dt>
                  <dd className="break-words font-medium text-[color:var(--merchant-ink)]">
                    {value}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </section>
    </main>
  );
}
