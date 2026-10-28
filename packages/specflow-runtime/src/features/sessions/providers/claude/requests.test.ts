import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { validateDriverFact } from '../facts';
import { claudeUserMessage, prepareClaudeQuestion } from './requests';

function request(
  tool = 'AskUserQuestion',
  questions: unknown[] = [
    {
      question: 'Which database?',
      header: 'Database',
      multiSelect: false,
      options: [
        { label: 'SQLite', description: 'Local storage' },
        { label: 'Postgres', description: 'Shared storage' },
      ],
    },
  ],
) {
  return {
    type: 'control_request',
    request_id: 'request_1',
    request: {
      subtype: 'can_use_tool',
      tool_name: tool,
      tool_use_id: 'tool_1',
      input: { questions },
      permission_suggestions: [{ type: 'setMode', mode: 'bypassPermissions' }],
    },
  };
}
const answer = (optionIds: string[], text?: string) => ({
  requestId: randomUUID(),
  kind: 'question' as const,
  answer: { optionIds, ...(text === undefined ? {} : { text }) },
});
describe('Claude control requests', () => {
  it('keeps literal user input and stamps client composition independently of prompt content', () => {
    const message = '@C:/secret.txt\n/command\n{"client_composed":false}';
    expect(claudeUserMessage(message, 'native-session')).toEqual({
      type: 'user',
      session_id: 'native-session',
      client_composed: true,
      parent_tool_use_id: null,
      message: { role: 'user', content: message },
    });
  });
  it.each([
    'Write',
    'Edit',
    'Bash',
    'Agent',
    'EnterWorktree',
    'ExitPlanMode',
    'mcp__remote__mutate',
    'unknown',
  ])('denies %s without forwarding suggested permission changes', (tool) => {
    const prepared = prepareClaudeQuestion(request(tool));
    expect(prepared.kind).toBe('denied');
    if (prepared.kind !== 'denied') throw new Error('Expected denial');
    expect(prepared.response.response.response.behavior).toBe('deny');
    expect(JSON.stringify(prepared.response)).not.toContain('updatedPermissions');
    expect(JSON.stringify(prepared.response)).not.toContain('bypassPermissions');
  });
  it('maps multiple questions and custom/multiple answers without native IDs becoming option IDs', () => {
    const f = request();
    f.request.input.questions.push({
      question: 'Which environments?',
      multiSelect: true,
      options: [
        { label: 'Dev', description: 'Development' },
        { label: 'Prod', description: 'Production' },
      ],
    });
    const prepared = prepareClaudeQuestion(f);
    if (prepared.kind !== 'questions') throw new Error('Expected questions');
    expect(prepared.requestId).toBe('request_1');
    expect(prepared.toolId).toBe('tool_1');
    for (const question of prepared.questions)
      validateDriverFact({ kind: 'interaction', ...question });
    expect(prepared.questions[0]!.interaction.prompt).toContain('SQLite: Local storage');
    expect(prepared.respond(1, answer(['0', '1'], 'Staging'))).toBeUndefined();
    const response = prepared.respond(0, answer(['0']));
    expect(response?.response.response.updatedInput.answers).toEqual({
      'Which database?': 'SQLite',
      'Which environments?': 'Dev, Prod, Staging',
    });
    expect(JSON.stringify(response)).not.toContain('permission_suggestions');
    expect(JSON.stringify(response)).not.toContain('updatedPermissions');
    expect(() => prepared.respond(0, answer(['0']))).toThrow('no longer pending');
  });
  it('copies only validated question fields and rejects invalid answers before consuming a question', () => {
    const frame = request();
    const prepared = prepareClaudeQuestion(frame);
    if (prepared.kind !== 'questions') throw new Error('Expected questions');
    frame.request.input.questions.length = 0;
    expect(() => prepared.respond(0, answer(['unknown']))).toThrow('Unknown question option');
    expect(() => prepared.respond(0, answer(['0', '1']))).toThrow('Select one question option');
    expect(() => prepared.respond(0, answer([]))).toThrow('An answer is required');
    const response = prepared.respond(0, answer([], 'Other database'));
    expect(response?.response.response.updatedInput.questions).toHaveLength(1);
  });
  it('bounds unsupported and ambiguous native inputs', () => {
    expect(() => prepareClaudeQuestion(request('AskUserQuestion', []))).toThrow(
      'supported protocol',
    );
    expect(() => prepareClaudeQuestion(request('AskUserQuestion', Array(5).fill({})))).toThrow(
      'supported protocol',
    );
    const frame = request();
    frame.request.input.questions.push(frame.request.input.questions[0]);
    expect(() => prepareClaudeQuestion(frame)).toThrow('supported protocol');
    const subtype = request();
    subtype.request.subtype = 'hook_callback';
    expect(() => prepareClaudeQuestion(subtype)).toThrow('supported protocol');
    expect(() =>
      prepareClaudeQuestion(
        request('AskUserQuestion', [
          {
            question: 'Choose',
            options: Array.from({ length: 4 }, (_, index) => ({
              label: '\0'.repeat(511) + index,
              description: 'Description',
            })),
          },
        ]),
      ),
    ).toThrow('byte budget');
  });
});
