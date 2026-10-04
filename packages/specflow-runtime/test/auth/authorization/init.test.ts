import { describe, expect, it } from 'vitest';

import { createAuthorizationSetup } from '../../../src/auth/authorization/init';
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
  it('assigns roles immediately in canonical-user creation order', async () => {
    const ui = new DefaultingUi();
    const setup = createAuthorizationSetup(ui);

    await setup.addUser('10', { name: 'Ten User' });
    await setup.addUser('2', { name: 'Two User' });
    const result = await setup.finish();

    expect(ui.defaults).toEqual(['admin', 'developer']);
    expect(result.projectAuthorization).toEqual({
      assignments: [
        { userId: '10', role: 'admin', scope: {} },
        { userId: '2', role: 'developer', scope: {} },
      ],
    });
  });
});
