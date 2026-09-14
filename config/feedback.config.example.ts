export const feedbackConfig = {
  weights: {
    independence: 0.35,
    recognition: 0.3,
    implementation: 0.2,
    complexity: 0.15,
  },

  ratings: {
    againMaxExclusive: 0.4,
    hardMaxExclusive: 0.6,
    goodMaxExclusive: 0.85,
  },
} as const;

// Illustrative decimal values only. The validated runtime config uses fixed-point
// units and explicit assistance/UNABLE caps in apps/api/src/config/default-config.ts.
// See accepted ADR 006; do not restore inclusive .59/.84 gaps.
