export async function readSseEvents(response: Response, onEvent: (event: string, data: unknown) => void) {
  if (!response.ok || !response.body) { const body = await response.json().catch(() => null) as { message?: string } | null; throw new Error(body?.message || "生成请求失败，请稍后重试。"); }
  const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = "";
  while (true) {
    const { done, value } = await reader.read(); buffer += decoder.decode(value, { stream: !done }).replace(/\r\n/g, "\n");
    let boundary = buffer.indexOf("\n\n");
    while (boundary >= 0) { const block = buffer.slice(0, boundary); buffer = buffer.slice(boundary + 2); const name = block.split("\n").find((line) => line.startsWith("event:"))?.slice(6).trim(); const raw = block.split("\n").find((line) => line.startsWith("data:"))?.slice(5).trim(); if (name && raw) { try { onEvent(name, JSON.parse(raw)); } catch { /* ignore malformed app events */ } } boundary = buffer.indexOf("\n\n"); }
    if (done) break;
  }
}
