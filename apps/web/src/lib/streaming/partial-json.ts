import { parse as parsePartial, Allow } from "partial-json";

/**
 * Best-effort parse of Claude streaming JSON. Tolerates truncated
 * strings and arrays so we can extract categories as they're generated.
 */
export function parsePartialJSON<T = unknown>(text: string): T | null {
  if (!text || !text.trim()) return null;
  try {
    return parsePartial(text, Allow.ALL) as T;
  } catch {
    return null;
  }
}

/**
 * Extract everything from the first `{` onwards, ignoring preamble.
 */
export function extractJSONBlock(text: string): string | null {
  const start = text.indexOf("{");
  if (start === -1) return null;
  return text.slice(start);
}
