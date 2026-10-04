import { describe, expect, it } from 'vitest';

import type { RuntimeUserConfig } from '../../../src/auth/authentication/config/model';
import { initAuthorization } from '../../../src/auth/authorization/init';
import type {
  RuntimeSetupChoice,
  RuntimeSetupSelectValue,
  RuntimeSetupUi,
} from '../../../src/init/contracts';

class DefaultingUi implements RuntimeSetupUi {
  readonly defaults: (RuntimeSetupSelectValue | undefined)[] = [];

  confirm(): Promise<boolean> {
    throw new Error('confirm is not used by authorization setup');
  }

  select<T extends RuntimeSetupSelectValue>(
    _message: string,
    _choices: readonly RuntimeSetupChoice<T>[],
    initialValue?: T,
  ): Promise<T> {
    this.defaults.push(initialValue);
    if (initialValue === undefined) throw new Error('Expected an authorization default.');
    return Promise.resolve(initialValue);
  }

  input(): Promise<string> {
    throw new Error('input is not used by authorization setup');
  }

  secret(): Promise<string> {
    throw new Error('secret is not used by authorization setup');
  }

  note(): void {}
}

describe('authorization initialization', () => {
  it('uses canonical-user creation order instead of object-key enumeration order', async () => {
    const ui = new DefaultingUi();
    const users = new Map<string, RuntimeUserConfig>([
      ['10', { name: 'Ten User' }],
      ['2', { name: 'Two User' }],
    ]);

    const result = await initAuthorization(ui, users);

    expect(ui.defaults).toEqual(['admin', 'developer']);
    expect(result.projectAuthorization).toEqual({
      assignments: [
        { userId: '10', role: 'admin', scope: {} },
        { userId: '2', role: 'developer', scope: {} },
      ],
    });
  });
});
