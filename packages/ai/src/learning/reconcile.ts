/**
 * Two-layer data contract (spec #13 — personalization / learning loop).
 *
 * Layer 1 = system defaults (immutable, upgradeable independently). Layer 2 = the user's own
 * overrides, which ALWAYS win. The reconcile is a pure, non-mutating merge so a system-pack
 * upgrade can never silently clobber a user's expressed preference.
 */
export function reconcile<T extends Record<string, unknown>>(
  systemLayer: T,
  userLayer: Partial<T>,
): T {
  // New object; inputs are never mutated. User layer wins on key collisions.
  return { ...systemLayer, ...userLayer };
}

/** Specialization for evaluation weights (dimension → percentage). */
export function reconcileWeights(
  systemDefaults: Record<string, number>,
  userOverrides: Record<string, number>,
): Record<string, number> {
  return { ...systemDefaults, ...userOverrides };
}
