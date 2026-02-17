"use client";

import { useState, useCallback, useRef } from "react";
import { Upload, FileText, Check, Loader2, X } from "lucide-react";
import { Button } from "@repo/ui/button";
import { cn } from "@repo/ui/lib/utils";

interface CVDropzoneProps {
  onUploadComplete?: (result: CVUploadResult) => void;
}

export interface CVUploadResult {
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

/** Maximum allowed file size for CV uploads (10 MB). */
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

export function CVDropzone({ onUploadComplete }: CVDropzoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<CVUploadResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUpload = useCallback(
    async (file: File) => {
      if (file.type !== "application/pdf") {
        const result = { success: false, error: "Only PDF files are supported" };
        setUploadResult(result);
        return;
      }

      if (file.size > MAX_FILE_SIZE_BYTES) {
        const result = { success: false, error: "File must be under 10MB" };
        setUploadResult(result);
        return;
      }

      setIsUploading(true);
      setUploadResult(null);

      try {
        const formData = new FormData();
        formData.append("cv", file);

        const res = await fetch("/api/cv/upload", {
          method: "POST",
          body: formData,
        });

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          const serverMsg = (body as { error?: string }).error;
          throw new Error(serverMsg ?? `Upload failed (${res.status})`);
        }

        const raw = await res.json();
        const data: CVUploadResult = { success: true, parsed: raw.parsed };
        setUploadResult(data);
        onUploadComplete?.(data);
      } catch (err) {
        const raw = err instanceof Error ? err.message : "Upload failed";
        // Distinguish network errors from server errors
        const isNetwork =
          raw.toLowerCase().includes("failed to fetch") ||
          raw.toLowerCase().includes("network");
        const message = isNetwork
          ? "Network error. Please check your connection."
          : raw;
        const result: CVUploadResult = { success: false, error: message };
        setUploadResult(result);
      } finally {
        setIsUploading(false);
      }
    },
    [onUploadComplete]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) handleUpload(file);
    },
    [handleUpload]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    // Only clear isDragging when the pointer leaves the dropzone entirely,
    // not when it moves into a child element (which fires dragLeave too).
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragging(false);
    }
  }, []);

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleUpload(file);
    },
    [handleUpload]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        fileInputRef.current?.click();
      }
    },
    []
  );

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label="Upload CV — drag and drop a PDF file or press Enter to browse"
      className={cn(
        "rounded-lg border-2 border-dashed p-6 text-center transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        isDragging
          ? "border-primary bg-primary/5"
          : uploadResult?.success
            ? "border-green-500/50 bg-green-500/5"
            : uploadResult?.error
              ? "border-destructive/50 bg-destructive/5"
              : "border-muted-foreground/25 hover:border-muted-foreground/50"
      )}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onKeyDown={handleKeyDown}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf"
        className="hidden"
        onChange={handleFileSelect}
        aria-label="Upload CV in PDF format"
      />

      {isUploading ? (
        <div className="flex flex-col items-center gap-2">
          <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">Parsing your CV...</p>
        </div>
      ) : uploadResult?.success ? (
        <div className="flex flex-col items-center gap-2">
          <Check className="h-8 w-8 text-green-500" aria-hidden="true" />
          <p className="text-sm font-medium">CV uploaded successfully!</p>
          {uploadResult.parsed && (
            <div className="mt-1 text-xs text-muted-foreground">
              <p>Found {uploadResult.parsed.skillsCount} skills</p>
              {uploadResult.parsed.hasExperience && <p>Experience detected</p>}
              {uploadResult.parsed.hasEducation && <p>Education detected</p>}
            </div>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="mt-2"
            onClick={() => {
              setUploadResult(null);
              fileInputRef.current?.click();
            }}
          >
            Upload a different CV
          </Button>
        </div>
      ) : uploadResult?.error ? (
        <div className="flex flex-col items-center gap-2">
          <X className="h-8 w-8 text-destructive" aria-hidden="true" />
          <p className="text-sm text-destructive">{uploadResult.error}</p>
          <Button
            variant="ghost"
            size="sm"
            className="mt-2"
            onClick={() => {
              setUploadResult(null);
              fileInputRef.current?.click();
            }}
          >
            Try again
          </Button>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-2">
          <div className="rounded-full bg-muted p-3">
            {isDragging ? (
              <FileText className="h-6 w-6 text-primary" aria-hidden="true" />
            ) : (
              <Upload className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
            )}
          </div>
          <div>
            <p className="text-sm font-medium">
              {isDragging ? "Drop your CV here" : "Upload your CV"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              PDF format, max 10MB
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="mt-2"
            onClick={() => fileInputRef.current?.click()}
          >
            Browse files
          </Button>
        </div>
      )}
    </div>
  );
}
