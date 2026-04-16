import { describe, it, expect } from "vitest";
import {
  parsePartialJSON,
  extractJSONBlock,
} from "@/lib/streaming/partial-json";

describe("parsePartialJSON", () => {
  it("parses complete JSON", () => {
    expect(parsePartialJSON('{"a":1}')).toEqual({ a: 1 });
  });

  it("parses truncated object (missing closing brace)", () => {
    const partial = '{"a":1,"b":{"c":2';
    const result = parsePartialJSON<{ a: number; b: { c: number } }>(partial);
    expect(result?.a).toBe(1);
    expect(result?.b?.c).toBe(2);
  });

  it("parses truncated array", () => {
    const partial = '{"items":[1,2,3';
    const result = parsePartialJSON<{ items: number[] }>(partial);
    expect(result?.items).toEqual([1, 2, 3]);
  });

  it("returns null for empty", () => {
    expect(parsePartialJSON("")).toBeNull();
    expect(parsePartialJSON("   ")).toBeNull();
  });

  it("parses bare partial fragments aggressively (partial-json design)", () => {
    // partial-json is intentionally permissive; this is OK for our streaming use case
    expect(parsePartialJSON("{{{")).toEqual({});
  });
});

describe("extractJSONBlock", () => {
  it("strips preamble before first {", () => {
    expect(extractJSONBlock("Here is the JSON:\n{\"a\":1}")).toBe('{"a":1}');
  });

  it("returns null if no opening brace", () => {
    expect(extractJSONBlock("no json here")).toBeNull();
  });
});
