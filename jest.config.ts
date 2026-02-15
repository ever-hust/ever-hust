import type { Config } from "jest";

const config: Config = {
  projects: [
    {
      displayName: "stripe",
      testMatch: ["<rootDir>/packages/stripe/src/**/*.test.ts"],
      transform: {
        "^.+\\.tsx?$": ["ts-jest", { useESM: true }],
      },
      extensionsToTreatAsEsm: [".ts"],
      moduleNameMapper: {
        "^(\\.{1,2}/.*)\\.js$": "$1",
      },
    },
    {
      displayName: "cv-parser",
      testMatch: ["<rootDir>/packages/cv-parser/src/**/*.test.ts"],
      transform: {
        "^.+\\.tsx?$": ["ts-jest", { useESM: true }],
      },
      extensionsToTreatAsEsm: [".ts"],
      moduleNameMapper: {
        "^(\\.{1,2}/.*)\\.js$": "$1",
      },
    },
    {
      displayName: "jobs-api",
      testMatch: ["<rootDir>/packages/jobs-api/src/**/*.test.ts"],
      transform: {
        "^.+\\.tsx?$": ["ts-jest", { useESM: true }],
      },
      extensionsToTreatAsEsm: [".ts"],
      moduleNameMapper: {
        "^(\\.{1,2}/.*)\\.js$": "$1",
      },
    },
    {
      displayName: "utils",
      testMatch: ["<rootDir>/packages/utils/src/**/*.test.ts"],
      transform: {
        "^.+\\.tsx?$": ["ts-jest", { useESM: true }],
      },
      extensionsToTreatAsEsm: [".ts"],
      moduleNameMapper: {
        "^(\\.{1,2}/.*)\\.js$": "$1",
      },
    },
  ],
};

export default config;
