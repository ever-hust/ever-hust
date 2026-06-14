import { tool } from "ai";
import type { LanguageModel } from "ai";
import { z } from "zod";
import { db, jobs, users, evaluations } from "@ever-hust/db";
import { eq } from "drizzle-orm";
import {
  evaluationLlmPartSchema,
  evaluationArtifact,
  assertArtifact,
  generateValidatedObject,
  type EvaluationSummary,
} from "../structured";
import {
  resolveWeights,
  scoreComp,
  scoreRemote,
  scoreLevel,
  cvSkillOverlap,
  type RemotePreference,
  type CompScore,
  type DeterministicScore,
} from "../evaluation/scoring";
import { detectTaxonomy } from "../evaluation/taxonomy";
import { assembleEvaluation } from "../evaluation/assemble";

export const evaluateJobInput = z.object({
  jobId: z
    .number()
    .int()
    .positive()
    .describe("The ID of the job to evaluate (from search results)."),
  weightOverride: z
    .record(z.string(), z.number().min(0).max(100))
    .optional()
    .describe(
      "Optional per-dimension weight overrides as percentages (e.g. boost 'comp' if pay matters most). Renormalized to 100; an invalid set falls back to defaults.",
    ),
  includeInterviewPlan: z
    .boolean()
    .optional()
    .default(false)
    .describe(
      "Include Block F (interview themes + STAR story seeds). Heavier — opt-in.",
    ),
  // userId is injected server-side by the orchestrator — never LLM-provided.
  userId: z.string().optional(),
});

type EvaluateJobInput = z.infer<typeof evaluateJobInput>;

export type EvaluateJobResult =
  | ({ evaluated: true; jobTitle: string; companyName: string | null } & EvaluationSummary)
  | { evaluated: false; jobId: number; error: string };

const EVAL_SYSTEM = [
  "You are Hust's job-fit evaluator. You score how well ONE specific job fits ONE specific candidate, honestly.",
  "Quality over quantity: be willing to recommend AGAINST applying when the fit is weak, and say plainly why.",
  "Ground every CV-match claim in the candidate's actual CV evidence — never invent experience, employers, numbers, titles, or skills. State gaps; do not paper over them.",
  "Use the deterministic facts you are given (comp/remote/level scores and the skill-overlap baseline) as fixed — do not re-derive them.",
  "Score each requested dimension 1–5 (5 best) with a one-sentence rationale, write the A–F blocks, and give a concise, honest recommendation.",
].join(" ");

const LLM_DIMENSION_KEYS = [
  "north_star",
  "cv_match",
  "growth",
  "reputation",
  "tech",
  "speed",
  "culture",
] as const;

function asStringArray(v: unknown): string[] {
  return Array.isArray(v)
    ? v.filter((x): x is string => typeof x === "string")
    : [];
}

function toNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) {
    return Number(v);
  }
  return null;
}

function modelLabel(model: LanguageModel): string {
  if (typeof model === "string") return model;
  const m = model as { modelId?: string };
  return m.modelId ?? "unknown";
}

interface JobFacts {
  id: number;
  title: string;
  companyName: string | null;
  companyIndustry: string | null;
  description: string | null;
  skills: unknown;
  isRemote: boolean | null;
  jobLevel: string | null;
  locationCity: string | null;
  locationState: string | null;
  locationCountry: string | null;
  salaryMin: unknown;
  salaryMax: unknown;
  salaryCurrency: string | null;
}

function buildPrompt(input: {
  job: JobFacts;
  prefs: Record<string, unknown>;
  cv: Record<string, unknown>;
  jobFamily: string;
  archetype: string;
  comp: CompScore;
  remote: DeterministicScore;
  level: DeterministicScore;
  overlap: { ratio: number; matched: string[]; missing: string[] };
  includeInterviewPlan: boolean;
}): string {
  const { job, prefs, cv, jobFamily, archetype, comp, remote, level, overlap, includeInterviewPlan } = input;

  const experience = Array.isArray(cv.experience)
    ? (cv.experience as Record<string, unknown>[])
        .slice(0, 6)
        .map((e) => {
          const title = typeof e.title === "string" ? e.title : "role";
          const company = typeof e.company === "string" ? e.company : "a company";
          return `- ${title} at ${company}`;
        })
        .join("\n")
    : "(no parsed work history)";

  const candidateSkills = [
    ...asStringArray((prefs as { skills?: unknown }).skills),
    ...asStringArray(cv.skills),
  ];
  const targetSalaryMin = toNumber(prefs.salaryMin);
  const targetSalaryMax = toNumber(prefs.salaryMax);

  const jobDescription = (job.description ?? "").slice(0, 3000);
  const jobLocation = [job.locationCity, job.locationState, job.locationCountry]
    .filter(Boolean)
    .join(", ");

  return [
    "## Candidate",
    `Headline: ${typeof cv.headline === "string" ? cv.headline : (prefs.roleLevel ?? "—")}`,
    `Summary: ${typeof cv.summary === "string" ? cv.summary.slice(0, 800) : "—"}`,
    `Target role/level: ${prefs.roleLevel ?? "—"}`,
    `Target industries: ${asStringArray(prefs.industries).join(", ") || "—"}`,
    `Remote preference: ${prefs.remotePreference ?? "any"}`,
    `Target salary: ${targetSalaryMin ?? "—"}–${targetSalaryMax ?? "—"}`,
    `Skills: ${candidateSkills.slice(0, 40).join(", ") || "—"}`,
    `Work history:\n${experience}`,
    "",
    "## Job",
    `Title: ${job.title}`,
    `Company: ${job.companyName ?? "—"}${job.companyIndustry ? ` (${job.companyIndustry})` : ""}`,
    `Detected family / archetype: ${jobFamily} / ${archetype}`,
    `Level: ${job.jobLevel ?? "—"}`,
    `Location: ${jobLocation || "—"} · Remote: ${job.isRemote ?? "unknown"}`,
    `Salary: ${toNumber(job.salaryMin) ?? "—"}–${toNumber(job.salaryMax) ?? "—"} ${job.salaryCurrency ?? ""}`,
    `Required skills: ${asStringArray(job.skills).join(", ") || "—"}`,
    `Description:\n${jobDescription || "—"}`,
    "",
    "## Deterministic facts (fixed — do not re-derive)",
    `Comp dimension: ${comp.score5}/5 — ${comp.rationale} (budgetFit=${comp.budgetFit})`,
    `Remote dimension: ${remote.score5}/5 — ${remote.rationale}`,
    `Level dimension: ${level.score5}/5 — ${level.rationale}`,
    `CV skill-overlap baseline: ${Math.round(overlap.ratio * 100)}% — matched: ${overlap.matched.slice(0, 20).join(", ") || "none"}; missing: ${overlap.missing.slice(0, 20).join(", ") || "none"}`,
    "",
    "## Your task",
    `Score these dimensions (1–5 + one-sentence rationale), using the keys exactly: ${LLM_DIMENSION_KEYS.join(", ")}.`,
    "- north_star: alignment to the candidate's stated target role/archetype.",
    "- cv_match: how well the CV evidence meets the JD (anchor on the overlap baseline above).",
    "- growth: trajectory / path to the next level.",
    "- reputation: employer reputation / absence of red flags.",
    "- tech: stack modernity / relevance to the candidate.",
    "- speed: likely time-to-offer.",
    "- culture: builder vs bureaucratic signals.",
    "",
    "Then write the blocks:",
    "- roleSummary: what the role actually is, normalized from the JD.",
    "- cvMatch.evidence: map each key JD requirement to specific CV evidence (met true/false); cvMatch.gaps: honest gaps.",
    "- levelStrategy: seniority read + how to position.",
    "- compDemand.summary + budgetFit: salary vs market and the candidate's budget (reuse the comp fact).",
    "- customization: what to emphasize/tailor for this role.",
    includeInterviewPlan
      ? "- interviewPlan: 3–5 likely interview themes, each with a STAR story seed drawn from the candidate's real history."
      : "- Do NOT include interviewPlan.",
    "",
    "Finally, recommendation: a concise, honest verdict — if the fit is weak, recommend against applying and say why.",
  ].join("\n");
}

/**
 * Core evaluation routine (spec #3). Pure orchestration over the tested deterministic core
 * + the LLM layer + persistence. Reusable by the tool, a read/refresh API route, and batch
 * evaluation (#19). `userId` and `model` are supplied by the caller (injected server-side).
 */
export async function runEvaluateJob(args: {
  jobId: number;
  userId: string;
  model: LanguageModel;
  weightOverride?: Record<string, number>;
  includeInterviewPlan?: boolean;
}): Promise<EvaluateJobResult> {
  const { jobId, userId, model, weightOverride, includeInterviewPlan = false } = args;

  const jobRows = await db
    .select({
      id: jobs.id,
      title: jobs.title,
      companyName: jobs.companyName,
      companyIndustry: jobs.companyIndustry,
      description: jobs.description,
      skills: jobs.skills,
      isRemote: jobs.isRemote,
      jobLevel: jobs.jobLevel,
      locationCity: jobs.locationCity,
      locationState: jobs.locationState,
      locationCountry: jobs.locationCountry,
      salaryMin: jobs.salaryMin,
      salaryMax: jobs.salaryMax,
      salaryCurrency: jobs.salaryCurrency,
    })
    .from(jobs)
    .where(eq(jobs.id, jobId))
    .limit(1);

  const job = jobRows[0];
  if (!job) return { evaluated: false, jobId, error: `Job ${jobId} was not found.` };

  const userRows = await db
    .select({
      skills: users.skills,
      cvParsedData: users.cvParsedData,
      preferences: users.preferences,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  const user = userRows[0];
  if (!user) return { evaluated: false, jobId, error: "User not found." };

  const prefs = (user.preferences ?? {}) as Record<string, unknown>;
  const cv = (user.cvParsedData ?? {}) as Record<string, unknown>;

  // Deterministic dimensions (server-computed; passed to the LLM as fixed facts).
  const userSkills = [...asStringArray(user.skills), ...asStringArray(cv.skills)];
  const overlap = cvSkillOverlap(userSkills, asStringArray(job.skills));
  const comp = scoreComp(
    { salaryMin: toNumber(job.salaryMin), salaryMax: toNumber(job.salaryMax) },
    { min: toNumber(prefs.salaryMin), max: toNumber(prefs.salaryMax) },
  );
  const remote = scoreRemote(
    job.isRemote,
    (prefs.remotePreference ?? null) as RemotePreference,
  );
  const level = scoreLevel(
    job.jobLevel,
    typeof prefs.roleLevel === "string" ? prefs.roleLevel : null,
  );

  const { jobFamily, archetype } = detectTaxonomy({
    title: job.title,
    description: job.description,
  });

  const { weights } = resolveWeights({
    user: (prefs.evaluationWeights ?? null) as Record<string, number> | null,
    override: weightOverride ?? null,
  });

  // LLM-reasoned dimensions + A–F blocks + recommendation (model retries on schema mismatch).
  const llmPart = await generateValidatedObject({
    model,
    schema: evaluationLlmPartSchema,
    schemaName: "JobEvaluation",
    schemaDescription:
      "Reasoned fit dimensions (1–5 + rationale), the A–F evaluation blocks, and an honest recommendation.",
    system: EVAL_SYSTEM,
    prompt: buildPrompt({
      job,
      prefs,
      cv,
      jobFamily,
      archetype,
      comp,
      remote,
      level,
      overlap,
      includeInterviewPlan,
    }),
    telemetry: { functionId: "evaluate-job", metadata: { userId, jobId } },
  });

  const summary = assembleEvaluation({
    jobId,
    jobFamily,
    archetype,
    weights,
    deterministic: { comp, remote, level },
    llmPart,
    includeInterviewPlan,
  });

  // Validate the artifact before persistence (throws in dev/test, degrades in prod).
  const artifact = assertArtifact(
    evaluationArtifact,
    evaluationArtifact.build(summary, llmPart.recommendation),
  );

  const row = {
    score: artifact.summary.score,
    score5: artifact.summary.score5,
    band: artifact.summary.band,
    jobFamily: artifact.summary.jobFamily,
    archetype: artifact.summary.archetype,
    schemaVersion: artifact.schemaVersion,
    dimensions: artifact.summary.dimensions,
    blocks: artifact.summary.blocks,
    recommendation: artifact.summary.recommendation,
    modelUsed: modelLabel(model),
    weightsUsed: weights,
  };

  await db
    .insert(evaluations)
    .values({ userId, jobId, ...row })
    .onConflictDoUpdate({
      target: [evaluations.userId, evaluations.jobId],
      set: { ...row, updatedAt: new Date() },
    });

  return {
    evaluated: true,
    jobTitle: job.title,
    companyName: job.companyName,
    ...artifact.summary,
  };
}

export const evaluateJobTool = tool({
  description:
    "Evaluate how well a specific job fits THIS user. Returns a 0–100 fit score, a 1–5 band " +
    "(apply_now / worth_it / specific_reason / not_recommended), an A–F breakdown (role summary, " +
    "CV-match evidence + gaps, level strategy, comp & demand, customization plan, optional interview " +
    "plan), and an honest recommendation that may advise AGAINST applying. Use when the user asks " +
    "'is this worth it / a good fit / should I apply', or to rank jobs by fit. Surface 'not_recommended' honestly.",
  inputSchema: evaluateJobInput,
  execute: async (input): Promise<EvaluateJobResult> => {
    const { jobId, weightOverride, includeInterviewPlan, userId } =
      input as EvaluateJobInput;
    const model = (input as { model?: LanguageModel }).model;
    if (!userId) return { evaluated: false, jobId, error: "Not authenticated." };
    if (!model) {
      return { evaluated: false, jobId, error: "No model available for evaluation." };
    }
    try {
      return await runEvaluateJob({
        jobId,
        userId,
        model,
        weightOverride,
        includeInterviewPlan,
      });
    } catch (err) {
      console.error(
        "[evaluate-job] execute failed:",
        err instanceof Error ? err.message : err,
      );
      return {
        evaluated: false,
        jobId,
        error: "Something went wrong while evaluating this job. Please try again.",
      };
    }
  },
});
