import { NextResponse } from "next/server";
import { parseCV } from "@repo/cv-parser";
import { db } from "@repo/db";
import { users } from "@repo/db";
import { eq } from "drizzle-orm";
import { requireSessionUser } from "../../../../lib/get-session-user";

export async function POST(req: Request) {
  let user;
  try {
    user = await requireSessionUser();
  } catch (response) {
    return response as NextResponse;
  }
  const userId = user.id;

  const formData = await req.formData();
  const file = formData.get("cv") as File | null;

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  // Validate file type
  if (file.type !== "application/pdf") {
    return NextResponse.json(
      { error: "Only PDF files are supported" },
      { status: 400 }
    );
  }

  // Validate file size (max 10MB)
  if (file.size > 10 * 1024 * 1024) {
    return NextResponse.json(
      { error: "File must be under 10MB" },
      { status: 400 }
    );
  }

  try {
    // Read file buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Parse CV
    const parsed = await parseCV(buffer);

    // Store parsed data in user profile
    await db
      .update(users)
      .set({
        cvParsedData: parsed,
        updatedAt: new Date(),
        // Also update skills if we found any and user doesn't have them yet
      })
      .where(eq(users.id, userId));

    // Update skills if parsed CV has skills
    if (parsed.skills.length > 0) {
      const existingUser = await db
        .select({ skills: users.skills })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      const existingSkills = (existingUser[0]?.skills as string[]) ?? [];
      const mergedSkills = [
        ...new Set([...existingSkills, ...parsed.skills]),
      ];

      await db
        .update(users)
        .set({ skills: mergedSkills })
        .where(eq(users.id, userId));
    }

    return NextResponse.json({
      success: true,
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
    console.error("CV parsing error:", error);
    return NextResponse.json(
      { error: "Failed to parse CV" },
      { status: 500 }
    );
  }
}
