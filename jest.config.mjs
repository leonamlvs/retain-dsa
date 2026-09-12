const transform = {
  '^.+\\.[tj]sx?$': [
    '@swc/jest',
    {
      jsc: {
        parser: { syntax: 'typescript', tsx: true },
        target: 'es2022',
        transform: { react: { runtime: 'automatic' } },
      },
      module: { type: 'es6' },
    },
  ],
};
const common = {
  transform,
  extensionsToTreatAsEsm: ['.ts', '.tsx'],
  moduleNameMapper: { '^(\\.{1,2}/.*)\\.js$': '$1' },
  clearMocks: true,
};
export default {
  projects: [
    {
      ...common,
      displayName: 'unit-api',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/tests/unit/api/**/*.spec.ts'],
      setupFilesAfterEnv: ['<rootDir>/tests/support/no-network.ts'],
    },
    {
      ...common,
      displayName: 'unit-web',
      testEnvironment: '<rootDir>/tests/support/jsdom-environment.mjs',
      testMatch: ['<rootDir>/tests/unit/web/**/*.spec.tsx'],
      setupFilesAfterEnv: ['<rootDir>/tests/support/web-setup.ts'],
    },
    {
      ...common,
      displayName: 'provider',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/tests/integration/provider/**/*.spec.ts'],
      setupFilesAfterEnv: ['<rootDir>/tests/support/no-network.ts'],
    },
    {
      ...common,
      displayName: 'database',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/tests/integration/database/**/*.spec.ts'],
      testTimeout: 120000,
    },
  ],
};
