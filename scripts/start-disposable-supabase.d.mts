export const PORT_IN_USE: RegExp;
export const PORT_RETRY_DELAYS_SECONDS: number[];
export function configuredPorts(configText: string): number[];
export function describePortHolders(ssOutput: string, ports: number[]): string[];
export function startDisposableSupabase(options: {
  logPath: string;
  run?: (args: string[], logFile: string) => boolean;
  report?: (logPath: string) => void;
  wait?: (seconds: number) => void;
  inspect?: () => void;
}): number;
