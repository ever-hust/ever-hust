"use client";

import { useState, useEffect, useRef } from "react";
import { setOptions, importLibrary } from "@googlemaps/js-api-loader";

/**
 * Lazily loads the Google Maps JavaScript API using @googlemaps/js-api-loader v2.
 *
 * Returns `{ isLoaded, loadError }`.
 * - When the API key is missing, `isLoaded` stays `false` (no error).
 * - Uses the v2 functional API: `setOptions()` then `importLibrary()`.
 * - Loads BOTH the `maps` and `places` libraries — consumers use Places
 *   (`AutocompleteService`) as well as the map, and `isLoaded` must not flip
 *   true until `google.maps.places` actually exists.
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

    // Load all libraries the consumers touch before signalling readiness:
    //  - `maps`   — the map itself
    //  - `places` — location autocomplete (`AutocompleteService`)
    //  - `marker` — `AdvancedMarkerElement` used by the map markers
    // If any is missing, consumers throw on first access (`google.maps.marker`
    // undefined previously crashed the jobs page in split/map view).
    Promise.all([
      importLibrary("maps"),
      importLibrary("places"),
      importLibrary("marker"),
    ])
      .then(() => setIsLoaded(true))
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : "Failed to load Google Maps";
        setLoadError(message);
        console.error("[useGoogleMaps]", message);
      });
  }, []);

  return { isLoaded, loadError } as const;
}
