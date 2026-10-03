export function cookieValue(setCookie: string | string[] | undefined, name: string): string {
  const values = Array.isArray(setCookie) ? setCookie : [setCookie ?? ''];
  const header = values.find((value) => value.startsWith(`${name}=`));
  const match = header?.match(new RegExp(`^${name}=([^;]+)`));
  if (!match?.[1]) {
    throw new Error(`Missing ${name} cookie in ${JSON.stringify(setCookie)}`);
  }
  return match[1];
}
