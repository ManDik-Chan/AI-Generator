import { execFileSync } from "node:child_process";
import {
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const textExtensions = new Set([
  ".css",
  ".html",
  ".js",
  ".json",
  ".jsonl",
  ".log",
  ".md",
  ".network",
  ".stacks",
  ".trace",
  ".txt",
  ".xml",
]);
const environmentNames = [
  "AI_API_KEY",
  "DATABASE_URL",
  "DIRECT_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_TEST_ANON_KEY",
  "SUPABASE_TEST_SERVICE_ROLE_KEY",
  "TEST_DATABASE_URL",
];

let sensitiveValues = [];

export function redactE2eArtifactText(content, values = []) {
  let result = content;
  for (const value of values) {
    result = result.split(value).join("[REDACTED]");
  }
  return result
    .replace(/\bbase64-eyJ[A-Za-z0-9_=-]+/g, "[REDACTED_SUPABASE_SESSION]")
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, "[REDACTED_JWT]")
    .replace(/\b(postgres(?:ql)?:\/\/)[^@\s"']+@/gi, "$1[REDACTED]@")
    .replace(/("password"\s*:\s*")[^"]+(")/gi, "$1[REDACTED]$2");
}

function redact(content) {
  return redactE2eArtifactText(content, sensitiveValues);
}

async function sanitizeEmbeddedPlaywrightReport(path) {
  const original = await readFile(path, "utf8");
  const pattern = /(<template id="playwrightReportBase64">data:application\/zip;base64,)([A-Za-z0-9+/=]+)(<\/template>)/;
  const match = original.match(pattern);
  if (!match) return;

  const temporaryDirectory = await mkdtemp(join(tmpdir(), "e2e-html-report-"));
  const archivePath = join(temporaryDirectory, "report.zip");
  try {
    await writeFile(archivePath, Buffer.from(match[2], "base64"));
    await sanitizeZip(archivePath);
    const sanitizedArchive = await readFile(archivePath);
    const sanitizedHtml = original.replace(
      pattern,
      `$1${sanitizedArchive.toString("base64")}$3`,
    );
    await writeFile(path, redact(sanitizedHtml), "utf8");
  } finally {
    await rm(temporaryDirectory, { force: true, recursive: true });
  }
}

async function redactTree(root) {
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      await redactTree(path);
      continue;
    }
    if (!entry.isFile() || !textExtensions.has(extname(entry.name).toLowerCase())) continue;
    if (extname(entry.name).toLowerCase() === ".html") {
      await sanitizeEmbeddedPlaywrightReport(path);
    }
    const original = await readFile(path, "utf8");
    const sanitized = redact(original);
    if (sanitized !== original) await writeFile(path, sanitized, "utf8");
  }
}

async function sanitizeZip(path) {
  const temporaryDirectory = await mkdtemp(join(tmpdir(), "e2e-artifact-"));
  try {
    execFileSync("unzip", ["-qq", path, "-d", temporaryDirectory], { stdio: "ignore" });
    await redactTree(temporaryDirectory);
    await rm(path, { force: true });
    execFileSync("zip", ["-q", "-r", path, "."], {
      cwd: temporaryDirectory,
      stdio: "ignore",
    });
  } finally {
    await rm(temporaryDirectory, { force: true, recursive: true });
  }
}

async function zipFiles(root) {
  const archives = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) archives.push(...await zipFiles(path));
    else if (entry.isFile() && extname(entry.name).toLowerCase() === ".zip") archives.push(path);
  }
  return archives;
}

async function main() {
  const [artifactRootArgument, sensitiveValuesFile] = process.argv.slice(2);
  if (!artifactRootArgument || !sensitiveValuesFile) {
    throw new Error("Usage: node scripts/redact-e2e-artifacts.mjs <artifact-root> <sensitive-values-file>");
  }

  const artifactRoot = resolve(artifactRootArgument);
  const values = [];
  for (const name of environmentNames) {
    const value = process.env[name];
    if (value) values.push(value);
  }
  try {
    values.push(...(await readFile(sensitiveValuesFile, "utf8")).split(/\r?\n/));
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  sensitiveValues = [...new Set(values.filter((value) => value.length >= 6))]
    .flatMap((value) => [value, encodeURIComponent(value)])
    .sort((left, right) => right.length - left.length);

  if (!(await stat(artifactRoot)).isDirectory()) {
    throw new Error(`Artifact root is not a directory: ${basename(artifactRoot)}`);
  }
  for (const archive of await zipFiles(artifactRoot)) await sanitizeZip(archive);
  await redactTree(artifactRoot);
  process.stdout.write("e2e_artifacts_sanitized\n");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
