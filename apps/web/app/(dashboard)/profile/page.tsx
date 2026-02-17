"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  MapPin,
  Mail,
  Briefcase,
  Heart,
  FileText,
  Star,
  ExternalLink,
  User,
  Settings,
  Calendar,
} from "lucide-react";
import { Badge } from "@repo/ui/badge";
import { Button } from "@repo/ui/button";
import { Card } from "@repo/ui/card";
import { Skeleton } from "@repo/ui/skeleton";
import { Avatar, AvatarFallback } from "@repo/ui/avatar";
import { CVDropzone } from "@/components/canvas/cv-dropzone";
import { ScrollToTop } from "@/components/shared/scroll-to-top";
import { ErrorState } from "@/components/shared/error-state";
import { PageHeader } from "@/components/shared/page-header";
import { timeAgo } from "@/lib/format-date";

interface UserProfile {
  id: string;
  name: string;
  email: string;
  headline: string | null;
  location: string | null;
  photoUrl: string | null;
  skills: string[] | null;
  experience: unknown;
  preferences: Record<string, unknown> | null;
  cvParsedData: unknown;
  subscriptionStatus: string;
  onboardingCompleted: boolean;
  createdAt: string;
}

interface FavoriteJob {
  jobId: number;
  jobTitle: string | null;
  companyName: string | null;
  jobUrl: string | null;
  createdAt: string;
}

interface ApplicationJob {
  jobId: number;
  jobTitle: string | null;
  companyName: string | null;
  appliedAt: string | null;
  status: string;
}

interface ProfileData {
  user: UserProfile;
  favorites: FavoriteJob[];
  applications: ApplicationJob[];
}

export default function ProfilePage() {
  const router = useRouter();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [data, setData] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reloadProfile = useCallback(() => {
    setLoading(true);
    router.refresh();
    // Re-trigger the effect by resetting state
    setData(null);
    setError(null);
  }, [router]);

  useEffect(() => {
    const controller = new AbortController();
    async function loadProfile() {
      try {
        setError(null);
        const res = await fetch("/api/user/profile", { signal: controller.signal });
        if (!res.ok) {
          if (res.status === 401) throw new Error("Please sign in to view your profile.");
          throw new Error("Failed to load profile");
        }
        if (!controller.signal.aborted) {
          setData(await res.json());
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : "Failed to load profile");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    loadProfile();
    return () => controller.abort();
  }, []);

  if (loading) {
    return (
      <div
        className="mx-auto max-w-3xl space-y-6 p-6"
        aria-busy="true"
        aria-label="Loading profile"
        role="status"
      >
        <Skeleton className="h-40 w-full rounded-lg" />
        <Skeleton className="h-32 w-full rounded-lg" />
        <Skeleton className="h-32 w-full rounded-lg" />
        <span className="sr-only">Loading your profile...</span>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <ErrorState
          message={error ?? "Failed to load profile"}
          onRetry={reloadProfile}
        />
      </div>
    );
  }

  const { user, favorites, applications } = data;
  const skills = user.skills ?? [];
  const prefs = user.preferences ?? {};
  const memberSince = user.createdAt
    ? new Date(user.createdAt).toLocaleDateString(undefined, {
        month: "long",
        year: "numeric",
      })
    : null;

  return (
    <div ref={scrollRef} className="mx-auto max-w-3xl space-y-6 overflow-y-auto p-6">
      <PageHeader
        icon={User}
        title="Profile"
        className="border-b-0 px-0 py-0"
        actions={
          <Link href="/settings">
            <Button variant="outline" size="sm" className="gap-1.5">
              <Settings className="h-3.5 w-3.5" aria-hidden="true" />
              Edit Profile
            </Button>
          </Link>
        }
      />

      {/* Header Card */}
      <Card className="p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          <Avatar className="h-16 w-16 shrink-0">
            {user.photoUrl ? (
              <img
                src={user.photoUrl}
                alt={user.name}
                className="h-16 w-16 rounded-full object-cover"
              />
            ) : (
              <AvatarFallback className="text-lg">
                <User className="h-8 w-8" aria-hidden="true" />
              </AvatarFallback>
            )}
          </Avatar>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h2 className="text-2xl font-bold truncate">{user.name}</h2>
                {user.headline && (
                  <p className="mt-0.5 text-muted-foreground">{user.headline}</p>
                )}
              </div>
              <Badge
                variant={user.subscriptionStatus === "active" ? "default" : "secondary"}
                className="capitalize shrink-0"
              >
                {user.subscriptionStatus === "active" ? (
                  <>
                    <Star className="mr-1 h-3 w-3" aria-hidden="true" />
                    Pro
                  </>
                ) : (
                  "Free"
                )}
              </Badge>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
              {user.location && (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  {user.location}
                </span>
              )}
              <span className="inline-flex items-center gap-1">
                <Mail className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                {user.email}
              </span>
              {memberSince && (
                <span className="inline-flex items-center gap-1">
                  <Calendar className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  Member since {memberSince}
                </span>
              )}
            </div>
          </div>
        </div>
      </Card>

      {/* Skills */}
      <Card className="p-6">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Briefcase className="h-5 w-5" aria-hidden="true" />
          Skills
        </h2>
        {skills.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {skills.map((skill) => (
              <Badge key={skill} variant="secondary">
                {skill}
              </Badge>
            ))}
          </div>
        ) : (
          <div className="mt-3 rounded-md border border-dashed p-4 text-center">
            <p className="text-sm text-muted-foreground">
              No skills added yet.
            </p>
            <Link href="/settings" className="mt-2 inline-block">
              <Button variant="outline" size="sm" className="gap-1.5 mt-2">
                <Settings className="h-3.5 w-3.5" aria-hidden="true" />
                Add Skills in Settings
              </Button>
            </Link>
          </div>
        )}
      </Card>

      {/* Preferences */}
      {Object.keys(prefs).length > 0 && (
        <Card className="p-6">
          <h2 className="text-lg font-semibold">Job Preferences</h2>
          <div className="mt-3 grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
            {prefs.jobType ? (
              <div>
                <p className="text-xs text-muted-foreground">Job Type</p>
                <p className="font-medium capitalize">
                  {(prefs.jobType as string[]).join(", ")}
                </p>
              </div>
            ) : null}
            {prefs.roleLevel ? (
              <div>
                <p className="text-xs text-muted-foreground">Role Level</p>
                <p className="font-medium capitalize">
                  {String(prefs.roleLevel)}
                </p>
              </div>
            ) : null}
            {prefs.salaryMin || prefs.salaryMax ? (
              <div>
                <p className="text-xs text-muted-foreground">Salary Range</p>
                <p className="font-medium">
                  {prefs.salaryMin ? `$${(prefs.salaryMin as number).toLocaleString()}` : "Any"}
                  {" - "}
                  {prefs.salaryMax ? `$${(prefs.salaryMax as number).toLocaleString()}` : "Any"}
                </p>
              </div>
            ) : null}
            {prefs.remotePreference ? (
              <div>
                <p className="text-xs text-muted-foreground">Remote Preference</p>
                <p className="font-medium capitalize">
                  {String(prefs.remotePreference)}
                </p>
              </div>
            ) : null}
            {prefs.locations && (prefs.locations as string[]).length > 0 ? (
              <div>
                <p className="text-xs text-muted-foreground">Locations</p>
                <p className="font-medium">
                  {(prefs.locations as string[]).join(", ")}
                </p>
              </div>
            ) : null}
            {prefs.companySize ? (
              <div>
                <p className="text-xs text-muted-foreground">Company Size</p>
                <p className="font-medium capitalize">
                  {String(prefs.companySize)}
                </p>
              </div>
            ) : null}
            {prefs.timeline ? (
              <div>
                <p className="text-xs text-muted-foreground">Timeline</p>
                <p className="font-medium capitalize">
                  {String(prefs.timeline)}
                </p>
              </div>
            ) : null}
          </div>
        </Card>
      )}

      {/* CV Upload */}
      <Card className="p-6">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <FileText className="h-5 w-5" aria-hidden="true" />
          Resume / CV
        </h2>
        <div className="mt-3">
          {user.cvParsedData ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 rounded-md border bg-muted/30 p-3">
                <FileText className="h-5 w-5 text-primary" aria-hidden="true" />
                <div className="flex-1">
                  <p className="text-sm font-medium">CV uploaded</p>
                  <p className="text-xs text-muted-foreground">
                    Skills and experience have been extracted
                  </p>
                </div>
              </div>
              <CVDropzone
                onUploadComplete={() => {
                  reloadProfile();
                }}
              />
            </div>
          ) : (
            <CVDropzone
              onUploadComplete={() => {
                window.location.reload();
              }}
            />
          )}
        </div>
      </Card>

      {/* Favorite Jobs */}
      <Card className="p-6">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Heart className="h-5 w-5" aria-hidden="true" />
            Favorite Jobs ({favorites.length})
          </h2>
          {favorites.length > 0 && (
            <Link href="/favorites">
              <Button variant="ghost" size="sm" className="text-xs">
                View All
              </Button>
            </Link>
          )}
        </div>
        {favorites.length > 0 ? (
          <div className="mt-3 space-y-2">
            {favorites.slice(0, 5).map((fav) => (
              <div
                key={fav.jobId}
                className="flex items-center justify-between rounded-md border p-3 transition-colors hover:bg-muted/30"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {fav.jobTitle ?? "Unknown Job"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {fav.companyName ?? "Unknown Company"}
                    {fav.createdAt && (
                      <> · Saved {timeAgo(fav.createdAt)}</>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-2 ml-2 shrink-0">
                  <Link
                    href={`/jobs/${fav.jobId}`}
                    className="text-muted-foreground transition-colors hover:text-foreground"
                    aria-label={`View ${fav.jobTitle ?? "job"} details`}
                  >
                    <ExternalLink className="h-4 w-4" aria-hidden="true" />
                  </Link>
                </div>
              </div>
            ))}
            {favorites.length > 5 && (
              <p className="pt-1 text-center text-xs text-muted-foreground">
                +{favorites.length - 5} more favorites
              </p>
            )}
          </div>
        ) : (
          <div className="mt-3 rounded-md border border-dashed p-4 text-center">
            <Heart className="mx-auto h-8 w-8 text-muted-foreground/30" aria-hidden="true" />
            <p className="mt-2 text-sm text-muted-foreground">
              No favorite jobs yet.
            </p>
            <p className="text-xs text-muted-foreground/70">
              Use the chat to search for jobs and click the heart icon to save them.
            </p>
          </div>
        )}
      </Card>

      {/* Applications */}
      <Card className="p-6">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Briefcase className="h-5 w-5" aria-hidden="true" />
            Applications ({applications.length})
          </h2>
          {applications.length > 0 && (
            <Link href="/applications">
              <Button variant="ghost" size="sm" className="text-xs">
                View All
              </Button>
            </Link>
          )}
        </div>
        {applications.length > 0 ? (
          <div className="mt-3 space-y-2">
            {applications.slice(0, 5).map((app) => (
              <div
                key={app.jobId}
                className="flex items-center justify-between rounded-md border p-3 transition-colors hover:bg-muted/30"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {app.jobTitle ?? "Unknown Job"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {app.companyName ?? "Unknown Company"}
                    {app.appliedAt && (
                      <> · Applied {timeAgo(app.appliedAt)}</>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-2 ml-2 shrink-0">
                  <Badge variant="outline" className="capitalize text-xs">
                    {app.status}
                  </Badge>
                  <Link
                    href={`/jobs/${app.jobId}`}
                    className="text-muted-foreground transition-colors hover:text-foreground"
                    aria-label={`View ${app.jobTitle ?? "job"} details`}
                  >
                    <ExternalLink className="h-4 w-4" aria-hidden="true" />
                  </Link>
                </div>
              </div>
            ))}
            {applications.length > 5 && (
              <p className="pt-1 text-center text-xs text-muted-foreground">
                +{applications.length - 5} more applications
              </p>
            )}
          </div>
        ) : (
          <div className="mt-3 rounded-md border border-dashed p-4 text-center">
            <Briefcase className="mx-auto h-8 w-8 text-muted-foreground/30" aria-hidden="true" />
            <p className="mt-2 text-sm text-muted-foreground">
              No applications yet.
            </p>
            <p className="text-xs text-muted-foreground/70">
              Use the chat to apply for jobs and track them here.
            </p>
          </div>
        )}
      </Card>

      <ScrollToTop containerRef={scrollRef} />
    </div>
  );
}
