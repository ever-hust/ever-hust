import type { Config } from "jest";
import { fileURLToPath } from "url";
import { dirname } from "path";

// Normalize rootDir to use forward slashes (fixes glob matching on Windows)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = __dirname.replace(/\\/g, "/");

// Map workspace packages to their source dirs for ts-jest resolution
const workspaceModuleMapper: Record<string, string> = {
  "^@repo/stripe(.*)$": `${rootDir}/packages/stripe/src$1`,
  "^@repo/db(.*)$": `${rootDir}/packages/db/src$1`,
  "^@repo/utils(.*)$": `${rootDir}/packages/utils/src$1`,
  "^@repo/ai(.*)$": `${rootDir}/packages/ai/src$1`,
  "^@repo/jobs-api(.*)$": `${rootDir}/packages/jobs-api/src$1`,
  "^@repo/email(.*)$": `${rootDir}/packages/email/src$1`,
  "^@repo/cv-parser(.*)$": `${rootDir}/packages/cv-parser/src$1`,
  "^@repo/auth(.*)$": `${rootDir}/packages/auth/src$1`,
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
      { useESM: true, diagnostics: false, tsconfig: { isolatedModules: true } },
    ],
  },
  extensionsToTreatAsEsm: [".ts" as const],
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
