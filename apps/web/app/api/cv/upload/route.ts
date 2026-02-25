import { NextResponse } from "next/server";
import {
  parseCV,
  SUPPORTED_CV_MIME_TYPES,
  SUPPORTED_CV_EXTENSIONS,
} from "@ever-hust/cv-parser";
import { db } from "@ever-hust/db";
import { users } from "@ever-hust/db";
import { eq } from "drizzle-orm";
import { requireSessionUser } from "../../../../lib/get-session-user";
import { applyRateLimit } from "../../../../lib/rate-limit";
import {
  apiSuccess,
  apiBadRequest,
  apiError,
} from "../../../../lib/api-response";
import { uploadFile } from "@ever-hust/supabase/storage";

/** Maximum file size: 10 MB */
const MAX_FILE_SIZE = 10 * 1024 * 1024;

/**
 * Map of file extensions to their human-readable format names.
 * Used for error messages.
 */
const EXTENSION_LABELS = "PDF, Word (.docx), or plain text (.txt)";

export async function POST(req: Request) {
  let user;
  try {
    user = await requireSessionUser();
  } catch (response) {
    return response as NextResponse;
  }
  const userId = user.id;

  // Rate limit: prevent abuse of file upload (uses authenticated tier)
  const rateLimited = applyRateLimit(userId, "authenticated");
  if (rateLimited) return rateLimited;

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch (err) {
    console.error("[api/cv/upload] Failed to parse form data:", err instanceof Error ? err.message : err);
    return apiBadRequest("Invalid multipart form data");
  }

  const fileEntry = formData.get("cv");
  if (!fileEntry || !(fileEntry instanceof File)) {
    return apiBadRequest("No file provided");
  }
  const file = fileEntry;

  // Validate file type (MIME)
  if (!SUPPORTED_CV_MIME_TYPES.has(file.type)) {
    return apiBadRequest(`Unsupported file type. Accepted: ${EXTENSION_LABELS}`);
  }

  // Validate file extension
  const fileName = file.name?.toLowerCase() ?? "";
  const ext = fileName.split(".").pop() ?? "";
  if (!fileName || !SUPPORTED_CV_EXTENSIONS.has(ext)) {
    return apiBadRequest(`File must have a supported extension: ${EXTENSION_LABELS}`);
  }

  // Validate file size
  if (file.size > MAX_FILE_SIZE) {
    return apiBadRequest("File must be under 10MB");
  }

  // Reject empty or suspiciously small files
  if (file.size < 10) {
    return apiBadRequest(
      "File appears to be empty or too small to be valid",
    );
  }

  try {
    // Read file buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Upload to Supabase Storage
    const storagePath = `cvs/${userId}/${fileName}`;
    const cvFileUrl = await uploadFile(storagePath, buffer, file.type);

    // Parse CV (pass MIME type for format-specific extraction)
    const parsed = await parseCV(buffer, file.type);

    // Store parsed data, file URL, and merge skills atomically
    const updateFields: Record<string, unknown> = {
      cvParsedData: parsed,
      cvFileUrl,
      updatedAt: new Date(),
    };

    // Merge CV skills with existing user skills
    if ((parsed.skills ?? []).length > 0) {
      const existingUser = await db
        .select({ skills: users.skills })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      const existingSkills = (existingUser[0]?.skills as string[]) ?? [];
      updateFields.skills = [
        ...new Set([...existingSkills, ...(parsed.skills ?? [])]),
      ];
    }

    await db
      .update(users)
      .set(updateFields)
      .where(eq(users.id, userId));

    return apiSuccess({
      parsed: {
        name: parsed.name,
        email: parsed.email,
        phone: parsed.phone,
        skills: parsed.skills ?? [],
        skillsCount: (parsed.skills ?? []).length,
        hasExperience: (parsed.experience ?? []).length > 0,
        hasEducation: (parsed.education ?? []).length > 0,
        textLength: parsed.rawText?.length ?? 0,
      },
      fileUrl: cvFileUrl,
    });
  } catch (error) {
    console.error(
      "[cv/upload] CV parsing error:",
      error instanceof Error ? error.message : error,
    );
    return apiError("Failed to parse CV. Please ensure the file is valid.");
  }
}
