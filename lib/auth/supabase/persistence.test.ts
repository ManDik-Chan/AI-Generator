import { describe, expect, it } from "vitest";
import { AUTH_PERSISTENCE_COOKIE, isSessionCookie, persistenceOptions, readableAuthCookies, readPersistence, sessionCookieOptions } from "./persistence";

describe("browser persistence preference", () => {
  it("preserves legacy sessions without inventing a new credential", () => {
    expect(readPersistence([])).toBe("persistent");
    expect(persistenceOptions("session", true)).not.toHaveProperty("maxAge");
    expect(persistenceOptions("persistent", true)).toMatchObject({ path: "/", sameSite: "lax", secure: true, maxAge: 34560000 });
  });
  it("strips SDK lifetime on every session-only refresh while preserving security flags", () => {
    const options = { path: "/", sameSite: "lax" as const, secure: true, maxAge: 34560000, expires: new Date("2030-01-01") };
    expect(sessionCookieOptions(options, "session")).toEqual({ path: "/", sameSite: "lax", secure: true });
    expect(sessionCookieOptions(options, "persistent")).toEqual(options);
  });
  it("keeps chunk deletion instructions so logout removes the entire session", () => {
    const options = { path: "/", maxAge: 0, expires: new Date(0) };
    expect(sessionCookieOptions(options, "session")).toEqual(options);
    expect(isSessionCookie("sb-example-auth-token.2", "https://example.supabase.co")).toBe(true);
    expect(isSessionCookie("sb-other-auth-token", "https://example.supabase.co")).toBe(false);
    expect(isSessionCookie("theme", "https://example.supabase.co")).toBe(false);
  });
  it("ignores late refresh cookies when the user has explicitly signed out", () => {
    const cookies = [{ name: AUTH_PERSISTENCE_COOKIE, value: "signed-out" }, { name: "sb-example-auth-token", value: "synthetic" }];
    expect(readableAuthCookies(cookies)).toEqual([]);
    expect(readableAuthCookies(cookies.slice(1))).toEqual(cookies.slice(1));
  });
});
