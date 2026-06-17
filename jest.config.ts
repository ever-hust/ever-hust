import type { Config } from "jest";
import { fileURLToPath } from "url";
import { dirname } from "path";

// Normalize rootDir to use forward slashes (fixes glob matching on Windows)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = __dirname.replace(/\\/g, "/");

// NOTE: We intentionally run Jest in CJS mode (no useESM, no extensionsToTreatAsEsm).
// Even though packages declare "type": "module", ts-jest transpiles .ts → CJS before
// Jest evaluates files, so the ESM flag in package.json is irrelevant at test time.
// Running in ESM mode (--experimental-vm-modules + useESM) causes
// "ReferenceError: exports is not defined" due to ts-jest 29 / Jest 30 interop issues.

// Map workspace packages to their source dirs for ts-jest resolution
const workspaceModuleMapper: Record<string, string> = {
  "^@ever-hust/stripe(.*)$": `${rootDir}/packages/stripe/src$1`,
  "^@ever-hust/rate-limit(.*)$": `${rootDir}/packages/rate-limit/src$1`,
  "^@ever-hust/db(.*)$": `${rootDir}/packages/db/src$1`,
  "^@ever-hust/utils(.*)$": `${rootDir}/packages/utils/src$1`,
  "^@ever-hust/ai(.*)$": `${rootDir}/packages/ai/src$1`,
  "^@ever-hust/jobs-api(.*)$": `${rootDir}/packages/jobs-api/src$1`,
  "^@ever-hust/email(.*)$": `${rootDir}/packages/email/src$1`,
  "^@ever-hust/cv-parser(.*)$": `${rootDir}/packages/cv-parser/src$1`,
  "^@ever-hust/auth(.*)$": `${rootDir}/packages/auth/src$1`,
  "^@ever-hust/triggers(.*)$": `${rootDir}/packages/triggers/src$1`,
  // ESM .js → .ts resolution
  "^(\\.{1,2}/.*)\\.js$": "$1",
};

const sharedConfig = {
  transform: {
    // isolatedModules: true makes ts-jest transpile each file independently
    // without running the full TS type-checker. This prevents OOM on deeply-nested
    // AI SDK / Zod generics (tool<T>, generateObject<T>).
    // Type-checking is already handled by `tsc --noEmit` in the build step.
    "^.+\\.tsx?$": [
      "ts-jest",
      { diagnostics: false, tsconfig: { isolatedModules: true, jsx: "react-jsx" } },
    ],
  },
  moduleNameMapper: workspaceModuleMapper,
};

const config: Config = {
  // Use forward-slash rootDir for cross-platform glob matching
  rootDir,
  projects: [
    {
      displayName: "ai",
      rootDir,
      testMatch: [`${rootDir}/packages/ai/src/**/*.test.ts`],
      ...sharedConfig,
    },
    {
      displayName: "stripe",
      rootDir,
      testMatch: [`${rootDir}/packages/stripe/src/**/*.test.ts`],
      ...sharedConfig,
    },
    {
      displayName: "rate-limit",
      rootDir,
      testMatch: [`${rootDir}/packages/rate-limit/src/**/*.test.ts`],
      ...sharedConfig,
    },
    {
      displayName: "cv-parser",
      rootDir,
      testMatch: [`${rootDir}/packages/cv-parser/src/**/*.test.ts`],
      ...sharedConfig,
    },
    {
      displayName: "jobs-api",
      rootDir,
      testMatch: [`${rootDir}/packages/jobs-api/src/**/*.test.ts`],
      ...sharedConfig,
    },
    {
      displayName: "db",
      rootDir,
      testMatch: [`${rootDir}/packages/db/src/**/*.test.ts`],
      ...sharedConfig,
    },
    {
      displayName: "utils",
      rootDir,
      testMatch: [`${rootDir}/packages/utils/src/**/*.test.ts`],
      ...sharedConfig,
    },
    {
      displayName: "email",
      rootDir,
      testMatch: [`${rootDir}/packages/email/src/**/*.test.ts`],
      ...sharedConfig,
    },
    {
      displayName: "triggers",
      rootDir,
      testMatch: [`${rootDir}/packages/triggers/src/**/*.test.ts`],
      ...sharedConfig,
    },
    {
      displayName: "web-lib",
      rootDir,
      testMatch: [`${rootDir}/apps/web/lib/**/*.test.ts`],
      moduleNameMapper: {
        ...workspaceModuleMapper,
        // Next.js path alias resolution for the web app
        "^@/(.*)$": `${rootDir}/apps/web/$1`,
      },
      ...sharedConfig,
    },
  ],
};

export default config;
