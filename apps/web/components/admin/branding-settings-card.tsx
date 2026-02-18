"use client";

import { useState, useEffect, useCallback } from "react";
import { Palette, Loader2, Save } from "lucide-react";
import { Button } from "@repo/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@repo/ui/card";
import { Input } from "@repo/ui/input";
import { Label } from "@repo/ui/label";
import { Separator } from "@repo/ui/separator";
import { toast } from "sonner";

interface BrandingFormData {
  name: string;
  logoUrl: string;
  faviconUrl: string;
  primaryColor: string;
  accentColor: string;
  tagline: string;
  customFooterHtml: string;
  hideEverJobsBranding: boolean;
  customDomain: string;
}

const INITIAL_FORM: BrandingFormData = {
  name: "Ever Jobs",
  logoUrl: "",
  faviconUrl: "",
  primaryColor: "#3b82f6",
  accentColor: "#8b5cf6",
  tagline: "AI-Powered Job Search",
  customFooterHtml: "",
  hideEverJobsBranding: false,
  customDomain: "",
};

interface BrandingApiResponse {
  config: {
    id: number;
    name: string;
    logoUrl: string | null;
    faviconUrl: string | null;
    primaryColor: string | null;
    accentColor: string | null;
    tagline: string | null;
    customFooterHtml: string | null;
    hideEverJobsBranding: boolean;
    customDomain: string | null;
  } | null;
}

export function BrandingSettingsCard() {
  const [form, setForm] = useState<BrandingFormData>(INITIAL_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadConfig = useCallback(async (signal?: AbortSignal) => {
    try {
      const res = await fetch("/api/admin/branding", { signal });
      if (res.ok && !signal?.aborted) {
        const json = (await res.json()) as BrandingApiResponse;
        if (json.config) {
          setForm({
            name: json.config.name,
            logoUrl: json.config.logoUrl ?? "",
            faviconUrl: json.config.faviconUrl ?? "",
            primaryColor: json.config.primaryColor ?? "#3b82f6",
            accentColor: json.config.accentColor ?? "#8b5cf6",
            tagline: json.config.tagline ?? "",
            customFooterHtml: json.config.customFooterHtml ?? "",
            hideEverJobsBranding: json.config.hideEverJobsBranding,
            customDomain: json.config.customDomain ?? "",
          });
        }
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      console.error("Failed to load branding config:", err);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    loadConfig(controller.signal);
    return () => controller.abort();
  }, [loadConfig]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/branding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          logoUrl: form.logoUrl || null,
          faviconUrl: form.faviconUrl || null,
          primaryColor: form.primaryColor || null,
          accentColor: form.accentColor || null,
          tagline: form.tagline || null,
          customFooterHtml: form.customFooterHtml || null,
          hideEverJobsBranding: form.hideEverJobsBranding,
          customDomain: form.customDomain || null,
        }),
      });

      if (res.ok) {
        toast.success("Branding configuration saved");
      } else {
        const errorData = (await res.json()) as { error?: string };
        toast.error(errorData.error ?? "Failed to save branding configuration");
      }
    } catch {
      toast.error("Failed to save branding configuration");
    } finally {
      setSaving(false);
    }
  }, [form]);

  const updateField = useCallback(
    <K extends keyof BrandingFormData>(key: K, value: BrandingFormData[K]) => {
      setForm((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Palette className="h-5 w-5" aria-hidden="true" />
            Branding
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <Loader2
              className="h-6 w-6 animate-spin text-muted-foreground"
              aria-hidden="true"
            />
            <span className="sr-only">Loading branding configuration...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Palette className="h-5 w-5" aria-hidden="true" />
          Branding
        </CardTitle>
        <CardDescription>
          Customize the platform appearance. These settings apply as the default
          branding for all users.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Brand Name */}
          <div className="space-y-1.5">
            <Label htmlFor="brand-name">Brand Name</Label>
            <Input
              id="brand-name"
              value={form.name}
              onChange={(e) => updateField("name", e.target.value)}
              placeholder="Ever Jobs"
              maxLength={100}
            />
          </div>

          {/* Logo URL */}
          <div className="space-y-1.5">
            <Label htmlFor="logo-url">Logo URL</Label>
            <Input
              id="logo-url"
              type="url"
              value={form.logoUrl}
              onChange={(e) => updateField("logoUrl", e.target.value)}
              placeholder="https://example.com/logo.svg"
            />
          </div>

          {/* Favicon URL */}
          <div className="space-y-1.5">
            <Label htmlFor="favicon-url">Favicon URL</Label>
            <Input
              id="favicon-url"
              type="url"
              value={form.faviconUrl}
              onChange={(e) => updateField("faviconUrl", e.target.value)}
              placeholder="https://example.com/favicon.ico"
            />
          </div>

          <Separator />

          {/* Colors */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="primary-color">Primary Color</Label>
              <div className="flex gap-2">
                <input
                  id="primary-color"
                  type="color"
                  value={form.primaryColor}
                  onChange={(e) => updateField("primaryColor", e.target.value)}
                  className="h-9 w-12 cursor-pointer rounded border bg-transparent p-0.5"
                />
                <Input
                  value={form.primaryColor}
                  onChange={(e) => updateField("primaryColor", e.target.value)}
                  placeholder="#3b82f6"
                  maxLength={7}
                  className="font-mono text-sm"
                  aria-label="Primary color hex value"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="accent-color">Accent Color</Label>
              <div className="flex gap-2">
                <input
                  id="accent-color"
                  type="color"
                  value={form.accentColor}
                  onChange={(e) => updateField("accentColor", e.target.value)}
                  className="h-9 w-12 cursor-pointer rounded border bg-transparent p-0.5"
                />
                <Input
                  value={form.accentColor}
                  onChange={(e) => updateField("accentColor", e.target.value)}
                  placeholder="#8b5cf6"
                  maxLength={7}
                  className="font-mono text-sm"
                  aria-label="Accent color hex value"
                />
              </div>
            </div>
          </div>

          <Separator />

          {/* Tagline */}
          <div className="space-y-1.5">
            <Label htmlFor="tagline">Tagline</Label>
            <Input
              id="tagline"
              value={form.tagline}
              onChange={(e) => updateField("tagline", e.target.value)}
              placeholder="AI-Powered Job Search"
              maxLength={200}
            />
          </div>

          {/* Custom Footer HTML */}
          <div className="space-y-1.5">
            <Label htmlFor="custom-footer">Custom Footer HTML</Label>
            <textarea
              id="custom-footer"
              value={form.customFooterHtml}
              onChange={(e) => updateField("customFooterHtml", e.target.value)}
              placeholder="<p>Powered by Acme Corp</p>"
              maxLength={2000}
              rows={3}
              className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
            <p className="text-xs text-muted-foreground">
              HTML rendered in the footer area. Use with caution.
            </p>
          </div>

          {/* Custom Domain */}
          <div className="space-y-1.5">
            <Label htmlFor="custom-domain">Custom Domain</Label>
            <Input
              id="custom-domain"
              value={form.customDomain}
              onChange={(e) => updateField("customDomain", e.target.value)}
              placeholder="jobs.acme.com"
              maxLength={200}
            />
            <p className="text-xs text-muted-foreground">
              Point this domain to the platform via DNS CNAME to enable
              white-label access.
            </p>
          </div>

          <Separator />

          {/* Hide Ever Jobs Branding */}
          <div className="flex items-center gap-3">
            <input
              id="hide-branding"
              type="checkbox"
              checked={form.hideEverJobsBranding}
              onChange={(e) =>
                updateField("hideEverJobsBranding", e.target.checked)
              }
              className="h-4 w-4 rounded border-input"
            />
            <Label htmlFor="hide-branding" className="cursor-pointer">
              Hide Ever Jobs branding
            </Label>
          </div>

          <Separator />

          {/* Save Button */}
          <Button onClick={handleSave} disabled={saving || !form.name.trim()}>
            {saving ? (
              <Loader2
                className="mr-1.5 h-4 w-4 animate-spin"
                aria-hidden="true"
              />
            ) : (
              <Save className="mr-1.5 h-4 w-4" aria-hidden="true" />
            )}
            Save Branding
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
