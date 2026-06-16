"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { MapPin } from "lucide-react";
import { Input } from "@ever-hust/ui/input";
import { useGoogleMaps } from "@/hooks/use-google-maps";

interface AddressAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

/**
 * Google Places Autocomplete input for location filtering.
 * Falls back to a plain text input if the Google Maps API is not loaded.
 */
export function AddressAutocomplete({
  value,
  onChange,
  placeholder = "City, state, or country...",
  className,
}: AddressAutocompleteProps) {
  const { isLoaded } = useGoogleMaps();
  const inputRef = useRef<HTMLInputElement>(null);
  const [suggestions, setSuggestions] = useState<google.maps.places.AutocompletePrediction[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const sessionTokenRef = useRef<google.maps.places.AutocompleteSessionToken | null>(null);
  const autocompleteServiceRef = useRef<google.maps.places.AutocompleteService | null>(null);

  // Initialize autocomplete service.
  // Defensive: the page must never crash if Places is unavailable (missing API
  // key, blocked script, or only the base "maps" lib loaded). If the service
  // can't be created, `autocompleteServiceRef` stays null and the component
  // silently degrades to a plain text input — `fetchSuggestions` already no-ops
  // when the ref is null.
  useEffect(() => {
    if (!isLoaded) return;
    if (typeof google === "undefined" || !google.maps?.places?.AutocompleteService) {
      return;
    }
    try {
      autocompleteServiceRef.current = new google.maps.places.AutocompleteService();
      sessionTokenRef.current = new google.maps.places.AutocompleteSessionToken();
    } catch (err) {
      console.error("[AddressAutocomplete] Places init failed; falling back to text input:", err);
    }
  }, [isLoaded]);

  // Fetch suggestions when input changes
  const fetchSuggestions = useCallback(
    async (input: string) => {
      if (!autocompleteServiceRef.current || !input || input.length < 2) {
        setSuggestions([]);
        setShowDropdown(false);
        return;
      }

      try {
        const result = await new Promise<google.maps.places.AutocompletePrediction[]>(
          (resolve) => {
            autocompleteServiceRef.current!.getPlacePredictions(
              {
                input,
                types: ["(regions)"], // Cities, states, countries only
                sessionToken: sessionTokenRef.current!,
              },
              (predictions, status) => {
                if (
                  status === google.maps.places.PlacesServiceStatus.OK &&
                  predictions
                ) {
                  resolve(predictions);
                } else {
                  resolve([]);
                }
              }
            );
          }
        );

        setSuggestions(result);
        setShowDropdown(result.length > 0);
      } catch {
        setSuggestions([]);
      }
    },
    []
  );

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newValue = e.target.value;
      onChange(newValue);
      fetchSuggestions(newValue);
    },
    [onChange, fetchSuggestions]
  );

  const handleSelect = useCallback(
    (prediction: google.maps.places.AutocompletePrediction) => {
      onChange(prediction.description);
      setShowDropdown(false);
      setSuggestions([]);
      // Create a new session token after selection to group billing
      sessionTokenRef.current = new google.maps.places.AutocompleteSessionToken();
    },
    [onChange]
  );

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (inputRef.current && !inputRef.current.parentElement?.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="relative">
      <div className="relative">
        <MapPin className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          ref={inputRef}
          type="text"
          value={value}
          onChange={handleInputChange}
          onFocus={() => suggestions.length > 0 && setShowDropdown(true)}
          placeholder={placeholder}
          className={`pl-8 h-8 text-xs ${className ?? ""}`}
          autoComplete="off"
        />
      </div>

      {/* Autocomplete dropdown */}
      {showDropdown && suggestions.length > 0 && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md">
          <ul className="max-h-48 overflow-auto py-1">
            {suggestions.map((prediction) => (
              <li key={prediction.place_id}>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-accent transition-colors"
                  onClick={() => handleSelect(prediction)}
                >
                  <MapPin className="h-3 w-3 shrink-0 text-muted-foreground" />
                  <span className="truncate">{prediction.description}</span>
                </button>
              </li>
            ))}
          </ul>
          <div className="border-t px-3 py-1">
            <p className="text-[10px] text-muted-foreground/50">
              Powered by Google Maps
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
