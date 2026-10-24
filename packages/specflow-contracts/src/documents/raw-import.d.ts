// Vitest (Vite) `?raw` imports return the file text; used by tests that compare committed bytes.
declare module '*?raw' {
  const text: string;
  export default text;
}
