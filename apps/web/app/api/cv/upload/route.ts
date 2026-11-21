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
import {
  deleteFile,
  storagePathFromPublicUrl,
  uploadFile,
} from "@ever-hust/supabase/storage";

/** Maximum file size: 10 MB */
const MAX_FILE_SIZE = 10 * 1024 * 1024;

/**
 * Map of file extensions to their human-readable format names.
 * Used for error messages.
 */
const EXTENSION_LABELS = "PDF, Word (.docx), or plain text (.txt)";

/**
 * Best-effort delete of a CV object. A failed delete only leaves an orphaned
 * object behind, so it never fails the request.
 */
async function removeCvObject(path: string): Promise<void> {
  try {
    await deleteFile(path);
  } catch (error) {
    console.warn(
      "[cv/upload] Failed to delete CV object:",
      path,
      error instanceof Error ? error.message : error,
    );
  }
}

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

  // Refuse path-like names. The name is never used as the storage key, but a
  // hand-made multipart filename such as "../x.pdf" is never a real upload.
  const rawName = file.name ?? "";
  if (rawName.includes("/") || rawName.includes("\\") || rawName.includes("..")) {
    return apiBadRequest("Invalid file name");
  }

  // Validate file extension
  const fileName = rawName.toLowerCase();
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

  // Every upload gets a new random key, so nothing is overwritten: the object
  // written here is deleted again when the request fails after the upload, and
  // the CV it replaces is deleted once the new URL is saved.
  let storagePath: string | null = null;
  try {
    // Read file buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Upload to Supabase Storage under a server-chosen name: the client's file
    // name must never reach the storage key (path traversal).
    storagePath = `cvs/${userId}/${crypto.randomUUID()}.${ext}`;
    const cvFileUrl = await uploadFile(storagePath, buffer, file.type);

    // Parse CV (pass MIME type for format-specific extraction)
    const parsed = await parseCV(buffer, file.type);

    // Store parsed data and file URL and merge skills under a lock on the user
    // row, so two uploads at once each see the other's URL and skills: the
    // URL read here is the one this upload replaces.
    const previousUrl = await db.transaction(async (tx) => {
      const [current] = await tx
        .select({ skills: users.skills, cvUrl: users.cvUrl })
        .from(users)
        .where(eq(users.id, userId))
        .for("update");

      // users.cv_url (cvUrl): the route used to set a "cvFileUrl" key, which
      // is not a column, so Drizzle dropped it and the URL was never stored.
      const updateFields: Partial<typeof users.$inferInsert> = {
        cvParsedData: parsed,
        cvUrl: cvFileUrl,
        updatedAt: new Date(),
      };

      // Merge CV skills with existing user skills
      if ((parsed.skills ?? []).length > 0) {
        const existingSkills = (current?.skills as string[] | null) ?? [];
        updateFields.skills = [
          ...new Set([...existingSkills, ...(parsed.skills ?? [])]),
        ];
      }

      await tx.update(users).set(updateFields).where(eq(users.id, userId));
      return current?.cvUrl ?? null;
    });

    // The previous CV is no longer referenced. Only an object in this user's
    // own folder is ever deleted.
    const previousPath = storagePathFromPublicUrl(previousUrl);
    if (
      previousPath &&
      previousPath !== storagePath &&
      previousPath.startsWith(`cvs/${userId}/`)
    ) {
      await removeCvObject(previousPath);
    }

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
    // The new object (if the upload got that far) is not referenced by the
    // user row: parsing or saving failed, so delete it.
    if (storagePath) await removeCvObject(storagePath);
    return apiError("Failed to parse CV. Please ensure the file is valid.");
  }
}
