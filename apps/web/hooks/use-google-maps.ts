"use client";

import { useState, useEffect, useRef } from "react";
import { setOptions, importLibrary } from "@googlemaps/js-api-loader";

/**
 * Lazily loads the Google Maps JavaScript API using @googlemaps/js-api-loader v2.
 *
 * Returns `{ isLoaded, loadError }`.
 * - When the API key is missing, `isLoaded` stays `false` (no error).
 * - Uses the v2 functional API: `setOptions()` then `importLibrary()`.
 * - The first `importLibrary()` call triggers the actual script load.
 */

let optionsSet = false;

export function useGoogleMaps() {
  const [isLoaded, setIsLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const loadAttempted = useRef(false);

  useEffect(() => {
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!apiKey) return; // Gracefully degrade — no map available
    if (loadAttempted.current) return;
    loadAttempted.current = true;

    if (!optionsSet) {
      setOptions({ key: apiKey, v: "weekly" });
      optionsSet = true;
    }

    importLibrary("maps")
      .then(() => setIsLoaded(true))
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : "Failed to load Google Maps";
        setLoadError(message);
        console.error("[useGoogleMaps]", message);
      });
  }, []);

  return { isLoaded, loadError } as const;
}
