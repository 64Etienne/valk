import { describe, it, expect } from "vitest";
import {
  checkResolution,
  checkFPS,
  checkLightingSymmetry,
  checkVoiceRMS,
} from "@/lib/preflight/preflight-checks";

describe("preflight checks", () => {
  it("resolution: fails below 640×480, warns below HD, passes HD+", () => {
    expect(checkResolution(320, 240)?.severity).toBe("fail");
    expect(checkResolution(640, 480)?.severity).toBe("warn");
    expect(checkResolution(1280, 720)).toBeNull();
  });

  it("FPS: fails <18, warns <25, passes ≥25", () => {
    expect(checkFPS(15)?.severity).toBe("fail");
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
