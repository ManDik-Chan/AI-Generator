export const PORT_IN_USE: RegExp;
export function startDisposableSupabase(options: {
  logPath: string;
  run?: (args: string[], logFile: string) => boolean;
  report?: (logPath: string) => void;
}): number;
