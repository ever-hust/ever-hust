import { NextResponse } from "next/server";
import { parseCV } from "@repo/cv-parser";
import { db } from "@repo/db";
import { users } from "@repo/db";
import { eq } from "drizzle-orm";
import { requireSessionUser } from "../../../../lib/get-session-user";
import { applyRateLimit } from "../../../../lib/rate-limit";
import {
  apiSuccess,
  apiBadRequest,
  apiError,
} from "../../../../lib/api-response";

/** Allowed MIME types for CV uploads */
const ALLOWED_MIME_TYPES = new Set(["application/pdf"]);

/** Maximum file size: 10 MB */
const MAX_FILE_SIZE = 10 * 1024 * 1024;

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

  const formData = await req.formData();
  const file = formData.get("cv") as File | null;

  if (!file) {
    return apiBadRequest("No file provided");
  }

  // Validate file type (MIME + extension)
  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    return apiBadRequest("Only PDF files are supported");
  }

  const fileName = file.name?.toLowerCase() ?? "";
  if (fileName && !fileName.endsWith(".pdf")) {
    return apiBadRequest("File must have a .pdf extension");
  }

  // Validate file size
  if (file.size > MAX_FILE_SIZE) {
    return apiBadRequest("File must be under 10MB");
  }

  try {
    // Read file buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Parse CV
    const parsed = await parseCV(buffer);

    // Store parsed data and merge skills atomically
    const updateFields: Record<string, unknown> = {
      cvParsedData: parsed,
      updatedAt: new Date(),
    };

    // Merge CV skills with existing user skills
    if (parsed.skills.length > 0) {
      const existingUser = await db
        .select({ skills: users.skills })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      const existingSkills = (existingUser[0]?.skills as string[]) ?? [];
      updateFields.skills = [
        ...new Set([...existingSkills, ...parsed.skills]),
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
        skills: parsed.skills,
        skillsCount: parsed.skills.length,
        hasExperience: parsed.experience.length > 0,
        hasEducation: parsed.education.length > 0,
        textLength: parsed.rawText.length,
      },
    });
  } catch (error) {
    console.error(
      "[cv/upload] CV parsing error:",
      error instanceof Error ? error.message : error,
    );
    return apiError("Failed to parse CV. Please ensure the file is a valid PDF.");
  }
}
