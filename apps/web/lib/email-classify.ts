/**
 * Lightweight, dependency-free classifier for inbound job-search email. Used on
 * sync to tag each message so the inbox can highlight interview invites, offers,
 * rejections, etc. Heuristic (keyword) — fast and free; the AI can refine on
 * demand. Order matters: stronger signals first.
 */
export type EmailCategory =
  | "offer"
  | "rejection"
  | "interview"
  | "scheduling"
  | "recruiter"
  | "application"
  | "other";

export const CATEGORY_LABELS: Record<EmailCategory, string> = {
  offer: "Offer",
  rejection: "Rejection",
  interview: "Interview",
  scheduling: "Scheduling",
  recruiter: "Recruiter",
  application: "Application",
  other: "Other",
};

export function classifyEmail(subject?: string | null, body?: string | null): EmailCategory {
  const t = `${subject ?? ""}\n${body ?? ""}`.toLowerCase();
  if (!t.trim()) return "other";

  if (/\b(job )?offer\b|pleased to offer|offer letter|extend(ing)? (you )?an offer|compensation package/.test(t)) {
    return "offer";
  }
  if (
    /unfortunately|regret to inform|not (be )?(moving|proceeding)|won'?t be moving forward|decided (not |to not )|other candidates|no longer (being )?considered|not selected|will not be progressing/.test(
      t,
    )
  ) {
    return "rejection";
  }
  if (/interview|phone screen|technical screen|hiring manager|meet (the|with) (the )?team|onsite|coding (challenge|test)/.test(t)) {
    return "interview";
  }
  if (/calendly|book a time|schedule (a |your )?(call|chat|meeting|time)|availability|what times work|reschedul/.test(t)) {
    return "scheduling";
  }
  if (/recruiter|sourcer|talent (acquisition|partner)|reaching out|came across your (profile|resume)|opportunity that|i'?d love to connect/.test(t)) {
    return "recruiter";
  }
  if (/application (was )?(received|submitted)|thank you for applying|we(?:'| ha)?ve received your application|successfully applied/.test(t)) {
    return "application";
  }
  return "other";
}

/** Extract a bare domain from a "Name <user@host>" address string. */
export function senderDomain(fromAddr?: string | null): string | null {
  if (!fromAddr) return null;
  const m = fromAddr.match(/@([a-z0-9.-]+)/i);
  return m ? m[1]!.toLowerCase().replace(/>$/, "") : null;
}

/** Extract a bare host (sans www.) from a company URL like "https://acme.com/jobs". */
export function urlDomain(url?: string | null): string | null {
  if (!url) return null;
  try {
    const u = url.includes("://") ? url : `https://${url}`;
    return new URL(u).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}
