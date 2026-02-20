import { PDFParse } from "pdf-parse";
import { createAnthropic } from "@ai-sdk/anthropic";
import { generateObject } from "ai";
import { z } from "zod";

export interface ParsedCV {
  name?: string;
  email?: string;
  phone?: string;
  location?: string;
  headline?: string;
  summary?: string;
  skills: string[];
  experience: {
    company: string;
    title: string;
    startDate?: string;
    endDate?: string;
    description?: string;
  }[];
  education: {
    institution: string;
    degree: string;
    field?: string;
    startDate?: string;
    endDate?: string;
  }[];
  rawText: string;
}

// ---------------------------------------------------------------------------
// PDF text extraction (lightweight, no AI needed)
// ---------------------------------------------------------------------------

/**
 * Extract text from a PDF buffer.
 */
export async function extractTextFromPDF(buffer: Buffer): Promise<string> {
  const parser = new PDFParse({ data: buffer });
  const result = await parser.getText();
  await parser.destroy();
  return result.text;
}

// ---------------------------------------------------------------------------
// AI-powered structured extraction via Claude
// ---------------------------------------------------------------------------

const cvExtractionSchema = z.object({
  name: z.string().optional().describe("Full name of the candidate"),
  email: z.string().optional().describe("Email address"),
  phone: z.string().optional().describe("Phone number"),
  location: z
    .string()
    .optional()
    .describe("Location (city, state/country) of the candidate"),
  headline: z
    .string()
    .optional()
    .describe(
      "Professional headline or title (e.g., 'Senior Software Engineer')",
    ),
  summary: z
    .string()
    .optional()
    .describe(
      "Professional summary or objective from the CV, 1-3 sentences max",
    ),
  skills: z
    .array(z.string())
    .describe(
      "List of technical and professional skills mentioned in the CV",
    ),
  experience: z
    .array(
      z.object({
        company: z.string().describe("Company or organization name"),
        title: z.string().describe("Job title or role"),
        startDate: z
          .string()
          .optional()
          .describe("Start date (e.g., 'Jan 2020', '2020')"),
        endDate: z
          .string()
          .optional()
          .describe("End date (e.g., 'Dec 2023', 'Present')"),
        description: z
          .string()
          .optional()
          .describe(
            "Brief description of responsibilities and achievements, 1-2 sentences",
          ),
      }),
    )
    .describe("Work experience entries, most recent first"),
  education: z
    .array(
      z.object({
        institution: z.string().describe("University or school name"),
        degree: z.string().describe("Degree type (e.g., 'BSc', 'MBA')"),
        field: z
          .string()
          .optional()
          .describe("Field of study (e.g., 'Computer Science')"),
        startDate: z.string().optional().describe("Start date"),
        endDate: z.string().optional().describe("End date or graduation year"),
      }),
    )
    .describe("Education entries"),
});

/**
 * Use Claude to extract structured data from CV text.
 * Falls back to basic pattern matching if AI extraction fails or
 * ANTHROPIC_API_KEY is not configured.
 */
async function extractWithAI(
  rawText: string,
): Promise<Omit<ParsedCV, "rawText"> | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.warn("[cv-parser] ANTHROPIC_API_KEY not set, using basic extraction");
    return null;
  }

  try {
    const anthropic = createAnthropic({ apiKey });
    const model = anthropic("claude-haiku-4-5-20251001");

    const { object } = await generateObject({
      model,
      schema: cvExtractionSchema,
      prompt: `Extract structured information from the following CV/resume text. Be thorough but concise. If a field is not present, omit it. For skills, include all technical skills, tools, frameworks, and programming languages mentioned.\n\n--- CV TEXT ---\n${rawText.slice(0, 12000)}`,
    });

    return {
      name: object.name,
      email: object.email,
      phone: object.phone,
      location: object.location,
      headline: object.headline,
      summary: object.summary,
      skills: object.skills,
      experience: object.experience,
      education: object.education,
    };
  } catch (err) {
    console.warn("[cv-parser] AI extraction failed, falling back to basic:", err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Basic pattern-based extraction (fallback)
// ---------------------------------------------------------------------------

/**
 * Basic pattern-based extraction from CV text.
 * Used as fallback when AI extraction is unavailable.
 */
export function extractBasicInfo(text: string): Partial<ParsedCV> {
  const result: Partial<ParsedCV> = {
    skills: [],
    experience: [],
    education: [],
    rawText: text,
  };

  // Extract email
  const emailMatch = text.match(/[\w.+-]+@[\w-]+\.[\w.]+/);
  if (emailMatch) {
    result.email = emailMatch[0];
  }

  // Extract phone
  const phoneMatch = text.match(
    /(?:\+\d{1,3}[-.\s]?)?(?:\(?\d{1,4}\)?[-.\s]?)?\d{3,4}[-.\s]?\d{3,4}/,
  );
  if (phoneMatch) {
    result.phone = phoneMatch[0]!.trim();
  }

  // Extract name (typically first non-empty line)
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length > 0) {
    const firstLine = lines[0]!;
    if (firstLine.length < 60 && !/[@\d]/.test(firstLine)) {
      result.name = firstLine;
    }
  }

  // Extract skills (look for common skill keywords)
  const commonSkills = [
    "JavaScript", "TypeScript", "React", "Next.js", "Node.js", "Python",
    "Java", "C#", "C++", "Go", "Rust", "Ruby", "PHP", "Swift", "Kotlin",
    "SQL", "PostgreSQL", "MongoDB", "Redis", "AWS", "GCP", "Azure",
    "Docker", "Kubernetes", "Git", "CI/CD", "GraphQL", "REST",
    "HTML", "CSS", "Tailwind", "Vue", "Angular", "Svelte",
    "Machine Learning", "AI", "Data Science", "TensorFlow", "PyTorch",
    "Figma", "Agile", "Scrum", "JIRA", "Linux", "Terraform",
    "Ansible", "Jenkins", "GitHub Actions", "Vercel", "Supabase",
    "Firebase", "Stripe",
  ];

  const textLower = text.toLowerCase();
  result.skills = commonSkills.filter((skill) =>
    textLower.includes(skill.toLowerCase()),
  );

  return result;
}

// ---------------------------------------------------------------------------
// Main parse function
// ---------------------------------------------------------------------------

/**
 * Parse a CV from a PDF buffer. Uses AI-powered extraction when available,
 * falls back to basic pattern matching otherwise.
 *
 * Returns structured data including work experience, education, skills,
 * and the raw text for further processing.
 */
export async function parseCV(buffer: Buffer): Promise<ParsedCV> {
  const rawText = await extractTextFromPDF(buffer);

  // Try AI-powered extraction first
  const aiResult = await extractWithAI(rawText);

  if (aiResult) {
    return {
      ...aiResult,
      rawText,
    };
  }

  // Fallback: basic pattern matching
  const basic = extractBasicInfo(rawText);

  return {
    name: basic.name,
    email: basic.email,
    phone: basic.phone,
    location: basic.location,
    headline: basic.headline,
    summary: basic.summary,
    skills: basic.skills ?? [],
    experience: basic.experience ?? [],
    education: basic.education ?? [],
    rawText,
  };
}
