const {
  MIN_BUILD_NODE_VERSION,
  TARGET_ELECTRON_VERSION,
  compareVersions,
  assertSupportedBuildNode,
  getConfiguredElectronVersion,
  assertPackagedElectronVersion
} = require('../../scripts/verify-electron-runtime');

describe('Desktop Electron runtime policy', () => {
  test('requires Node 22.12.0 or newer for packaging', () => {
    expect(MIN_BUILD_NODE_VERSION).toBe('22.12.0');
    expect(() => assertSupportedBuildNode('22.11.0')).toThrow(/Node\.js >= 22\.12\.0/);
    expect(assertSupportedBuildNode('22.12.0')).toBe('22.12.0');
    expect(assertSupportedBuildNode('24.20.0')).toBe('24.20.0');
  });

  test('pins the packaged runtime to Electron 44.3.0', () => {
    expect(TARGET_ELECTRON_VERSION).toBe('44.3.0');
    expect(getConfiguredElectronVersion({ build: { electronVersion: '44.3.0' } })).toBe('44.3.0');
    expect(() => getConfiguredElectronVersion({ build: { electronVersion: '44.2.0' } })).toThrow(/44\.3\.0/);
  });

  test('rejects artifacts built with a different Electron runtime', () => {
    expect(assertPackagedElectronVersion('44.3.0')).toBe('44.3.0');
    expect(() => assertPackagedElectronVersion('28.3.3')).toThrow(/运行时版本不一致/);
  });

  test('compares numeric versions without an external semver dependency', () => {
    expect(compareVersions('44.3.0', '44.2.9')).toBe(1);
    expect(compareVersions('44.3.0', '44.3.0')).toBe(0);
    expect(compareVersions('22.11.9', '22.12.0')).toBe(-1);
  });
});
