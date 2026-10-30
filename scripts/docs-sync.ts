/*
 * pnpm docs:sync          regenerate docs/developer/openapi.json and refresh example blocks
 * pnpm docs:sync --check  exit 1 if anything is out of date (used before committing)
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { serializeOpenApi, syncExamples } from "@/features/docs/sync";
import { buildOpenApiDocument } from "@/features/demos/runtime/openapi";

const root = process.cwd();
const check = process.argv.includes("--check");
const stale: string[] = [];

const write = (path: string, next: string) => {
  const absolute = join(root, path);
  const current = readFileSync(absolute, { encoding: "utf8", flag: "a+" });
  if (current === next) return;
  stale.push(path);
  if (!check) writeFileSync(absolute, next);
};

write("docs/developer/openapi.json", serializeOpenApi(buildOpenApiDocument()));

for (const file of readdirSync(join(root, "docs/developer")).filter((name) => name.endsWith(".md"))) {
  const path = `docs/developer/${file}`;
  const { text } = syncExamples(readFileSync(join(root, path), "utf8"), (example) => readFileSync(join(root, example), "utf8"));
  write(path, text);
}

if (stale.length) {
  console.log(`${check ? "Out of date" : "Updated"}: ${stale.join(", ")}`);
  if (check) process.exit(1);
} else {
  console.log("Developer docs are in sync.");
}
