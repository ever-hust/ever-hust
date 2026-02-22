"use client";

import {
  createContext,
  useContext,
  type ReactNode,
} from "react";
import { createElement } from "react";
import { useQuery } from "@tanstack/react-query";
import { APP_NAME } from "@ever-hust/utils";

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
  name: APP_NAME,
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
  const { data, isLoading } = useQuery<BrandingData>({
    queryKey: ["branding"],
    queryFn: async ({ signal }) => {
      const res = await fetch("/api/branding/resolve", { signal });
      if (!res.ok) throw new Error("Failed to fetch branding config");
      return res.json() as Promise<BrandingData>;
    },
    staleTime: Infinity, // Branding rarely changes within a session
  });

  const branding = data ?? DEFAULT_BRANDING;

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
