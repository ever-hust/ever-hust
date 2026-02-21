"use client";

import { useLocale } from "next-intl";
import { useRouter } from "next/navigation";
import { useCallback, useState, useRef, useEffect } from "react";
import { Globe } from "lucide-react";
import { Button } from "@ever-hust/ui/button";
import { cn } from "@ever-hust/ui/lib/utils";
import { locales, type Locale } from "@/i18n/config";

/** Display metadata for each supported locale. */
const localeLabels: Record<Locale, { flag: string; label: string }> = {
  en: { flag: "\u{1F1FA}\u{1F1F8}", label: "English" },
  es: { flag: "\u{1F1EA}\u{1F1F8}", label: "Espa\u00f1ol" },
};

/**
 * Language switcher component.
 * Renders a globe icon button that opens a small popover with available locales.
 * On selection, sets a `NEXT_LOCALE` cookie and refreshes the page so next-intl
 * picks up the new locale via `requestLocale`.
 *
 * Compact enough to fit in the sidebar alongside the ThemeToggle.
 */
export function LanguageSwitcher() {
  const currentLocale = useLocale();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close the popover when clicking outside
  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  // Close on Escape key
  useEffect(() => {
    if (!open) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [open]);

  const switchLocale = useCallback(
    (locale: Locale) => {
      // Set the NEXT_LOCALE cookie so next-intl resolves this locale on future requests
      document.cookie = `NEXT_LOCALE=${locale};path=/;max-age=31536000;samesite=lax`;
      setOpen(false);
      router.refresh();
    },
    [router]
  );

  const currentLabel = localeLabels[currentLocale as Locale] ?? localeLabels.en;

  return (
    <div ref={containerRef} className="relative">
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setOpen((prev) => !prev)}
        aria-label={`Language: ${currentLabel.label}. Click to change.`}
        aria-expanded={open}
        aria-haspopup="listbox"
        title={`Language: ${currentLabel.label}`}
      >
        <Globe className="h-5 w-5" aria-hidden="true" />
      </Button>

      {open && (
        <div
          role="listbox"
          aria-label="Select language"
          className="absolute bottom-full left-0 mb-1 min-w-[10rem] rounded-md border bg-popover p-1 shadow-md z-50"
        >
          {locales.map((locale) => {
            const { flag, label } = localeLabels[locale];
            const isActive = locale === currentLocale;
            return (
              <button
                key={locale}
                type="button"
                role="option"
                aria-selected={isActive}
                onClick={() => switchLocale(locale)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm transition-colors",
                  "hover:bg-accent hover:text-accent-foreground",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  isActive && "bg-accent text-accent-foreground font-medium"
                )}
              >
                <span aria-hidden="true">{flag}</span>
                <span>{label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
