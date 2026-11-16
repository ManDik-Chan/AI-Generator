import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { configuredPorts, describePortHolders, PORT_RETRY_DELAYS_SECONDS, startDisposableSupabase } from "./start-disposable-supabase.mjs";

const portLog = "Bind for 0.0.0.0:54322 failed: port is already allocated\n";

function harness(startResults: Array<"ok" | "port" | "other">) {
  const dir = mkdtempSync(join(tmpdir(), "supabase-start-"));
  const logPath = join(dir, "start.log");
  const calls: string[] = [];
  const waits: number[] = [];
  let reported = false;
  let inspected = 0;
  let index = 0;
  const code = startDisposableSupabase({
    logPath,
    run(args, file) {
      calls.push(args.join(" "));
      if (args[0] !== "start") {
        writeFileSync(file, "stopped\n");
        return true;
      }
      const result = startResults[index++] ?? "other";
      writeFileSync(file, result === "port" ? portLog : result === "ok" ? "Started\n" : "container health check failed\n");
      return result === "ok";
    },
    report() {
      reported = true;
    },
    wait(seconds) {
      waits.push(seconds);
    },
    inspect() {
      inspected += 1;
    },
  });
  return { calls, code, reported, waits, inspected, log: readFileSync(logPath, "utf8") };
}

describe("disposable Supabase start", () => {
  it("stops a leftover stack and starts once when the ports are free", () => {
    const { calls, code, reported, waits, inspected } = harness(["ok"]);
    expect(calls).toEqual(["stop --no-backup", "start"]);
    expect(code).toBe(0);
    expect(reported).toBe(false);
    expect(waits).toEqual([]);
    expect(inspected).toBe(0);
  });

  it("waits and retries after a port collision and keeps the successful start", () => {
    const { calls, code, reported, waits, inspected, log } = harness(["port", "ok"]);
    expect(calls).toEqual(["stop --no-backup", "start", "stop --no-backup", "start"]);
    expect(code).toBe(0);
    expect(reported).toBe(false);
    expect(waits).toEqual([PORT_RETRY_DELAYS_SECONDS[0]]);
    expect(inspected).toBe(1);
    expect(log).toBe("Started\n");
  });

  it("outlasts a TIME_WAIT socket with a second, longer wait", () => {
    const { calls, code, reported, waits } = harness(["port", "port", "ok"]);
    expect(calls).toEqual(["stop --no-backup", "start", "stop --no-backup", "start", "stop --no-backup", "start"]);
    expect(code).toBe(0);
    expect(reported).toBe(false);
    expect(waits).toEqual(PORT_RETRY_DELAYS_SECONDS);
    expect(waits.reduce((total, seconds) => total + seconds, 0)).toBeGreaterThan(60);
  });

  it("does not retry an unrelated startup failure", () => {
    const { calls, code, reported, waits, inspected } = harness(["other"]);
    expect(calls).toEqual(["stop --no-backup", "start"]);
    expect(code).toBe(1);
    expect(reported).toBe(true);
    expect(waits).toEqual([]);
    expect(inspected).toBe(0);
  });

  it("does not retry an unrelated failure that follows a port collision", () => {
    const { calls, code, reported, waits } = harness(["port", "other"]);
    expect(calls).toEqual(["stop --no-backup", "start", "stop --no-backup", "start"]);
    expect(code).toBe(1);
    expect(reported).toBe(true);
    expect(waits).toEqual([PORT_RETRY_DELAYS_SECONDS[0]]);
  });

  it("rejects a port collision that survives every wait", () => {
    const { calls, code, reported, waits, inspected } = harness(["port", "port", "port"]);
    expect(calls).toEqual(["stop --no-backup", "start", "stop --no-backup", "start", "stop --no-backup", "start"]);
    expect(code).toBe(1);
    expect(reported).toBe(true);
    expect(waits).toEqual(PORT_RETRY_DELAYS_SECONDS);
    expect(inspected).toBe(3);
  });
});

describe("disposable Supabase port diagnostics", () => {
  it("reads every published port from the checked-in configuration", () => {
    expect(configuredPorts(readFileSync("supabase/config.toml", "utf8")).sort()).toEqual([54320, 54321, 54322]);
  });

  it("names the socket state and ports of each holder without addresses", () => {
    const ss = [
      "LISTEN 0      4096         0.0.0.0:22          0.0.0.0:*",
      "ESTAB  0      0          10.1.0.4:54322   203.0.113.9:443",
      "LISTEN 0      4096               *:54321            *:*",
      "TIME-WAIT 0   0     [fd00::4]:54320  [2001:db8::1]:443",
      "ESTAB  0      0          10.1.0.4:40000   203.0.113.9:54322",
    ].join("\n");
    const holders = describePortHolders(ss, [54320, 54321, 54322]);
    expect(holders).toEqual([
      "port 54322: ESTAB connection to remote port 443 (ephemeral source port)",
      "port 54321: listening socket",
      "port 54320: TIME-WAIT connection to remote port 443 (ephemeral source port)",
    ]);
    expect(holders.join(" ")).not.toMatch(/10\.1\.0\.4|203\.0\.113\.9|fd00|2001:db8/);
    expect(describePortHolders("", [54321])).toEqual([]);
  });
});
