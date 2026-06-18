// @vitest-environment node
import { describe, it, expect, afterAll } from "vitest";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rmSync } from "node:fs";

// Configurer la DB de test + la clé AVANT d'importer les routes (getStore lit
// VALK_DB_PATH au premier appel, qui survient dans les handlers).
const DB_PATH = join(tmpdir(), `valk-route-test-${process.pid}.sqlite`);
process.env.VALK_DB_PATH = DB_PATH;
process.env.VALK_DEBUG_KEY = "testkey";

import { POST, GET } from "../route";
import { GET as GET_SID } from "../[sid]/route";

afterAll(() => {
  try {
    rmSync(DB_PATH);
  } catch {
    /* ignore */
  }
});

function postReq(body: unknown) {
  return new Request("http://localhost/api/logs", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

interface SessionList {
  sessions: Array<{ sessionId: string; logCount: number }>;
}
interface LogList {
  logs: Array<{ message: string; level: string; category: string }>;
}

describe("/api/logs", () => {
  it("POST batch unifié → 200 + persisté + lisible (gaté)", async () => {
    const res = await POST(
      postReq({
        sessionId: "mob-1",
        device: { platform: "ios", osVersion: "26.5", runtime: "expoGo" },
        entries: [
          { tsMonotonic: 1, tsWall: 100, level: "info", category: "app", message: "start" },
        ],
      }),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).count).toBe(1);

    const listed = await GET(new Request("http://localhost/api/logs?key=testkey"));
    expect(listed.status).toBe(200);
    const lj = (await listed.json()) as SessionList;
    const sess = lj.sessions.find((s) => s.sessionId === "mob-1");
    expect(sess?.logCount).toBe(1);
  });

  it("POST format legacy → mappé vers SQLite", async () => {
    const res = await POST(
      postReq({
        sessionId: "web-1",
        ua: "Mozilla/5.0",
        href: "/results",
        entries: [{ ts: 5, wallMs: 500, level: "warn", event: "logger.test", data: { x: 1 } }],
      }),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).legacy).toBe(true);

    const sidRes = await GET_SID(
      new Request("http://localhost/api/logs/web-1?key=testkey"),
      { params: Promise.resolve({ sid: "web-1" }) },
    );
    const sj = (await sidRes.json()) as LogList;
    expect(sj.logs[0].message).toBe("logger.test");
    expect(sj.logs[0].level).toBe("warn");
  });

  it("POST payload non reconnu → 400", async () => {
    const res = await POST(postReq({ foo: "bar" }));
    expect(res.status).toBe(400);
  });

  it("GET liste sans clé → 401", async () => {
    const res = await GET(new Request("http://localhost/api/logs"));
    expect(res.status).toBe(401);
  });

  it("GET [sid] sans clé → 401", async () => {
    const res = await GET_SID(new Request("http://localhost/api/logs/mob-1"), {
      params: Promise.resolve({ sid: "mob-1" }),
    });
    expect(res.status).toBe(401);
  });
});
