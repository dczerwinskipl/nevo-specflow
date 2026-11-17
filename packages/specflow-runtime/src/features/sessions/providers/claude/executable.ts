import { win32 } from 'node:path';
import { semanticVersion, type ProviderExecutableDeclaration } from '../executable';

/**
 * Where Anthropic's installers put the native Windows `claude.exe`:
 * - the native installer (`install.ps1`) installs `%USERPROFILE%\.local\bin\claude.exe`;
 * - the npm package `@anthropic-ai/claude-code` declares `bin/claude.exe`, which its install script
 *   replaces with the platform's native binary (a placeholder that is never replaced fails the
 *   version check).
 */
export const claudeExecutable: ProviderExecutableDeclaration = {
  providerId: 'claude',
  title: 'Claude',
  command: 'claude',
  versionArguments: ['--version'],
  parseVersion(output) {
    const match = /^(\S+) \(Claude Code\)$/.exec(output);

    return match ? semanticVersion(match[1]!) : undefined;
  },
  npmPackage: {
    name: '@anthropic-ai/claude-code',
    executables: [win32.join('node_modules', '@anthropic-ai', 'claude-code', 'bin', 'claude.exe')],
  },
  installLocations(environment) {
    const home = environment.USERPROFILE;

    return home
      ? [
          {
            location: 'claude-native-installer',
            pattern: win32.join(home, '.local', 'bin', 'claude.exe'),
          },
        ]
      : [];
  },
  signInArguments: ['auth', 'login'],
};
