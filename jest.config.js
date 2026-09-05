module.exports = {
  testEnvironment: 'node',
  modulePathIgnorePatterns: ['<rootDir>/dist/'],
  testMatch: ['**/__tests__/**/*.test.js'],
  collectCoverageFrom: ['backend/services/**/*.js'],
  coveragePathIgnorePatterns: ['/node_modules/']
};
