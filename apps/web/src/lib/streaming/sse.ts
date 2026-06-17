/**
 * Encode a typed event payload into an SSE frame.
 * Format: `event: <name>\ndata: <json>\n\n`
 */
export function encodeSSE(event: string, data: unknown): string {
  const json = JSON.stringify(data);
  return `event: ${event}\ndata: ${json}\n\n`;
}

export interface ParsedSSEEvent {
  event: string;
  data: unknown;
}

/**
 * Parse accumulated SSE text into discrete events.
 * Returns the parsed events + the remaining unconsumed buffer.
 */
export function parseSSE(buffer: string): {
  events: ParsedSSEEvent[];
  rest: string;
} {
  const events: ParsedSSEEvent[] = [];
  const lines = buffer.split("\n\n");
  const rest = lines.pop() ?? "";

  for (const block of lines) {
    const eventMatch = block.match(/^event: (.+)$/m);
    const dataMatch = block.match(/^data: (.+)$/m);
    if (!eventMatch || !dataMatch) continue;
    try {
      events.push({
        event: eventMatch[1].trim(),
        data: JSON.parse(dataMatch[1].trim()),
      });
    } catch {
      /* skip malformed */
    }
  }

  return { events, rest };
}
