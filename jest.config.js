module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.js'],
  collectCoverageFrom: ['backend/services/**/*.js'],
  coveragePathIgnorePatterns: ['/node_modules/']
};
