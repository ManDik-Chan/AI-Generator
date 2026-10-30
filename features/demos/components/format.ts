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

/** A copy-pasteable curl command for a JSON POST. Single quotes in the body are escaped for POSIX shells. */
export function curlCommand(url: string, body: unknown, options: { stream?: boolean } = {}) {
  const json = JSON.stringify(body).replace(/'/g, "'\\''");
  return [
    `curl -sS${options.stream ? "N" : ""} -X POST '${url}' \\`,
    "  -H 'Content-Type: application/json' \\",
    ...(options.stream ? ["  -H 'Accept: text/event-stream' \\"] : []),
    `  -d '${json}'`,
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
