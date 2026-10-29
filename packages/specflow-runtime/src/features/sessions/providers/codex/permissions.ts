import type { RespondInteraction } from '@nevo/specflow-contracts/sessions';
import { SessionError } from '../../errors';
import { validateDriverFact } from '../facts';

/** Native shell approvals may lift the OS sandbox. They require a distinct effect
 * policy and are deliberately not represented as ordinary workspace permissions.
 * Patch approval is limited to a previously observed, bounded native patch. */
export function prepareCodexPermission(targets: readonly string[], sequence: number) {
  if (!targets.length || targets.length > 128) {
    throw new SessionError('CAPABILITY_UNSUPPORTED', 'The native patch has no bounded targets.');
  }

  const question = {
    key: 'codex-permission:' + sequence,
    interaction: {
      kind: 'permission' as const,
      prompt: 'Codex requests permission for one workspace patch.',
      actionSummary: 'Apply patch to:\n' + targets.join('\n'),
    },
  };
  validateDriverFact({ kind: 'interaction', ...question });
  let answered = false;

  return {
    questions: [question],
    respond(index: number, response: RespondInteraction) {
      if (index !== 0 || answered) {
        throw new SessionError('INTERACTION_EXPIRED', 'The native permission expired.');
      }

      if (response.kind !== 'permission') {
        throw new SessionError(
          'INTERACTION_RESPONSE_INVALID',
          'A permission decision is required.',
        );
      }

      answered = true;

      return { decision: response.decision === 'allow' ? 'accept' : 'decline' };
    },
  };
}
