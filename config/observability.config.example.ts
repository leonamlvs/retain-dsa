export const observabilityConfig = {
  logging: {
    level: 'info',
    prettyInDevelopment: true,
  },

  telemetry: {
    enabled: false,
  },

  decisions: {
    persistScoreBreakdown: true,
  },
} as const;
