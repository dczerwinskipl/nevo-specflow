import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Pairs the first owner device of a headless trusted-local Runtime the way its owner does (D21):
 * read the one-time initial pairing code the Runtime saved in its owner-only file under
 * `<stateRoot>/auth/`, redeem it, and keep the device credential cookie. The answered headers make
 * every later `fetch` an owner request of the Runtime's own page (the device cookie and
 * `X-Nevo-Owner: 1`; Node's fetch sends neither `Origin` nor `Sec-Fetch-Site`).
 *
 * The names are the product's (the Runtime's `INITIAL_CODE_FILE`, `deviceCookieNames` and
 * `OWNER_REQUEST_HEADER`), spelled out so the packaged smoke stays a black-box client.
 */
export async function pairOwnerDevice(
  baseUrl: string,
  stateRoot: string,
  port: number,
): Promise<Record<string, string>> {
  const code = (await readFile(join(stateRoot, 'auth', 'initial-pairing-code'), 'utf8')).trim();
  const redeemed = await fetch(`${baseUrl}/api/auth/pairing/redeem`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind: 'initial-code', code }),
  });
  if (redeemed.status !== 201) {
    throw new Error(
      `Pairing the owner device failed: ${String(redeemed.status)} ${await redeemed.text()}`,
    );
  }

  const name = `nevo_device_${String(port)}`;
  const credential = redeemed.headers
    .getSetCookie()
    .map((cookie) => cookie.split(';')[0]!)
    .find((pair) => pair.startsWith(`${name}=`));
  if (!credential) {
    throw new Error(`Pairing the owner device set no ${name} cookie.`);
  }

  return { Cookie: credential, 'X-Nevo-Owner': '1' };
}
