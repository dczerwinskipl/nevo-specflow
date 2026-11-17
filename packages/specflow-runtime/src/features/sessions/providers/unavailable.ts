import type { ProviderDescriptor } from '@nevo/specflow-contracts/sessions';
import { SessionError } from '../errors';

export type ProviderUnavailableCode = Exclude<
  NonNullable<ProviderDescriptor['reasonCode']>,
  | 'AUTHENTICATION_REQUIRED'
  | 'SPECIFICATION_WORKTREE_UNSUPPORTED'
  | 'NOT_ALLOWED_BY_PROJECT'
  | 'NOT_ENABLED_ON_WORKSTATION'
>;

/**
 * A provider is unavailable for a specific, catalogue-visible reason. The message says what was
 * found and why it cannot be used; the catalogue shows it with the code's what-to-do hint.
 */
export class ProviderUnavailableError extends SessionError {
  readonly reasonCode: ProviderUnavailableCode;
  /** What discovery established: the executable it found, or every place it looked. */
  readonly executable?: ProviderDescriptor['executable'];
  readonly checkedLocations?: ProviderDescriptor['checkedLocations'];
  constructor(
    reasonCode: ProviderUnavailableCode,
    message: string,
    facts: Pick<ProviderDescriptor, 'executable' | 'checkedLocations'> = {},
  ) {
    super('PROVIDER_UNAVAILABLE', message);
    this.name = 'ProviderUnavailableError';
    this.reasonCode = reasonCode;
    if (facts.executable) {
      this.executable = facts.executable;
    }

    if (facts.checkedLocations) {
      this.checkedLocations = facts.checkedLocations;
    }
  }
}

/**
 * An installation inspection's refusal of a found, working executable: its login source,
 * environment or machine-managed policy is outside the supported configuration. A sign-in
 * requirement and an already classified reason pass through unchanged.
 */
export function installationUnavailable(error: unknown): never {
  if (
    error instanceof SessionError &&
    error.code === 'PROVIDER_UNAVAILABLE' &&
    !(error instanceof ProviderUnavailableError)
  ) {
    throw new ProviderUnavailableError('INSTALLATION_UNAVAILABLE', error.message);
  }

  throw error;
}
