import { createServer } from "node:http";

const port = Number(process.env.MOCK_AI_PORT || 4319);
const cancellableResponses = new Map();

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

function slowSse(response) {
  response.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  response.write(`data: ${JSON.stringify({
    choices: [{
      delta: { content: "E2E slow response started" },
      finish_reason: null,
    }],
  })}\n\n`);
  setTimeout(() => {
    if (response.destroyed || response.writableEnded) return;
    response.write(`data: ${JSON.stringify({
      choices: [{ delta: {}, finish_reason: "stop" }],
    })}\n\n`);
    response.end("data: [DONE]\n\n");
  }, 10_000);
}

function cancellableSse(response) {
  response.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
  });
  response.flushHeaders();
  const delta = (content) => response.write(`data: ${JSON.stringify({
    choices: [{ delta: { content }, finish_reason: null }],
  })}\n\n`);
  delta("E2E cancellable response started");
  // Keep producing chunks so WebKit can consume the app's queued turn event.
  // This fixture never races cancellation against a timed successful finish.
  const heartbeat = setInterval(() => {
    if (!response.destroyed && !response.writableEnded) delta(".");
  }, 100);
  // Failed tests must not leave an indefinitely pending provider connection.
  const deadline = setTimeout(() => response.destroy(), 30_000);
  const cleanup = () => {
    cancellableResponses.delete(response);
    clearInterval(heartbeat);
    clearTimeout(deadline);
  };
  response.once("close", cleanup);
  response.once("error", () => {
    cleanup();
    response.destroy();
  });
  cancellableResponses.set(response, cleanup);
}

function decodeMemoryXml(value) {
  return value
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", "\"")
    .replaceAll("&apos;", "'")
    .replaceAll("&amp;", "&");
}

function promptMemoryContents(messages) {
  const system = messages.find((message) =>
    String(message.content).includes("<user_memories>"));
  return [...String(system?.content ?? "").matchAll(
    /<memory>([\s\S]*?)<\/memory>/g,
  )].map((match) => decodeMemoryXml(match[1]));
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
  request.on("error", () => undefined);
  response.on("error", () => undefined);
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
      const currentMessage = String(messages.at(-1)?.content ?? "");
      if (!isExtractor && currentMessage.includes("E2E_PROVIDER_FAIL")) {
        response.writeHead(503, { "Content-Type": "application/json" });
        response.end(JSON.stringify({
          error: { message: "mocked provider failure" },
        }));
        return;
      }
      if (!isExtractor && currentMessage.includes("E2E_PROVIDER_CANCELLABLE")) {
        cancellableSse(response);
        return;
      }
      if (!isExtractor && currentMessage.includes("E2E_PROVIDER_SLOW")) {
        slowSse(response);
        return;
      }
      const promptAudit = !isExtractor
        && currentMessage.includes("E2E_PROMPT_AUDIT")
        ? `PROMPT_MEMORY_CONTENTS=${encodeURIComponent(JSON.stringify(
            promptMemoryContents(messages).sort(),
          ))}`
        : undefined;
      sse(
        response,
        isExtractor
          ? JSON.stringify(operationFor(messages))
          : promptAudit ?? "已收到这条测试消息。",
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
  process.on(signal, () => {
    for (const [response, cleanup] of cancellableResponses) {
      cleanup();
      response.destroy();
    }
    server.close(() => process.exit(0));
  });
}
