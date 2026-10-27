import { createInterface } from 'node:readline';
import { randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const home = process.argv[2];
const workspace = process.cwd();
const args = process.argv.slice(3);
let threadId;
let token;
let turns = 0;
const send = (frame) => process.stdout.write(JSON.stringify(frame) + '\n');
const notify = (method, params) => send({ method, params: { threadId, ...params } });
function thread() {
  return {
    model: 'controlled-model',
    cwd: workspace,
    approvalPolicy: 'on-request',
    approvalsReviewer: 'user',
    sandbox: {
      type: 'workspaceWrite',
      networkAccess: false,
      writableRoots: [],
      excludeTmpdirEnvVar: true,
      excludeSlashTmp: true,
    },
    thread: { id: threadId, ephemeral: false, turns: [] },
  };
}

for await (const line of createInterface({ input: process.stdin })) {
  const frame = JSON.parse(line);
  const { id, method, params } = frame;
  if (method === 'initialized') continue;
  let result;
  if (method === 'initialize') result = { userAgent: 'controlled-codex', codexHome: home };
  else if (method === 'configRequirements/read') result = { requirements: null };
  else if (method === 'experimentalFeature/list')
    result = {
      data: [
        ...args.flatMap((arg, at) =>
          arg === '--disable' ? [{ name: args[at + 1], enabled: false }] : [],
        ),
        { name: 'code_mode_host', enabled: true },
      ],
    };
  else if (method === 'mcpServerStatus/list') result = { data: [] };
  else if (method === 'account/read') result = { account: { type: 'chatgpt' } };
  else if (method === 'model/list')
    result = {
      data: [
        {
          model: 'controlled-model',
          displayName: 'Controlled',
          supportedReasoningEfforts: [{ reasoningEffort: 'low' }],
        },
      ],
    };
  else if (method === 'thread/start') {
    threadId = randomUUID();
    result = thread();
  } else if (method === 'thread/resume') {
    const previous = JSON.parse(await readFile(join(home, params.threadId + '.json'), 'utf8'));
    if (previous.workspace !== workspace) throw new Error('Fixture workspace changed');
    threadId = params.threadId;
    token = previous.token;
    turns = previous.turns;
    notify('thread/tokenUsage/updated', {
      turnId: 'previous-turn',
      tokenUsage: { total: { inputTokens: turns * 2, outputTokens: turns * 3 } },
    });
    notify('thread/goal/cleared', {});
    result = thread();
  } else if (method === 'turn/start') {
    const turnId = randomUUID();
    send({ id, result: { turn: { id: turnId, status: 'inProgress' } } });
    notify('turn/started', { turn: { id: turnId, status: 'inProgress' } });
    const message = params.input[0].text;
    if (message.startsWith('write:')) {
      token = message.slice(6);
      const item = {
        id: 'patch',
        type: 'fileChange',
        changes: [{ path: 'controlled-agent.txt', diff: '+' + token, kind: { type: 'add' } }],
      };
      notify('item/started', { turnId, item: { ...item, status: 'inProgress' } });
      await writeFile(join(workspace, 'controlled-agent.txt'), token);
      notify('item/completed', { turnId, item: { ...item, status: 'completed' } });
    } else if (message !== 'recall') throw new Error('Unsupported fixture intent');
    turns++;
    await writeFile(join(home, threadId + '.json'), JSON.stringify({ workspace, token, turns }));
    const answer = { id: 'answer', type: 'agentMessage', phase: 'final_answer' };
    notify('item/started', { turnId, item: { ...answer, text: '' } });
    notify('item/completed', { turnId, item: { ...answer, text: token } });
    notify('thread/tokenUsage/updated', {
      turnId,
      tokenUsage: { total: { inputTokens: turns * 2, outputTokens: turns * 3 } },
    });
    notify('turn/completed', { turnId, turn: { id: turnId, status: 'completed' } });
    continue;
  } else throw new Error('Unsupported fixture RPC');
  send({ id, result });
}
