import { notFound } from "next/navigation";
import { FEATURE_FLAGS } from "@/lib/config";
import { StorefrontCheckPanels } from "@/components/audit/StorefrontCheckPanels";
import { RecoveryCheckoutHeader } from "@/components/recovery-v2/RecoveryPages";

// AI Revenue Recovery v2 "Checkout": the existing storefront check under a v2 header that names it
// and keeps it apart from Convert (the agent checkout test, held for domain verification). The
// legacy page's "Storefront Revenue Recovery" header is not shown here. Flag off: rewritten to a 404.
export default function CheckoutPage() {
  if (!FEATURE_FLAGS.RECOVERY_V2) notFound();
  return (
    <div className="space-y-6">
      <RecoveryCheckoutHeader />
      <StorefrontCheckPanels />
    </div>
  );
}
