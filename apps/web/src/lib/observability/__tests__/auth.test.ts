// @vitest-environment node
import { describe, it, expect, afterEach } from "vitest";
import { checkDebugKey } from "../auth";

function req({ header, query }: { header?: string; query?: string }) {
  const url = "http://localhost/api/logs" + (query ? `?key=${query}` : "");
  const headers = new Headers();
  if (header) headers.set("x-valk-debug-key", header);
  return new Request(url, { headers });
}

const ORIG = process.env.VALK_DEBUG_KEY;

describe("checkDebugKey", () => {
  afterEach(() => {
    if (ORIG === undefined) delete process.env.VALK_DEBUG_KEY;
    else process.env.VALK_DEBUG_KEY = ORIG;
    delete process.env.VALK_DEBUG_OPEN;
  });

  it("accepte la bonne clé en header", () => {
    process.env.VALK_DEBUG_KEY = "secret";
    expect(checkDebugKey(req({ header: "secret" }))).toBe(true);
  });
  it("accepte la bonne clé en query", () => {
    process.env.VALK_DEBUG_KEY = "secret";
    expect(checkDebugKey(req({ query: "secret" }))).toBe(true);
  });
  it("rejette une mauvaise clé", () => {
    process.env.VALK_DEBUG_KEY = "secret";
    expect(checkDebugKey(req({ header: "nope" }))).toBe(false);
  });
  it("rejette si aucune clé fournie", () => {
    process.env.VALK_DEBUG_KEY = "secret";
    expect(checkDebugKey(req({}))).toBe(false);
  });
  it("fail-closed si VALK_DEBUG_KEY non défini", () => {
    delete process.env.VALK_DEBUG_KEY;
    expect(checkDebugKey(req({ header: "anything" }))).toBe(false);
  });
  it("VALK_DEBUG_OPEN=1 ouvre en dev local", () => {
    delete process.env.VALK_DEBUG_KEY;
    process.env.VALK_DEBUG_OPEN = "1";
    expect(checkDebugKey(req({}))).toBe(true);
  });
});
