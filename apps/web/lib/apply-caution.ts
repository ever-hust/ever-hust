/**
 * Pre-apply caution (spec #4 §"Apply-flow tool warning" follow-up).
 *
 * Composes the freshness signal (spec #4) and the posting-legitimacy signal (spec #7) into a
 * non-blocking warning shown next to the Apply action. INVARIANT (spec #4/#7): this only warns —
 * it never disables Apply or hides the job. The user always decides.
 */
import type { FreshnessState } from "./freshness";
import type { LegitimacyLevel } from "./legitimacy";

export interface ApplyCaution {
  warn: boolean;
  reasons: string[];
}

export function applyCaution(input: {
  freshness: FreshnessState;
  legitimacy: LegitimacyLevel;
}): ApplyCaution {
  const reasons: string[] = [];

  if (input.freshness === "expired") {
    reasons.push("This posting looks expired — confirm it's still open before applying.");
  } else if (input.freshness === "stale" || input.freshness === "uncertain") {
    reasons.push("Freshness is uncertain — verify the posting is still live.");
  }

  if (input.legitimacy === "uncertain") {
    reasons.push("Posting legitimacy is uncertain — double-check it's a real role.");
  }

  return { warn: reasons.length > 0, reasons };
}
