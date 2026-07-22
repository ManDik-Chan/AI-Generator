import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";

import {
  InvalidUsageIdempotencyKeyError,
  isUsageIdempotencyConflict,
  readUsageIdempotencyKey,
  usageIdempotencyKey,
} from "@/features/usage/ledger";

describe("usage idempotency", () => {
  it("uses a caller key across retries and retains a run fallback", () => {
    const firstRun = crypto.randomUUID();
    const secondRun = crypto.randomUUID();
    expect(usageIdempotencyKey("CHAT_MESSAGE", firstRun, "client-request-123"))
      .toBe(usageIdempotencyKey("CHAT_MESSAGE", secondRun, "client-request-123"));
    expect(usageIdempotencyKey("CHAT_MESSAGE", firstRun)).toBe(`chat_message:${firstRun}`);
  });

  it("accepts bounded opaque request keys and rejects malformed headers", () => {
    expect(readUsageIdempotencyKey(new Request("http://localhost", { headers: { "Idempotency-Key": "request_1234" } })))
      .toBe("request_1234");
    for (const key of ["short", "contains space", "x".repeat(161)]) {
      expect(() => readUsageIdempotencyKey(new Request("http://localhost", { headers: { "Idempotency-Key": key } })))
        .toThrow(InvalidUsageIdempotencyKeyError);
    }
  });

  it("recognizes only the usage-ledger idempotency unique conflict", () => {
    const duplicate = new Prisma.PrismaClientKnownRequestError("duplicate", {
      code: "P2002",
      clientVersion: Prisma.prismaVersion.client,
      meta: { target: ["user_id", "idempotency_key"] },
    });
    const unrelated = new Prisma.PrismaClientKnownRequestError("duplicate", {
      code: "P2002",
      clientVersion: Prisma.prismaVersion.client,
      meta: { target: ["email"] },
    });
    expect(isUsageIdempotencyConflict(duplicate)).toBe(true);
    expect(isUsageIdempotencyConflict(unrelated)).toBe(false);
    expect(isUsageIdempotencyConflict(new Error("duplicate"))).toBe(false);
  });
});
