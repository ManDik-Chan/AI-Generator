import assert from "node:assert/strict";
import { buildSecurityHeaders } from "../../lib/security/headers";

export function assertSecurityHeaderContract(headers: Headers) {
  for (const { key, value } of buildSecurityHeaders(process.env.NEXT_PUBLIC_SUPABASE_URL)) {
    assert.equal(headers.get(key), value, `${key} must retain the audited response policy`);
  }
}
