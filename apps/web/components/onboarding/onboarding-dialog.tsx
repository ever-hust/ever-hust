"use client";

import { useState, useCallback, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/dialog";
import { Button } from "@repo/ui/button";
import { Badge } from "@repo/ui/badge";
import { Input } from "@repo/ui/input";
import { Label } from "@repo/ui/label";
import {
  Sparkles,
  MapPin,
  Briefcase,
  ArrowRight,
  ArrowLeft,
  Check,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";

interface OnboardingDialogProps {
  open: boolean;
  onComplete: () => void;
  userName?: string;
}

const COMMON_SKILLS = [
  "JavaScript",
  "TypeScript",
  "React",
  "Next.js",
  "Node.js",
  "Python",
  "Java",
  "Go",
  "Rust",
  "SQL",
  "AWS",
  "Docker",
  "Kubernetes",
  "Machine Learning",
  "Data Science",
  "DevOps",
  "Product Management",
  "UI/UX Design",
  "Figma",
  "GraphQL",
];

const JOB_LEVELS = [
  "Intern",
  "Junior",
  "Mid-Level",
  "Senior",
  "Staff",
  "Lead",
  "Principal",
  "Manager",
  "Director",
  "VP",
  "C-Level",
];

export function OnboardingDialog({
  open,
  onComplete,
  userName,
}: OnboardingDialogProps) {
  const [step, setStep] = useState(0);
  const [headline, setHeadline] = useState("");
  const [location, setLocation] = useState("");
  const [selectedSkills, setSelectedSkills] = useState<Set<string>>(new Set());
  const [customSkill, setCustomSkill] = useState("");
  const [selectedLevel, setSelectedLevel] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const toggleSkill = useCallback((skill: string) => {
    setSelectedSkills((prev) => {
      const next = new Set(prev);
      if (next.has(skill)) {
        next.delete(skill);
      } else {
        next.add(skill);
      }
      return next;
    });
  }, []);

  const addCustomSkill = useCallback(() => {
    // Strip HTML tags to prevent stored XSS, then trim whitespace
    const sanitized = customSkill.replace(/<[^>]*>/g, "").trim();
    // Only allow reasonable characters: letters, numbers, spaces, hyphens,
    // dots, plus, sharp/hash, and slashes (e.g. "C++", "C#", "CI/CD", "Node.js")
    const isValid = /^[\p{L}\p{N}\s\-.+#/]+$/u.test(sanitized);
    if (sanitized && sanitized.length <= 100 && isValid) {
      setSelectedSkills((prev) => new Set(prev).add(sanitized));
      setCustomSkill("");
    }
  }, [customSkill]);

  const handleComplete = useCallback(async () => {
    setIsSubmitting(true);
    try {
      // Save profile data
      const profileRes = await fetch("/api/user/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          headline: headline || undefined,
          location: location || undefined,
          skills: selectedSkills.size > 0 ? Array.from(selectedSkills) : undefined,
          onboardingCompleted: true,
        }),
      });
      if (!profileRes.ok) throw new Error("Failed to save profile");

      // Save experience level to user preferences (roleLevel field)
      if (selectedLevel) {
        const settingsRes = await fetch("/api/user/settings", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            preferences: { roleLevel: [selectedLevel] },
          }),
        });
        if (!settingsRes.ok) throw new Error("Failed to save preferences");
      }
      toast.success("Profile set up! Let's find your dream job.");
    } catch {
      // Non-blocking — user can still proceed
      toast.error("Couldn't save all preferences, but you can update them in Settings.");
    }
    setIsSubmitting(false);
    onComplete();
  }, [headline, location, selectedSkills, selectedLevel, onComplete]);

  // Memoize the steps array so it's only rebuilt when its dependencies change,
  // not on every render (e.g. when `step` changes).
  const steps = useMemo(() => [
    // Step 0: Welcome
    <div key="welcome" className="flex flex-col items-center text-center py-4">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 mb-4">
        <Sparkles className="h-7 w-7 text-primary" aria-hidden="true" />
      </div>
      <h3 className="text-xl font-semibold mb-2">
        Welcome{userName ? `, ${userName}` : ""}! 👋
      </h3>
      <p className="text-sm text-muted-foreground max-w-sm">
        Let&apos;s set up your profile so our AI can find the best jobs for you.
        This takes about 30 seconds.
      </p>
    </div>,

    // Step 1: Role & Location
    <div key="role" className="space-y-5 py-2">
      <div className="flex items-center gap-2 mb-1">
        <Briefcase className="h-5 w-5 text-primary" aria-hidden="true" />
        <h3 className="text-lg font-semibold">Your Role</h3>
      </div>
      <div className="space-y-3">
        <div>
          <Label htmlFor="headline">Job title or headline</Label>
          <Input
            id="headline"
            placeholder="e.g. Senior Software Engineer"
            value={headline}
            onChange={(e) => setHeadline(e.target.value)}
            maxLength={500}
            className="mt-1"
          />
        </div>
        <div>
          <Label htmlFor="location">Preferred location</Label>
          <div className="flex items-center gap-2 mt-1">
            <MapPin className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden="true" />
            <Input
              id="location"
              placeholder="e.g. San Francisco, CA or Remote"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              maxLength={200}
            />
          </div>
        </div>
        <div>
          <Label>Experience level</Label>
          <div className="flex flex-wrap gap-2 mt-2" role="radiogroup" aria-label="Experience level">
            {JOB_LEVELS.map((level) => (
              <Badge
                key={level}
                role="radio"
                tabIndex={0}
                aria-checked={selectedLevel === level}
                variant={selectedLevel === level ? "default" : "outline"}
                className="cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                onClick={() =>
                  setSelectedLevel(selectedLevel === level ? null : level)
                }
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setSelectedLevel(selectedLevel === level ? null : level);
                  }
                }}
              >
                {level}
              </Badge>
            ))}
          </div>
        </div>
      </div>
    </div>,

    // Step 2: Skills
    <div key="skills" className="space-y-4 py-2">
      <div>
        <h3 className="text-lg font-semibold">Your Skills</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Select the skills that match your expertise. You can always update these later.
        </p>
      </div>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Skills">
        {COMMON_SKILLS.map((skill) => (
          <Badge
            key={skill}
            role="checkbox"
            tabIndex={0}
            aria-checked={selectedSkills.has(skill)}
            variant={selectedSkills.has(skill) ? "default" : "outline"}
            className="cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            onClick={() => toggleSkill(skill)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                toggleSkill(skill);
              }
            }}
          >
            {selectedSkills.has(skill) && (
              <Check className="mr-1 h-3 w-3" aria-hidden="true" />
            )}
            {skill}
          </Badge>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <Input
          aria-label="Add a custom skill"
          placeholder="Add a custom skill..."
          value={customSkill}
          onChange={(e) => setCustomSkill(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addCustomSkill()}
          maxLength={100}
          className="flex-1"
        />
        <Button size="sm" variant="outline" onClick={addCustomSkill} disabled={!customSkill.trim()}>
          Add
        </Button>
      </div>
      {selectedSkills.size > 0 && (
        <p className="text-xs text-muted-foreground">
          {selectedSkills.size} skill{selectedSkills.size !== 1 ? "s" : ""} selected
        </p>
      )}
    </div>,
  ], [userName, headline, location, selectedSkills, customSkill, selectedLevel, toggleSkill, addCustomSkill]);

  const isLastStep = step === steps.length - 1;

  return (
    <Dialog open={open}>
      <DialogContent
        className="sm:max-w-[480px]"
        hideClose
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="sr-only">Profile Setup</DialogTitle>
          <DialogDescription className="sr-only">
            Set up your profile for better job recommendations
          </DialogDescription>
          {/* Progress bar + step label */}
          <div className="space-y-1.5 pt-1">
            <div className="flex items-center justify-between text-[10px] text-muted-foreground" aria-live="polite">
              <span>Step {step + 1} of {steps.length}</span>
              <span>
                {step === 0 ? "Welcome" : step === 1 ? "About you" : "Skills"}
              </span>
            </div>
            <div className="h-1 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={step + 1} aria-valuemin={1} aria-valuemax={steps.length} aria-label="Setup progress">
              <div
                className="h-full rounded-full bg-primary transition-all duration-500 ease-out"
                style={{ width: `${((step + 1) / steps.length) * 100}%` }}
              />
            </div>
          </div>
        </DialogHeader>

        {steps[step]}

        <div className="flex items-center justify-between pt-2">
          {step > 0 ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setStep(step - 1)}
              disabled={isSubmitting}
            >
              <ArrowLeft className="mr-1 h-4 w-4" aria-hidden="true" />
              Back
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleComplete}
              disabled={isSubmitting}
              className="text-muted-foreground"
            >
              Skip
            </Button>
          )}

          {isLastStep ? (
            <Button
              onClick={handleComplete}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden="true" />
                  Saving...
                </>
              ) : (
                <>
                  Get Started
                  <Sparkles className="ml-1 h-4 w-4" aria-hidden="true" />
                </>
              )}
            </Button>
          ) : (
            <Button onClick={() => setStep(step + 1)}>
              Continue
              <ArrowRight className="ml-1 h-4 w-4" aria-hidden="true" />
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
