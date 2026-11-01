import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ effect: vi.fn(), create: vi.fn(), onAuthStateChange: vi.fn(), fetch: vi.fn(), stopAutoRefresh: vi.fn(), unsubscribe: vi.fn(), replace: vi.fn(), setInterval: vi.fn(), clearInterval: vi.fn() }));
vi.mock("react", () => ({ useEffect: mocks.effect }));
vi.mock("@/lib/auth/supabase/browser", () => ({ createSupabaseBrowserClient: mocks.create }));
import { SessionSync } from "./session-sync";

let listeners: Map<string, Set<(event: { persisted?: boolean }) => void>>;
let documentState: { cookie: string; visibilityState: string };
let cleanups: (() => void)[];
const viewerId = "11111111-1111-4111-8111-111111111111";
function events(target: string) {
  return {
    addEventListener: (type: string, callback: (event: { persisted?: boolean }) => void) => {
      const key = `${target}:${type}`, handlers = listeners.get(key) ?? new Set();
      handlers.add(callback); listeners.set(key, handlers);
    },
    removeEventListener: (type: string, callback: (event: { persisted?: boolean }) => void) => listeners.get(`${target}:${type}`)?.delete(callback),
  };
}
beforeEach(() => {
  vi.resetAllMocks(); listeners = new Map(); cleanups = [];
  documentState = { cookie: "aig-auth-persistence=persistent", visibilityState: "visible" };
  mocks.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: mocks.unsubscribe } } });
  mocks.create.mockReturnValue({ auth: { onAuthStateChange: mocks.onAuthStateChange, stopAutoRefresh: mocks.stopAutoRefresh } });
  mocks.setInterval.mockReturnValue(17); mocks.fetch.mockResolvedValue({ status: 204 });
  vi.stubGlobal("fetch", mocks.fetch);
  vi.stubGlobal("document", Object.assign(documentState, events("document")));
  vi.stubGlobal("window", {
    location: { replace: mocks.replace }, setInterval: mocks.setInterval, clearInterval: mocks.clearInterval,
    setTimeout: (callback: () => void, delay: number) => globalThis.setTimeout(callback, delay),
    clearTimeout: (timer: ReturnType<typeof setTimeout>) => globalThis.clearTimeout(timer),
    ...events("window"),
  });
});
afterEach(() => { cleanups.forEach(cleanup => cleanup()); vi.useRealTimers(); vi.unstubAllGlobals(); });
function mount(): () => void {
  expect(SessionSync({ viewerId })).toBeNull();
  const cleanup = mocks.effect.mock.calls[0][0]();
  let mounted = true;
  const dispose = () => { if (mounted) { mounted = false; cleanup(); } };
  cleanups.push(dispose);
  return dispose;
}
function dispatch(type: string, event: { persisted?: boolean } = {}, target = "window") { listeners.get(`${target}:${type}`)?.forEach(handler => handler(event)); }
function tick() { mocks.setInterval.mock.calls[0][0](); }
const flush = () => new Promise(resolve => setImmediate(resolve));

describe("live tab session lifecycle without remounting its page", () => {
  it("does not revalidate ordinary entry, initial focus or pageshow", () => {
    mount(); tick(); dispatch("focus"); dispatch("pageshow", { persisted: false });
    expect(mocks.fetch).not.toHaveBeenCalled(); expect(mocks.replace).not.toHaveBeenCalled();
  });
  it("coalesces returning focus/visibility/bfcache events into one server check", async () => {
    let resolveCheck!: (value: { status: number }) => void;
    mocks.fetch.mockImplementation(() => new Promise(resolve => { resolveCheck = resolve; }));
    mount(); dispatch("blur"); dispatch("focus");
    dispatch("pageshow", { persisted: true }); dispatch("focus");
    expect(mocks.fetch).toHaveBeenCalledOnce();
    expect(mocks.fetch).toHaveBeenCalledWith("/api/auth/session", expect.objectContaining({ cache: "no-store", credentials: "same-origin", redirect: "error", headers: { "x-aig-viewer": viewerId } }));
    resolveCheck({ status: 204 }); await flush(); expect(mocks.replace).not.toHaveBeenCalled();
    dispatch("blur"); dispatch("focus"); expect(mocks.fetch).toHaveBeenCalledTimes(2);
  });
  it("checks a distinct return again when account cookies may have changed during the older request", async () => {
    const completions: ((response: { status: number }) => void)[] = [];
    mocks.fetch.mockImplementation(() => new Promise(resolve => { completions.push(resolve); }));
    mount(); dispatch("blur"); dispatch("focus");
    // Another tab can complete logout and a different-account login while this
    // older request still carries the previous account's cookies and viewer.
    dispatch("blur"); dispatch("focus");
    expect(mocks.fetch).toHaveBeenCalledOnce();
    completions[0]({ status: 204 }); await flush();
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
    expect(mocks.replace).not.toHaveBeenCalled();
    completions[1]({ status: 409 }); await flush();
    expect(mocks.replace).toHaveBeenCalledExactlyOnceWith("/login");
  });
  it("checks persisted pages without a blur and delays checks while hidden", async () => {
    mount(); documentState.visibilityState = "hidden";
    dispatch("pageshow", { persisted: true }); expect(mocks.fetch).not.toHaveBeenCalled();
    documentState.visibilityState = "visible"; dispatch("visibilitychange", {}, "document");
    await flush(); expect(mocks.fetch).toHaveBeenCalledOnce();
  });
  it("validates the first return of a tab that originally mounted in the background", async () => {
    documentState.visibilityState = "hidden"; mount();
    dispatch("focus"); expect(mocks.fetch).not.toHaveBeenCalled();
    documentState.visibilityState = "visible"; dispatch("visibilitychange", {}, "document"); await flush();
    expect(mocks.fetch).toHaveBeenCalledOnce(); expect(mocks.replace).not.toHaveBeenCalled();
  });
  it("does not lose a later return when the current check finishes while away", async () => {
    let resolveCheck!: (value: { status: number }) => void;
    mocks.fetch.mockImplementation(() => new Promise(resolve => { resolveCheck = resolve; }));
    mount(); dispatch("pageshow", { persisted: true }); dispatch("blur");
    resolveCheck({ status: 204 }); await flush(); dispatch("focus"); expect(mocks.fetch).toHaveBeenCalledTimes(2);
  });
  it("leaves cached pages on a server-rejected session", async () => {
    mocks.fetch.mockResolvedValue({ status: 401 }); mount(); dispatch("blur"); dispatch("focus"); await flush();
    expect(mocks.replace).toHaveBeenCalledExactlyOnceWith("/login"); expect(mocks.stopAutoRefresh).toHaveBeenCalledOnce();
  });
  it("discards the previous account's cached page when the authenticated viewer changed", async () => {
    mocks.fetch.mockResolvedValue({ status: 409 }); mount(); dispatch("blur"); dispatch("focus"); await flush();
    expect(mocks.fetch.mock.calls[0][1].headers).toEqual({ "x-aig-viewer": viewerId });
    expect(mocks.replace).toHaveBeenCalledExactlyOnceWith("/login");
    expect(mocks.stopAutoRefresh).toHaveBeenCalledOnce();
  });
  it("prioritizes logout even while server validation is in flight", () => {
    mocks.fetch.mockImplementation(() => new Promise(() => {})); mount(); dispatch("pageshow", { persisted: true });
    documentState.cookie = "aig-auth-persistence=signed-out; sb-example-auth-token=late"; tick(); dispatch("focus");
    expect(mocks.replace).toHaveBeenCalledExactlyOnceWith("/login"); expect(mocks.fetch.mock.calls[0][1].signal.aborted).toBe(true);
  });
  it("immediately leaves if mounted after logout", () => {
    documentState.cookie = "aig-auth-persistence=signed-out"; mount();
    expect(mocks.replace).toHaveBeenCalledExactlyOnceWith("/login"); expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it("checks SDK sign-out without waiting for focus", async () => {
    mount(); const notify = mocks.onAuthStateChange.mock.calls[0][0];
    notify("TOKEN_REFRESHED"); expect(mocks.fetch).not.toHaveBeenCalled();
    notify("SIGNED_OUT"); await flush(); expect(mocks.fetch).toHaveBeenCalledOnce();
  });
  it("does not let a pre-signout successful response suppress fresh invalid-session validation", async () => {
    const completions: ((response: { status: number }) => void)[] = [];
    mocks.fetch.mockImplementation(() => new Promise(resolve => { completions.push(resolve); }));
    mount(); dispatch("blur"); dispatch("focus");
    const oldSignal = mocks.fetch.mock.calls[0][1].signal as AbortSignal;
    documentState.visibilityState = "hidden";
    mocks.onAuthStateChange.mock.calls[0][0]("SIGNED_OUT");
    expect(oldSignal.aborted).toBe(true);
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
    completions[0]({ status: 204 }); await flush();
    expect(mocks.replace).not.toHaveBeenCalled();
    completions[1]({ status: 401 }); await flush();
    expect(mocks.replace).toHaveBeenCalledExactlyOnceWith("/login");
  });
  it("bounds a hung check and permits a later return to retry", async () => {
    vi.useFakeTimers();
    let completeOld!: (response: { status: number }) => void;
    mocks.fetch.mockImplementationOnce(() => new Promise(resolve => { completeOld = resolve; }));
    mount(); dispatch("pageshow", { persisted: true });
    const oldSignal = mocks.fetch.mock.calls[0][1].signal as AbortSignal;
    expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(oldSignal.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
    dispatch("focus"); await vi.advanceTimersByTimeAsync(0);
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
    completeOld({ status: 401 }); await vi.advanceTimersByTimeAsync(0);
    expect(mocks.replace).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
  it("clears request timeout resources on forced validation and unmount", async () => {
    vi.useFakeTimers(); mocks.fetch.mockImplementation(() => new Promise(() => {}));
    const cleanup = mount(); dispatch("pageshow", { persisted: true });
    expect(vi.getTimerCount()).toBe(1);
    mocks.onAuthStateChange.mock.calls[0][0]("SIGNED_OUT");
    expect(vi.getTimerCount()).toBe(1);
    cleanup();
    expect(vi.getTimerCount()).toBe(0);
  });
  it.each(["network", "unavailable"])("retries on a later return after %s failure without granting validity", async failure => {
    if (failure === "network") mocks.fetch.mockRejectedValueOnce(new Error("offline")); else mocks.fetch.mockResolvedValueOnce({ status: 503 });
    mount(); dispatch("pageshow", { persisted: true }); await flush();
    expect(mocks.replace).not.toHaveBeenCalled(); expect(mocks.fetch).toHaveBeenCalledOnce();
    dispatch("focus"); await flush(); expect(mocks.fetch).toHaveBeenCalledTimes(2);
  });
  it("aborts pending validation and cleans up subscriptions on navigation", async () => {
    let resolveCheck!: (value: { status: number }) => void;
    mocks.fetch.mockImplementation(() => new Promise(resolve => { resolveCheck = resolve; }));
    const cleanup = mount(); dispatch("pageshow", { persisted: true }); cleanup();
    expect(mocks.fetch.mock.calls[0][1].signal.aborted).toBe(true);
    resolveCheck({ status: 401 }); await flush(); expect(mocks.replace).not.toHaveBeenCalled();
    expect(mocks.clearInterval).toHaveBeenCalledExactlyOnceWith(17); expect(mocks.unsubscribe).toHaveBeenCalledOnce();
    expect([...listeners.values()].every(handlers => handlers.size === 0)).toBe(true);
  });
});
