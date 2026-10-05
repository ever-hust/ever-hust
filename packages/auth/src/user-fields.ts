/**
 * Custom columns on the users table that Better Auth persists.
 *
 * Do NOT set `fieldName` to the SQL column (e.g. "linkedin_data"): the Drizzle
 * adapter looks fields up by the Drizzle table's JS key (`users.linkedinData`)
 * and Drizzle maps that to the column. A column name here made every new
 * LinkedIn sign-up fail with `unable_to_create_user`.
 */
export const userAdditionalFields = {
  linkedinId: { type: "string", required: false, input: false },
  linkedinData: { type: "json", required: false, input: false },
  headline: { type: "string", required: false, input: false },
  photoUrl: { type: "string", required: false, input: false },
} as const;
