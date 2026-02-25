"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  MapPin,
  Mail,
  Briefcase,
  FileText,
  Star,
  User,
  Settings,
  Calendar,
  Plus,
  X,
} from "lucide-react";
import { Badge } from "@ever-hust/ui/badge";
import { Button } from "@ever-hust/ui/button";
import { Card } from "@ever-hust/ui/card";
import { Skeleton } from "@ever-hust/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@ever-hust/ui/avatar";
import dynamic from "next/dynamic";

const UppyCvUpload = dynamic(
  () =>
    import("@/components/shared/uppy-cv-upload").then((mod) => mod.UppyCvUpload),
  { ssr: false }
);
const UppyAvatarUpload = dynamic(
  () =>
    import("@/components/shared/uppy-avatar-upload").then((mod) => mod.UppyAvatarUpload),
  { ssr: false }
);
import { ScrollToTop } from "@/components/shared/scroll-to-top";
import { ErrorState } from "@/components/shared/error-state";
import { PageHeader } from "@/components/shared/page-header";
import { safeExternalUrl } from "@/lib/safe-url";
import { toast } from "sonner";
import type { UserPreferences } from "@/lib/api-schemas";

interface UserProfile {
  id: string;
  name: string;
  email: string;
  headline: string | null;
  location: string | null;
  photoUrl: string | null;
  skills: string[] | null;
  experience: unknown;
  preferences: UserPreferences | null;
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
  id: number;
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
  const [retryKey, setRetryKey] = useState(0);

  const reloadProfile = useCallback(() => {
    router.refresh();
    setRetryKey((k) => k + 1);
  }, [router]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setData(null);
    async function loadProfile() {
      try {
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
  }, [retryKey]);

  if (loading) {
    return (
      <div className="flex flex-1 flex-col overflow-hidden">
        <div
          className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6"
          aria-busy="true"
          aria-label="Loading profile"
          role="status"
        >
          <Skeleton className="h-40 w-full rounded-lg" />
          <Skeleton className="h-32 w-full rounded-lg" />
          <Skeleton className="h-32 w-full rounded-lg" />
          <span className="sr-only">Loading your profile...</span>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="flex flex-1 items-center justify-center">
          <ErrorState
            message={error ?? "Failed to load profile"}
            onRetry={reloadProfile}
          />
        </div>
      </div>
    );
  }

  const { user } = data;
  const skills = user.skills ?? [];
  const prefs: UserPreferences = user.preferences ?? {};
  const safePhoto = safeExternalUrl(user.photoUrl);
  const memberSince = user.createdAt
    ? new Date(user.createdAt).toLocaleDateString(undefined, {
        month: "long",
        year: "numeric",
      })
    : null;

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <PageHeader
        icon={User}
        title="Profile"
        actions={
          <Button variant="outline" size="sm" className="gap-1.5" asChild>
            <Link href="/settings">
              <Settings className="h-3.5 w-3.5" aria-hidden="true" />
              Edit Profile
            </Link>
          </Button>
        }
      />

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
      {/* Header Card */}
      <Card className="p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          <div className="group/avatar relative h-16 w-16 shrink-0">
            <Avatar className="h-16 w-16">
              {safePhoto ? (
                <AvatarImage
                  src={safePhoto}
                  alt={user.name || "User profile photo"}
                />
              ) : null}
              <AvatarFallback className="text-lg">
                <User className="h-8 w-8" aria-hidden="true" />
              </AvatarFallback>
            </Avatar>
            <UppyAvatarUpload onUploadComplete={() => reloadProfile()} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h2 className="text-2xl font-bold truncate">{user.name}</h2>
                {user.headline && (
                  <p className="mt-0.5 text-muted-foreground">{user.headline}</p>
                )}
              </div>
              <Badge
                variant={user.subscriptionStatus === "active" || user.subscriptionStatus === "past_due" ? "default" : "secondary"}
                className="capitalize shrink-0"
              >
                {user.subscriptionStatus === "active" || user.subscriptionStatus === "past_due" ? (
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
      <SkillsEditor initialSkills={skills} />

      {/* Preferences — only show if user has displayable job-search preferences */}
      {(prefs.jobTypes?.length || prefs.roleLevel?.length || prefs.salaryMin || prefs.salaryMax || prefs.remotePreference || prefs.locations?.length || prefs.companySizes?.length || prefs.timeline) && (
        <Card className="p-6">
          <h2 className="text-lg font-semibold">Job Preferences</h2>
          <div className="mt-3 grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
            {prefs.jobTypes && prefs.jobTypes.length > 0 ? (
              <div>
                <p className="text-xs text-muted-foreground">Job Type</p>
                <p className="font-medium capitalize">
                  {prefs.jobTypes.join(", ")}
                </p>
              </div>
            ) : null}
            {prefs.roleLevel && prefs.roleLevel.length > 0 ? (
              <div>
                <p className="text-xs text-muted-foreground">Role Level</p>
                <p className="font-medium capitalize">
                  {prefs.roleLevel.join(", ")}
                </p>
              </div>
            ) : null}
            {prefs.salaryMin || prefs.salaryMax ? (
              <div>
                <p className="text-xs text-muted-foreground">Salary Range</p>
                <p className="font-medium">
                  {prefs.salaryMin ? `$${prefs.salaryMin.toLocaleString()}` : "Any"}
                  {" - "}
                  {prefs.salaryMax ? `$${prefs.salaryMax.toLocaleString()}` : "Any"}
                </p>
              </div>
            ) : null}
            {prefs.remotePreference ? (
              <div>
                <p className="text-xs text-muted-foreground">Remote Preference</p>
                <p className="font-medium capitalize">
                  {prefs.remotePreference}
                </p>
              </div>
            ) : null}
            {prefs.locations && prefs.locations.length > 0 ? (
              <div>
                <p className="text-xs text-muted-foreground">Locations</p>
                <p className="font-medium">
                  {prefs.locations.join(", ")}
                </p>
              </div>
            ) : null}
            {prefs.companySizes && prefs.companySizes.length > 0 ? (
              <div>
                <p className="text-xs text-muted-foreground">Company Size</p>
                <p className="font-medium capitalize">
                  {prefs.companySizes.join(", ")}
                </p>
              </div>
            ) : null}
            {prefs.timeline ? (
              <div>
                <p className="text-xs text-muted-foreground">Timeline</p>
                <p className="font-medium capitalize">
                  {prefs.timeline}
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
              <UppyCvUpload
                onUploadComplete={() => {
                  reloadProfile();
                }}
              />
            </div>
          ) : (
            <UppyCvUpload
              onUploadComplete={() => {
                reloadProfile();
              }}
            />
          )}
        </div>
      </Card>

      <ScrollToTop containerRef={scrollRef} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Skills editor sub-component
// ---------------------------------------------------------------------------

function SkillsEditor({ initialSkills }: { initialSkills: string[] }) {
  const [skills, setSkills] = useState<string[]>(initialSkills);
  const [newSkill, setNewSkill] = useState("");
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const saveSkills = useCallback(async (updatedSkills: string[]) => {
    setSaving(true);
    try {
      const res = await fetch("/api/user/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skills: updatedSkills }),
      });
      if (!res.ok) {
        toast.error("Failed to save skills");
        return false;
      }
      toast.success("Skills updated");
      return true;
    } catch {
      toast.error("Failed to save skills");
      return false;
    } finally {
      setSaving(false);
    }
  }, []);

  const addSkill = useCallback(async () => {
    const trimmed = newSkill.trim();
    if (!trimmed || skills.includes(trimmed)) {
      setNewSkill("");
      return;
    }
    const updated = [...skills, trimmed];
    const ok = await saveSkills(updated);
    if (ok) {
      setSkills(updated);
      setNewSkill("");
      inputRef.current?.focus();
    }
  }, [newSkill, skills, saveSkills]);

  const removeSkill = useCallback(
    async (skill: string) => {
      const updated = skills.filter((s) => s !== skill);
      const ok = await saveSkills(updated);
      if (ok) setSkills(updated);
    },
    [skills, saveSkills]
  );

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Briefcase className="h-5 w-5" aria-hidden="true" />
          Skills
        </h2>
        <Button
          variant="ghost"
          size="sm"
          className="text-xs"
          onClick={() => {
            setEditing((e) => !e);
            if (!editing) {
              requestAnimationFrame(() => inputRef.current?.focus());
            }
          }}
        >
          {editing ? "Done" : "Edit"}
        </Button>
      </div>

      {skills.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {skills.map((skill, i) => (
            <Badge
              key={`${skill}-${i}`}
              variant="secondary"
              className={editing ? "pr-1" : ""}
            >
              {skill}
              {editing && (
                <button
                  type="button"
                  onClick={() => removeSkill(skill)}
                  disabled={saving}
                  className="ml-1 rounded-full p-0.5 hover:bg-destructive/20 hover:text-destructive transition-colors"
                  aria-label={`Remove ${skill}`}
                >
                  <X className="h-3 w-3" aria-hidden="true" />
                </button>
              )}
            </Badge>
          ))}
        </div>
      ) : (
        <div className="mt-3 rounded-md border border-dashed p-4 text-center">
          <p className="text-sm text-muted-foreground">
            No skills added yet. Click Edit to add skills.
          </p>
        </div>
      )}

      {editing && (
        <div className="mt-3 flex gap-2">
          <input
            ref={inputRef}
            type="text"
            value={newSkill}
            onChange={(e) => setNewSkill(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addSkill();
              }
            }}
            placeholder="Type a skill and press Enter"
            disabled={saving}
            className="flex-1 rounded-md border bg-background px-3 py-1.5 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
          />
          <Button
            size="sm"
            variant="outline"
            onClick={addSkill}
            disabled={saving || !newSkill.trim()}
            className="gap-1"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            Add
          </Button>
        </div>
      )}
    </Card>
  );
}
