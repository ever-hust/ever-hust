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

/**
 * Negated offer phrases ("unable to offer you the position", "decided not to extend an offer",
 * "no offer"). A rejection email is full of these; without stripping them the bare `offer` keyword
 * below classifies the rejection as an offer — and the pipeline then advances the application to
 * the "offer" stage.
 */
// NOTE: no capturing groups — the replace callback below relies on (match, offset).
const NEGATION =
  "(?:unable|cannot|can ?not|can['’]?t|won['’]?t|don['’]?t|doesn['’]?t|didn['’]?t|aren['’]?t|isn['’]?t|(?:are |is |will |do |does |did |could |would )?not)";
const FILLER = "(?:\\s+(?:be|being|going|able|in|a|position|to|currently|yet))*";
const OBJECT = "(?:\\s+(?:you|them|him|her))?";
const OFFER_NOUN_MODS = "(?:\\s+(?:job|formal|employment|written))*";
const NEGATED_OFFER = new RegExp(
  `\\b${NEGATION}${FILLER}\\s+(?:` +
    // "offer / extend [you] [an] [job] [offer]" — the noun is optional here
    `(?:offer|extend)(?:ing)?${OBJECT}(?:\\s+(?:an?|the))?${OFFER_NOUN_MODS}(?:\\s+offer)?` +
    // "make / give [you] [an] offer" — the noun is required, "not make a decision" is not about offers
    `|(?:make|making|give|giving)${OBJECT}(?:\\s+an?)?${OFFER_NOUN_MODS}\\s+offer` +
    `)|\\bno (?:job )?offer\\b`,
  "g",
);

/**
 * Whether a negated-offer match is a denial of *the candidate's* offer ("unable to offer you the
 * position", "decided not to extend an offer", "can't offer you a role") rather than an aside in
 * an otherwise-positive email ("we are not offering relocation").
 */
function isOfferDenial(match: string, following: string): boolean {
  return (
    /^no\b/.test(match) ||
    /\b(?:you|them|him|her)\b/.test(match) ||
    /\b(?:an?|the)\s+(?:\w+\s+)*offer$/.test(match) ||
    /^\s*(?:the |this |that |a |an )?(?:position|role|job|opportunity)\b/.test(following)
  );
}

const REJECTION_RE =
  /unfortunately|regret to inform|not (be )?(moving|proceeding)|won'?t be moving forward|decided (not |to not )|other candidates|no longer (being )?considered|not selected|will not be progressing|(?:unable|not able) to (?:move|proceed|progress)|position (?:has been|was|is) filled/;

export function classifyEmail(subject?: string | null, body?: string | null): EmailCategory {
  const t = `${subject ?? ""}\n${body ?? ""}`.toLowerCase();
  if (!t.trim()) return "other";

  let denied = false;
  const withoutNegatedOffers = t.replace(NEGATED_OFFER, (match: string, offset: number) => {
    if (isOfferDenial(match, t.slice(offset + match.length, offset + match.length + 30))) {
      denied = true;
    }
    return " ";
  });
  if (/\b(job )?offer\b|pleased to offer|offer letter|extend(ing)? (you )?an offer|compensation package/.test(withoutNegatedOffers)) {
    return "offer";
  }
  // A plain "we are unable to offer you the position" carries no other rejection keyword.
  if (denied || REJECTION_RE.test(t)) {
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
