import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  effect: vi.fn(), refresh: vi.fn(), create: vi.fn(), onAuthStateChange: vi.fn(),
  stopAutoRefresh: vi.fn(), unsubscribe: vi.fn(), replace: vi.fn(),
  setInterval: vi.fn(), clearInterval: vi.fn(),
}));
vi.mock("react", () => ({ useEffect: mocks.effect }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock("@/lib/auth/supabase/browser", () => ({ createSupabaseBrowserClient: mocks.create }));
import { SessionSync } from "./session-sync";

let listeners: Map<string, Set<() => void>>;
let documentState: { cookie: string; visibilityState: string };

beforeEach(() => {
  vi.resetAllMocks();
  listeners = new Map();
  documentState = { cookie: "aig-auth-persistence=persistent", visibilityState: "visible" };
  mocks.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: mocks.unsubscribe } } });
  mocks.create.mockReturnValue({ auth: { onAuthStateChange: mocks.onAuthStateChange, stopAutoRefresh: mocks.stopAutoRefresh } });
  mocks.setInterval.mockReturnValue(17);
  vi.stubGlobal("document", documentState);
  vi.stubGlobal("window", {
    location: { replace: mocks.replace },
    setInterval: mocks.setInterval,
    clearInterval: mocks.clearInterval,
    addEventListener: (type: string, callback: () => void) => {
      const handlers = listeners.get(type) ?? new Set();
      handlers.add(callback); listeners.set(type, handlers);
    },
    removeEventListener: (type: string, callback: () => void) => listeners.get(type)?.delete(callback),
  });
});
afterEach(() => vi.unstubAllGlobals());

function mount(): () => void {
  expect(SessionSync()).toBeNull();
  return mocks.effect.mock.calls[0][0]();
}
function dispatch(type: string) { listeners.get(type)?.forEach((handler) => handler()); }
function tick() { mocks.setInterval.mock.calls[0][0](); }

describe("live tab session synchronization without a browser runtime", () => {
  it("leaves normal session validation to the server without polling Auth", () => {
    mount(); tick();
    expect(mocks.replace).not.toHaveBeenCalled();
    expect(mocks.refresh).not.toHaveBeenCalled();
    expect(mocks.setInterval.mock.calls[0][1]).toBe(2000);
  });

  it("escapes cached authenticated pages after logout in another tab", () => {
    mount();
    documentState.cookie = "aig-auth-persistence=signed-out; sb-example-auth-token=late-refresh";
    tick(); tick(); dispatch("focus");
    expect(mocks.stopAutoRefresh).toHaveBeenCalledOnce();
    expect(mocks.replace).toHaveBeenCalledExactlyOnceWith("/login");
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("redirects immediately when an authenticated page mounts after logout", () => {
    documentState.cookie = "aig-auth-persistence=signed-out";
    mount();
    expect(mocks.replace).toHaveBeenCalledExactlyOnceWith("/login");
  });

  it("revalidates visible pages on focus and bfcache restoration", () => {
    mount(); dispatch("focus"); dispatch("pageshow");
    expect(mocks.refresh).toHaveBeenCalledTimes(2);
    documentState.visibilityState = "hidden";
    dispatch("focus"); dispatch("pageshow");
    expect(mocks.refresh).toHaveBeenCalledTimes(2);
  });

  it("revalidates when the SDK reports an expired or revoked session", () => {
    mount();
    const notify = mocks.onAuthStateChange.mock.calls[0][0];
    notify("TOKEN_REFRESHED");
    expect(mocks.refresh).not.toHaveBeenCalled();
    notify("SIGNED_OUT");
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });

  it("removes polling and event subscriptions on navigation", () => {
    const cleanup = mount(); cleanup();
    expect(mocks.clearInterval).toHaveBeenCalledExactlyOnceWith(17);
    expect(mocks.unsubscribe).toHaveBeenCalledOnce();
    dispatch("focus"); dispatch("pageshow");
    expect(mocks.refresh).not.toHaveBeenCalled();
    expect([...listeners.values()].every((handlers) => handlers.size === 0)).toBe(true);
  });
});
