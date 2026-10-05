import * as schema from "@ever-hust/db/schema";
import { userAdditionalFields } from "./user-fields";

/**
 * Regression: LinkedIn sign-up failed for every NEW user with
 *   BetterAuthError: The field "linkedin_data" does not exist in the "user" Drizzle schema
 * because `fieldName` named the SQL column. Better Auth's Drizzle adapter maps
 * each field to `fieldName ?? key` and requires that to be a key of the Drizzle
 * table object (`users.linkedinData`); Drizzle maps keys to snake_case columns.
 * (better-auth is ESM-only, so this mirrors the adapter's check instead of
 * importing it under this repo's CJS Jest.)
 */
describe("user additionalFields ↔ Drizzle users table", () => {
  it.each(Object.entries(userAdditionalFields))(
    "%s resolves to a key of the Drizzle users table",
    (key, field) => {
      const drizzleKey = (field as { fieldName?: string }).fieldName ?? key;
      expect(Object.keys(schema.users)).toContain(drizzleKey);
    },
  );

  it("stores the raw LinkedIn profile as JSON (jsonb column)", () => {
    expect(userAdditionalFields.linkedinData.type).toBe("json");
    expect(schema.users.linkedinData.dataType).toBe("json");
  });
});
