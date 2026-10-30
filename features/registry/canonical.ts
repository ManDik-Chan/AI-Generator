import { createHash } from "node:crypto";

/** RFC 8785 / I-JSON. Hash the UTF-8 canonical bytes, never PostgreSQL jsonb text. */
export const HASH_ALGORITHM = "JCS-SHA256-v1" as const;
export const MAX_JSON_BYTES = 256 * 1024;
export const MAX_JSON_DEPTH = 64;
export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

export class CanonicalJsonError extends Error {
  constructor(message: string) { super(message); this.name = "CanonicalJsonError"; }
}

function fail(message: string): never { throw new CanonicalJsonError(message); }

/** Preserve Unicode as supplied: no normalization and no replacement characters. */
export function assertUnicode(value: string): void {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff) {
      const low = value.charCodeAt(++i);
      if (!(low >= 0xdc00 && low <= 0xdfff)) fail("Lone Unicode surrogate");
      const point = ((code - 0xd800) << 10) + low - 0xdc00 + 0x10000;
      if ((point & 0xffff) >= 0xfffe) fail("I-JSON noncharacter");
    } else if (code >= 0xdc00 && code <= 0xdfff) fail("Lone Unicode surrogate");
    else if ((code >= 0xfdd0 && code <= 0xfdef) || code >= 0xfffe) fail("I-JSON noncharacter");
  }
}

/** JSON.parse alone loses duplicate names (including escaped aliases). */
export function parseStrictJson(text: string): JsonValue {
  if (typeof text !== "string" || Buffer.byteLength(text, "utf8") > MAX_JSON_BYTES) fail("JSON input exceeds byte limit");
  let at = 0;
  const white = () => { while (/[\x20\t\r\n]/.test(text[at] ?? "") && at < text.length) at++; };
  const string = (): string => {
    const start = at++;
    while (at < text.length) {
      const c = text[at++];
      if (c === '"') {
        let result: string;
        try { result = JSON.parse(text.slice(start, at)) as string; } catch { return fail("Invalid JSON string"); }
        assertUnicode(result);
        return result;
      }
      if (c === "\\") at++; // JSON.parse validates the escape and all control bytes.
    }
    return fail("Unterminated JSON string");
  };
  const value = (depth: number): JsonValue => {
    if (depth > MAX_JSON_DEPTH) fail("JSON nesting exceeds depth limit");
    white();
    const c = text[at];
    if (c === '"') return string();
    if (c === "{") {
      at++; white();
      const result: { [key: string]: JsonValue } = {};
      const seen = new Set<string>();
      if (text[at] === "}") { at++; return result; }
      while (at < text.length) {
        if (text[at] !== '"') fail("Expected JSON property name");
        const key = string();
        if (seen.has(key)) fail("Duplicate JSON property name");
        seen.add(key); white();
        if (text[at++] !== ":") fail("Expected JSON colon");
        Object.defineProperty(result, key, { value: value(depth + 1), writable: true, configurable: true, enumerable: true });
        white();
        const separator = text[at++];
        if (separator === "}") return result;
        if (separator !== ",") fail("Expected JSON object separator");
        white();
      }
      return fail("Unterminated JSON object");
    }
    if (c === "[") {
      at++; white();
      const result: JsonValue[] = [];
      if (text[at] === "]") { at++; return result; }
      while (at < text.length) {
        result.push(value(depth + 1)); white();
        const separator = text[at++];
        if (separator === "]") return result;
        if (separator !== ",") fail("Expected JSON array separator");
      }
      return fail("Unterminated JSON array");
    }
    for (const [literal, result] of [["null", null], ["true", true], ["false", false]] as const) {
      if (text.startsWith(literal, at)) { at += literal.length; return result; }
    }
    const number = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(text.slice(at));
    if (!number) return fail("Invalid JSON value");
    at += number[0].length;
    const result = Number(number[0]);
    if (!Number.isFinite(result)) fail("Non-finite JSON number");
    return result;
  };
  const result = value(0); white();
  if (at !== text.length) fail("Trailing JSON content");
  return result;
}

export function canonicalize(value: unknown): string {
  const ancestors = new Set<object>();
  let bytes = 0;
  const emit = (text: string) => {
    bytes += Buffer.byteLength(text, "utf8");
    if (bytes > MAX_JSON_BYTES) fail("Canonical JSON exceeds byte limit");
    return text;
  };
  const serialize = (item: unknown, depth: number): string => {
    if (depth > MAX_JSON_DEPTH) fail("JSON nesting exceeds depth limit");
    if (item === null || typeof item === "boolean") return emit(JSON.stringify(item));
    if (typeof item === "string") { assertUnicode(item); return emit(JSON.stringify(item)); }
    // V8's finite binary64 serialization is the ECMAScript algorithm required by JCS.
    if (typeof item === "number") {
      if (!Number.isFinite(item)) fail("Non-finite JSON number");
      return emit(JSON.stringify(item));
    }
    if (typeof item !== "object") fail("Only JSON data can be canonicalized");
    if (ancestors.has(item)) fail("Cyclic JSON data");
    if (!Array.isArray(item) && Object.getPrototypeOf(item) !== Object.prototype && Object.getPrototypeOf(item) !== null) fail("Only plain JSON objects are allowed");
    const descriptors = Object.getOwnPropertyDescriptors(item);
    if (Object.getOwnPropertySymbols(item).length) fail("Symbol properties are not JSON data");
    ancestors.add(item);
    try {
      if (Array.isArray(item)) {
        if (Object.keys(descriptors).length !== item.length + 1) fail("Sparse or extended JSON array");
        return emit("[") + Array.from({ length: item.length }, (_, index) => {
          const descriptor = descriptors[String(index)];
          if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) fail("Invalid JSON array element");
          return (index ? emit(",") : "") + serialize(descriptor.value, depth + 1);
        }).join("") + emit("]");
      }
      // Do not reconstruct an object then JSON.stringify it: integer keys would reorder.
      return emit("{") + Object.keys(descriptors).sort().map((key, index) => {
        const descriptor = descriptors[key];
        if (!("value" in descriptor) || !descriptor.enumerable) fail("Accessors and hidden properties are not JSON data");
        assertUnicode(key);
        return (index ? emit(",") : "") + emit(JSON.stringify(key)) + emit(":") + serialize(descriptor.value, depth + 1);
      }).join("") + emit("}");
    } finally { ancestors.delete(item); }
  };
  return serialize(value, 0);
}

export function canonicalHash(value: unknown): string {
  return createHash("sha256").update(canonicalize(value), "utf8").digest("hex");
}
export const hashSnapshot = canonicalHash;
