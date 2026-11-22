'use client';

import { StoreReadinessPanel } from '@/components/audit/StoreReadinessPanel';
import { FunnelChecksPanel } from '@/components/audit/FunnelChecksPanel';

/** The storefront check's panels, shared by the legacy page and v2 Checkout (which adds its own header). */
export function StorefrontCheckPanels() {
  return (
    <>
      <FunnelChecksPanel nextStep="storefront" />
      <StoreReadinessPanel />
    </>
  );
}
