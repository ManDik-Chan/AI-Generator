import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("client validation under a CSP without unsafe-eval", () => {
  it("initializes before application schemas and preserves validation without Function compilation", () => {
    // A fresh process avoids reusing Zod's cached eval probe from other tests.
    const output = execFileSync(process.execPath, ["--import", "tsx", "--input-type=module", "--eval", `
      import assert from 'node:assert/strict';
      import { createRequire } from 'node:module';
      const require = createRequire(import.meta.url);
      let compilations = 0;
      globalThis.Function = new Proxy(Function, {
        construct() { compilations++; throw new Error('CSP forbids Function'); },
        apply() { compilations++; throw new Error('CSP forbids Function'); },
      });
      require('./instrumentation-client.ts');
      const { createChatRequestSchema } = require('./features/chat/schemas.ts');
      const schema = createChatRequestSchema(20);
      assert.deepEqual(schema.parse({ content: ' hello ' }), { content: 'hello' });
      for (const input of [{ content: '' }, { content: 'x'.repeat(21) },
        { content: 'hello', editLastMessage: true }]) {
        assert.equal(schema.safeParse(input).success, false);
      }
      assert.equal(compilations, 0);
      console.log('interpreted-validation-passed');
    `], { cwd: process.cwd(), encoding: "utf8", windowsHide: true, timeout: 15_000 });
    expect(output.trim()).toBe("interpreted-validation-passed");
  });
});
