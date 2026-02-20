import { getRequestConfig } from "next-intl/server";
import { hasLocale } from "next-intl";
import { cookies } from "next/headers";
import { locales, defaultLocale } from "./config";

export default getRequestConfig(async ({ requestLocale }) => {
  // requestLocale is provided by next-intl middleware; since the app uses a
  // custom proxy.ts instead, it will be undefined.  Fall back to the
  // NEXT_LOCALE cookie set by the LanguageSwitcher component.
  let requested = await requestLocale;
  if (!requested) {
    try {
      const cookieStore = await cookies();
      requested = cookieStore.get("NEXT_LOCALE")?.value;
    } catch {
      // cookies() may not be available in all contexts (e.g. build time)
    }
  }
  const locale = hasLocale(locales, requested) ? requested : defaultLocale;

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
