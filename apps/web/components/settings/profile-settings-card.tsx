"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { User, Check, Loader2 } from "lucide-react";
import { Button } from "@repo/ui/button";
import { Card } from "@repo/ui/card";
import { Input } from "@repo/ui/input";
import { toast } from "sonner";
import type { UserSettings } from "./types";

/** Duration to show the "Saved!" feedback (ms). */
const SAVED_FEEDBACK_MS = 2_000;

interface ProfileSettingsCardProps {
  user: UserSettings;
}

export function ProfileSettingsCard({ user }: ProfileSettingsCardProps) {
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [formName, setFormName] = useState(user.name ?? "");
  const [formHeadline, setFormHeadline] = useState(user.headline ?? "");
  const [formLocation, setFormLocation] = useState(user.location ?? "");
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    };
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/user/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formName.trim(),
          headline: formHeadline.trim(),
          location: formLocation.trim(),
        }),
      });
      if (res.ok) {
        setSaved(true);
        toast.success("Settings saved successfully");
        if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
        savedTimerRef.current = setTimeout(() => setSaved(false), SAVED_FEEDBACK_MS);
      } else {
        toast.error("Failed to save settings");
      }
    } catch {
      toast.error("Failed to save settings");
    } finally {
      setSaving(false);
    }
  }, [formName, formHeadline, formLocation]);

  return (
    <Card id="profile" className="p-6">
      <h2 className="flex items-center gap-2 text-lg font-semibold">
        <User className="h-5 w-5" aria-hidden="true" />
        Profile
      </h2>
      <div className="mt-4 space-y-4">
        {user.email && (
          <div>
            <label className="text-sm font-medium text-muted-foreground">
              Email
            </label>
            <p className="mt-1 text-sm">{user.email}</p>
          </div>
        )}
        <div>
          <label className="text-sm font-medium" htmlFor="name">
            Name
          </label>
          <Input
            id="name"
            value={formName}
            onChange={(e) => setFormName(e.target.value)}
            maxLength={200}
            className="mt-1"
          />
        </div>
        <div>
          <label className="text-sm font-medium" htmlFor="headline">
            Headline
          </label>
          <Input
            id="headline"
            value={formHeadline}
            onChange={(e) => setFormHeadline(e.target.value)}
            placeholder="e.g. Senior Software Engineer"
            maxLength={500}
            className="mt-1"
          />
        </div>
        <div>
          <label className="text-sm font-medium" htmlFor="location">
            Location
          </label>
          <Input
            id="location"
            value={formLocation}
            onChange={(e) => setFormLocation(e.target.value)}
            placeholder="e.g. San Francisco, CA"
            maxLength={200}
            className="mt-1"
          />
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={handleSave} disabled={saving}>
            {saving ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" />
            ) : saved ? (
              <Check className="mr-1.5 h-4 w-4" aria-hidden="true" />
            ) : null}
            {saved ? "Saved" : "Save Changes"}
          </Button>
        </div>
      </div>
    </Card>
  );
}
