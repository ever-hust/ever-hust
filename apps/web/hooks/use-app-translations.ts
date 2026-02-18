"use client";

import { useTranslations } from "next-intl";

/**
 * Wrapper around next-intl's useTranslations hook.
 * Provides type-safe access to translations with namespace support.
 *
 * @param namespace - Optional translation namespace (e.g. "common", "nav", "chat")
 *
 * @example
 * ```tsx
 * const t = useAppTranslations("common");
 * return <p>{t("loading")}</p>;
 * ```
 *
 * @example
 * ```tsx
 * const t = useAppTranslations("jobs");
 * return <span>{t("totalCount", { count: 42 })}</span>;
 * ```
 */
export function useAppTranslations(namespace?: string) {
  return useTranslations(namespace);
}
