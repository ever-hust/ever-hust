"use client";

import { useEffect, useRef, useState } from "react";
import { Maximize2, Minimize2, ExternalLink } from "lucide-react";
import { useGoogleMaps } from "@/hooks/use-google-maps";

interface JobLocationMapProps {
  latitude: number;
  longitude: number;
  title: string;
  /** Human-readable location label for the "Open in Google Maps" link. */
  label?: string | null;
}

const MAP_ID = process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID;

/**
 * Small map with a single pin for the job's location, shown on the job detail
 * page only when coordinates are known. Expandable, with a link out to Google
 * Maps. Renders nothing if the Maps API key isn't configured.
 */
export function JobLocationMap({ latitude, longitude, title, label }: JobLocationMapProps) {
  const { isLoaded } = useGoogleMaps();
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<google.maps.Map | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!isLoaded || !mapRef.current || mapInstanceRef.current) return;
    const center = { lat: latitude, lng: longitude };

    const map = new google.maps.Map(mapRef.current, {
      center,
      zoom: 11,
      ...(MAP_ID ? { mapId: MAP_ID } : {}),
      disableDefaultUI: true,
      zoomControl: true,
      gestureHandling: "cooperative",
    });
    mapInstanceRef.current = map;

    try {
      if (MAP_ID && google.maps?.marker?.AdvancedMarkerElement) {
        new google.maps.marker.AdvancedMarkerElement({ position: center, map, title });
      } else {
        new google.maps.Marker({ position: center, map, title });
      }
    } catch (err) {
      console.error("[JobLocationMap] marker render failed", err);
    }

    return () => {
      mapInstanceRef.current = null;
    };
  }, [isLoaded, latitude, longitude, title]);

  // Recenter when the container resizes (expand/collapse).
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    google.maps.event.trigger(map, "resize");
    map.setCenter({ lat: latitude, lng: longitude });
  }, [expanded, latitude, longitude]);

  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!apiKey) return null;

  const gmapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    label ? `${label}` : `${latitude},${longitude}`,
  )}`;

  return (
    <div className="mt-3">
      <div
        ref={mapRef}
        className={`w-full overflow-hidden rounded-md border transition-[height] ${
          expanded ? "h-72" : "h-40"
        }`}
        aria-label="Job location map"
      />
      <div className="mt-1.5 flex items-center justify-between">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          {expanded ? (
            <>
              <Minimize2 className="h-3 w-3" aria-hidden="true" /> Collapse
            </>
          ) : (
            <>
              <Maximize2 className="h-3 w-3" aria-hidden="true" /> Expand map
            </>
          )}
        </button>
        <a
          href={gmapsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          Open in Google Maps <ExternalLink className="h-3 w-3" aria-hidden="true" />
        </a>
      </div>
    </div>
  );
}
