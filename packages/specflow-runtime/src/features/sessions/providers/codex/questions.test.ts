import { expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { prepareCodexQuestions } from './questions';
import { prepareCodexPermission } from './permissions';

const choice = { label: 'One', description: 'First choice' };
const question = { id: 'native-question', header: 'Header', question: 'Choose', options: [choice] };
it('retains partial grouped answers and emits one complete native response', () => {
  const group = prepareCodexQuestions(
    { isBlocking: true, questions: [question, { ...question, id: 'second', isOther: true }] },
    1,
  );
  expect(
    group.respond(0, { requestId: randomUUID(), kind: 'question', answer: { optionIds: ['0'] } }),
  ).toBeUndefined();
  expect(
    group.respond(1, {
      requestId: randomUUID(),
      kind: 'question',
      answer: { optionIds: [], text: 'Custom' },
    }),
  ).toEqual({
    answers: { 'native-question': { answers: ['One'] }, second: { answers: ['Custom'] } },
  });
  expect(() =>
    group.respond(0, { requestId: randomUUID(), kind: 'question', answer: { optionIds: ['0'] } }),
  ).toThrow();
});
it('rejects secret, nonblocking, duplicate and ambiguous questions before admission', () => {
  for (const input of [
    { isBlocking: false, questions: [question] },
    { isBlocking: true, questions: [{ ...question, isSecret: true }] },
    { isBlocking: true, questions: [question, question] },
    { isBlocking: true, questions: [{ ...question, options: [choice, choice] }] },
  ])
    expect(() => prepareCodexQuestions(input, 1)).toThrow();
});
it('maps exactly one permission without session or persistent grants', () => {
  const group = prepareCodexPermission(['workspace/file.txt'], 1);
  expect(() =>
    group.respond(0, { requestId: randomUUID(), kind: 'question', answer: { optionIds: [] } }),
  ).toThrow();
  expect(
    group.respond(0, { requestId: randomUUID(), kind: 'permission', decision: 'allow' }),
  ).toEqual({ decision: 'accept' });
  expect(() =>
    group.respond(0, { requestId: randomUUID(), kind: 'permission', decision: 'allow' }),
  ).toThrow();
  const denied = prepareCodexPermission(['workspace/file.txt'], 2);
  expect(
    denied.respond(0, { requestId: randomUUID(), kind: 'permission', decision: 'deny' }),
  ).toEqual({ decision: 'decline' });
});
