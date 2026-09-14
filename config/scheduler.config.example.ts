export const schedulerConfig = {
  queueSize: 5,

  retention: {
    reviewThreshold: 0.8,
    regressionThreshold: 0.5,
  },

  progression: {
    positiveEvidenceRequired: 2,
  },

  problemCooldown: {
    intervalMultiplier: 3,
    minimumDays: 30,
    maximumDays: 180,
  },
} as const;

// MVP tuning values. Validate relationships at startup.
// Do not treat these numbers as immutable pedagogical truths.
