import { buildSecurityHeaders } from "../../../lib/security/headers";

export interface CspObservation {
  blockedURI: string;
  disposition: string;
  effectiveDirective: string;
  originalPolicy: string;
  documentOrigin: string;
  sourceOrigin: string;
  frameOrigin: string;
}
export interface CspConsoleObservation { text: string; origin: string; error?: string }
export const expectedCspPolicy = buildSecurityHeaders(process.env.NEXT_PUBLIC_SUPABASE_URL)
  .find(({ key }) => key === "Content-Security-Policy-Report-Only")!.value;

export function urlOrigin(value: string) {
  try { const url = new URL(value); return ["http:", "https:"].includes(url.protocol) ? url.origin : ""; } catch { return ""; }
}

function expectedInline(event: CspObservation) {
  return event.originalPolicy === expectedCspPolicy && event.disposition === "report" && event.blockedURI === "inline"
    && ["script-src-elem", "style-src-elem", "style-src-attr"].includes(event.effectiveDirective)
    && Boolean(event.documentOrigin) && event.documentOrigin === event.sourceOrigin && event.documentOrigin === event.frameOrigin;
}

function consoleKind(text: string): "script" | "style" | undefined {
  // Browser engine signatures, not a general CSP/error substring exception.
  const webkit = /^\[Report Only\] Refused to (execute a script|apply a stylesheet) because its hash, its nonce, or 'unsafe-inline' does not appear in the (script|style)-src directive of the Content Security Policy\.$/.exec(text);
  if (webkit && (webkit[1] === "execute a script") === (webkit[2] === "script")) return webkit[2] as "script" | "style";
  const chromium = /^(Executing inline script|Applying inline style) violates the following Content Security Policy directive '([^\n]+)'\. Either the 'unsafe-inline' keyword, a hash \('sha256-[A-Za-z0-9+/=]+'\), or a nonce \('nonce-\.\.\.'\) is required to enable inline execution\.(?: Note that hashes do not apply to event handlers, style attributes and javascript: navigations unless the 'unsafe-hashes' keyword is present\.)? The policy is report-only, so the violation has been logged but no further action has been taken\.$/.exec(text);
  if (!chromium) return;
  const kind = chromium[1] === "Executing inline script" ? "script" : "style";
  if (!expectedCspPolicy.split("; ").includes(chromium[2]!) || !chromium[2]!.startsWith(`${kind}-src`)) return;
  return kind;
}

/** Every accepted console observation consumes one real, matching browser event. */
export function pairCspObservations(events: CspObservation[], messages: CspConsoleObservation[]) {
  const remaining = [...events];
  const expectedErrors: string[] = [];
  const unexpected: string[] = [];
  for (const message of messages) {
    const kind = consoleKind(message.text);
    const index = remaining.findIndex((event) => expectedInline(event) && event.documentOrigin === message.origin && event.effectiveDirective.startsWith(`${kind}-src`));
    if (!kind || index < 0) {
      // Error-level messages are already retained in diagnostics.errors.
      if (!message.error) unexpected.push("csp: unmatched report-only console observation");
      continue;
    }
    remaining.splice(index, 1);
    if (message.error) expectedErrors.push(message.error);
  }
  for (const event of remaining) {
    unexpected.push(`csp: unpaired violation (${event.disposition}, ${event.effectiveDirective}, ${event.blockedURI === "inline" ? "inline" : "other"})`);
  }
  return { expectedErrors, unexpected };
}
