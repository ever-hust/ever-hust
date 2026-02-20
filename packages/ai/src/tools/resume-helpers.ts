/**
 * Pure helper functions extracted from resume-builder for testability.
 */

/**
 * Extracts ATS-relevant keywords from a job description by identifying
 * common professional and technical terms.
 */
export function extractAtsKeywords(description: string): string[] {
  // Normalize and split into words/phrases
  const text = description.toLowerCase();

  // Common ATS keyword patterns: multi-word terms first, then single words
  const keywordPatterns = [
    // Technical & professional terms frequently scanned by ATS
    /\b(?:machine learning|deep learning|data analysis|project management|product management)\b/g,
    /\b(?:cloud computing|ci\/cd|version control|agile methodology|scrum master)\b/g,
    /\b(?:full[- ]stack|front[- ]end|back[- ]end|dev[- ]ops|quality assurance)\b/g,
    /\b(?:business intelligence|data engineering|data science|user experience|user interface)\b/g,
    /\b(?:cross[- ]functional|stakeholder management|team leadership|problem[- ]solving)\b/g,
  ];

  const foundKeywords = new Set<string>();

  for (const pattern of keywordPatterns) {
    const matches = text.match(pattern);
    if (matches) {
      for (const match of matches) {
        foundKeywords.add(match.trim());
      }
    }
  }

  // Extract capitalized terms / proper nouns from original description
  // (tools, frameworks, certifications)
  const capitalizedTerms =
    description.match(
      /\b[A-Z][a-zA-Z+#.]*(?:\s[A-Z][a-zA-Z+#.]*){0,2}\b/g
    ) ?? [];
  for (const term of capitalizedTerms) {
    const cleaned = term.trim();
    // Skip very short or very long matches and generic words
    if (
      cleaned.length >= 3 &&
      cleaned.length <= 40 &&
      !["The", "This", "That", "With", "From", "About", "Your"].includes(
        cleaned
      )
    ) {
      foundKeywords.add(cleaned);
    }
  }

  return [...foundKeywords].slice(0, 30);
}

/**
 * Finds the overlap between user-provided skills and job-required skills.
 */
export function findSkillOverlap(
  userSkills: string[],
  jobSkills: string[]
): { matching: string[]; missing: string[] } {
  const normalizedUser = userSkills.map((s) => s.toLowerCase().trim());

  const matching: string[] = [];
  const missing: string[] = [];

  for (const jobSkill of jobSkills) {
    const normalizedJobSkill = jobSkill.toLowerCase().trim();
    if (normalizedUser.includes(normalizedJobSkill)) {
      matching.push(jobSkill);
    } else {
      missing.push(jobSkill);
    }
  }

  return { matching, missing };
}

/**
 * Generates ATS formatting tips based on job level and context.
 */
export function getFormatTips(jobLevel: string | null): string[] {
  const baseTips = [
    "Use a clean, single-column layout with standard section headings (Summary, Experience, Skills, Education).",
    "Avoid tables, graphics, headers/footers, and text boxes — ATS parsers often skip these.",
    "Use standard fonts (Arial, Calibri, Times New Roman) at 10-12pt size.",
    "Save as .docx or .pdf (check the application instructions for preferred format).",
    "Start each bullet point with a strong action verb (Led, Developed, Implemented, Optimized).",
    "Include quantifiable achievements with metrics (percentages, dollar amounts, team sizes).",
    "Mirror exact keywords and phrases from the job description in your resume.",
    "Keep the resume to 1-2 pages — 1 page for early career, 2 pages for senior roles.",
  ];

  if (jobLevel) {
    const level = jobLevel.toLowerCase();
    if (level.includes("senior") || level.includes("lead") || level.includes("principal")) {
      baseTips.push(
        "Emphasize leadership experience, mentoring, and strategic impact for this senior-level role."
      );
      baseTips.push(
        "Highlight cross-team collaboration and scope of influence (team size, budget, revenue impact)."
      );
    } else if (level.includes("entry") || level.includes("junior") || level.includes("intern")) {
      baseTips.push(
        "Focus on relevant coursework, projects, internships, and transferable skills for this entry-level role."
      );
      baseTips.push(
        "Include academic achievements, certifications, and volunteer work to demonstrate initiative."
      );
    } else if (level.includes("manager") || level.includes("director") || level.includes("vp")) {
      baseTips.push(
        "Lead with executive summary highlighting P&L impact, organizational scope, and strategic initiatives."
      );
      baseTips.push(
        "Quantify team sizes managed, budgets controlled, and revenue/growth metrics driven."
      );
    }
  }

  return baseTips;
}
