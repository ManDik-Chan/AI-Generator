/* Display helpers for the demo developer panels (pure, unit-tested). */

/** Pretty JSON with long arrays shortened and short numeric arrays kept on one line. */
export function prettyJson(value: unknown, maxItems = 8) {
  const shortened = JSON.stringify(value, (_key, item: unknown) => {
    if (Array.isArray(item) && item.length > maxItems + 2) return [...item.slice(0, maxItems), `… 另有 ${item.length - maxItems} 项`];
    return item;
  }, 2);
  if (shortened === undefined) return "";
  return shortened.replace(/\[\s+((?:-?[\d.e+-]+,\s*)*-?[\d.e+-]+)\s+\]/g, (_whole, inner: string) => `[${inner.replace(/\s+/g, " ")}]`);
}

/** Single-quote a value for POSIX shells. */
const shellQuote = (text: string) => `'${text.replace(/'/g, "'\\''")}'`;

/**
 * A copy-pasteable curl command: a GET when there is no body, otherwise a JSON POST.
 * URL and body are single-quoted for POSIX shells.
 */
export function curlCommand(url: string, body?: unknown, options: { stream?: boolean } = {}) {
  const flags = `-sS${options.stream ? "N" : ""}`;
  const accept = "-H 'Accept: text/event-stream'";
  if (body === undefined) {
    return options.stream ? `curl ${flags} ${shellQuote(url)} \\\n  ${accept}` : `curl ${flags} ${shellQuote(url)}`;
  }
  return [
    `curl ${flags} -X POST ${shellQuote(url)} \\`,
    "  -H 'Content-Type: application/json' \\",
    ...(options.stream ? [`  ${accept} \\`] : []),
    `  -d ${shellQuote(JSON.stringify(body))}`,
  ].join("\n");
}

export const stopReasonLabels: Record<string, string> = {
  "construction-only": "只做了构造",
  converged: "收敛：没有更短的局部改动",
  "schedule-complete": "退火计划完成并打磨",
  deadline: "到达截止时间",
};

export function formatPercent(value: number, digits = 1) {
  return `${(value * 100).toFixed(digits)}%`;
}

export function formatNumber(value: number) {
  return new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 1 }).format(value);
}
