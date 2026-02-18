"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Search,
  ChevronLeft,
  ChevronRight,
  Briefcase,
  MapPin,
  Globe,
  ExternalLink,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@repo/ui/card";
import { Button } from "@repo/ui/button";
import { Badge } from "@repo/ui/badge";
import { Input } from "@repo/ui/input";
import { Skeleton } from "@repo/ui/skeleton";
import { apiFetch } from "@/lib/api-client";

interface JobRow {
  id: number;
  title: string;
  companyName: string | null;
  locationCity: string | null;
  locationState: string | null;
  locationCountry: string | null;
  isRemote: boolean | null;
  jobLevel: string | null;
  site: string;
  datePosted: string | null;
  createdAt: string;
}

interface JobsResponse {
  jobs: JobRow[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

function formatDate(dateString: string | null): string {
  if (!dateString) return "N/A";
  return new Date(dateString).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatLocation(job: JobRow): string {
  const parts = [job.locationCity, job.locationState, job.locationCountry].filter(
    Boolean,
  );
  return parts.length > 0 ? parts.join(", ") : "Not specified";
}

export default function AdminJobsPage() {
  const [data, setData] = useState<JobsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");

  const fetchJobs = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("limit", "20");
    if (search) params.set("q", search);

    const result = await apiFetch<JobsResponse>(
      `/api/admin/jobs?${params.toString()}`,
    );
    if (result) {
      setData(result);
    }
    setLoading(false);
  }, [page, search]);

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    setSearch(searchInput);
  };

  const pagination = data?.pagination;

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Jobs Management</h1>
        <p className="text-muted-foreground">
          Review and manage job listings across the platform.
        </p>
      </div>

      {/* Search */}
      <form onSubmit={handleSearch} className="flex gap-2 max-w-md">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Search by title or company..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button type="submit" variant="secondary">
          Search
        </Button>
      </form>

      {/* Jobs Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Briefcase className="h-5 w-5" aria-hidden="true" />
            Job Listings
          </CardTitle>
          <CardDescription>
            {pagination
              ? `Showing ${(pagination.page - 1) * pagination.limit + 1}-${Math.min(pagination.page * pagination.limit, pagination.total)} of ${pagination.total} jobs`
              : "Loading..."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex flex-col gap-4">
              {Array.from({ length: 10 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4">
                  <div className="flex-1">
                    <Skeleton className="h-4 w-60 mb-1" />
                    <Skeleton className="h-3 w-40" />
                  </div>
                  <Skeleton className="h-6 w-24" />
                  <Skeleton className="h-6 w-20" />
                  <Skeleton className="h-6 w-20" />
                </div>
              ))}
            </div>
          ) : data?.jobs.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              No jobs found.
            </p>
          ) : (
            <>
              {/* Table header */}
              <div className="hidden lg:grid lg:grid-cols-[1fr_auto_auto_auto_auto] gap-4 pb-3 border-b text-xs font-medium text-muted-foreground uppercase tracking-wider">
                <span>Job</span>
                <span className="w-40 text-center">Location</span>
                <span className="w-20 text-center">Remote</span>
                <span className="w-20 text-center">Source</span>
                <span className="w-24 text-right">Posted</span>
              </div>

              {/* Table rows */}
              <div className="divide-y">
                {data?.jobs.map((job) => (
                  <div
                    key={job.id}
                    className="grid lg:grid-cols-[1fr_auto_auto_auto_auto] gap-3 lg:gap-4 py-4 items-center"
                  >
                    {/* Job info */}
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">
                        {job.title}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {job.companyName ?? "Unknown company"}
                        {job.jobLevel && (
                          <span className="ml-2 text-muted-foreground/60">
                            &middot; {job.jobLevel}
                          </span>
                        )}
                      </p>
                    </div>

                    {/* Location */}
                    <div className="w-40 flex justify-center">
                      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground truncate max-w-full">
                        <MapPin className="h-3 w-3 shrink-0" aria-hidden="true" />
                        <span className="truncate">{formatLocation(job)}</span>
                      </span>
                    </div>

                    {/* Remote */}
                    <div className="w-20 flex justify-center">
                      {job.isRemote ? (
                        <Badge variant="default" className="gap-1">
                          <Globe className="h-3 w-3" aria-hidden="true" />
                          Yes
                        </Badge>
                      ) : (
                        <Badge variant="outline">No</Badge>
                      )}
                    </div>

                    {/* Source */}
                    <div className="w-20 flex justify-center">
                      <Badge variant="secondary">
                        <ExternalLink className="h-3 w-3 mr-1" aria-hidden="true" />
                        {job.site}
                      </Badge>
                    </div>

                    {/* Date posted */}
                    <div className="w-24 text-right">
                      <span className="text-xs text-muted-foreground">
                        {formatDate(job.datePosted ?? job.createdAt)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Pagination */}
          {pagination && pagination.totalPages > 1 && (
            <div className="flex items-center justify-between pt-4 border-t mt-4">
              <p className="text-sm text-muted-foreground">
                Page {pagination.page} of {pagination.totalPages}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={pagination.page <= 1 || loading}
                >
                  <ChevronLeft className="h-4 w-4 mr-1" aria-hidden="true" />
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setPage((p) => Math.min(pagination.totalPages, p + 1))
                  }
                  disabled={pagination.page >= pagination.totalPages || loading}
                >
                  Next
                  <ChevronRight className="h-4 w-4 ml-1" aria-hidden="true" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
