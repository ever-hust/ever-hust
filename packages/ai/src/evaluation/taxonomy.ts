/**
 * Two-level job-family → archetype taxonomy (spec #3 §3.1).
 *
 * This is **data, not code**: the keyword packs parameterize the rubric so the same engine
 * scores a Staff SRE and a Field Marketing Manager correctly. Detection uses JD-keyword
 * signals (title weighted heavier than body). The packs are seeded here and are intended to
 * be org-overridable later via `organization_ai_configs` — adding a family/archetype must not
 * require a deploy.
 */

export interface ArchetypeDef {
  name: string;
  keywords: string[];
}

export interface JobFamilyDef {
  family: string;
  /** Signals that the posting belongs to this family at all. */
  keywords: string[];
  archetypes: ArchetypeDef[];
}

export const JOB_FAMILIES: readonly JobFamilyDef[] = [
  {
    family: "Software Eng",
    keywords: [
      "software engineer",
      "developer",
      "programmer",
      "swe",
      "engineering",
      "engineer",
    ],
    archetypes: [
      { name: "Backend", keywords: ["backend", "back-end", "api", "services", "microservice", "server-side", "distributed"] },
      { name: "Frontend", keywords: ["frontend", "front-end", "react", "ui engineer", "web", "css", "typescript"] },
      { name: "Platform", keywords: ["platform", "infrastructure", "ci/cd", "devops", "build", "tooling"] },
      { name: "SRE", keywords: ["sre", "site reliability", "reliability", "on-call", "observability", "latency", "uptime"] },
      { name: "Mobile", keywords: ["ios", "android", "mobile", "swift", "kotlin", "react native"] },
    ],
  },
  {
    family: "Data / ML",
    keywords: ["data", "machine learning", " ml ", "ai engineer", "analytics", "scientist", "llm"],
    archetypes: [
      { name: "Analytics", keywords: ["analytics", "analyst", "bi", "dashboard", "sql", "reporting"] },
      { name: "ML Eng", keywords: ["machine learning", "ml engineer", "model", "evals", "feature store", "inference", "llm"] },
      { name: "Data Eng", keywords: ["data engineer", "pipelines", "etl", "warehouse", "spark", "airflow"] },
    ],
  },
  {
    family: "Design",
    keywords: ["design", "designer", "ux", "ui designer", "product design"],
    archetypes: [
      { name: "Product", keywords: ["product design", "product designer", "figma", "prototyping", "interaction"] },
      { name: "Brand", keywords: ["brand", "visual", "graphic", "identity"] },
      { name: "UX Research", keywords: ["user research", "ux research", "usability", "research"] },
      { name: "Systems", keywords: ["design system", "design systems", "component library"] },
    ],
  },
  {
    family: "Product",
    keywords: ["product manager", "product management", " pm ", "tpm", "product owner"],
    archetypes: [
      { name: "PM", keywords: ["product manager", "prd", "roadmap", "discovery", "backlog"] },
      { name: "TPM", keywords: ["technical program", "tpm", "program manager"] },
      { name: "Growth PM", keywords: ["growth", "experimentation", "a/b", "activation", "retention"] },
    ],
  },
  {
    family: "Sales",
    keywords: ["sales", "account executive", " ae ", "sdr", "business development", "quota"],
    archetypes: [
      { name: "AE", keywords: ["account executive", "closing", "quota", "pipeline", "arr"] },
      { name: "SDR", keywords: ["sdr", "bdr", "outbound", "prospecting", "lead gen"] },
      { name: "Sales Eng", keywords: ["sales engineer", "solutions engineer", "demo", "pre-sales"] },
      { name: "CS", keywords: ["customer success", "renewals", "account management", "csm"] },
    ],
  },
  {
    family: "Marketing",
    keywords: ["marketing", "demand gen", "growth marketing", "content", "seo", "brand marketing"],
    archetypes: [
      { name: "Growth", keywords: ["growth", "performance marketing", "cac", "paid", "acquisition"] },
      { name: "Content", keywords: ["content", "copywriter", "editorial", "blog", "seo"] },
      { name: "Demand-gen", keywords: ["demand gen", "lifecycle", "campaigns", "attribution", "marketing ops"] },
      { name: "Brand", keywords: ["brand", "communications", "pr", "social"] },
    ],
  },
  {
    family: "Ops / Other",
    keywords: ["operations", "finance", "people", "hr", "recruiter", "revops", "bizops", "legal"],
    archetypes: [
      { name: "RevOps", keywords: ["revops", "revenue operations", "sales ops"] },
      { name: "BizOps", keywords: ["bizops", "business operations", "strategy", "chief of staff"] },
      { name: "People", keywords: ["people", "hr", "recruiter", "talent", "human resources"] },
      { name: "Finance", keywords: ["finance", "accounting", "fp&a", "controller", "forecasting", "close"] },
    ],
  },
];

const GENERIC_ARCHETYPE = "General";
const FALLBACK_FAMILY = "Ops / Other";

function countHits(haystack: string, keywords: string[]): number {
  let hits = 0;
  for (const kw of keywords) {
    if (haystack.includes(kw)) hits += 1;
  }
  return hits;
}

export interface DetectedTaxonomy {
  jobFamily: string;
  archetype: string;
}

/**
 * Detect the job family + archetype from the posting's title and description (title weighted
 * heavier). Returns a generic fallback when nothing matches, never throws.
 */
export function detectTaxonomy(input: {
  title?: string | null;
  description?: string | null;
}): DetectedTaxonomy {
  const title = (input.title ?? "").toLowerCase();
  const body = (input.description ?? "").toLowerCase();
  // Pad with spaces so token-bounded keywords like " ml " / " pm " match at edges.
  const titlePadded = ` ${title} `;
  const bodyPadded = ` ${body} `;

  let bestFamily: JobFamilyDef | null = null;
  let bestFamilyScore = 0;
  for (const fam of JOB_FAMILIES) {
    const score = countHits(titlePadded, fam.keywords) * 3 + countHits(bodyPadded, fam.keywords);
    if (score > bestFamilyScore) {
      bestFamilyScore = score;
      bestFamily = fam;
    }
  }

  if (!bestFamily || bestFamilyScore === 0) {
    return { jobFamily: FALLBACK_FAMILY, archetype: GENERIC_ARCHETYPE };
  }

  let bestArchetype: string = GENERIC_ARCHETYPE;
  let bestArchetypeScore = 0;
  for (const arch of bestFamily.archetypes) {
    const score = countHits(titlePadded, arch.keywords) * 3 + countHits(bodyPadded, arch.keywords);
    if (score > bestArchetypeScore) {
      bestArchetypeScore = score;
      bestArchetype = arch.name;
    }
  }

  return { jobFamily: bestFamily.family, archetype: bestArchetype };
}
