import type {
  Interaction,
  RespondInteraction,
  WorkSummary,
} from '@nevo/specflow-contracts/sessions';

const QUESTION_MAX = 1024;
const ANSWER_TEXT_MAX = 2048;

/**
 * At most `max` UTF-16 units (the contract's `maxLength`), never splitting a surrogate pair; an
 * ellipsis marks a cut.
 */
function bounded(text: string, max: number): string {
  if (text.length <= max) {
    return text;
  }

  let cut = max - 1;
  const last = text.charCodeAt(cut - 1);
  if (last >= 0xd800 && last <= 0xdbff) {
    cut--;
  }

  return text.slice(0, cut) + '…';
}

/**
 * What the person was asked and what they answered, recorded on the question's Work when the answer
 * is accepted (the same transaction that settles it), so the Work history can say "Scope → All
 * batches" without reading the transcript. Bounded: the question's first paragraph (the provider's
 * question; the prompt continues with option details), its option labels, the free text.
 */
export function answeredQuestion(
  interaction: Extract<Interaction, { kind: 'question' }>,
  answer: Extract<RespondInteraction, { kind: 'question' }>['answer'],
): NonNullable<WorkSummary['question']> {
  const question = interaction.prompt.split('\n\n')[0]?.trim() ?? '';
  const text = answer.text?.trim();

  return {
    ...(interaction.header ? { header: interaction.header } : {}),
    text: bounded(question === '' ? interaction.prompt : question, QUESTION_MAX),
    ...(interaction.options?.length
      ? { options: interaction.options.map(({ id, label }) => ({ id, label })) }
      : {}),
    answer: {
      optionIds: [...answer.optionIds],
      ...(text ? { text: bounded(text, ANSWER_TEXT_MAX) } : {}),
    },
  };
}
