import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  conversations: vi.fn(),
  personas: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(async () => ({ auth: { getUser: mocks.getUser } })),
}));
vi.mock("@/features/chat/queries", () => ({ getConversationList: mocks.conversations }));
vi.mock("@/features/persona/queries", () => ({ getActivePersonaChoices: mocks.personas }));

import { GET } from "@/app/api/chat/bootstrap/route";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

describe("Chat bootstrap route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
  });

  it("starts sidebar and Persona reads concurrently after one auth check", async () => {
    const conversations = deferred<never[]>();
    const personas = deferred<never[]>();
    mocks.conversations.mockReturnValue(conversations.promise);
    mocks.personas.mockReturnValue(personas.promise);

    const responsePromise = GET(new Request("http://localhost/api/chat/bootstrap"));
    await vi.waitFor(() => {
      expect(mocks.conversations).toHaveBeenCalledOnce();
      expect(mocks.personas).toHaveBeenCalledOnce();
    });
    conversations.resolve([]);
    personas.resolve([]);

    const response = await responsePromise;
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ conversations: [], personas: [] });
    expect(mocks.getUser).toHaveBeenCalledOnce();
    expect(response.headers.get("server-timing")).toMatch(/auth;dur=.*conversations;dur=.*personas;dur=.*total;dur=/);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("does not query Persona choices for an existing Conversation bootstrap", async () => {
    mocks.conversations.mockResolvedValue([]);
    const response = await GET(new Request("http://localhost/api/chat/bootstrap?personas=0"));
    expect(response.status).toBe(200);
    expect(mocks.conversations).toHaveBeenCalledOnce();
    expect(mocks.personas).not.toHaveBeenCalled();
  });

  it("rejects an unauthenticated bootstrap before database queries", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });
    const response = await GET(new Request("http://localhost/api/chat/bootstrap"));
    expect(response.status).toBe(401);
    expect(mocks.conversations).not.toHaveBeenCalled();
    expect(mocks.personas).not.toHaveBeenCalled();
  });
});
