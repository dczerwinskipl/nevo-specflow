import type { RespondInteraction } from '@nevo/specflow-contracts/sessions';
import { SessionError } from '../../errors';
import { validateDriverFact } from '../facts';
import { identifier, object } from './protocol';
import { prepareClaudeQuestion } from './requests';

const MAX_INPUT_BYTES = 256 * 1024;
const schemas: Record<string, Record<string, 'string' | 'boolean' | 'number'>> = {
  Bash: {
    command: 'string',
    description: 'string',
    timeout: 'number',
    run_in_background: 'boolean',
    dangerouslyDisableSandbox: 'boolean',
  },
  Write: { file_path: 'string', content: 'string' },
  Edit: { file_path: 'string', old_string: 'string', new_string: 'string', replace_all: 'boolean' },
};

/** A one-operation native approval. Persistent permissions and provider suggestions
 * are never forwarded. Unknown tool shapes remain denied until explicitly supported. */
export function prepareClaudeRequest(frame: unknown, writable: boolean) {
  const fallback = prepareClaudeQuestion(frame);
  if (fallback.kind !== 'denied' || !writable) {
    return fallback;
  }

  const envelope = object(frame);
  const request = object(envelope.request);
  const schema = typeof request.tool_name === 'string' ? schemas[request.tool_name] : undefined;
  if (!schema) {
    return fallback;
  }

  const input = structuredClone(object(request.input));
  if (
    Buffer.byteLength(JSON.stringify(input)) > MAX_INPUT_BYTES ||
    Object.entries(input).some(([key, value]) => !schema[key] || typeof value !== schema[key])
  ) {
    return fallback;
  }

  let summary: string;
  if (request.tool_name === 'Bash') {
    if (
      typeof input.command !== 'string' ||
      !input.command.trim() ||
      Buffer.byteLength(input.command) > 7000 ||
      input.run_in_background === true ||
      input.dangerouslyDisableSandbox === true ||
      (input.timeout !== undefined &&
        (typeof input.timeout !== 'number' ||
          !Number.isSafeInteger(input.timeout) ||
          input.timeout < 1 ||
          input.timeout > 600000))
    ) {
      return fallback;
    }

    summary = 'Run command:\n' + input.command;
  } else {
    if (
      typeof input.file_path !== 'string' ||
      !input.file_path.trim() ||
      Buffer.byteLength(input.file_path) > 4096 ||
      (request.tool_name === 'Write' && typeof input.content !== 'string') ||
      (request.tool_name === 'Edit' &&
        (typeof input.old_string !== 'string' || typeof input.new_string !== 'string'))
    ) {
      return fallback;
    }

    summary =
      String(request.tool_name) +
      ' file: ' +
      input.file_path +
      '\n' +
      (request.tool_name === 'Write'
        ? Buffer.byteLength(input.content as string) + ' bytes'
        : Buffer.byteLength(input.old_string as string) +
          ' → ' +
          Buffer.byteLength(input.new_string as string) +
          ' bytes');
  }

  const requestId = identifier(envelope.request_id);
  const toolId = identifier(request.tool_use_id);
  const question = {
    key: 'permission:' + requestId,
    interaction: {
      kind: 'permission' as const,
      prompt: 'Claude requests permission for one operation.',
      actionSummary: summary,
    },
  };
  validateDriverFact({ kind: 'interaction', ...question });
  let answered = false;

  return {
    kind: 'questions' as const,
    requestId,
    toolId,
    questions: [question],
    respond(index: number, response: RespondInteraction) {
      if (index !== 0 || answered) {
        throw new SessionError(
          'INTERACTION_EXPIRED',
          'The native permission is no longer pending.',
        );
      }

      if (response.kind !== 'permission') {
        throw new SessionError(
          'INTERACTION_RESPONSE_INVALID',
          'A permission decision is required.',
        );
      }

      answered = true;

      return {
        type: 'control_response',
        response: {
          subtype: 'success',
          request_id: requestId,
          response:
            response.decision === 'allow'
              ? { behavior: 'allow', updatedInput: input }
              : { behavior: 'deny', message: 'The user denied this operation.' },
        },
      };
    },
  };
}
