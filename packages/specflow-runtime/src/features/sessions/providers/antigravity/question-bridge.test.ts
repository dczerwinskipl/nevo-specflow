import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { createAntigravityQuestionBridge } from './question-bridge';

it('registers only the shared question tool in private native MCP configuration', async () => {
  const bridge = await createAntigravityQuestionBridge({
    invocation: { sessionId: randomUUID(), turnId: randomUUID(), invocationId: randomUUID() },
    emit: () => Promise.resolve(),
    signal: new AbortController().signal,
  });
  try {
    const servers = bridge.configuration.mcpServers;
    expect(Object.keys(servers)).toEqual(['specflow-interactions']);
    expect(servers['specflow-interactions']).toEqual({
      serverUrl: bridge.nativeHookClientConfiguration.baseUrl + '/mcp',
      headers: { Authorization: bridge.nativeHookClientConfiguration.token },
      enabledTools: ['ask_user'],
      timeoutSeconds: -1,
    });
    expect(bridge.permissionRule).toBe('mcp(specflow-interactions/ask_user)');
  } finally {
    await bridge.close();
  }
});
