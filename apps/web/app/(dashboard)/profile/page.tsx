"use client";

import { useEffect, useState } from "react";
import {
  MapPin,
  Mail,
  Briefcase,
  Heart,
  FileText,
  Star,
  ExternalLink,
  Upload,
  Loader2,
  User,
} from "lucide-react";
import { Badge } from "@repo/ui/badge";
import { Button } from "@repo/ui/button";
import { Card } from "@repo/ui/card";
import { Separator } from "@repo/ui/separator";
import { Skeleton } from "@repo/ui/skeleton";
import { Avatar, AvatarFallback } from "@repo/ui/avatar";
import { CVDropzone } from "@/components/canvas/cv-dropzone";

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

interface ProfileData {
  user: UserProfile;
  favorites: FavoriteJob[];
  applications: FavoriteJob[];
}

export default function ProfilePage() {
  const [data, setData] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadProfile() {
      try {
        const res = await fetch("/api/user/profile");
        if (res.ok) {
          setData(await res.json());
        }
      } catch {
        // Silently fail
      } finally {
        setLoading(false);
      }
    }
    loadProfile();
  }, []);

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl space-y-6 p-6">
        <Skeleton className="h-40 w-full rounded-lg" />
        <Skeleton className="h-32 w-full rounded-lg" />
        <Skeleton className="h-32 w-full rounded-lg" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-muted-foreground">Failed to load profile</p>
      </div>
    );
  }

  const { user, favorites, applications } = data;
  const skills = (user.skills as string[]) ?? [];
  const prefs = user.preferences ?? {};

  return (
    <div className="mx-auto max-w-3xl space-y-6 overflow-y-auto p-6">
      {/* Header Card */}
      <Card className="p-6">
        <div className="flex items-start gap-4">
          <Avatar className="h-16 w-16">
            {user.photoUrl ? (
              <img
                src={user.photoUrl}
                alt={user.name}
                className="h-16 w-16 rounded-full object-cover"
              />
            ) : (
              <AvatarFallback className="text-lg">
                <User className="h-8 w-8" />
              </AvatarFallback>
            )}
          </Avatar>
          <div className="flex-1">
            <h1 className="text-2xl font-bold">{user.name}</h1>
            {user.headline && (
              <p className="mt-0.5 text-muted-foreground">{user.headline}</p>
            )}
            <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
              {user.location && (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5" />
                  {user.location}
                </span>
              )}
              <span className="inline-flex items-center gap-1">
                <Mail className="h-3.5 w-3.5" />
                {user.email}
              </span>
            </div>
          </div>
          <Badge
            variant={user.subscriptionStatus === "active" ? "default" : "secondary"}
            className="capitalize"
          >
            {user.subscriptionStatus === "active" ? (
              <>
                <Star className="mr-1 h-3 w-3" />
                Pro
              </>
            ) : (
              "Free"
            )}
          </Badge>
        </div>
      </Card>

      {/* Skills */}
      {skills.length > 0 && (
        <Card className="p-6">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Briefcase className="h-5 w-5" />
            Skills
          </h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {skills.map((skill) => (
              <Badge key={skill} variant="secondary">
                {skill}
              </Badge>
            ))}
          </div>
        </Card>
      )}

      {/* Preferences */}
      {Object.keys(prefs).length > 0 && (
        <Card className="p-6">
          <h2 className="text-lg font-semibold">Job Preferences</h2>
          <div className="mt-3 grid grid-cols-2 gap-4 text-sm">
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
          <FileText className="h-5 w-5" />
          Resume / CV
        </h2>
        <div className="mt-3">
          {user.cvParsedData ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 rounded-md border bg-muted/30 p-3">
                <FileText className="h-5 w-5 text-primary" />
                <div className="flex-1">
                  <p className="text-sm font-medium">CV uploaded</p>
                  <p className="text-xs text-muted-foreground">
                    Skills and experience have been extracted
                  </p>
                </div>
              </div>
              <CVDropzone
                onUploadComplete={() => {
                  // Reload profile after upload
                  window.location.reload();
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
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Heart className="h-5 w-5" />
          Favorite Jobs ({favorites.length})
        </h2>
        {favorites.length > 0 ? (
          <div className="mt-3 space-y-2">
            {favorites.map((fav) => (
              <div
                key={fav.jobId}
                className="flex items-center justify-between rounded-md border p-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {fav.jobTitle ?? "Unknown Job"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {fav.companyName ?? "Unknown Company"}
                  </p>
                </div>
                {fav.jobUrl && (
                  <a
                    href={fav.jobUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ml-2 shrink-0"
                  >
                    <ExternalLink className="h-4 w-4 text-muted-foreground hover:text-foreground" />
                  </a>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">
            No favorite jobs yet. Use the chat to search for jobs and click the
            heart icon to save them.
          </p>
        )}
      </Card>
    </div>
  );
}
