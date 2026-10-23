import { isHttpClientError } from '@nevo/http-client';
import type { CreateFailure } from './createFailure';
import { protectedBranchFailure, type SentCreate } from './createSpecErrors';
import { RequestNotSentError } from '../creationPipeline';

/**
 * Codes that mean "an option you chose is no longer valid". The Engine answers an unusable
 * integration target and other bad input alike with `CREATE_OPERATION_INVALID`, so the field cannot
 * be named. `DEMO_WORKSPACE_UNAVAILABLE` is a demo-only code (the Engine overloads other codes).
 */
const staleCodes = new Set([
  'DEMO_WORKSPACE_UNAVAILABLE',
  'CREATE_OPERATION_INVALID',
  'BASE_REF_NOT_FOUND',
]);

/**
 * Maps a failed demo create (a raw HTTP client error with a body to sniff) to the UX state. Transport rule (F-02): only a request that was never
 * dispatched ({@link RequestNotSentError}) is a definite "nothing happened". Anything that fails
 * after dispatch without a coded answer (timeout, reset, abort, answer without a body) may have
 * been committed by the server, so it is uncertain and only the same operation may be checked.
 */
export function classifyDemoCreateFailure(error: unknown, sent: SentCreate = {}): CreateFailure {
  if (error instanceof RequestNotSentError) return { kind: 'offline' };
  if (!isHttpClientError(error) || error.kind === 'cancelled') return { kind: 'uncertain' };
  if (error.kind !== 'http') return { kind: 'uncertain' };
  const data = error.data;
  const code =
    typeof data === 'object' && data && 'code' in data && typeof data.code === 'string'
      ? data.code
      : undefined;
  const raw =
    typeof data === 'object' && data && 'error' in data && typeof data.error === 'string'
      ? data.error
      : undefined;
  if (code === 'BRANCH_ALREADY_EXISTS')
    return { kind: 'branch-exists', automatic: !sent.customBranch };
  if (code && staleCodes.has(code)) return { kind: 'stale', code };
  if (code === 'CREATE_CONFLICT') return { kind: 'operation-conflict' };
  if (code === 'CREATE_RECOVERY_REQUIRED') return { kind: 'recovery-required' };
  // The files were written but could not be committed (503): recovery, never a blind retry.
  if (code === 'COMMIT_FAILED') return { kind: 'recovery-required', committed: true };
  // Nothing was created: the branch is protected (422) / the checkout cannot commit now (409).
  if (code === 'BRANCH_PROTECTED') return protectedBranchFailure(sent);
  if (code === 'COMMIT_BLOCKED') return { kind: 'commit-blocked' };
  // Authorization answers carry no `code`: `{ error: 'forbidden' }` (403) / `authentication_required` (401).
  if (error.status === 403) return { kind: 'forbidden' };
  if (error.status === 401) return { kind: 'unauthenticated' };
  // A definitive answer carries a body; an answer without one proves nothing about the commit.
  if (code === undefined && raw === undefined) return { kind: 'uncertain' };
  return { kind: 'failed' };
}
