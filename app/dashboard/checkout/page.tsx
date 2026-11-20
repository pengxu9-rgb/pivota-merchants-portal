import { notFound } from "next/navigation";
import { FEATURE_FLAGS } from "@/lib/config";
import StorefrontAgentReadinessPage from "../agent-center/storefront-agent-readiness/page";
import { RecoveryCheckoutNote } from "@/components/recovery-v2/RecoveryPages";

// AI Revenue Recovery v2 "Checkout": the existing storefront check, re-skinned
// by the v2 shell (no board). Flag off: rewritten to a 404 in next.config.mjs.
export default function CheckoutPage() {
  if (!FEATURE_FLAGS.RECOVERY_V2) notFound();
  return (
    <>
      <RecoveryCheckoutNote />
      <StorefrontAgentReadinessPage />
    </>
  );
}
