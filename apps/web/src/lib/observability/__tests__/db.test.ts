// @vitest-environment node
import { describe, it, expect } from "vitest";
import { createSqliteStore } from "../db";

describe("sqlite observability store", () => {
  it("insère un batch et le relit dans l'ordre", () => {
    const store = createSqliteStore(":memory:");
    store.insertLogs({
      sessionId: "s1",
      device: { platform: "ios", osVersion: "26.5", runtime: "expoGo" },
      entries: [
        { tsMonotonic: 1, tsWall: 100, level: "info", category: "app", message: "start" },
        { tsMonotonic: 2, tsWall: 200, level: "warn", category: "net", message: "slow", data: { ms: 800 } },
      ],
    });
    const logs = store.getSessionLogs("s1");
    expect(logs).toHaveLength(2);
    expect(logs[0].message).toBe("start");
    expect(logs[1].level).toBe("warn");
    expect(logs[1].data).toEqual({ ms: 800 });
    expect(logs[0].data).toBeUndefined();
  });

  it("résume les sessions avec device et compte", () => {
    const store = createSqliteStore(":memory:");
    store.insertLogs({
      sessionId: "s1",
      device: { platform: "ios", runtime: "expoGo" },
      entries: [{ tsMonotonic: 1, tsWall: 100, level: "info", category: "a", message: "m" }],
    });
    const sessions = store.listSessions();
    expect(sessions).toHaveLength(1);
    expect(sessions[0].sessionId).toBe("s1");
    expect(sessions[0].logCount).toBe(1);
    expect(sessions[0].device.platform).toBe("ios");
  });

  it("agrège plusieurs batches dans la même session", () => {
    const store = createSqliteStore(":memory:");
    const dev = { platform: "web", runtime: "web" as const };
    store.insertLogs({ sessionId: "s1", device: dev, entries: [{ tsMonotonic: 1, tsWall: 1, level: "info", category: "a", message: "m1" }] });
    store.insertLogs({ sessionId: "s1", device: dev, entries: [{ tsMonotonic: 2, tsWall: 2, level: "info", category: "a", message: "m2" }] });
    expect(store.getSessionLogs("s1")).toHaveLength(2);
    expect(store.listSessions()[0].logCount).toBe(2);
  });

  it("sépare les sessions", () => {
    const store = createSqliteStore(":memory:");
    store.insertLogs({ sessionId: "a", device: { platform: "ios", runtime: "expoGo" }, entries: [{ tsMonotonic: 1, tsWall: 1, level: "info", category: "x", message: "ma" }] });
    store.insertLogs({ sessionId: "b", device: { platform: "ios", runtime: "expoGo" }, entries: [{ tsMonotonic: 1, tsWall: 1, level: "info", category: "x", message: "mb" }] });
    expect(store.listSessions()).toHaveLength(2);
    expect(store.getSessionLogs("a")).toHaveLength(1);
  });
});
