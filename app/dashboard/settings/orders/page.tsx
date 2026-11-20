import { notFound } from "next/navigation";
import { FEATURE_FLAGS } from "@/lib/config";
import OrdersPage from "../../orders/page";
import { RecoveryOrdersHeader } from "@/components/recovery-v2/RecoveryPages";

// "Past orders & refunds" under Settings (build decision 4): the existing
// orders page and its refund dialog, out of the main nav. Flag off: 404.
export default function PastOrdersPage() {
  if (!FEATURE_FLAGS.RECOVERY_V2) notFound();
  return (
    <>
      <RecoveryOrdersHeader />
      <OrdersPage />
    </>
  );
}
