declare module 'node:test' { const test: (name: string, fn: () => unknown | Promise<unknown>) => void; export default test }
declare module 'node:assert/strict' { const assert: any; export default assert }
declare module 'node:fs' { export function readFileSync(path: string, encoding: string): string }
