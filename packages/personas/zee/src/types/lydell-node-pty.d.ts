// Minimal typings for the optional node-pty dependency used via dynamic import.
declare module "@lydell/node-pty" {
  export const spawn: unknown;
  const defaultExport: { spawn?: unknown };
  export default defaultExport;
}
