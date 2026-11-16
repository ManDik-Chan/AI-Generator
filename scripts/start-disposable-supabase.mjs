import { spawnSync } from "node:child_process";
import { closeSync, openSync, readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

// Same classification as scripts/diagnose-supabase-start.mjs. The raw log is never printed.
export const PORT_IN_USE = /address already in use|port is already allocated/i;

/**
 * Seconds to wait before each further start after a port collision. The published ports sit in
 * the Linux ephemeral range, so a runner connection can hold one as its source port; a closed
 * connection keeps it for the 60 s TIME_WAIT. The two waits together outlast that.
 */
export const PORT_RETRY_DELAYS_SECONDS = [20, 45];

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

function sleep(seconds) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, seconds * 1000);
}

/** Ports published by supabase/config.toml, including the shadow database port. */
export function configuredPorts(configText) {
  return [...configText.matchAll(/^(?:shadow_)?port\s*=\s*(\d+)/gm)].map((match) => Number(match[1]));
}

/**
 * Describe the sockets that hold the given local ports, from `ss -Htan` output
 * (State Recv-Q Send-Q Local:Port Peer:Port). Only the state and the port numbers are
 * reported; addresses are dropped.
 */
export function describePortHolders(ssOutput, ports) {
  const holders = [];
  for (const line of ssOutput.split("\n")) {
    const [state, , , local, peer] = line.trim().split(/\s+/);
    const localPort = Number(local?.slice(local.lastIndexOf(":") + 1));
    if (!ports.includes(localPort)) continue;
    const peerPort = peer?.slice(peer.lastIndexOf(":") + 1);
    holders.push(state === "LISTEN" ? `port ${localPort}: listening socket`
      : `port ${localPort}: ${state} connection to remote port ${peerPort} (ephemeral source port)`);
  }
  return holders;
}

function inspectPorts() {
  try {
    const config = readFileSync(new URL("../supabase/config.toml", import.meta.url), "utf8");
    const sockets = spawnSync("ss", ["-Htan"], { encoding: "utf8" });
    if (sockets.status !== 0) return;
    const holders = describePortHolders(sockets.stdout, configuredPorts(config));
    console.error(`Port holders: ${holders.join("; ") || "none visible in the host socket table"}`);
  } catch {
    // Diagnostics only: `ss` is not available on every platform.
  }
}

/**
 * Start the disposable stack from supabase/config.toml.
 * A hosted runner can still have these published ports allocated. Stop any leftover stack
 * first. If a start reports the port collision, report what holds the ports, stop, wait and
 * start again, once per entry of PORT_RETRY_DELAYS_SECONDS. Every other failure, and a
 * collision after the last wait, is diagnosed and rejected.
 */
export function startDisposableSupabase({ logPath, run = runSupabase, report = reportFailure, wait = sleep, inspect = inspectPorts }) {
  const stopLog = `${logPath}.stop`;
  run(["stop", "--no-backup"], stopLog);
  for (const delay of [...PORT_RETRY_DELAYS_SECONDS, null]) {
    if (run(["start"], logPath)) return 0;
    if (!PORT_IN_USE.test(readFileSync(logPath, "utf8"))) break;
    inspect();
    if (delay === null) break;
    run(["stop", "--no-backup"], stopLog);
    console.error(`Supabase start hit an allocated port; retrying in ${delay} s.`);
    wait(delay);
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
