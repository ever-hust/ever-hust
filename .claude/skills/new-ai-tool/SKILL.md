---
name: new-ai-tool
description: Scaffold a new AI orchestrator tool with Zod schema, execute function, and registration
disable-model-invocation: true
---

# New AI Tool Skill

Scaffold and wire up a new tool for the Ever Jobs AI orchestrator agent.

## Arguments

The user provides the tool name and a description of what it should do.

## Workflow

1. **Create the tool file**: Create `packages/ai/src/tools/<tool-name>.ts` following the existing pattern.

2. **Define the tool** using the Vercel AI SDK `tool()` helper:
   ```typescript
   import { tool } from "ai";
   import { z } from "zod";

   export const myToolTool = tool({
     description: "What this tool does — written for the LLM to understand when to use it",
     parameters: z.object({
       // Input parameters the LLM provides
       param1: z.string().describe("Description for the LLM"),
       // Internal params injected by the orchestrator (not from LLM)
       userId: z.string().optional().describe("Injected by orchestrator"),
     }),
     execute: async (params) => {
       // Implementation here
       // Return a plain object — it will be JSON-serialized for the LLM and streamed to the client
       return { success: true, data: {} };
     },
   });
   ```

3. **Export from tools index**: Add the export to `packages/ai/src/tools/index.ts`:
   ```typescript
   export { myToolTool } from "./my-tool";
   ```

4. **Export from package index**: Add the export to `packages/ai/src/index.ts`.

5. **Register in orchestrator**: Add the tool to `packages/ai/src/agents/orchestrator.ts`:
   - Import the tool
   - Add it to the `tools` object in `createOrchestratorStream()`
   - If the tool needs `userId`, wrap the execute function to inject it (follow the pattern of `favoriteJobTool`, `savePreferencesTool`, etc.)
   - If the tool needs subscription gating, add a rate limit check (follow the pattern of `searchJobsTool`, `generateCoverLetterTool`)

6. **Update system prompt**: Add the tool to the capabilities list in `packages/ai/src/prompts/orchestrator-system.ts` AND `packages/ai/src/prompts.ts` (the Langfuse fallback prompt). Both must stay in sync.

7. **Handle on client** (if the tool returns data for the canvas): Update `apps/web/hooks/use-canvas-sync.ts` to handle the new tool's results in the `handleToolResult` switch statement.

8. **Add tests**: Create `packages/ai/src/tools/__tests__/<tool-name>.test.ts` or add to `tool-schemas.test.ts`.

## Conventions

- Tool names: camelCase in the orchestrator tools object (e.g., `searchJobs`, `favoriteJob`)
- File names: kebab-case (e.g., `search-jobs.ts`, `favorite-job.ts`)
- Export names: camelCase + "Tool" suffix (e.g., `searchJobsTool`, `favoriteJobTool`)
- Parameters that come from the LLM should have `.describe()` annotations
- Parameters injected by the orchestrator (like `userId`) should be `.optional()` since the LLM won't provide them
- Tools that perform sensitive actions (apply, submit, delete) should note "ALWAYS confirm with the user before calling" in description
- Return objects should be structured so the LLM can summarize them and the client can render them
