/**
 * Where a platform-dependent CLI test runs (the same classification as the Engine helper in
 * packages/specflow-engine/test/support/platform.ts, kept apart because packages do not import each
 * other's tests): SIGKILL and `/proc` tests are Linux-only.
 */
export const onLinux: boolean = process.platform === 'linux';
export const onPosix: boolean = process.platform !== 'win32';
