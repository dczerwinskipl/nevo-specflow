import { win32 } from 'node:path';
import { semanticVersion, type ProviderExecutableDeclaration } from '../executable';

/**
 * Where the Antigravity CLI installer puts `agy.exe`: `%LOCALAPPDATA%\agy\bin\agy.exe`. It is not
 * distributed through npm. The CLI has no sign-in subcommand: starting it signs in.
 */
export const antigravityExecutable: ProviderExecutableDeclaration = {
  providerId: 'antigravity',
  title: 'Antigravity',
  command: 'agy',
  versionArguments: ['--version'],
  parseVersion: semanticVersion,
  npmPackageExecutables: [],
  installLocations(environment) {
    const local = environment.LOCALAPPDATA;

    return local
      ? [
          {
            label: 'Antigravity CLI installer',
            pattern: win32.join(local, 'agy', 'bin', 'agy.exe'),
          },
        ]
      : [];
  },
  signInArguments: [],
};
