import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

import { canonicalHash, canonicalize, MAX_JSON_BYTES, MAX_JSON_DEPTH, parseStrictJson } from "./canonical";

const fixtures = JSON.parse(readFileSync("tests/fixtures/registry-jcs-vectors.json", "utf8")) as {
  vectors: { id: string; inputText: string; canonical: string; sha256: string }[];
  numbers: { hex: string; canonical: string | null }[];
};

it.each(fixtures.vectors)("JCS golden vector $id", ({ inputText, canonical, sha256 }) => {
  expect(canonicalize(parseStrictJson(inputText))).toBe(canonical);
  expect(canonicalHash(parseStrictJson(inputText))).toBe(sha256);
});
it.each(fixtures.numbers)("RFC 8785 Appendix B binary64 $hex", ({ hex, canonical }) => {
  const number = Buffer.from(hex, "hex").readDoubleBE();
  if (canonical === null) expect(() => canonicalize(number)).toThrow("Non-finite");
  else expect(canonicalize(number)).toBe(canonical);
});
it.each([
  '{"a":1,"a":2}', '{"a":1,"\\u0061":2}', '{"a":{"x":1,"x":2}}',
  '"\\ud800"', '"\\udfff"', '"\\ufdd0"', '"\\ud83f\\udffe"', '{"\\ud800":1}',
  '1e400', 'NaN', 'Infinity', '+1', '01', '1.', '.1', '[-1,]', '{"a":true,}',
  '{} {}', '\ufeff{}', '{"a":undefined}', '{"a":"\n"}', '/* comment */{}',
])("strict parser rejects ambiguous or invalid JSON %s", (input) => {
  expect(() => parseStrictJson(input)).toThrow();
});
it("accepts decoded escaped pairs without normalizing Unicode or polluting prototypes", () => {
  expect(parseStrictJson('"\\ud83d\\ude00"')).toBe("😀");
  expect(canonicalize(parseStrictJson('{"__proto__":{"polluted":true}}'))).toBe('{"__proto__":{"polluted":true}}');
  expect(({} as { polluted?: boolean }).polluted).toBeUndefined();
  expect(canonicalHash("é")).not.toBe(canonicalHash("e\u0301"));
});
it("rejects JS types, sparse arrays, accessors, hidden or symbolic properties and cycles", () => {
  const cycle: unknown[] = []; cycle.push(cycle);
  const accessor = { get value() { throw new Error("Must not invoke accessor"); } };
  for (const value of [undefined, BigInt(1), () => 1, new Date(), new Map(), NaN, Infinity, "\ud800", [, 1], cycle,
    accessor, Object.defineProperty({}, "hidden", { value: 1 }), { [Symbol("x")]: 1 }, Object.assign([], { extra: 1 })]) {
    expect(() => canonicalize(value)).toThrow();
  }
});
it("enforces bounded UTF-8 bytes and depth on both parsing and canonicalization", () => {
  const deep = "[".repeat(MAX_JSON_DEPTH + 2) + "0" + "]".repeat(MAX_JSON_DEPTH + 2);
  expect(() => parseStrictJson(deep)).toThrow("depth");
  expect(() => canonicalize(JSON.parse(deep))).toThrow("depth");
  expect(() => parseStrictJson(JSON.stringify("é".repeat(MAX_JSON_BYTES)))).toThrow("byte");
  expect(() => canonicalize("é".repeat(MAX_JSON_BYTES))).toThrow("byte");
});
