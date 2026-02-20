/**
 * Validates that a URL string uses a safe protocol (http or https).
 *
 * External URLs from the database (e.g. job postings, company websites)
 * are untrusted user input.  Without validation, a malicious URL like
 * `javascript:alert(1)` could be rendered as an href, enabling XSS.
 *
 * @returns The original URL if it's safe, otherwise `undefined`.
 */
export function safeExternalUrl(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  try {
    const parsed = new URL(url);
    if (
      (parsed.protocol === "http:" || parsed.protocol === "https:") &&
      !parsed.username && !parsed.password // block userinfo like "https://user@evil.com"
    ) {
      return url;
    }
    return undefined;
  } catch {
    // Invalid URL — try adding https:// prefix for bare domains like "example.com"
    // Reject inputs starting with @ or containing @ before the first / to block
    // userinfo-based URL confusion (e.g. "@attacker.com", "user@attacker.com")
    if (url.includes("@")) return undefined;
    try {
      const withScheme = `https://${url}`;
      const parsed = new URL(withScheme);
      if (parsed.protocol === "https:" && !parsed.username && !parsed.password) {
        return withScheme;
      }
    } catch {
      // Not a valid URL at all
    }
    return undefined;
  }
}
