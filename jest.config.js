module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.ts'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  collectCoverageFrom: ['nodes/**/*.ts', 'credentials/**/*.ts'],
  coveragePathIgnorePatterns: ['/node_modules/', '/dist/'],
  testTimeout: 60000, // 60s for API calls
  setupFiles: ['dotenv/config'],
  verbose: true,
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      tsconfig: 'tests/tsconfig.json',
    }],
  },
};
