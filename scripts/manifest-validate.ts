/*
 * pnpm manifest:validate path/to/manifest.json
 *
 * Checks a project manifest against the P0.5 contract (schemaVersion 0.5.0) with the
 * same validator the Developer console uses. Exit code 0 = valid, 1 = invalid, 2 = usage.
 * Validation is local; nothing is uploaded and nothing is registered.
 */
import { readFileSync } from "node:fs";

import { validateManifest } from "@/features/platform/manifest";

const file = process.argv[2];
if (!file) {
  console.error("用法：pnpm manifest:validate <manifest.json>");
  process.exit(2);
}

let text: string;
try {
  text = readFileSync(file, "utf8");
} catch {
  console.error(`读不到文件：${file}`);
  process.exit(2);
}

const result = validateManifest(text);
for (const issue of result.issues) {
  console.log(`${issue.level === "error" ? "✗ 错误" : "! 提示"}  ${issue.path}  ${issue.message}`);
}
console.log(result.ok ? `✓ ${file} 符合 P0.5 Manifest 契约（0.5.0）` : `✗ ${file} 不符合契约：${result.issues.filter((issue) => issue.level === "error").length} 个错误`);
process.exit(result.ok ? 0 : 1);
