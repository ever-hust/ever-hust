"use client";

import { useState, useMemo } from "react";
import Uppy from "@uppy/core";
import Dashboard from "@uppy/react/dashboard";
import XHR from "@uppy/xhr-upload";

import "@uppy/core/css/style.min.css";
import "@uppy/dashboard/css/style.min.css";

interface UppyCvUploadProps {
  onUploadComplete?: (result: UppyCvUploadResult) => void;
}

export interface UppyCvUploadResult {
  success: boolean;
  parsed?: {
    name: string | null;
    email: string | null;
    phone: string | null;
    skills: string[];
    skillsCount: number;
    hasExperience: boolean;
    hasEducation: boolean;
    textLength: number;
  };
  error?: string;
}

/**
 * Uppy-powered CV upload widget. Accepts a single PDF, Word (.docx), or TXT
 * file (max 10 MB), uploads to /api/cv/upload, and calls onUploadComplete
 * with the parsed result.
 */
export function UppyCvUpload({ onUploadComplete }: UppyCvUploadProps) {
  const [result, setResult] = useState<UppyCvUploadResult | null>(null);

  const uppy = useMemo(() => {
    const instance = new Uppy({
      id: "cv-upload",
      restrictions: {
        maxNumberOfFiles: 1,
        maxFileSize: 10 * 1024 * 1024, // 10 MB
        allowedFileTypes: [".pdf", ".docx", ".txt", "application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "text/plain"],
      },
      autoProceed: true,
    });

    instance.use(XHR, {
      endpoint: "/api/cv/upload",
      fieldName: "cv",
      formData: true,
      limit: 1,
    });

    instance.on("upload-success", (_file, response) => {
      const body = response.body as { parsed?: UppyCvUploadResult["parsed"] };
      const data: UppyCvUploadResult = { success: true, parsed: body.parsed };
      setResult(data);
      onUploadComplete?.(data);
    });

    instance.on("upload-error", (_file, _error, response) => {
      const body = response?.body as { error?: string } | undefined;
      const errMsg = body?.error ?? "Upload failed. Please try again.";
      setResult({ success: false, error: errMsg });
    });

    return instance;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Uppy instance is stable — intentionally created once

  return (
    <div className="uppy-cv-upload">
      {result?.success && (
        <div className="mb-3 rounded-md border border-green-500/30 bg-green-500/5 p-3 text-sm">
          <p className="font-medium text-green-700 dark:text-green-400">
            ✓ CV uploaded and parsed successfully
          </p>
          {result.parsed && (
            <p className="mt-1 text-xs text-muted-foreground">
              Found {result.parsed.skillsCount} skills
              {result.parsed.hasExperience ? " • Experience detected" : ""}
              {result.parsed.hasEducation ? " • Education detected" : ""}
            </p>
          )}
        </div>
      )}

      {result?.error && (
        <div className="mb-3 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {result.error}
        </div>
      )}

      <Dashboard
        uppy={uppy}
        proudlyDisplayPoweredByUppy={false}
        height={220}
        note="PDF, Word (.docx), or TXT — max 10 MB"
        locale={{
          strings: {
            dropPasteFiles: "Drop your CV here or %{browseFiles}",
            browseFiles: "browse",
          },
        }}
      />
    </div>
  );
}
