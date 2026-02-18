---
name: db-migration
description: Create and apply a Drizzle ORM database migration for the Ever Jobs platform
disable-model-invocation: true
---

# Database Migration Skill

Create and apply Drizzle ORM schema changes for the Ever Jobs PostgreSQL database (Supabase).

## Workflow

1. **Understand the change**: Parse the user's request to determine what schema changes are needed (new table, new column, modify column, add index, etc.)

2. **Edit the schema**: Modify the appropriate file(s) in `packages/db/src/schema/`:
   - `users.ts` — User profiles, preferences, subscription status
   - `jobs.ts` — Job listings from external API
   - `user-jobs.ts` — User-job relationships (favorites, applications)
   - `user-alerts.ts` — Job alert subscriptions
   - `chat.ts` — Chat sessions and messages
   - `agents.ts` — Agent instance tracking
   - `subscriptions.ts` — Stripe subscription records
   - `applications.ts` — Application tracking
   - `index.ts` — Re-exports all tables (update if adding new tables)

3. **Update exports**: If adding a new table, export it from `packages/db/src/schema/index.ts` and `packages/db/src/index.ts`.

4. **Generate migration**: Run `pnpm db:generate` to create migration SQL files.

5. **Review the SQL**: Read the generated migration in `packages/db/src/migrations/` and verify it matches the intent.

6. **Apply to database**: Run `pnpm db:push` to apply schema changes to the database.

7. **Verify**: Run `pnpm --filter @repo/db check-types` to ensure types are correct.

## Schema Conventions

- Use `pgTable()` from `drizzle-orm/pg-core`
- Primary keys: `text("id").primaryKey()` for user-generated IDs, `serial("id").primaryKey()` for auto-increment
- Timestamps: Always include `createdAt` and `updatedAt` with `timestamp().notNull().defaultNow()`
- JSON columns: Use `jsonb()` with `.$type<T>()` for type safety
- Foreign keys: Use `.references(() => table.column, { onDelete: "cascade" })` where appropriate
- Enums: Use `text("col", { enum: [...] })` pattern (not pgEnum)
- Naming: snake_case for column names in DB, camelCase for TypeScript property names
