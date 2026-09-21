'use client';

import { StoreReadinessPanel } from '@/components/audit/StoreReadinessPanel';
import { PageHeader } from '@/components/ui/merchant-primitives';

export default function StorefrontAgentReadinessPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Storefront operations · no catalog sync"
        title="Storefront Agent Readiness"
        description="Check whether a shopping agent can find a product on your storefront, open the correct product page, add it to the cart, enter a synthetic shipping address, and reach checkout. The check stops before payment or order submission."
      />

      <StoreReadinessPanel />
    </div>
  );
}
