/**
 * Gap aggregation (spec #18 — career-growth advisor). Pure: roll up the recurring CV-match gaps
 * across the user's evaluations (spec #3 `blocks.cvMatch.gaps`) so the advisor can target the
 * skills that keep reducing fit. No I/O; unit-tested.
 */
export interface GapCount {
  skill: string;
  frequency: number;
}

export function aggregateGaps(
  items: { gaps: string[] }[],
  limit = 12,
): GapCount[] {
  const map = new Map<string, { display: string; count: number }>();
  for (const item of items) {
    for (const raw of item.gaps ?? []) {
      if (typeof raw !== "string") continue;
      const trimmed = raw.trim();
      const key = trimmed.toLowerCase();
      if (!key) continue;
      const existing = map.get(key);
      if (existing) existing.count += 1;
      else map.set(key, { display: trimmed, count: 1 });
    }
  }
  return [...map.values()]
    .map((e) => ({ skill: e.display, frequency: e.count }))
    .sort((a, b) => b.frequency - a.frequency)
    .slice(0, limit);
}
