import { describe, it, expect } from "vitest";
import { LogBuffer, LogChannel, type SendFn, type LogChannelOptions } from "../log-channel";
import type { LogBatch, DeviceContext } from "../observability";

const device: DeviceContext = { platform: "ios", runtime: "expoGo" };

function makeSend(initialOk = true) {
  const calls: LogBatch[] = [];
  let ok = initialOk;
  const send: SendFn = async (b) => {
    calls.push(b);
    return ok;
  };
  return { send, calls, setOk: (v: boolean) => (ok = v) };
}

function channel(extra: Partial<LogChannelOptions> = {}, sender = makeSend()) {
  let t = 0;
  const ch = new LogChannel({
    sessionId: "s1",
    device,
    send: sender.send,
    flushThreshold: 100,
    now: () => ++t,
    wallNow: () => 1000 + t,
    ...extra,
  });
  return { ch, sender };
}

describe("LogBuffer", () => {
  it("borne la capacité aux plus récents", () => {
    const b = new LogBuffer(2);
    b.add({ tsMonotonic: 1, tsWall: 1, level: "info", category: "c", message: "a" });
    b.add({ tsMonotonic: 2, tsWall: 2, level: "info", category: "c", message: "b" });
    b.add({ tsMonotonic: 3, tsWall: 3, level: "info", category: "c", message: "c" });
    expect(b.size()).toBe(2);
    expect(b.snapshot().map((e) => e.message)).toEqual(["b", "c"]);
  });
});

describe("LogChannel", () => {
  it("bufferise sous le seuil sans envoyer", () => {
    const { ch, sender } = channel({ flushThreshold: 5 });
    ch.log("info", "app", "m1");
    ch.log("warn", "app", "m2");
    expect(ch.size()).toBe(2);
    expect(sender.calls).toHaveLength(0);
  });

  it("flush envoie un batch bien formé et vide le buffer", async () => {
    const { ch, sender } = channel();
    ch.log("info", "app", "start", { a: 1 });
    await ch.flush();
    expect(sender.calls).toHaveLength(1);
    const batch = sender.calls[0];
    expect(batch.sessionId).toBe("s1");
    expect(batch.device.platform).toBe("ios");
    expect(batch.entries[0]).toMatchObject({ level: "info", category: "app", message: "start", data: { a: 1 } });
    expect(ch.size()).toBe(0);
  });

  it("ré-enfile en cas d'échec d'envoi (aucun log perdu)", async () => {
    const sender = makeSend(false);
    const { ch } = channel({}, sender);
    ch.log("error", "net", "boom");
    await ch.flush();
    expect(ch.size()).toBe(1); // ré-enfilé
    sender.setOk(true);
    await ch.flush();
    expect(ch.size()).toBe(0); // renvoyé avec succès
  });

  it("auto-flush au seuil atteint", async () => {
    const { ch, sender } = channel({ flushThreshold: 2 });
    ch.log("info", "a", "m1");
    ch.log("info", "a", "m2"); // déclenche le flush (fire-and-forget)
    await new Promise((r) => setTimeout(r, 0));
    expect(sender.calls).toHaveLength(1);
    expect(sender.calls[0].entries).toHaveLength(2);
    expect(ch.size()).toBe(0);
  });

  it("flush vide est un no-op", async () => {
    const { ch, sender } = channel();
    await ch.flush();
    expect(sender.calls).toHaveLength(0);
  });
});
