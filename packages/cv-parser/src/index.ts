import { PDFParse } from "pdf-parse";

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

/**
 * Extract text from a PDF buffer.
 */
export async function extractTextFromPDF(buffer: Buffer): Promise<string> {
  const parser = new PDFParse({ data: buffer });
  const result = await parser.getText();
  await parser.destroy();
  return result.text;
}

/**
 * Basic pattern-based extraction from CV text.
 * For production, this would be enhanced with AI-powered extraction.
 */
export function extractBasicInfo(text: string): Partial<ParsedCV> {
  const result: Partial<ParsedCV> = {
    skills: [],
    experience: [],
    education: [],
    rawText: text,
  };

  // Extract email
  const emailMatch = text.match(
    /[\w.+-]+@[\w-]+\.[\w.]+/
  );
  if (emailMatch) {
    result.email = emailMatch[0];
  }

  // Extract phone
  const phoneMatch = text.match(
    /(?:\+\d{1,3}[-.\s]?)?(?:\(?\d{1,4}\)?[-.\s]?)?\d{3,4}[-.\s]?\d{3,4}/
  );
  if (phoneMatch) {
    result.phone = phoneMatch[0].trim();
  }

  // Extract name (typically first non-empty line)
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length > 0) {
    const firstLine = lines[0]!;
    // Name is usually the first line, often all caps or title case, no special chars
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
  ];

  const textLower = text.toLowerCase();
  result.skills = commonSkills.filter((skill) =>
    textLower.includes(skill.toLowerCase())
  );

  return result;
}

/**
 * Parse a CV from a PDF buffer. Returns basic extracted data + raw text
 * for further AI-powered extraction.
 */
export async function parseCV(buffer: Buffer): Promise<ParsedCV> {
  const rawText = await extractTextFromPDF(buffer);
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
