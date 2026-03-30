"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  DEFAULT_PORTAL_LANGUAGE,
  normalizePortalLanguage,
  PORTAL_LANGUAGE_STORAGE_KEY,
  translatePortalMessage,
  type MerchantPortalLanguage,
} from "@/lib/i18n/merchant-portal";

type MerchantLanguageContextValue = {
  language: MerchantPortalLanguage;
  setLanguage: (language: MerchantPortalLanguage) => void;
  t: (key: string, variables?: Record<string, string | number | undefined>) => string;
};

const MerchantLanguageContext = createContext<MerchantLanguageContextValue | null>(null);

export function MerchantLanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] =
    useState<MerchantPortalLanguage>(DEFAULT_PORTAL_LANGUAGE);

  useEffect(() => {
    if (typeof window === "undefined") return;

    setLanguageState(
      normalizePortalLanguage(localStorage.getItem(PORTAL_LANGUAGE_STORAGE_KEY)),
    );
  }, []);

  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.lang = language;
    }
  }, [language]);

  const setLanguage = useCallback((nextLanguage: MerchantPortalLanguage) => {
    const normalized = normalizePortalLanguage(nextLanguage);
    setLanguageState(normalized);

    if (typeof window !== "undefined") {
      localStorage.setItem(PORTAL_LANGUAGE_STORAGE_KEY, normalized);
    }
  }, []);

  const t = useCallback(
    (key: string, variables?: Record<string, string | number | undefined>) =>
      translatePortalMessage(language, key, variables),
    [language],
  );

  const value = useMemo(
    () => ({
      language,
      setLanguage,
      t,
    }),
    [language, setLanguage, t],
  );

  return (
    <MerchantLanguageContext.Provider value={value}>
      {children}
    </MerchantLanguageContext.Provider>
  );
}

export function useMerchantLanguage() {
  const context = useContext(MerchantLanguageContext);
  if (!context) {
    throw new Error("useMerchantLanguage must be used within MerchantLanguageProvider");
  }
  return context;
}
