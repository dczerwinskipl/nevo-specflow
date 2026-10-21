export const sessionKeys = {
  detail: (spec: string, session: string) =>
    ['specifications', spec, 'demo-session', session] as const,
};
