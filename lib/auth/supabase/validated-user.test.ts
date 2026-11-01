import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

const mocks = vi.hoisted(() => ({ query: vi.fn(), getSession: vi.fn(), getUser: vi.fn() }));
vi.mock("@/lib/database/prisma", () => ({ prisma: { $queryRaw: mocks.query } }));
import { getValidatedUser } from "./validated-user";

const userId = "11111111-1111-4111-8111-111111111111";
const sessionId = "22222222-2222-4222-8222-222222222222";
const user = { id: userId };
const client = { auth: { getSession: mocks.getSession, getUser: mocks.getUser } } as unknown as SupabaseClient;
function token(claims = { sub: userId, session_id: sessionId, exp: 2_000_000_000 }) {
  return `synthetic.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.test`;
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getSession.mockResolvedValue({ data: { session: { access_token: token() } }, error: null });
  mocks.getUser.mockResolvedValue({ data: { user }, error: null });
  mocks.query.mockResolvedValue([{ id: sessionId }]);
});

describe("server-validated session restoration", () => {
  it("verifies the exact refreshed token and correlates its live server session", async () => {
    expect(await getValidatedUser(client)).toEqual(user);
    expect(mocks.getUser).toHaveBeenCalledWith(token());
    const [sql, ...parameters] = mocks.query.mock.calls[0];
    expect(sql.join("?")).toContain("not_after>clock_timestamp()");
    expect(sql.join("?")).toContain("to_timestamp(?)>clock_timestamp()");
    expect(parameters).toEqual([sessionId, userId, 2_000_000_000]);
  });

  it.each([
    { data: { session: null }, error: null },
    { data: { session: { access_token: token() } }, error: new Error("expired refresh") },
  ])("does not restore a missing or failed session", async (result) => {
    mocks.getSession.mockResolvedValue(result);
    expect(await getValidatedUser(client)).toBeNull();
    expect(mocks.getUser).not.toHaveBeenCalled();
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it("rejects credentials rejected by Auth before decoding claims or querying the database", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: new Error("revoked") });
    expect(await getValidatedUser(client)).toBeNull();
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it.each([
    "malformed",
    token({ sub: sessionId, session_id: sessionId, exp: 2_000_000_000 }),
    token({ sub: userId, session_id: "invalid-session", exp: 2_000_000_000 }),
    token({ sub: userId, session_id: sessionId, exp: -1 }),
  ])("rejects malformed or mismatched verified session claims", async (access_token) => {
    mocks.getSession.mockResolvedValue({ data: { session: { access_token } }, error: null });
    expect(await getValidatedUser(client)).toBeNull();
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it("does not restore a deleted or server-expired session with an unexpired JWT", async () => {
    mocks.query.mockResolvedValue([]);
    expect(await getValidatedUser(client)).toBeNull();
  });

  it.each(["getSession", "getUser", "query"] as const)("fails closed when %s is unavailable", async (method) => {
    mocks[method].mockRejectedValue(new Error("service unavailable"));
    expect(await getValidatedUser(client)).toBeNull();
  });
});
