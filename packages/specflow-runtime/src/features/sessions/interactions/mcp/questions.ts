import { Type } from 'typebox';
import { Value } from 'typebox/value';
import {
  RespondInteractionSchema,
  type RespondInteraction,
} from '@nevo/specflow-contracts/sessions';
import type { DriverFact } from '../../persistence/protocol';
import { SessionError } from '../../errors';
import { validateDriverFact } from '../../providers/facts';

const closed = { additionalProperties: false } as const;
export const McpQuestionEndpoint = {
  serverName: 'specflow-interactions',
  toolName: 'ask_user',
} as const;
export const mcpQuestionSchema = Type.Object(
  {
    question: Type.String({ minLength: 1, maxLength: 8192 }),
    options: Type.Optional(
      Type.Array(
        Type.Object(
          {
            id: Type.String({ minLength: 1, maxLength: 128 }),
            label: Type.String({ minLength: 1, maxLength: 512 }),
          },
          closed,
        ),
        { minItems: 1, maxItems: 20 },
      ),
    ),
    allowText: Type.Optional(Type.Boolean()),
    maxSelections: Type.Optional(Type.Integer({ minimum: 1, maximum: 20 })),
  },
  closed,
);
type Question = Extract<DriverFact, { kind: 'interaction' }>['interaction'] & {
  kind: 'question';
};

export function prepareMcpQuestion(input: unknown): Question {
  if (!Value.Check(mcpQuestionSchema, input) || !input.question.trim()) {
    throw new SessionError('SESSION_INPUT_INVALID', 'Invalid MCP question.');
  }

  const allowText = input.allowText ?? true;
  const options = input.options;
  const maxSelections = options ? (input.maxSelections ?? 1) : undefined;
  if (
    (!allowText && !options?.length) ||
    (!options && input.maxSelections !== undefined) ||
    (options && maxSelections! > options.length) ||
    options?.some((option) => !option.label.trim())
  ) {
    throw new SessionError('SESSION_INPUT_INVALID', 'Invalid MCP question choices.');
  }

  const question: Question = {
    kind: 'question',
    prompt: input.question,
    allowText,
    ...(options ? { options: structuredClone(options), maxSelections } : {}),
  };
  validateDriverFact({ kind: 'interaction', key: 'validation', interaction: question });

  return question;
}

/** Called only after canonical response admission; rechecks the native mapping
 * without creating another admission journal or interpreting an answer as permission. */
export function mcpQuestionAnswer(question: Question, response: RespondInteraction) {
  if (!Value.Check(RespondInteractionSchema, response) || response.kind !== 'question') {
    throw new SessionError('INTERACTION_RESPONSE_INVALID', 'Expected a question answer.');
  }

  const { optionIds, text } = response.answer;
  const options = question.options ?? [];
  if (
    optionIds.some((id) => !options.some((option) => option.id === id)) ||
    optionIds.length > (question.maxSelections ?? 0) ||
    (text !== undefined && (!question.allowText || Buffer.byteLength(text) > 16384)) ||
    (!optionIds.length && !text?.trim())
  ) {
    throw new SessionError('INTERACTION_RESPONSE_INVALID', 'Answer does not match the question.');
  }

  return JSON.stringify({
    selections: optionIds.map((id) => options.find((option) => option.id === id)!),
    ...(text === undefined ? {} : { text }),
  });
}
