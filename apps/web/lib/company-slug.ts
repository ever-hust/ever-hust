/**
 * URL slug for a company name, e.g. "Amazon Web Services" → "amazon-web-services".
 *
 * Must stay in sync with the SQL used to resolve a slug back to a company on the
 * company page:
 *   trim(both '-' from regexp_replace(lower(company_name), '[^a-z0-9]+', '-', 'g'))
 */
export function companySlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
