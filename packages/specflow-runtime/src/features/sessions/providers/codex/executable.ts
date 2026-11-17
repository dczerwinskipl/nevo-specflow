import { win32 } from 'node:path';
import { semanticVersion, type ProviderExecutableDeclaration } from '../executable';

const npmTarget = ['vendor', 'x86_64-pc-windows-msvc', 'bin', 'codex.exe'];

/**
 * Where OpenAI's installers put the native Windows x64 `codex.exe`:
 * - the Codex desktop app (Microsoft Store package `OpenAI.Codex`) unpacks its bundled CLI into
 *   `%LOCALAPPDATA%\OpenAI\Codex\bin\<build hash>\`, a new folder per app update;
 * - the npm package `@openai/codex` runs the native binary of its platform package
 *   `@openai/codex-win32-x64` (nested under the package or hoisted), or of its own `vendor` folder.
 * The macOS app bundle is not listed: the adapter runs on Windows x64 only.
 */
export const codexExecutable: ProviderExecutableDeclaration = {
  providerId: 'codex',
  title: 'Codex',
  command: 'codex',
  versionArguments: ['--version'],
  parseVersion(output) {
    const match = /^codex-cli (\S+)$/.exec(output);

    return match ? semanticVersion(match[1]!) : undefined;
  },
  npmPackageExecutables: [
    win32.join(
      'node_modules',
      '@openai',
      'codex',
      'node_modules',
      '@openai',
      'codex-win32-x64',
      ...npmTarget,
    ),
    win32.join('node_modules', '@openai', 'codex-win32-x64', ...npmTarget),
    win32.join('node_modules', '@openai', 'codex', ...npmTarget),
  ],
  installLocations(environment) {
    const local = environment.LOCALAPPDATA;

    return local
      ? [
          {
            label: 'Codex desktop app',
            pattern: win32.join(local, 'OpenAI', 'Codex', 'bin', '*', 'codex.exe'),
          },
        ]
      : [];
  },
  signInArguments: ['login'],
};
