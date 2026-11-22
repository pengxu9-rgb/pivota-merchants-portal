import { notFound } from "next/navigation";
import { FEATURE_FLAGS } from "@/lib/config";
import { StoreConnectionsPage } from "@/components/recovery-v2/StoreConnections";

// Settings → Store connections (v2): the stores, sync, primary and disconnect, without the legacy
// Integrations page's payment processors and API credentials. Flag off: 404.
export default function StoreConnectionsRoute() {
  if (!FEATURE_FLAGS.RECOVERY_V2) notFound();
  return <StoreConnectionsPage />;
}
