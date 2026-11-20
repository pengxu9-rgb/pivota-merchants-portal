"use client";

// The re-skin of pages without a board (legacy --merchant-* tokens → quiet
// ledger, flattened legacy primitives), for pages outside the v2 shell: the
// auth shell renders this via a client-side next/dynamic import behind the
// flag, so /login and /signup get it with the flag on and no flag-off page
// links it. (A dynamic import from the server root layout would put this CSS
// into the global stylesheet even when it never renders.)
import "../../styles/recovery-v2-legacy.css";

export function RecoveryLegacyStyles() {
  return null;
}
