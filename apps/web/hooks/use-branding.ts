"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import { createElement } from "react";

interface BrandingData {
  name: string;
  logoUrl: string | null;
  faviconUrl: string | null;
  primaryColor: string;
  accentColor: string;
  tagline: string;
  customFooterHtml: string | null;
  hideEverJobsBranding: boolean;
  isCustom: boolean;
}

interface BrandingContextValue extends BrandingData {
  isLoading: boolean;
}

const DEFAULT_BRANDING: BrandingData = {
  name: "Ever Jobs",
  logoUrl: null,
  faviconUrl: null,
  primaryColor: "#3b82f6",
  accentColor: "#8b5cf6",
  tagline: "AI-Powered Job Search",
  customFooterHtml: null,
  hideEverJobsBranding: false,
  isCustom: false,
};

const BrandingContext = createContext<BrandingContextValue>({
  ...DEFAULT_BRANDING,
  isLoading: true,
});

export function BrandingProvider({ children }: { children: ReactNode }) {
  const [branding, setBranding] = useState<BrandingData>(DEFAULT_BRANDING);
  const [isLoading, setIsLoading] = useState(true);

  const fetchBranding = useCallback(async (signal: AbortSignal) => {
    try {
      const res = await fetch("/api/branding/resolve", { signal });
      if (res.ok) {
        const json = (await res.json()) as BrandingData;
        setBranding(json);
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      console.error("Failed to fetch branding config:", err);
      // Keep defaults on error
    } finally {
      if (!signal.aborted) {
        setIsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetchBranding(controller.signal);
    return () => controller.abort();
  }, [fetchBranding]);

  return createElement(
    BrandingContext.Provider,
    { value: { ...branding, isLoading } },
    children,
  );
}

/**
 * Hook to access the current branding configuration.
 * Must be used within a `BrandingProvider`.
 */
export function useBranding(): BrandingContextValue {
  return useContext(BrandingContext);
}
