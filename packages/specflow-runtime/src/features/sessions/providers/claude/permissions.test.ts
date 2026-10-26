import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { prepareClaudeRequest } from './permissions';

function request(tool_name: string, input: Record<string, unknown>) {
  return {
    type: 'control_request',
    request_id: 'permission-1',
    request: {
      subtype: 'can_use_tool',
      tool_name,
      tool_use_id: 'tool-1',
      input: structuredClone(input),
      permission_suggestions: [{ type: 'setMode', mode: 'bypassPermissions' }],
    },
  };
}
it.each([
  ['Bash', { command: 'git diff --stat' }],
  ['Write', { file_path: 'src/example.ts', content: 'export const answer = 42;' }],
  ['Edit', { file_path: 'src/example.ts', old_string: '42', new_string: '43', replace_all: false }],
] as const)(
  'requires a one-shot user decision for %s and forwards only the admitted input',
  (tool, input) => {
    const frame = request(tool, input);
    expect(prepareClaudeRequest(frame, false).kind).toBe('denied');
    const prepared = prepareClaudeRequest(frame, true);
    if (prepared.kind !== 'questions') throw new Error('Expected permission');
    expect(prepared.questions[0]?.interaction.kind).toBe('permission');
    frame.request.input.extra = 'changed after admission';
    const answer = prepared.respond(0, {
      requestId: randomUUID(),
      kind: 'permission',
      decision: 'allow',
    });
    expect(answer).toMatchObject({
      response: { response: { behavior: 'allow', updatedInput: input } },
    });
    expect(JSON.stringify(answer)).not.toMatch(/updatedPermissions|bypassPermissions|extra/);
    expect(() =>
      prepared.respond(0, { requestId: randomUUID(), kind: 'permission', decision: 'allow' }),
    ).toThrow('no longer pending');
  },
);
it('denies unknown fields, background execution, unbounded commands and policy bypass', () => {
  for (const [tool, input] of [
    ['Bash', { command: 'echo ok', run_in_background: true }],
    ['Bash', { command: 'echo ok', dangerouslyDisableSandbox: true }],
    ['Bash', { command: 'x'.repeat(7001) }],
    ['Bash', { command: 'echo ok', timeout: Infinity }],
    ['Write', { file_path: 'a', content: 'x', unexpected: true }],
    ['Agent', { prompt: 'Run arbitrary background tasks' }],
  ] as const)
    expect(prepareClaudeRequest(request(tool, input), true).kind).toBe('denied');
});
it('denies without forwarding tool input or persistent grant suggestions', () => {
  const prepared = prepareClaudeRequest(request('Bash', { command: 'secret command' }), true);
  if (prepared.kind !== 'questions') throw new Error('Expected permission');
  const answer = prepared.respond(0, {
    requestId: randomUUID(),
    kind: 'permission',
    decision: 'deny',
  });
  expect(answer).toMatchObject({ response: { response: { behavior: 'deny' } } });
  expect(JSON.stringify(answer)).not.toMatch(/secret command|updatedInput|updatedPermissions/);
});
