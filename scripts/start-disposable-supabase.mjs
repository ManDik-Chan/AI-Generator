import { spawnSync } from "node:child_process";
import { closeSync, openSync, readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

// Same classification as scripts/diagnose-supabase-start.mjs. The raw log is never printed.
export const PORT_IN_USE = /address already in use|port is already allocated/i;

function runSupabase(args, logFile) {
  const fd = openSync(logFile, "w");
  try {
    return spawnSync("supabase", args, { stdio: ["ignore", fd, fd] }).status === 0;
  } finally {
    closeSync(fd);
  }
}

function reportFailure(logPath) {
  const script = fileURLToPath(new URL("./diagnose-supabase-start.mjs", import.meta.url));
  spawnSync(process.execPath, [script, logPath], { stdio: "inherit" });
}

/**
 * Start the disposable stack from supabase/config.toml.
 * A hosted runner can still have these published ports allocated. Stop any leftover
 * stack first. If that start reports the port collision, stop and try once more.
 * Every other failure, and a second failure, is diagnosed and rejected.
 */
export function startDisposableSupabase({ logPath, run = runSupabase, report = reportFailure }) {
  const stopLog = `${logPath}.stop`;
  run(["stop", "--no-backup"], stopLog);
  if (run(["start"], logPath)) return 0;
  if (PORT_IN_USE.test(readFileSync(logPath, "utf8"))) {
    run(["stop", "--no-backup"], stopLog);
    if (run(["start"], logPath)) return 0;
  }
  report(logPath);
  return 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const logPath = process.argv[2];
  if (!logPath) {
    console.error("usage: node scripts/start-disposable-supabase.mjs <log-path>");
    process.exit(1);
  }
  process.exit(startDisposableSupabase({ logPath }));
}
