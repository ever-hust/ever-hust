"use client";

import { useState, useCallback, useMemo } from "react";
import { Button } from "@ever-hust/ui/button";
import { Badge } from "@ever-hust/ui/badge";
import { Input } from "@ever-hust/ui/input";
import { Label } from "@ever-hust/ui/label";
import { Card } from "@ever-hust/ui/card";
import {
  Sparkles,
  MapPin,
  Briefcase,
  ArrowRight,
  ArrowLeft,
  Check,
  Loader2,
  Linkedin,
} from "lucide-react";
import { linkSocial } from "@ever-hust/auth/client";
import { toast } from "sonner";

/* ------------------------------------------------------------------ */
/*  Constants                                                         */
/* ------------------------------------------------------------------ */

const COMMON_SKILLS = [
  "JavaScript", "TypeScript", "React", "Next.js", "Node.js",
  "Python", "Java", "Go", "Rust", "SQL",
  "AWS", "Docker", "Kubernetes", "Machine Learning",
  "Data Science", "DevOps", "Product Management",
  "UI/UX Design", "Figma", "GraphQL",
];

const JOB_LEVELS = [
  "Intern", "Junior", "Mid-Level", "Senior", "Staff",
  "Lead", "Principal", "Manager", "Director", "VP", "C-Level",
];

const STEP_LABELS = ["Welcome", "Connect LinkedIn", "About you", "Skills"];

/* ------------------------------------------------------------------ */
/*  Props                                                             */
/* ------------------------------------------------------------------ */

interface OnboardingWizardProps {
  userName?: string;
  linkedInConnected: boolean;
  onComplete: () => void;
}

/* ------------------------------------------------------------------ */
/*  Component                                                         */
/* ------------------------------------------------------------------ */

export function OnboardingWizard({
  userName,
  linkedInConnected,
  onComplete,
}: OnboardingWizardProps) {
  const [step, setStep] = useState(0);
  const [headline, setHeadline] = useState("");
  const [location, setLocation] = useState("");
  const [selectedSkills, setSelectedSkills] = useState<Set<string>>(new Set());
  const [customSkill, setCustomSkill] = useState("");
  const [selectedLevel, setSelectedLevel] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLinkingLinkedIn, setIsLinkingLinkedIn] = useState(false);
  const totalSteps = STEP_LABELS.length;

  /* ---- helpers ---- */

  const toggleSkill = useCallback((skill: string) => {
    setSelectedSkills((prev) => {
      const next = new Set(prev);
      if (next.has(skill)) next.delete(skill);
      else next.add(skill);
      return next;
    });
  }, []);

  const addCustomSkill = useCallback(() => {
    const sanitized = customSkill.replace(/<[^>]*>/g, "").trim();
    const isValid = /^[\p{L}\p{N}\s\-.+#/]+$/u.test(sanitized);
    if (sanitized && sanitized.length <= 100 && isValid) {
      setSelectedSkills((prev) => new Set(prev).add(sanitized));
      setCustomSkill("");
    }
  }, [customSkill]);

  const handleConnectLinkedIn = useCallback(async () => {
    setIsLinkingLinkedIn(true);
    try {
      await linkSocial({ provider: "linkedin", callbackURL: "/dashboard" });
    } catch {
      toast.error("Failed to connect LinkedIn. Please try again.");
      setIsLinkingLinkedIn(false);
    }
  }, []);

  /** Save profile + preferences, then mark onboarding complete. */
  const handleFinish = useCallback(async () => {
    setIsSubmitting(true);
    try {
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

      if (selectedLevel) {
        const settingsRes = await fetch("/api/user/settings", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ preferences: { roleLevel: [selectedLevel] } }),
        });
        if (!settingsRes.ok) throw new Error("Failed to save preferences");
      }
      toast.success("Profile set up! Let's find your dream job.");
    } catch {
      toast.error("Couldn't save all preferences, but you can update them in Settings.");
    }
    setIsSubmitting(false);
    onComplete();
  }, [headline, location, selectedSkills, selectedLevel, onComplete]);

  /** Skip = mark completed without saving form data. */
  const handleSkip = useCallback(async () => {
    setIsSubmitting(true);
    try {
      await fetch("/api/user/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ onboardingCompleted: true }),
      });
    } catch {
      /* non-blocking */
    }
    setIsSubmitting(false);
    onComplete();
  }, [onComplete]);

  /* ---- step content ---- */

  const steps = useMemo(
    () => [
      /* ── Step 0 : Welcome ────────────────────────────── */
      <div key="welcome" className="flex flex-col items-center text-center py-8">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 mb-5">
          <Sparkles className="h-8 w-8 text-primary" aria-hidden="true" />
        </div>
        <h2 className="text-2xl font-bold mb-2">
          Welcome{userName ? `, ${userName}` : ""}! 👋
        </h2>
        <p className="text-muted-foreground max-w-md">
          Let&apos;s set up your profile so our AI can find the best jobs for
          you. This takes about 30&nbsp;seconds.
        </p>
      </div>,

      /* ── Step 1 : Connect LinkedIn ───────────────────── */
      <div key="linkedin" className="space-y-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#0A66C2]/10">
            <Linkedin className="h-5 w-5 text-[#0A66C2]" aria-hidden="true" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">Connect LinkedIn</h2>
            <p className="text-sm text-muted-foreground">
              Import your profile for better job matches
            </p>
          </div>
        </div>

        <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
          <p className="text-sm font-medium">Why connect LinkedIn?</p>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li className="flex items-start gap-2">
              <Check className="h-4 w-4 mt-0.5 text-green-500 shrink-0" aria-hidden="true" />
              Auto-fill your headline, skills, and experience
            </li>
            <li className="flex items-start gap-2">
              <Check className="h-4 w-4 mt-0.5 text-green-500 shrink-0" aria-hidden="true" />
              Get more relevant job recommendations
            </li>
            <li className="flex items-start gap-2">
              <Check className="h-4 w-4 mt-0.5 text-green-500 shrink-0" aria-hidden="true" />
              Sign in easily with LinkedIn in the future
            </li>
          </ul>
        </div>

        {linkedInConnected ? (
          <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 p-3 dark:border-green-800 dark:bg-green-950/30">
            <Check className="h-5 w-5 text-green-600 dark:text-green-400" aria-hidden="true" />
            <span className="text-sm font-medium text-green-700 dark:text-green-300">
              LinkedIn connected!
            </span>
          </div>
        ) : (
          <Button
            size="lg"
            className="w-full gap-2 bg-[#0A66C2] hover:bg-[#004182] text-white"
            onClick={handleConnectLinkedIn}
            disabled={isLinkingLinkedIn}
          >
            {isLinkingLinkedIn ? (
              <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
            ) : (
              <Linkedin className="h-5 w-5" aria-hidden="true" />
            )}
            Connect LinkedIn
          </Button>
        )}

        <p className="text-center text-xs text-muted-foreground/70">
          You can always connect or disconnect accounts in Settings later.
        </p>
      </div>,

      /* ── Step 2 : Role & Location ────────────────────── */
      <div key="role" className="space-y-5 py-4">
        <div className="flex items-center gap-2 mb-1">
          <Briefcase className="h-5 w-5 text-primary" aria-hidden="true" />
          <h2 className="text-lg font-semibold">Your Role</h2>
        </div>
        <div className="space-y-4">
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
                  onClick={() => setSelectedLevel(selectedLevel === level ? null : level)}
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

      /* ── Step 3 : Skills ─────────────────────────────── */
      <div key="skills" className="space-y-4 py-4">
        <div>
          <h2 className="text-lg font-semibold">Your Skills</h2>
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
    ],
    [
      userName,
      linkedInConnected, isLinkingLinkedIn, handleConnectLinkedIn,
      headline, location, selectedLevel,
      selectedSkills, customSkill, toggleSkill, addCustomSkill,
    ],
  );

  const isLastStep = step === totalSteps - 1;

  /* ---- render ---- */

  return (
    <div className="flex flex-1 items-center justify-center overflow-y-auto p-4 sm:p-6">
      <Card className="w-full max-w-lg p-6 sm:p-8">
        {/* ── Progress bar ── */}
        <div className="space-y-1.5 mb-6">
          <div
            className="flex items-center justify-between text-[10px] text-muted-foreground"
            aria-live="polite"
          >
            <span>Step {step + 1} of {totalSteps}</span>
            <span>{STEP_LABELS[step]}</span>
          </div>
          <div
            className="h-1 overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-valuenow={Number(step + 1)}
            aria-valuemin={Number(1)}
            aria-valuemax={Number(totalSteps)}
            aria-label="Setup progress"
          >
            <div
              className="h-full rounded-full bg-primary transition-all duration-500 ease-out progress-fill"
              style={{ "--progress": `${((step + 1) / totalSteps) * 100}%` } as React.CSSProperties}
            />
          </div>
        </div>

        {/* ── Step content ── */}
        {steps[step]}

        {/* ── Navigation ── */}
        <div className="flex items-center justify-between pt-4 border-t mt-4">
          <div className="flex items-center gap-2">
            {step > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setStep(step - 1)}
                disabled={isSubmitting}
              >
                <ArrowLeft className="mr-1 h-4 w-4" aria-hidden="true" />
                Back
              </Button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleSkip}
              disabled={isSubmitting}
              className="text-muted-foreground"
            >
              Skip
            </Button>

            {isLastStep ? (
              <Button onClick={handleFinish} disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden="true" />
                    Saving…
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
        </div>
      </Card>
    </div>
  );
}
