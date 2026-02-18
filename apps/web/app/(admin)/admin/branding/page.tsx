"use client";

import { BrandingSettingsCard } from "@/components/admin/branding-settings-card";

export default function AdminBrandingPage() {
  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Branding</h1>
        <p className="text-muted-foreground">
          Configure the platform&apos;s white-label branding and appearance.
        </p>
      </div>

      <BrandingSettingsCard />
    </div>
  );
}
