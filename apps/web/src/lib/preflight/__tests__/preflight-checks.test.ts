import { describe, it, expect } from "vitest";
import {
  checkResolution,
  checkFPS,
  checkLightingSymmetry,
  checkVoiceRMS,
} from "@/lib/preflight/preflight-checks";

describe("preflight checks", () => {
  it("resolution: 0×0 → fail, else never fail, warn below HD, pass HD+", () => {
    expect(checkResolution(0, 0)?.severity).toBe("fail");
    expect(checkResolution(320, 240)?.severity).toBe("warn");
    expect(checkResolution(640, 480)?.severity).toBe("warn");
    expect(checkResolution(1280, 720)).toBeNull();
  });

  it("resolution: orientation-independent — portrait iPhone (406×720) is WARN not FAIL", () => {
    // iOS front camera in portrait returns short-edge first
    expect(checkResolution(406, 720)?.severity).toBe("warn");
    expect(checkResolution(480, 640)?.severity).toBe("warn");
    expect(checkResolution(720, 1280)).toBeNull(); // portrait HD = pass
  });

  it("FPS: fails <12, warns <25, passes ≥25", () => {
    expect(checkFPS(10)?.severity).toBe("fail");
    expect(checkFPS(15)?.severity).toBe("warn");
    expect(checkFPS(22)?.severity).toBe("warn");
    expect(checkFPS(30)).toBeNull();
  });

  it("lighting: dim → warn, asymmetric → warn, good → pass", () => {
    expect(checkLightingSymmetry(15, 15)?.code).toBe("lighting_dim");
    expect(checkLightingSymmetry(50, 70)?.code).toBe("lighting_asymmetric");
    expect(checkLightingSymmetry(55, 60)).toBeNull();
  });

  it("voice: fails <-50dB, warns <-42dB, passes ≥-42", () => {
    expect(checkVoiceRMS(-55)?.severity).toBe("fail");
    expect(checkVoiceRMS(-45)?.severity).toBe("warn");
    expect(checkVoiceRMS(-30)).toBeNull();
  });
});
