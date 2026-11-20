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
  getPublicUrl,
  uploadFile,
} from "@ever-hust/supabase/storage";

/** Maximum file size: 10 MB */
const MAX_FILE_SIZE = 10 * 1024 * 1024;

/** A stored CV's file name: the server-chosen `{uuid}.{ext}`, never a path. */
const CV_FILE_NAME = /^[\w-]+\.[a-z0-9]+$/i;

/**
 * The storage path of a CV this route stored for `userId`, or null when `url`
 * is not a public URL of a file directly inside `cvs/{userId}/` (another user's
 * folder, another host or bucket, a sub-folder, dot segments, a query string).
 */
function ownCvPath(url: unknown, userId: string): string | null {
  if (typeof url !== "string") return null;
  const folder = `cvs/${userId}/`;
  const folderUrl = getPublicUrl(folder);
  if (!url.startsWith(folderUrl)) return null;
  const name = url.slice(folderUrl.length);
  return CV_FILE_NAME.test(name) ? `${folder}${name}` : null;
}

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

  try {
    // Read file buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Upload to Supabase Storage under a server-chosen name: the client's file
    // name must never reach the storage key (path traversal).
    const storagePath = `cvs/${userId}/${crypto.randomUUID()}.${ext}`;
    const cvFileUrl = await uploadFile(storagePath, buffer, file.type);

    // Parse CV (pass MIME type for format-specific extraction)
    const parsed = await parseCV(buffer, file.type);

    // Store parsed data, file URL, and merge skills atomically. Typed with the
    // table's columns: Drizzle silently drops a key that is not a column, which
    // is how the URL, set as "cvFileUrl", never reached users.cv_url.
    const updateFields: Partial<typeof users.$inferInsert> = {
      cvParsedData: parsed,
      cvUrl: cvFileUrl,
      updatedAt: new Date(),
    };

    // Read the skills to merge with and the CV file this upload replaces
    const [existingUser] = await db
      .select({ skills: users.skills, cvUrl: users.cvUrl })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    // Merge CV skills with existing user skills
    if ((parsed.skills ?? []).length > 0) {
      const existingSkills = (existingUser?.skills as string[]) ?? [];
      updateFields.skills = [
        ...new Set([...existingSkills, ...(parsed.skills ?? [])]),
      ];
    }

    await db
      .update(users)
      .set(updateFields)
      .where(eq(users.id, userId));

    // Each upload gets a new name, so remove the CV it replaced (best effort).
    // Only a file inside this user's own folder is ever removed.
    try {
      const oldPath = ownCvPath(existingUser?.cvUrl, userId);
      if (oldPath && oldPath !== storagePath) {
        await deleteFile(oldPath);
      }
    } catch (cleanupErr) {
      console.warn(
        "[cv/upload] Failed to delete the replaced CV:",
        cleanupErr instanceof Error ? cleanupErr.message : cleanupErr,
      );
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
    return apiError("Failed to parse CV. Please ensure the file is valid.");
  }
}
