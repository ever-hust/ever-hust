"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { OrgAiConfigCard } from "@/components/settings/org-ai-config-card";
import { apiFetch } from "@/lib/api-client";

interface OrgListResponse {
  organizations: {
    organization: {
      id: number;
      name: string;
    };
    role: string;
  }[];
}

export default function AdminAiConfigPage() {
  const [orgId, setOrgId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadOrg() {
      // Fetch the first organization the admin belongs to
      const data = await apiFetch<OrgListResponse>("/api/organizations", {
        showToast: false,
      });

      const firstOrg = data?.organizations?.[0];
      if (firstOrg?.organization?.id) {
        setOrgId(firstOrg.organization.id);
      }
      setLoading(false);
    }
    loadOrg();
  }, []);

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          AI Configuration
        </h1>
        <p className="text-muted-foreground">
          Configure the default AI model, system prompt, and behavior settings
          for your organization.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-12">
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
          <span className="text-sm text-muted-foreground">Loading...</span>
        </div>
      ) : orgId ? (
        <OrgAiConfigCard orgId={orgId} />
      ) : (
        <div className="rounded-md border border-dashed p-8 text-center">
          <p className="text-sm text-muted-foreground">
            No organization found. Create an organization first to configure AI
            settings.
          </p>
        </div>
      )}
    </div>
  );
}
