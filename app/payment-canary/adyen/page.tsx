"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AdyenCheckout, Card, Dropin } from "@adyen/adyen-web";
import { apiClient } from "@/lib/api-client";

const ADYEN_SDK_VERSION = "6.32.0";
const ADYEN_CSS_URL = `https://checkoutshopper-test.cdn.adyen.com/checkoutshopper/sdk/${ADYEN_SDK_VERSION}/adyen.css`;

type CanaryPaymentAction = {
  type?: string;
  client_secret?: string;
  session_data?: string;
  client_key?: string;
  raw?: {
    id?: string;
    environment?: string;
    [key: string]: unknown;
  };
};

type CanaryResponse = {
  success?: boolean;
  order_id?: string;
  payment_id?: string;
  psp_used?: string;
  status?: string;
  error_message?: string | null;
  payment_action?: CanaryPaymentAction | null;
};

type ResultState =
  | { kind: "idle" }
  | { kind: "creating" }
  | { kind: "ready"; payload: CanaryResponse }
  | { kind: "completed"; payload: unknown }
  | { kind: "failed"; payload: unknown }
  | { kind: "error"; message: string };

export default function AdyenPaymentCanaryPage() {
  const router = useRouter();
  const dropinContainerRef = useRef<HTMLDivElement | null>(null);
  const dropinRef = useRef<any>(null);
  const autoStartedRef = useRef(false);

  const [resultState, setResultState] = useState<ResultState>({ kind: "idle" });
  const [customerEmail, setCustomerEmail] = useState("peng@chydan.com");
  const [customerName, setCustomerName] = useState("Pivota Ops Adyen Test Canary");
  const [autostart, setAutostart] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    setAutostart(params.get("autostart") === "1");
  }, []);

  useEffect(() => {
    const token = localStorage.getItem("merchant_token");
    if (!token) {
      router.replace("/login");
      return;
    }

    try {
      const rawUser = localStorage.getItem("merchant_user");
      if (!rawUser) return;
      const parsed = JSON.parse(rawUser);
      const email = String(parsed?.email || "").trim();
      const name = String(parsed?.business_name || parsed?.full_name || "").trim();
      if (email) setCustomerEmail(email);
      if (name) setCustomerName(name);
    } catch {
      // Ignore stored-user parsing errors and keep defaults.
    }
  }, [router]);

  useEffect(() => {
    const existing = document.querySelector(`link[data-adyen-canary-css="${ADYEN_SDK_VERSION}"]`);
    if (existing) return;

    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = ADYEN_CSS_URL;
    link.setAttribute("data-adyen-canary-css", ADYEN_SDK_VERSION);
    document.head.appendChild(link);

    return () => {
      if (link.parentNode) {
        link.parentNode.removeChild(link);
      }
    };
  }, []);

  useEffect(() => {
    return () => {
      try {
        dropinRef.current?.unmount?.();
      } catch {
        // Best effort only.
      }
      dropinRef.current = null;
    };
  }, []);

  const orderLabel = useMemo(() => {
    return `adyen_test_canary_${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}`;
  }, []);

  const mountAdyenDropin = async (payload: CanaryResponse) => {
    const paymentAction = payload.payment_action || {};
    const raw = paymentAction.raw || {};
    const sessionId = String(raw.id || "").trim();
    const sessionData = String(paymentAction.session_data || paymentAction.client_secret || "").trim();
    const clientKey = String(paymentAction.client_key || "").trim();
    const environment = String(raw.environment || "test").trim().toLowerCase() || "test";

    if (paymentAction.type !== "adyen_session") {
      throw new Error(`Unexpected payment_action.type: ${String(paymentAction.type || "unknown")}`);
    }
    if (!sessionId || !sessionData || !clientKey) {
      throw new Error("Adyen test canary did not return a complete session payload");
    }
    if (!dropinContainerRef.current) {
      throw new Error("Drop-in container is not mounted");
    }

    try {
      dropinRef.current?.unmount?.();
    } catch {
      // Best effort only.
    }
    dropinRef.current = null;
    dropinContainerRef.current.innerHTML = "";

    const checkout = await AdyenCheckout({
      environment,
      clientKey,
      countryCode: "US",
      locale: "en-US",
      session: {
        id: sessionId,
        sessionData,
      },
      onPaymentCompleted: (completedResult: unknown) => {
        setResultState({ kind: "completed", payload: completedResult });
      },
      onPaymentFailed: (failedResult: unknown) => {
        setResultState({ kind: "failed", payload: failedResult });
      },
      onError: (error: unknown) => {
        const message =
          error instanceof Error ? error.message : `Adyen checkout error: ${String(error || "unknown")}`;
        setResultState({ kind: "error", message });
      },
    } as any);

    const dropin = new Dropin(checkout as any, {
      paymentMethodComponents: [Card],
      paymentMethodsConfiguration: {
        card: {
          hasHolderName: true,
          holderNameRequired: true,
        },
      },
    } as any);

    dropin.mount(dropinContainerRef.current);
    dropinRef.current = dropin;
    setResultState({ kind: "ready", payload });
  };

  const startCanary = async () => {
    setResultState({ kind: "creating" });
    try {
      const response = await apiClient.post("/merchant/payment-canary/order-backed", {
        amount: 100,
        currency: "USD",
        customer_email: customerEmail,
        customer_name: customerName,
        description: "merchant_order_backed_adyen_test_canary",
        metadata: {
          ops_canary: true,
          label: orderLabel,
        },
        emit_merchant_webhook: false,
        enforce_live_readiness: false,
        label: orderLabel,
        preferred_provider: "adyen",
      });
      const payload = ((response as { data?: CanaryResponse } | undefined)?.data || response) as CanaryResponse;

      await mountAdyenDropin(payload);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : `Failed to start Adyen test canary: ${String(error || "unknown")}`;
      setResultState({ kind: "error", message });
    }
  };

  useEffect(() => {
    if (!autostart || autoStartedRef.current) return;
    autoStartedRef.current = true;
    void startCanary();
  }, [autostart]);

  const canaryPayload =
    resultState.kind === "ready" || resultState.kind === "completed" || resultState.kind === "failed"
      ? resultState.payload
      : null;

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-10 text-slate-100">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="space-y-3">
          <p className="text-xs uppercase tracking-[0.3em] text-cyan-300">Hidden Ops Flow</p>
          <h1 className="text-4xl font-semibold tracking-tight">Adyen Test Canary</h1>
          <p className="max-w-3xl text-sm leading-6 text-slate-300">
            This page creates a real order-backed Adyen test session on <code>merchant.pivota.cc</code> and mounts
            Adyen Drop-in on the same origin. Use it to complete the full test-payment, webhook, and refund workflow
            before requesting live access.
          </p>
        </div>

        <section className="grid gap-4 rounded-3xl border border-slate-800 bg-slate-900/70 p-6 shadow-2xl lg:grid-cols-[1.15fr_0.85fr]">
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-2 text-sm">
                <span className="text-slate-300">Customer email</span>
                <input
                  className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm outline-none transition focus:border-cyan-400"
                  value={customerEmail}
                  onChange={(event) => setCustomerEmail(event.target.value)}
                />
              </label>
              <label className="space-y-2 text-sm">
                <span className="text-slate-300">Customer name</span>
                <input
                  className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm outline-none transition focus:border-cyan-400"
                  value={customerName}
                  onChange={(event) => setCustomerName(event.target.value)}
                />
              </label>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => void startCanary()}
                disabled={resultState.kind === "creating"}
                className="rounded-full bg-cyan-400 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-300"
              >
                {resultState.kind === "creating" ? "Creating Adyen test session..." : "Create Adyen Test Session"}
              </button>
              <span className="text-xs text-slate-400">Amount: $1.00 USD • provider override: adyen • readiness: test-only</span>
            </div>

            <div className="rounded-3xl border border-slate-800 bg-slate-950/80 p-5">
              <div ref={dropinContainerRef} />
              {resultState.kind === "idle" && (
                <p className="text-sm text-slate-400">No Adyen session mounted yet.</p>
              )}
            </div>
          </div>

          <aside className="space-y-4 rounded-3xl border border-slate-800 bg-slate-950/60 p-5">
            <div className="space-y-2">
              <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-300">Adyen Test Card</h2>
              <p className="text-sm text-slate-300">Official Adyen 3DS test values for web:</p>
              <ul className="space-y-1 text-sm text-slate-200">
                <li>
                  Card: <code>4917 6100 0000 0000</code>
                </li>
                <li>
                  Expiry: <code>03/2030</code>
                </li>
                <li>
                  CVC: <code>737</code>
                </li>
                <li>
                  Web challenge password: <code>password</code>
                </li>
              </ul>
            </div>

            <div className="space-y-2">
              <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-300">Session State</h2>
              <pre className="max-h-[24rem] overflow-auto rounded-2xl border border-slate-800 bg-slate-950 p-4 text-xs leading-5 text-slate-300">
                {JSON.stringify(resultState, null, 2)}
              </pre>
            </div>

            {canaryPayload && (
              <div className="rounded-2xl border border-cyan-500/30 bg-cyan-500/10 p-4 text-sm text-cyan-100">
                <p>
                  Order: <code>{canaryPayload.order_id || "unknown"}</code>
                </p>
                <p>
                  PSP: <code>{canaryPayload.psp_used || "unknown"}</code>
                </p>
                <p>
                  Status: <code>{canaryPayload.status || "unknown"}</code>
                </p>
              </div>
            )}
          </aside>
        </section>
      </div>
    </main>
  );
}
