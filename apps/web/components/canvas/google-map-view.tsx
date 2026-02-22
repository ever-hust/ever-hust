"use client";

import { useRef, useEffect, useCallback, useState, memo } from "react";
import { MapPin } from "lucide-react";
import { MarkerClusterer } from "@googlemaps/markerclusterer";
import { useGoogleMaps } from "@/hooks/use-google-maps";
import type { JobCardData } from "./job-card";
import { formatSalary, formatLocation } from "@/lib/format-date";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface GoogleMapViewProps {
  jobs: JobCardData[];
  favoritedJobIds: Set<number>;
  onViewDetails: (jobId: number) => void;
}

// Default center: continental US
const DEFAULT_CENTER = { lat: 39.8, lng: -98.5 };
const DEFAULT_ZOOM = 4;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const GoogleMapView = memo(function GoogleMapView({
  jobs,
  onViewDetails,
}: GoogleMapViewProps) {
  const { isLoaded, loadError } = useGoogleMaps();
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<google.maps.Map | null>(null);
  const clustererRef = useRef<MarkerClusterer | null>(null);
  const markersRef = useRef<google.maps.marker.AdvancedMarkerElement[]>([]);
  const infoWindowRef = useRef<google.maps.InfoWindow | null>(null);
  const [mapReady, setMapReady] = useState(false);

  // -----------------------------------------------------------------------
  // Initialize the map once the API is loaded
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (!isLoaded || !mapRef.current || mapInstanceRef.current) return;

    const map = new google.maps.Map(mapRef.current, {
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
      mapId: "hust-jobs-map", // Required for AdvancedMarkerElement
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
  const buildInfoContent = useCallback(
    (job: JobCardData): string => {
      const salary = formatSalary(
        job.salaryMin,
        job.salaryMax,
        job.salaryCurrency,
        job.salaryInterval
      );
      const location = formatLocation(
        job.locationCity,
        job.locationState,
        job.locationCountry,
        job.isRemote
      );

      return `
        <div style="max-width:280px;font-family:system-ui,sans-serif;font-size:13px;line-height:1.4">
          <h3 style="margin:0 0 4px;font-size:14px;font-weight:600">${escapeHtml(job.title)}</h3>
          <p style="margin:0 0 4px;color:#666">${escapeHtml(job.companyName ?? "Unknown Company")}</p>
          ${location ? `<p style="margin:0 0 4px;color:#888;font-size:12px">📍 ${escapeHtml(location)}</p>` : ""}
          ${salary ? `<p style="margin:0 0 8px;color:#16a34a;font-weight:500">${escapeHtml(salary)}</p>` : ""}
          <button
            onclick="window.__hustViewJobDetails(${job.id})"
            style="padding:4px 12px;font-size:12px;font-weight:500;color:#fff;background:#2563eb;border:none;border-radius:6px;cursor:pointer"
          >
            View Details
          </button>
        </div>
      `;
    },
    []
  );

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
  // Sync markers whenever jobs or map readiness changes
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (!mapReady || !mapInstanceRef.current) return;
    const map = mapInstanceRef.current;

    // Clean up old markers
    if (clustererRef.current) {
      clustererRef.current.clearMarkers();
    }
    for (const marker of markersRef.current) {
      marker.map = null;
    }
    markersRef.current = [];

    // Filter to geocoded jobs only
    const geoJobs = jobs.filter(
      (job) => job.latitude != null && job.longitude != null
    );

    if (geoJobs.length === 0) return;

    // Create markers
    const newMarkers = geoJobs.map((job) => {
      const marker = new google.maps.marker.AdvancedMarkerElement({
        position: { lat: job.latitude!, lng: job.longitude! },
        map,
        title: job.title,
      });

      marker.addListener("click", () => {
        if (infoWindowRef.current) {
          infoWindowRef.current.setContent(buildInfoContent(job));
          infoWindowRef.current.open({ anchor: marker, map });
        }
      });

      return marker;
    });

    markersRef.current = newMarkers;

    // Cluster markers
    clustererRef.current = new MarkerClusterer({
      map,
      markers: newMarkers,
    });

    // Auto-fit bounds if we have markers
    if (geoJobs.length > 0) {
      const bounds = new google.maps.LatLngBounds();
      for (const job of geoJobs) {
        bounds.extend({ lat: job.latitude!, lng: job.longitude! });
      }
      map.fitBounds(bounds, { top: 50, right: 50, bottom: 50, left: 50 });
    }
  }, [jobs, mapReady, buildInfoContent]);

  // -----------------------------------------------------------------------
  // Missing API key or load error — show placeholder
  // -----------------------------------------------------------------------
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  if (!apiKey) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-lg border border-dashed bg-muted/20 p-8 text-center">
        <MapPin className="h-10 w-10 text-muted-foreground/40" />
        <div>
          <p className="text-sm font-medium text-muted-foreground">
            Google Maps not configured
          </p>
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
          <p className="text-sm font-medium text-destructive">
            Failed to load Google Maps
          </p>
          <p className="mt-1 text-xs text-muted-foreground/60">
            {loadError}
          </p>
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

  const geoJobCount = jobs.filter(
    (j) => j.latitude != null && j.longitude != null
  ).length;

  return (
    <div className="relative flex flex-1 flex-col">
      {/* Map container */}
      <div ref={mapRef} className="flex-1 rounded-lg min-h-[400px]" />

      {/* Overlay badge showing how many jobs are on the map */}
      <div className="absolute bottom-3 left-3 rounded-full bg-background/90 px-3 py-1 text-xs font-medium shadow-sm backdrop-blur">
        {geoJobCount} of {jobs.length} jobs on map
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
