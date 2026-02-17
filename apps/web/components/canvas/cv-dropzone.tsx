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
          throw new Error(`Upload failed (${res.status})`);
        }

        const data = (await res.json()) as CVUploadResult;
        setUploadResult(data);
        onUploadComplete?.(data);
      } catch (err) {
        const message =
          err instanceof Error && err.message.includes("fetch")
            ? "Network error. Please check your connection."
            : "Upload failed. Please try again.";
        const result = { success: false, error: message };
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

  const handleDragLeave = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleUpload(file);
    },
    [handleUpload]
  );

  return (
    <div
      className={cn(
        "rounded-lg border-2 border-dashed p-6 text-center transition-colors",
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
