import type { ProviderDescriptor } from '@nevo/specflow-contracts/sessions';
import { ProviderUnavailableError } from '../unavailable';
import type { ExecutableResolution, ProviderExecutableDeclaration } from './locate';

/**
 * The CLI's sign-in command as the user can type it: the bare command when PATH finds it, else the
 * resolved executable (with PowerShell's call operator when the path has a space).
 */
export function signInCommand(
  declaration: ProviderExecutableDeclaration,
  resolution?: ExecutableResolution,
): string {
  const program =
    !resolution || resolution.source === 'path'
      ? declaration.command
      : resolution.path.includes(' ')
        ? `& "${resolution.path}"`
        : resolution.path;

  return [program, ...declaration.signInArguments].join(' ');
}

/**
 * The discovery facts of a catalogue entry: what an executable failure found or where it looked,
 * else the executable discovery resolved (also after a later check of that executable failed).
 */
export function executableFields(
  declaration: ProviderExecutableDeclaration,
  resolution: ExecutableResolution | undefined,
  error?: unknown,
): Pick<
  ProviderDescriptor,
  'executable' | 'checkedLocations' | 'unresolvedLauncher' | 'signInCommand'
> {
  if (error instanceof ProviderUnavailableError && (error.executable || error.checkedLocations)) {
    return {
      ...(error.executable ? { executable: error.executable } : {}),
      ...(error.checkedLocations ? { checkedLocations: error.checkedLocations } : {}),
      ...(error.unresolvedLauncher ? { unresolvedLauncher: error.unresolvedLauncher } : {}),
      signInCommand: signInCommand(declaration),
    };
  }

  return {
    ...(resolution ? { executable: { ...resolution } } : {}),
    signInCommand: signInCommand(declaration, resolution),
  };
}

/** `descriptor` with its discovery facts replaced by `fields`. */
export function withExecutableFields(
  descriptor: ProviderDescriptor,
  fields: ReturnType<typeof executableFields>,
): ProviderDescriptor {
  const next = { ...descriptor, ...fields };
  if (!fields.executable) {
    delete next.executable;
  }

  if (!fields.checkedLocations) {
    delete next.checkedLocations;
  }

  if (!fields.unresolvedLauncher) {
    delete next.unresolvedLauncher;
  }

  return next;
}
