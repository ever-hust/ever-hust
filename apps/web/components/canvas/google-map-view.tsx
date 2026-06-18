"use client";

import { useRef, useEffect, useCallback, useState, memo } from "react";
import { MapPin } from "lucide-react";
import { MarkerClusterer } from "@googlemaps/markerclusterer";
import { useGoogleMaps } from "@/hooks/use-google-maps";
import type { JobFilters } from "./filter-bar";
import { formatSalary, formatLocation } from "@/lib/format-date";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Minimal geo point returned by /api/jobs/map for the full filtered set. */
interface MapPoint {
  id: number;
  title: string;
  companyName: string | null;
  locationCity: string | null;
  locationState: string | null;
  locationCountry: string | null;
  isRemote: boolean | null;
  salaryMin: string | null;
  salaryMax: string | null;
  salaryCurrency: string | null;
  salaryInterval: string | null;
  latitude: number | string | null;
  longitude: number | string | null;
}

interface GoogleMapViewProps {
  /** Current search/filters — the map shows ALL matching jobs, not just a page. */
  filters: JobFilters;
  onViewDetails: (jobId: number) => void;
}

// Default center: continental US
const DEFAULT_CENTER = { lat: 39.8, lng: -98.5 };
const DEFAULT_ZOOM = 4;

// A real (Cloud-console) vector Map ID is required for AdvancedMarkerElement.
// When it's absent we fall back to classic markers, which render on a plain
// raster map without any Map ID — so pins always appear.
const MAP_ID = process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID;

function buildMapQuery(filters: JobFilters): string {
  const p = new URLSearchParams();
  if (filters.keywords) p.set("keywords", filters.keywords);
  if (filters.location) p.set("location", filters.location);
  if (filters.isRemote) p.set("isRemote", "true");
  if (filters.jobType) p.set("jobType", filters.jobType);
  if (filters.salaryMin != null && filters.salaryMin > 0) p.set("salaryMin", String(filters.salaryMin));
  if (filters.salaryMax != null && filters.salaryMax > 0) p.set("salaryMax", String(filters.salaryMax));
  return p.toString();
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const GoogleMapView = memo(function GoogleMapView({
  filters,
  onViewDetails,
}: GoogleMapViewProps) {
  const { isLoaded, loadError } = useGoogleMaps();
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<google.maps.Map | null>(null);
  const clustererRef = useRef<MarkerClusterer | null>(null);
  const markersRef = useRef<google.maps.Marker[] | google.maps.marker.AdvancedMarkerElement[]>([]);
  const infoWindowRef = useRef<google.maps.InfoWindow | null>(null);
  const [mapReady, setMapReady] = useState(false);

  const [points, setPoints] = useState<MapPoint[]>([]);
  const [capped, setCapped] = useState(false);
  const [fetching, setFetching] = useState(false);

  // -----------------------------------------------------------------------
  // Fetch the full filtered geo set whenever the filters change
  // -----------------------------------------------------------------------
  const query = buildMapQuery(filters);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setFetching(true);
    fetch(`/api/jobs/map?${query}`, { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((json) => {
        if (!active) return;
        const data = json?.data ?? json;
        setPoints(Array.isArray(data?.points) ? data.points : []);
        setCapped(Boolean(data?.capped));
      })
      .catch((err) => {
        if (active && err?.name !== "AbortError") {
          console.error("[GoogleMapView] map fetch failed", err);
          setPoints([]);
        }
      })
      .finally(() => {
        if (active) setFetching(false);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [query]);

  // -----------------------------------------------------------------------
  // Initialize the map once the API is loaded
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (!isLoaded || !mapRef.current || mapInstanceRef.current) return;

    const map = new google.maps.Map(mapRef.current, {
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
      ...(MAP_ID ? { mapId: MAP_ID } : {}),
      disableDefaultUI: false,
      zoomControl: true,
      streetViewControl: false,
      fullscreenControl: true,
      mapTypeControl: false,
    });

    mapInstanceRef.current = map;
    infoWindowRef.current = new google.maps.InfoWindow();
    setMapReady(true);

    return () => {
      mapInstanceRef.current = null;
      infoWindowRef.current = null;
      setMapReady(false);
    };
  }, [isLoaded]);

  // -----------------------------------------------------------------------
  // Build info window content
  // -----------------------------------------------------------------------
  const buildInfoContent = useCallback((point: MapPoint): string => {
    const salary = formatSalary(
      point.salaryMin,
      point.salaryMax,
      point.salaryCurrency,
      point.salaryInterval,
    );
    const location = formatLocation(
      point.locationCity,
      point.locationState,
      point.locationCountry,
      point.isRemote,
    );

    return `
      <div style="max-width:280px;font-family:system-ui,sans-serif;font-size:13px;line-height:1.4">
        <h3 style="margin:0 0 4px;font-size:14px;font-weight:600">${escapeHtml(point.title)}</h3>
        <p style="margin:0 0 4px;color:#666">${escapeHtml(point.companyName ?? "Unknown Company")}</p>
        ${location ? `<p style="margin:0 0 4px;color:#888;font-size:12px">📍 ${escapeHtml(location)}</p>` : ""}
        ${salary ? `<p style="margin:0 0 8px;color:#16a34a;font-weight:500">${escapeHtml(salary)}</p>` : ""}
        <button
          onclick="window.__hustViewJobDetails(${point.id})"
          style="padding:4px 12px;font-size:12px;font-weight:500;color:#fff;background:#2563eb;border:none;border-radius:6px;cursor:pointer"
        >
          View Details
        </button>
      </div>
    `;
  }, []);

  // -----------------------------------------------------------------------
  // Expose job details handler on window for info window "View Details" click
  // -----------------------------------------------------------------------
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__hustViewJobDetails = (jobId: number) => {
      onViewDetails(jobId);
    };
    return () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (window as any).__hustViewJobDetails;
    };
  }, [onViewDetails]);

  // -----------------------------------------------------------------------
  // Sync markers whenever points or map readiness changes
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (!mapReady || !mapInstanceRef.current) return;
    const map = mapInstanceRef.current;

    // Clean up old markers
    if (clustererRef.current) clustererRef.current.clearMarkers();
    for (const marker of markersRef.current) {
      if ("setMap" in marker) marker.setMap(null);
      else marker.map = null;
    }
    markersRef.current = [];

    const geoPoints = points
      .map((p) => ({ ...p, lat: Number(p.latitude), lng: Number(p.longitude) }))
      .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));

    if (geoPoints.length === 0) return;

    const useAdvanced = Boolean(MAP_ID) && Boolean(google.maps?.marker?.AdvancedMarkerElement);

    try {
      const newMarkers = geoPoints.map((point) => {
        let marker: google.maps.Marker | google.maps.marker.AdvancedMarkerElement;
        if (useAdvanced) {
          marker = new google.maps.marker.AdvancedMarkerElement({
            position: { lat: point.lat, lng: point.lng },
            title: point.title,
          });
        } else {
          marker = new google.maps.Marker({
            position: { lat: point.lat, lng: point.lng },
            title: point.title,
          });
        }
        marker.addListener("click", () => {
          if (infoWindowRef.current) {
            infoWindowRef.current.setContent(buildInfoContent(point));
            infoWindowRef.current.open({ anchor: marker, map });
          }
        });
        return marker;
      });

      // MarkerClusterer accepts either marker type; the array is homogeneous at
      // runtime (all advanced or all classic) — cast to satisfy the overload.
      markersRef.current = newMarkers as typeof markersRef.current;
      clustererRef.current = new MarkerClusterer({
        map,
        markers: newMarkers as google.maps.Marker[],
      });

      const bounds = new google.maps.LatLngBounds();
      for (const p of geoPoints) bounds.extend({ lat: p.lat, lng: p.lng });
      map.fitBounds(bounds, { top: 50, right: 50, bottom: 50, left: 50 });
    } catch (err) {
      console.error("[GoogleMapView] failed to render markers", err);
    }
  }, [points, mapReady, buildInfoContent]);

  // -----------------------------------------------------------------------
  // Missing API key or load error — show placeholder
  // -----------------------------------------------------------------------
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  if (!apiKey) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-lg border border-dashed bg-muted/20 p-8 text-center">
        <MapPin className="h-10 w-10 text-muted-foreground/40" />
        <div>
          <p className="text-sm font-medium text-muted-foreground">Google Maps not configured</p>
          <p className="mt-1 text-xs text-muted-foreground/60">
            Set <code className="rounded bg-muted px-1 py-0.5 text-[11px]">NEXT_PUBLIC_GOOGLE_MAPS_API_KEY</code> in your environment to enable the map view.
          </p>
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-lg border border-dashed bg-muted/20 p-8 text-center">
        <MapPin className="h-10 w-10 text-destructive/40" />
        <div>
          <p className="text-sm font-medium text-destructive">Failed to load Google Maps</p>
          <p className="mt-1 text-xs text-muted-foreground/60">{loadError}</p>
        </div>
      </div>
    );
  }

  if (!isLoaded) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-muted-foreground/20 border-t-primary" />
      </div>
    );
  }

  return (
    <div className="relative flex flex-1 flex-col">
      {/* Map container */}
      <div ref={mapRef} className="flex-1 rounded-lg min-h-[400px]" />

      {/* Overlay badge showing how many jobs are on the map */}
      <div className="absolute bottom-3 left-3 rounded-full bg-background/90 px-3 py-1 text-xs font-medium shadow-sm backdrop-blur">
        {fetching
          ? "Loading map…"
          : `${points.length.toLocaleString()} job${points.length === 1 ? "" : "s"} on map${capped ? " (showing first 5,000)" : ""}`}
      </div>
    </div>
  );
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
