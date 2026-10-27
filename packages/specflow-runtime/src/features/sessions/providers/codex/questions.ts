import type { RespondInteraction } from '@nevo/specflow-contracts/sessions';
import { SessionError } from '../../errors';
import { validateDriverFact } from '../facts';
import type { DriverFact } from '../../persistence/protocol';
import { CodexRpcError, rpcObject } from './rpc';

function bounded(value: unknown, bytes: number): string {
  if (typeof value !== 'string' || !value.trim() || Buffer.byteLength(value) > bytes) {
    throw new CodexRpcError('protocol');
  }

  return value;
}

export function prepareCodexQuestions(params: Record<string, unknown>, sequence: number) {
  if (
    !Number.isSafeInteger(sequence) ||
    sequence < 1 ||
    sequence > 1024 ||
    params.isBlocking !== true ||
    !Array.isArray(params.questions) ||
    !params.questions.length ||
    params.questions.length > 4
  ) {
    throw new CodexRpcError('protocol');
  }

  const nativeIds = new Set<string>();
  const questions = params.questions.map((value, index) => {
    const native = rpcObject(value);
    // Secret collection is not part of ordinary durable conversation. Reject before
    // allocating any Work/interaction; never turn secrets into canonical answer text.
    if (native.isSecret === true) {
      throw new SessionError(
        'CAPABILITY_UNSUPPORTED',
        'Secret questions are unsupported in managed conversation.',
      );
    }

    const nativeId = bounded(native.id, 128);
    if (nativeIds.has(nativeId)) {
      throw new CodexRpcError('protocol');
    }

    nativeIds.add(nativeId);
    const prompt = bounded(native.question, 4096);
    const source = native.options ?? [];
    if (!Array.isArray(source) || source.length > 20) {
      throw new CodexRpcError('protocol');
    }

    const choices = source.map((entry, option) => {
      const choice = rpcObject(entry);

      return {
        id: String(option),
        label: bounded(choice.label, 512),
        description: bounded(choice.description, 2048),
      };
    });
    if (new Set(choices.map((choice) => choice.label)).size !== choices.length) {
      throw new CodexRpcError('protocol');
    }

    const interaction: Extract<DriverFact, { kind: 'interaction' }>['interaction'] = {
      kind: 'question',
      prompt: [prompt, ...choices.map((choice) => choice.label + ': ' + choice.description)].join(
        '\n\n',
      ),
      allowText: !choices.length || native.isOther === true,
      maxSelections: 1,
      ...(choices.length ? { options: choices.map(({ id, label }) => ({ id, label })) } : {}),
    };
    const key = 'codex-question:' + sequence + ':' + index;
    validateDriverFact({ kind: 'interaction', key, interaction });

    return { nativeId, key, interaction, choices };
  });
  const answered = new Map<number, string[]>();

  return {
    questions: questions.map(({ key, interaction }) => ({ key, interaction })),
    respond(index: number, response: RespondInteraction) {
      const question = questions[index];
      if (!question || answered.has(index)) {
        throw new SessionError('INTERACTION_EXPIRED', 'The native question is no longer pending.');
      }

      if (response.kind !== 'question' || response.answer.optionIds.length > 1) {
        throw new SessionError('INTERACTION_RESPONSE_INVALID', 'Select one question option.');
      }

      const labels = response.answer.optionIds.map((id) => {
        const choice = question.choices.find((choice) => choice.id === id);
        if (!choice) {
          throw new SessionError('INTERACTION_RESPONSE_INVALID', 'Unknown question option.');
        }

        return choice.label;
      });
      const custom = response.answer.text ?? '';
      if (Buffer.byteLength(custom) > 16384 || (custom && !question.interaction.allowText)) {
        throw new SessionError(
          'INTERACTION_RESPONSE_INVALID',
          'Question text answer is unsupported or oversized.',
        );
      }

      if (custom.trim()) {
        labels.push(custom);
      }

      if (!labels.length) {
        throw new SessionError('INTERACTION_RESPONSE_INVALID', 'An answer is required.');
      }

      answered.set(index, labels);
      if (answered.size !== questions.length) {
        return undefined;
      }

      return {
        answers: Object.fromEntries(
          questions.map((question, at) => [question.nativeId, { answers: answered.get(at)! }]),
        ),
      };
    },
  };
}
