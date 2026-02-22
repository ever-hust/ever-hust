import { NextResponse } from "next/server";
import { z } from "zod";
import { env } from "@/lib/env";

/**
 * POST /api/geocode
 *
 * Server-side geocoding proxy. Takes { city, state, country } and returns
 * { lat, lng } using the Google Maps Geocoding REST API.
 *
 * The API key is kept server-side (not the NEXT_PUBLIC_ variant) so that
 * callers don't need a Maps API key of their own.
 *
 * Intended for batch-geocoding jobs in a background task.
 */

const geocodeSchema = z.object({
  city: z.string().optional(),
  state: z.string().optional(),
  country: z.string().optional(),
});

export async function POST(request: Request) {
  const apiKey = env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
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
    const res = await fetch(url.toString());
    const data = (await res.json()) as {
      status: string;
      results?: Array<{
        geometry: { location: { lat: number; lng: number } };
      }>;
    };

    if (data.status !== "OK" || !data.results?.length) {
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
