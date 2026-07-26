import { createServer } from "node:http";

const port = Number(process.env.MOCK_AI_PORT || 4319);

function sse(response, content) {
  response.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  response.write(`data: ${JSON.stringify({
    choices: [{ delta: { content }, finish_reason: null }],
  })}\n\n`);
  response.write(`data: ${JSON.stringify({
    choices: [{ delta: {}, finish_reason: "stop" }],
  })}\n\n`);
  response.end("data: [DONE]\n\n");
}

function textBetween(value, tag) {
  return value.match(new RegExp(`<${tag}[^>]*>\\s*([\\s\\S]*?)\\s*</${tag}>`))?.[1]?.trim() ?? "";
}

function operationFor(messages) {
  const input = String(messages.at(-1)?.content ?? "");
  const message = textBetween(input, "current_user_message");
  const token = message.match(/E2E_(?:IMPLICIT|UPDATE|EDIT|REJECT|CONFLICT|EXPIRED|DISABLED|EXPLICIT|SOURCE|RESUBMIT):([a-z0-9_-]+)/i)?.[1];
  if (!token) return { operations: [] };
  const normalized = token.toLowerCase().replace(/[^a-z0-9_-]/g, "_");
  const marker = message.match(/E2E_([A-Z]+):/i)?.[1]?.toUpperCase();
  const contents = {
    IMPLICIT: `E2E implicit fact ${normalized}`,
    UPDATE: `E2E updated fact ${normalized}`,
    EDIT: `E2E edit candidate ${normalized}`,
    REJECT: `E2E reject candidate ${normalized}`,
    CONFLICT: `E2E conflict candidate ${normalized}`,
    EXPIRED: `E2E expired candidate ${normalized}`,
    DISABLED: `E2E disabled candidate ${normalized}`,
    EXPLICIT: `E2E explicit fact ${normalized}`,
    SOURCE: `E2E source before edit ${normalized}`,
    RESUBMIT: `E2E source after edit ${normalized}`,
  };
  const content = contents[marker] ?? `E2E implicit fact ${normalized}`;
  const topicKey = `e2e.chat.${normalized}.${marker?.toLowerCase() ?? "implicit"}`;
  const existing = [...input.matchAll(/<memory id="([^"]+)"[^>]*topic="([^"]+)"[^>]*>/g)]
    .map((match) => ({ id: match[1], topic: match[2] }));
  const updateTarget = existing.find((memory) => memory.topic === topicKey);
  return {
    operations: [{
      action: updateTarget ? "UPDATE" : "CREATE",
      ...(updateTarget ? { existingMemoryId: updateTarget.id } : {}),
      content,
      category: "preference",
      scope: "GLOBAL",
      importance: 4,
      topicKey,
      keywords: ["E2E", normalized, marker?.toLowerCase() ?? "implicit"],
      confidence: 0.99,
      reasonCode: "preference",
    }],
  };
}

const server = createServer((request, response) => {
  if (request.method === "GET" && request.url === "/health") {
    response.writeHead(200, { "Content-Type": "text/plain" });
    response.end("ok");
    return;
  }
  let raw = "";
  request.setEncoding("utf8");
  request.on("data", (chunk) => {
    raw += chunk;
  });
  request.on("end", () => {
    if (request.method !== "POST") {
      response.writeHead(404).end();
      return;
    }
    if (request.url?.endsWith("/embeddings")) {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({
        data: [{
          index: 0,
          embedding: Array.from({ length: 512 }, (_, index) => index === 0 ? 1 : 0),
        }],
        model: "mock-embedding",
      }));
      return;
    }
    if (!request.url?.endsWith("/chat/completions")) {
      response.writeHead(404).end();
      return;
    }
    try {
      const body = JSON.parse(raw);
      const messages = Array.isArray(body.messages) ? body.messages : [];
      const isExtractor = messages.some(
        (message) => String(message.content).includes("你是长期记忆提取器"),
      );
      sse(
        response,
        isExtractor
          ? JSON.stringify(operationFor(messages))
          : "已收到这条测试消息。",
      );
    } catch {
      response.writeHead(400, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ error: { message: "invalid mock request" } }));
    }
  });
});

server.listen(port, "127.0.0.1", () => {
  process.stdout.write(`mock_ai_provider_ready port=${port}\n`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
