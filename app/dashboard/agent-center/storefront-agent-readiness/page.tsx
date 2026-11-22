'use client';

import { StorefrontCheckPanels } from '@/components/audit/StorefrontCheckPanels';
import { PageHeader } from '@/components/ui/merchant-primitives';

export default function StorefrontAgentReadinessPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Recover sales lost in the buying path"
        title="Storefront Revenue Recovery"
        description="Test where an agent-driven sale breaks across store search, product detail, cart, shipping address, and checkout. The check uses synthetic details and stops before payment or order submission."
      />

      <StorefrontCheckPanels />
    </div>
  );
}
