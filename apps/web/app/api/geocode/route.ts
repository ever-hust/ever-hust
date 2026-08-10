import { NextResponse } from "next/server";
import { z } from "zod";
import type { NextResponse as NextResponseType } from "next/server";
import { requireRole } from "@/lib/auth-roles";
import { applyRateLimit } from "@/lib/rate-limit";
import { mapsServerKey } from "@/lib/maps-key";

/**
 * POST /api/geocode
 *
 * Server-side geocoding proxy. Takes { city, state, country } and returns
 * { lat, lng } using the Google Maps Geocoding REST API.
 *
 * Uses the server-only key (`GOOGLE_MAPS_SERVER_KEY`), never the NEXT_PUBLIC_
 * browser key — the header comment here previously claimed that while the code
 * did the opposite.
 *
 * Every call costs a billed Google request, so this is authenticated and rate
 * limited: an open proxy on a public hostname lets anyone spend the project's
 * Maps quota through our own domain, which no key restriction can prevent.
 */

const geocodeSchema = z.object({
  city: z.string().optional(),
  state: z.string().optional(),
  country: z.string().optional(),
});

export async function POST(request: Request) {
  let user;
  try {
    user = await requireRole("admin", "recruiter", "user");
  } catch (response) {
    return response as NextResponseType;
  }

  const rateLimited = applyRateLimit(user.id, "export");
  if (rateLimited) return rateLimited;

  const apiKey = mapsServerKey();
  if (!apiKey) {
    return NextResponse.json(
      { error: "Google Maps API key is not configured" },
      { status: 503 }
    );
  }

  const body: unknown = await request.json().catch(() => null);
  const parsed = geocodeSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request body", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { city, state, country } = parsed.data;
  const addressParts = [city, state, country].filter(Boolean);
  if (addressParts.length === 0) {
    return NextResponse.json(
      { error: "At least one of city, state, or country is required" },
      { status: 400 }
    );
  }

  const address = addressParts.join(", ");
  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  url.searchParams.set("address", address);
  url.searchParams.set("key", apiKey);

  try {
    // Without a timeout a stalled Google connection pins a server worker.
    const res = await fetch(url.toString(), { signal: AbortSignal.timeout(5000) });
    const data = (await res.json()) as {
      status: string;
      error_message?: string;
      results?: Array<{
        geometry: { location: { lat: number; lng: number } };
      }>;
    };

    if (data.status !== "OK" || !data.results?.length) {
      console.warn(
        `[geocode] ${data.status} for "${address}"${data.error_message ? `: ${data.error_message}` : ""}`
      );
      return NextResponse.json(
        { error: "Geocoding failed", status: data.status },
        { status: 404 }
      );
    }

    const { lat, lng } = data.results[0]!.geometry.location;
    return NextResponse.json({ lat, lng });
  } catch (err) {
    console.error("[geocode] Error:", err);
    return NextResponse.json(
      { error: "Internal geocoding error" },
      { status: 500 }
    );
  }
}
