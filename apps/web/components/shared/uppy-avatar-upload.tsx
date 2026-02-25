"use client";

import { useState, useMemo, useCallback } from "react";
import Uppy from "@uppy/core";
import Dashboard from "@uppy/react/dashboard";
import XHR from "@uppy/xhr-upload";
import { Camera } from "lucide-react";

import "@uppy/core/css/style.min.css";
import "@uppy/dashboard/css/style.min.css";

interface UppyAvatarUploadProps {
  /** Called with the new public URL after a successful upload */
  onUploadComplete?: (url: string) => void;
}

/**
 * Uppy-powered avatar upload widget.
 * Accepts a single image (JPEG/PNG/WebP, max 5 MB),
 * uploads to /api/user/avatar, and returns the public URL.
 */
export function UppyAvatarUpload({ onUploadComplete }: UppyAvatarUploadProps) {
  const [showDashboard, setShowDashboard] = useState(false);

  const uppy = useMemo(() => {
    const instance = new Uppy({
      id: "avatar-upload",
      restrictions: {
        maxNumberOfFiles: 1,
        maxFileSize: 5 * 1024 * 1024, // 5 MB
        allowedFileTypes: ["image/jpeg", "image/png", "image/webp"],
      },
      autoProceed: true,
    });

    instance.use(XHR, {
      endpoint: "/api/user/avatar",
      fieldName: "avatar",
      formData: true,
      limit: 1,
    });

    return instance;
  }, []);

  const handleComplete = useCallback(() => {
    const files = uppy.getFiles();
    const successFile = files.find((f) => f.progress?.uploadComplete);
    if (successFile) {
      const response = successFile.response as { body?: { url?: string } } | undefined;
      const url = response?.body?.url;
      if (url) {
        onUploadComplete?.(url);
      }
    }
    setShowDashboard(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onUploadComplete]);

  // Register completion handler
  useMemo(() => {
    uppy.on("upload-success", () => handleComplete());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handleComplete]);

  if (!showDashboard) {
    return (
      <button
        type="button"
        onClick={() => setShowDashboard(true)}
        className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 opacity-0 transition-opacity group-hover/avatar:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label="Upload new profile photo"
      >
        <Camera className="h-5 w-5 text-white" />
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="relative w-full max-w-md rounded-lg bg-card p-4 shadow-2xl">
        <button
          type="button"
          onClick={() => setShowDashboard(false)}
          className="absolute right-3 top-3 z-10 rounded-md p-1 text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Close upload dialog"
        >
          ✕
        </button>
        <h3 className="mb-3 text-sm font-semibold">Upload Profile Photo</h3>
        <Dashboard
          uppy={uppy}
          proudlyDisplayPoweredByUppy={false}
          height={280}
          note="JPEG, PNG, or WebP — max 5 MB"
          locale={{
            strings: {
              dropPasteFiles: "Drop your photo here or %{browseFiles}",
              browseFiles: "browse",
            },
          }}
        />
      </div>
    </div>
  );
}
