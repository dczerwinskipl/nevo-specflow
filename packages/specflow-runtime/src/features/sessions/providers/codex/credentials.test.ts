import { mkdtemp, mkdir, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { expect, it } from 'vitest';
import { prepareCodexCredentials as prepareCredentials } from './credentials';
const prepareCodexCredentials = (user: string, root: string) =>
  prepareCredentials(user, root, join(dirname(user), 'workspace'));

async function fixture(
  run: (root: string, user: string, homeRoot: string, auth: string) => Promise<void>,
) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'codex-credentials-')));
  const user = join(root, 'user');
  await mkdir(join(root, 'workspace'));
  await mkdir(join(user, '.codex'), { recursive: true });
  const auth = join(user, '.codex', 'auth.json');
  try {
    await run(root, user, join(root, 'private'), auth);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
function login(account = 'account-one', token = 'source-token', user = 'user-one') {
  return {
    auth_mode: 'chatgpt',
    OPENAI_API_KEY: null,
    tokens: {
      account_id: account,
      access_token: token,
      refresh_token: 'refresh',
      id_token:
        'header.' +
        Buffer.from(
          JSON.stringify({
            'https://api.openai.com/auth': { chatgpt_account_id: account, chatgpt_user_id: user },
          }),
        ).toString('base64url') +
        '.signature',
    },
    untrusted_extra: 'never copied',
  };
}
it('copies only login fields into an account-isolated private native home', async () => {
  await fixture(async (_root, user, homeRoot, auth) => {
    await writeFile(auth, JSON.stringify(login()));
    const one = await prepareCodexCredentials(user, homeRoot);
    const stored = JSON.parse(await readFile(join(one.home, 'auth.json'), 'utf8')) as Record<
      string,
      unknown
    >;
    expect(stored).not.toHaveProperty('untrusted_extra');
    expect(one.accountScope).toMatch(/^[a-f0-9]{64}$/);
    expect(one.home).not.toContain('account-one');
    await writeFile(auth, JSON.stringify(login('account-two')));
    const two = await prepareCodexCredentials(user, homeRoot);
    expect(two.home).not.toBe(one.home);
    await writeFile(auth, JSON.stringify(login('account-two', 'new-user-token', 'user-two')));
    const otherUser = await prepareCodexCredentials(user, homeRoot);
    expect(otherUser.home).not.toBe(two.home);
  });
});
it('never copies refresh authority and reloads externally renewed access tokens', async () => {
  await fixture(async (_root, user, homeRoot, auth) => {
    await writeFile(auth, JSON.stringify(login()));
    const first = await prepareCodexCredentials(user, homeRoot);
    const privateAuth = join(first.home, 'auth.json');
    const copied = JSON.parse(await readFile(privateAuth, 'utf8')) as {
      tokens: { refresh_token: string; access_token: string };
    };
    expect(copied.tokens.refresh_token).toBe('');
    expect(copied.tokens.access_token).toBe('source-token');
    // An earlier experimental copy must never retain refresh authority, even if
    // its timestamp or native access token is newer than the external source.
    await writeFile(privateAuth, JSON.stringify(login('account-one', 'private-access')));
    await prepareCodexCredentials(user, homeRoot);
    expect((JSON.parse(await readFile(privateAuth, 'utf8')) as typeof copied).tokens).toMatchObject(
      { refresh_token: '', access_token: 'source-token' },
    );
    await writeFile(auth, JSON.stringify(login('account-one', 'new-login')));
    const renewed = await prepareCodexCredentials(user, homeRoot);
    expect(renewed.home).toBe(first.home);
    const updated = JSON.parse(await readFile(privateAuth, 'utf8')) as typeof copied;
    expect(updated.tokens).toMatchObject({ access_token: 'new-login', refresh_token: '' });
    expect(JSON.parse(await readFile(auth, 'utf8'))).toEqual(login('account-one', 'new-login'));
  });
});
it('refuses API keys and private-home configuration instead of importing user settings', async () => {
  await fixture(async (_root, user, homeRoot, auth) => {
    await writeFile(auth, JSON.stringify({ ...login(), OPENAI_API_KEY: 'unsupported-key' }));
    await expect(prepareCodexCredentials(user, homeRoot)).rejects.toThrow();
    await writeFile(auth, JSON.stringify(login()));
    const first = await prepareCodexCredentials(user, homeRoot);
    await writeFile(join(first.home, 'config.toml'), 'untrusted=true');
    await expect(prepareCodexCredentials(user, homeRoot)).rejects.toThrow();
  });
});
it('refuses a private home inside a workspace before creating or copying credentials', async () => {
  await fixture(async (root, user, _homeRoot, auth) => {
    await writeFile(auth, JSON.stringify(login()));
    const home = join(user, 'private');
    await expect(prepareCredentials(user, home, user)).rejects.toThrow('outside the workspace');
    await expect(readFile(join(home, 'auth.json'))).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(prepareCredentials(user, root, root)).rejects.toThrow('outside the workspace');
  });
});
