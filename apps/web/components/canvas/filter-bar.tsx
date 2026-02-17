"use client";

import { Search, X, SlidersHorizontal } from "lucide-react";
import { useState, useEffect, useRef, useCallback } from "react";
import { Input } from "@repo/ui/input";
import { Button } from "@repo/ui/button";
import { Badge } from "@repo/ui/badge";

export interface JobFilters {
  keywords?: string;
  location?: string;
  isRemote?: boolean;
  jobType?: string;
  salaryMin?: number;
  salaryMax?: number;
  skills?: string[];
}

interface FilterBarProps {
  filters: JobFilters;
  onFiltersChange: (filters: JobFilters) => void;
}

/** Debounce delay (ms) for text-input filter changes. */
const FILTER_DEBOUNCE_MS = 300;

/**
 * Debounced filter bar for job search.
 * Text inputs (keywords, location) are debounced to prevent excessive API calls.
 * Toggle/select inputs fire immediately.
 */
export function FilterBar({ filters, onFiltersChange }: FilterBarProps) {
  const [showAdvanced, setShowAdvanced] = useState(false);
  // Local state for text inputs (debounced)
  const [localKeywords, setLocalKeywords] = useState(filters.keywords ?? "");
  const [localLocation, setLocalLocation] = useState(filters.location ?? "");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync local state when filters change externally (e.g. clear)
  useEffect(() => {
    setLocalKeywords(filters.keywords ?? "");
    setLocalLocation(filters.location ?? "");
  }, [filters.keywords, filters.location]);

  // Debounced update for text inputs
  const debouncedUpdate = useCallback(
    (newFilters: JobFilters) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        onFiltersChange(newFilters);
      }, FILTER_DEBOUNCE_MS);
    },
    [onFiltersChange]
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const activeFilterCount = Object.values(filters).filter(
    (v) => v !== undefined && v !== "" && v !== false && !(Array.isArray(v) && v.length === 0)
  ).length;

  const clearFilters = () => {
    setLocalKeywords("");
    setLocalLocation("");
    onFiltersChange({});
  };

  return (
    <div role="search" aria-label="Job filters" className="space-y-2 border-b p-3">
      {/* Main search row */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            aria-label="Search jobs by keyword"
            placeholder="Search jobs..."
            value={localKeywords}
            onChange={(e) => {
              const value = e.target.value;
              setLocalKeywords(value);
              debouncedUpdate({ ...filters, keywords: value || undefined });
            }}
            className="h-8 pl-8 text-sm"
          />
        </div>
        <div className="relative flex-1">
          <Input
            aria-label="Filter by location"
            placeholder="Location..."
            value={localLocation}
            onChange={(e) => {
              const value = e.target.value;
              setLocalLocation(value);
              debouncedUpdate({ ...filters, location: value || undefined });
            }}
            className="h-8 text-sm"
          />
        </div>
        <Button
          variant={filters.isRemote ? "default" : "outline"}
          size="sm"
          className="h-8 text-xs"
          aria-pressed={!!filters.isRemote}
          aria-label="Filter remote jobs only"
          onClick={() =>
            onFiltersChange({
              ...filters,
              isRemote: filters.isRemote ? undefined : true,
            })
          }
        >
          Remote
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-1 text-xs"
          onClick={() => setShowAdvanced(!showAdvanced)}
          aria-expanded={showAdvanced}
          aria-controls="advanced-filters"
          aria-label={showAdvanced ? "Hide advanced filters" : "Show advanced filters"}
        >
          <SlidersHorizontal className="h-3 w-3" aria-hidden="true" />
          {activeFilterCount > 0 && (
            <Badge variant="secondary" className="ml-0.5 h-4 w-4 p-0 text-[10px]">
              {activeFilterCount}
            </Badge>
          )}
        </Button>
        {activeFilterCount > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 gap-1 text-xs"
            onClick={clearFilters}
          >
            <X className="h-3 w-3" aria-hidden="true" />
            Clear
          </Button>
        )}
      </div>

      {/* Advanced filters */}
      {showAdvanced && (
        <div id="advanced-filters" className="flex flex-wrap items-center gap-2 pt-1">
          <select
            aria-label="Job type"
            value={filters.jobType ?? ""}
            onChange={(e) =>
              onFiltersChange({
                ...filters,
                jobType: e.target.value || undefined,
              })
            }
            className="h-8 rounded-md border bg-background px-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="">All Types</option>
            <option value="fulltime">Full-time</option>
            <option value="parttime">Part-time</option>
            <option value="contract">Contract</option>
            <option value="internship">Internship</option>
          </select>
          <Input
            type="number"
            aria-label="Minimum salary"
            placeholder="Min salary"
            value={filters.salaryMin ?? ""}
            onChange={(e) =>
              onFiltersChange({
                ...filters,
                salaryMin: e.target.value ? Number(e.target.value) : undefined,
              })
            }
            className="h-8 w-28 text-xs"
          />
          <Input
            type="number"
            aria-label="Maximum salary"
            placeholder="Max salary"
            value={filters.salaryMax ?? ""}
            onChange={(e) =>
              onFiltersChange({
                ...filters,
                salaryMax: e.target.value ? Number(e.target.value) : undefined,
              })
            }
            className="h-8 w-28 text-xs"
          />
        </div>
      )}
    </div>
  );
}
