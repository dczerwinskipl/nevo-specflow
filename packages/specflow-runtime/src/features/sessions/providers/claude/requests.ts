import type { RespondInteraction } from '@nevo/specflow-contracts/sessions';
import type { DriverFact } from '../../persistence/protocol';
import { SessionError } from '../../errors';
import { validateDriverFact } from '../facts';
import { ClaudeProtocolError, identifier, object } from './protocol';

/** Literal caller text must not invoke slash commands or native @path/MCP expansion.
 * Supported by Claude >=2.1.248; certification must bind the installed executable.
 */
export function claudeUserMessage(message: string, sessionId: string) {
  identifier(sessionId);
  if (!message.trim() || Buffer.byteLength(message) > 128 * 1024) throw new ClaudeProtocolError();
  return {
    type: 'user',
    session_id: sessionId,
    client_composed: true,
    message: { role: 'user', content: message },
    parent_tool_use_id: null,
  } as const;
}

type CanonicalQuestion = Extract<DriverFact, { kind: 'interaction' }>['interaction'];
interface Question {
  nativeText: string;
  labels: string[];
  interaction: CanonicalQuestion;
  native: {
    question: string;
    header?: string;
    multiSelect: boolean;
    options: { label: string; description?: string }[];
  };
}
function boundedText(value: unknown, bytes: number): string {
  if (typeof value !== 'string' || !value.trim() || Buffer.byteLength(value) > bytes)
    throw new ClaudeProtocolError();
  return value;
}

/** One native request can contain several canonical questions. This pure mapping
 * retains only bounded question data, never a permission policy or arbitrary tool input.
 */
export function prepareClaudeQuestion(frame: unknown) {
  const envelope = object(frame);
  if (envelope.type !== 'control_request') throw new ClaudeProtocolError();
  const requestId = identifier(envelope.request_id);
  const request = object(envelope.request);
  if (request.subtype !== 'can_use_tool') throw new ClaudeProtocolError();
  const deny = {
    type: 'control_response',
    response: {
      subtype: 'success',
      request_id: requestId,
      response: {
        behavior: 'deny',
        message: 'This operation is outside the allowed Session capabilities.',
      },
    },
  } as const;
  if (request.tool_name !== 'AskUserQuestion') return { kind: 'denied' as const, response: deny };
  const toolId = identifier(request.tool_use_id);
  const input = object(request.input);
  if (!Array.isArray(input.questions) || input.questions.length < 1 || input.questions.length > 4)
    throw new ClaudeProtocolError();
  if (Buffer.byteLength(JSON.stringify(input)) > 24 * 1024) throw new ClaudeProtocolError();
  const questions: Question[] = input.questions.map((value) => {
    const question = object(value);
    const nativeText = boundedText(question.question, 4096);
    if (question.multiSelect !== undefined && typeof question.multiSelect !== 'boolean')
      throw new ClaudeProtocolError();
    if (
      !Array.isArray(question.options) ||
      question.options.length < 1 ||
      question.options.length > 20
    )
      throw new ClaudeProtocolError();
    const options = question.options.map((option, index) => {
      const entry = object(option);
      return {
        id: String(index),
        label: boundedText(entry.label, 512),
        ...(entry.description === undefined
          ? {}
          : { description: boundedText(entry.description, 2048) }),
      };
    });
    if (new Set(options.map((option) => option.label)).size !== options.length)
      throw new ClaudeProtocolError();
    const details = options
      .filter((option) => option.description)
      .map((option) => option.label + ': ' + option.description)
      .join('\n');
    const prompt = [
      nativeText,
      question.multiSelect
        ? 'Select any applicable options or enter your answer.'
        : 'Select one option or enter your answer.',
      details,
    ]
      .filter(Boolean)
      .join('\n\n');
    if (Buffer.byteLength(prompt) > 8192) throw new ClaudeProtocolError();
    return {
      nativeText,
      labels: options.map((option) => option.label),
      interaction: {
        kind: 'question',
        prompt,
        allowText: true,
        maxSelections: question.multiSelect ? options.length : 1,
        options: options.map(({ id, label }) => ({ id, label })),
      },
      native: {
        question: nativeText,
        ...(question.header === undefined ? {} : { header: boundedText(question.header, 128) }),
        multiSelect: question.multiSelect === true,
        options: options.map(({ label, description }) => ({
          label,
          ...(description === undefined ? {} : { description }),
        })),
      },
    };
  });
  if (new Set(questions.map((question) => question.nativeText)).size !== questions.length)
    throw new ClaudeProtocolError();
  const canonical = questions.map((question, index) => ({
    key: 'question:' + requestId + ':' + index,
    interaction: question.interaction,
  }));
  // Preflight every generated question before the caller allocates any Work. JSON escaping
  // and descriptions can make the canonical envelope larger than the native input.
  for (const question of canonical) validateDriverFact({ kind: 'interaction', ...question });
  const answers = new Map<number, string>();
  return {
    kind: 'questions' as const,
    requestId,
    toolId,
    questions: canonical,
    respond(index: number, response: RespondInteraction) {
      const question = questions[index];
      if (!question || answers.has(index))
        throw new SessionError('INTERACTION_EXPIRED', 'The native question is no longer pending.');
      if (response.kind !== 'question')
        throw new SessionError('INTERACTION_RESPONSE_INVALID', 'A question answer is required.');
      const ids = response.answer.optionIds;
      if (!question.native.multiSelect && ids.length > 1)
        throw new SessionError('INTERACTION_RESPONSE_INVALID', 'Select one question option.');
      const labels = ids.map((id) => {
        const option = question.labels.find((_label, at) => String(at) === id);
        if (option === undefined)
          throw new SessionError('INTERACTION_RESPONSE_INVALID', 'Unknown question option.');
        return option;
      });
      if (new Set(ids).size !== ids.length)
        throw new SessionError('INTERACTION_RESPONSE_INVALID', 'Duplicate question option.');
      const custom = response.answer.text ?? '';
      if (Buffer.byteLength(custom) > 16384)
        throw new SessionError('INTERACTION_RESPONSE_INVALID', 'Answer exceeds its byte budget.');
      const answer = [...labels, ...(custom.trim() ? [custom] : [])].join(', ');
      if (!answer) throw new SessionError('INTERACTION_RESPONSE_INVALID', 'An answer is required.');
      answers.set(index, answer);
      if (answers.size !== questions.length) return undefined;
      return {
        type: 'control_response',
        response: {
          subtype: 'success',
          request_id: requestId,
          response: {
            behavior: 'allow',
            updatedInput: {
              questions: questions.map((question) => question.native),
              answers: Object.fromEntries(
                questions.map((question, at) => [question.nativeText, answers.get(at)!]),
              ),
            },
          },
        },
      } as const;
    },
  };
}
