export function validateResetUrls(env: Record<string, string | undefined>): void;
export function inspectWorkdir(workdir: string): { workdir: string; project: string };
export function assertDisposableTarget(env?: NodeJS.ProcessEnv): { workdir: string; project: string };
export function bindDisposableLoopback(workdir: string): Promise<void>;
