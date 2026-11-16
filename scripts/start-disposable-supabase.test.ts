import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { startDisposableSupabase } from "./start-disposable-supabase.mjs";

const portLog = "Bind for 0.0.0.0:54322 failed: port is already allocated\n";

function harness(startResults: Array<"ok" | "port" | "other">) {
  const dir = mkdtempSync(join(tmpdir(), "supabase-start-"));
  const logPath = join(dir, "start.log");
  const calls: string[] = [];
  let reported = false;
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
  });
  return { calls, code, reported, log: readFileSync(logPath, "utf8") };
}

describe("disposable Supabase start", () => {
  it("stops a leftover stack and starts once when the ports are free", () => {
    const { calls, code, reported } = harness(["ok"]);
    expect(calls).toEqual(["stop --no-backup", "start"]);
    expect(code).toBe(0);
    expect(reported).toBe(false);
  });

  it("retries once after a port collision and keeps the second start", () => {
    const { calls, code, reported, log } = harness(["port", "ok"]);
    expect(calls).toEqual(["stop --no-backup", "start", "stop --no-backup", "start"]);
    expect(code).toBe(0);
    expect(reported).toBe(false);
    expect(log).toBe("Started\n");
  });

  it("does not retry an unrelated startup failure", () => {
    const { calls, code, reported } = harness(["other"]);
    expect(calls).toEqual(["stop --no-backup", "start"]);
    expect(code).toBe(1);
    expect(reported).toBe(true);
  });

  it("rejects a second port collision", () => {
    const { calls, code, reported } = harness(["port", "port"]);
    expect(calls).toEqual(["stop --no-backup", "start", "stop --no-backup", "start"]);
    expect(code).toBe(1);
    expect(reported).toBe(true);
  });
});
