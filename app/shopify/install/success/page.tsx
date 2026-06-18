import { redirect } from 'next/navigation';

type SearchParams = Record<string, string | string[] | undefined>;

const firstParam = (value: string | string[] | undefined) => {
  if (Array.isArray(value)) return value[0] || '';
  return value || '';
};

export default async function ShopifyInstallSuccessRedirect({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const query = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    const firstValue = firstParam(value);
    if (firstValue) query.set(key, firstValue);
  }

  query.set('platform', 'shopify');
  redirect(`/app/install/success?${query.toString()}`);
}
