import { describe, expect, it } from "vitest";
import { expectedCspPolicy, pairCspObservations, type CspObservation } from "./csp-observations";

const origin = "http://127.0.0.1:3000";
const text = "[Report Only] Refused to execute a script because its hash, its nonce, or 'unsafe-inline' does not appear in the script-src directive of the Content Security Policy.";
const error = `console: ${text} (${origin}/login:1:0)`;
const message = { text, origin, error };
const event = (extra: Partial<CspObservation> = {}): CspObservation => ({ blockedURI: "inline", disposition: "report", effectiveDirective: "script-src-elem", originalPolicy: expectedCspPolicy, documentOrigin: origin, sourceOrigin: origin, frameOrigin: origin, ...extra });

describe("strict CSP report-only diagnostic pairing", () => {
  it("accepts only the known inline event paired with its exact engine console signature", () => {
    expect(pairCspObservations([event()], [message])).toEqual({ expectedErrors: [error], unexpected: [] });
  });

  it("pairs Chromium info-level inline reports without treating them as runtime errors", () => {
    const directive = expectedCspPolicy.split("; ").find((value) => value.startsWith("script-src "))!;
    const text = `Executing inline script violates the following Content Security Policy directive '${directive}'. Either the 'unsafe-inline' keyword, a hash ('sha256-YWJjZA=='), or a nonce ('nonce-...') is required to enable inline execution. The policy is report-only, so the violation has been logged but no further action has been taken.`;
    expect(pairCspObservations([event()], [{ text, origin }])).toEqual({ expectedErrors: [], unexpected: [] });
    expect(pairCspObservations([event()], [{ text: text.replace(directive, "script-src *"), origin }]).unexpected).toHaveLength(2);
  });

  it("consumes observations one-for-one without hiding duplicates", () => {
    expect(pairCspObservations([event()], [message, message]).expectedErrors).toEqual([error]);
    expect(pairCspObservations([event(), event()], [message]).unexpected).toHaveLength(1);
    expect(pairCspObservations([], [message]).expectedErrors).toEqual([]);
  });

  it.each([
    { disposition: "enforce" }, { blockedURI: "eval" }, { blockedURI: "https://external.example/private" },
    { originalPolicy: "script-src *" }, { effectiveDirective: "img-src" }, { effectiveDirective: "script-src-attr" },
    { sourceOrigin: "https://external.example" }, { documentOrigin: "https://external.example" },
    { frameOrigin: "https://external.example" }, { sourceOrigin: "" },
  ])("never classifies an unrelated violation as expected: %o", (extra) => {
    const result = pairCspObservations([event(extra)], [message]);
    expect(result.expectedErrors).toEqual([]);
    expect(result.unexpected).toHaveLength(1);
  });

  it.each(["page: ReferenceError: failure", "Content Security Policy error", text.replace("[Report Only] ", ""), text.replace("script-src", "default-src"), `${text} unrelated suffix`])("does not accept unknown or enforcing console messages: %s", (text) => {
    expect(pairCspObservations([event()], [{ ...message, text }]).expectedErrors).toEqual([]);
  });

  it("does not classify an error reported from a different origin", () => {
    expect(pairCspObservations([event()], [{ ...message, origin: "https://external.example" }]).expectedErrors).toEqual([]);
  });
});
