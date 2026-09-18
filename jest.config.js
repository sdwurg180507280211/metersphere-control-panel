module.exports = {
  testEnvironment: 'node',
  modulePathIgnorePatterns: ['<rootDir>/dist/'],
  testMatch: ['<rootDir>/backend/__tests__/**/*.test.js'],
  collectCoverageFrom: ['backend/services/**/*.js'],
  coveragePathIgnorePatterns: ['/node_modules/']
};
