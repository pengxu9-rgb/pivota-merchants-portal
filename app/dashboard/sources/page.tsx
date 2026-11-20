import { notFound } from "next/navigation";
import { FEATURE_FLAGS } from "@/lib/config";
import { RecoverySources } from "@/components/recovery-v2/RecoverySources";

// AI Revenue Recovery v2 only. With the flag off, next.config.mjs rewrites this
// URL to a missing path (a real 404, as before v2); notFound() is a backstop.
export default function SourcesPage() {
  if (!FEATURE_FLAGS.RECOVERY_V2) notFound();
  return <RecoverySources />;
}
