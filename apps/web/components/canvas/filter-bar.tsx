"use client";

import { Search, X, SlidersHorizontal } from "lucide-react";
import { useState, useEffect, useRef, useCallback, memo } from "react";
import { Input } from "@ever-hust/ui/input";
import { Button } from "@ever-hust/ui/button";
import { Badge } from "@ever-hust/ui/badge";

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
export const FilterBar = memo(function FilterBar({ filters, onFiltersChange }: FilterBarProps) {
  const [showAdvanced, setShowAdvanced] = useState(false);
  // Local state for text/number inputs (debounced)
  const [localKeywords, setLocalKeywords] = useState(filters.keywords ?? "");
  const [localLocation, setLocalLocation] = useState(filters.location ?? "");
  const [localSalaryMin, setLocalSalaryMin] = useState<string>(filters.salaryMin != null ? String(filters.salaryMin) : "");
  const [localSalaryMax, setLocalSalaryMax] = useState<string>(filters.salaryMax != null ? String(filters.salaryMax) : "");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const filtersRef = useRef(filters);
  filtersRef.current = filters;
  const pendingPatchRef = useRef<Partial<JobFilters>>({});

  // Sync local state when filters change externally (e.g. clear).
  // Cancel any pending debounce to prevent stale values from being restored.
  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
      pendingPatchRef.current = {};
    }
    setLocalKeywords(filters.keywords ?? "");
    setLocalLocation(filters.location ?? "");
    setLocalSalaryMin(filters.salaryMin != null ? String(filters.salaryMin) : "");
    setLocalSalaryMax(filters.salaryMax != null ? String(filters.salaryMax) : "");
  }, [filters.keywords, filters.location, filters.salaryMin, filters.salaryMax]);

  // Debounced update for text inputs — accumulates patches so concurrent
  // changes within the debounce window don't overwrite each other.
  const debouncedUpdate = useCallback(
    (patch: Partial<JobFilters>) => {
      pendingPatchRef.current = { ...pendingPatchRef.current, ...patch };
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        onFiltersChange({ ...filtersRef.current, ...pendingPatchRef.current });
        pendingPatchRef.current = {};
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

  const activeFilterCount = [
    !!filters.keywords,
    !!filters.location,
    !!filters.isRemote,
    !!filters.jobType,
    filters.salaryMin != null && filters.salaryMin > 0,
    filters.salaryMax != null && filters.salaryMax > 0,
    (filters.skills?.length ?? 0) > 0,
  ].filter(Boolean).length;

  const clearFilters = () => {
    setLocalKeywords("");
    setLocalLocation("");
    setLocalSalaryMin("");
    setLocalSalaryMax("");
    onFiltersChange({});
  };

  return (
    <div role="search" aria-label="Job filters" className="space-y-2 border-b p-3">
      {/* Main search row */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 basis-[140px]">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            aria-label="Search jobs by keyword"
            placeholder="Search jobs..."
            value={localKeywords}
            onChange={(e) => {
              const value = e.target.value;
              setLocalKeywords(value);
              debouncedUpdate({ keywords: value || undefined });
            }}
            className="h-8 pl-8 text-sm"
          />
        </div>
        <div className="relative min-w-0 flex-1 basis-[140px]">
          <Input
            aria-label="Filter by location"
            placeholder="Location..."
            value={localLocation}
            onChange={(e) => {
              const value = e.target.value;
              setLocalLocation(value);
              debouncedUpdate({ location: value || undefined });
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
            aria-label="Clear all filters"
          >
            <X className="h-3 w-3" aria-hidden="true" />
            Clear
          </Button>
        )}
        <span className="sr-only" aria-live="polite" role="status">
          {activeFilterCount > 0
            ? `${activeFilterCount} filter${activeFilterCount !== 1 ? "s" : ""} active`
            : "No filters active"}
        </span>
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
            min={0}
            aria-label="Minimum salary"
            placeholder="Min salary"
            value={localSalaryMin}
            onChange={(e) => {
              const value = e.target.value;
              setLocalSalaryMin(value);
              const num = Number(value);
              debouncedUpdate({ salaryMin: value && Number.isFinite(num) ? num : undefined });
            }}
            className="h-8 w-28 text-xs"
          />
          <Input
            type="number"
            min={0}
            aria-label="Maximum salary"
            placeholder="Max salary"
            value={localSalaryMax}
            onChange={(e) => {
              const value = e.target.value;
              setLocalSalaryMax(value);
              const num = Number(value);
              debouncedUpdate({ salaryMax: value && Number.isFinite(num) ? num : undefined });
            }}
            className="h-8 w-28 text-xs"
          />
        </div>
      )}
    </div>
  );
});
