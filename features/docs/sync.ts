/*
 * Keeps the developer docs in step with the code:
 * - a fenced block preceded by `<!-- example: path/to/file -->` must equal that file, so
 *   every documented example is a file that tests execute;
 * - docs/developer/openapi.json is generated from the runtime's zod schemas.
 *
 * Parsing is line based: the marker line, then an opening fence on the next line, then
 * everything up to the first line that is exactly ``` (empty blocks are fine).
 */

const MARKER = /^<!--\s*example:\s*(\S+)\s*-->\s*$/;
const FENCE_OPEN = /^```\S*\s*$/;
const FENCE_CLOSE = /^```\s*$/;

export interface ExampleRef {
  path: string;
  fence: string;
  body: string;
  /** Line index of the opening fence and of the closing fence. */
  open: number;
  close: number;
}

export function findExamples(markdown: string): ExampleRef[] {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const found: ExampleRef[] = [];
  for (let i = 0; i < lines.length; i++) {
    const marker = MARKER.exec(lines[i]);
    if (!marker || !FENCE_OPEN.test(lines[i + 1] ?? "")) continue;
    let close = i + 2;
    while (close < lines.length && !FENCE_CLOSE.test(lines[close])) close++;
    if (close >= lines.length) break;
    found.push({ path: marker[1], fence: lines[i + 1], body: lines.slice(i + 2, close).join("\n"), open: i + 1, close });
    i = close;
  }
  return found;
}

/** Replace every marked block with the current file content. */
export function syncExamples(markdown: string, read: (path: string) => string) {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const examples = findExamples(markdown);
  let changed = false;
  // Replace from the end so earlier line indices stay valid.
  for (const example of [...examples].reverse()) {
    const content = read(example.path).replace(/\r\n/g, "\n").replace(/\n+$/, "");
    if (content === example.body) continue;
    changed = true;
    lines.splice(example.open + 1, example.close - example.open - 1, ...content.split("\n"));
  }
  return { text: lines.join("\n"), changed };
}

export function serializeOpenApi(document: unknown) {
  return `${JSON.stringify(document, null, 2)}\n`;
}
