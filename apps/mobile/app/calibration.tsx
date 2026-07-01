import { useRef, useState } from "react";
import { ActivityIndicator, Dimensions, Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { CameraView, useCameraPermissions, useMicrophonePermissions } from "expo-camera";
import { useKeepAwake } from "expo-keep-awake";
import { File } from "expo-file-system";
import {
  sidecarSchema,
  SIDECAR_SCHEMA_VERSION,
  type FixationModel,
  type Sidecar,
  type SyncMarker,
} from "@valk/shared";
import { logger } from "../src/observability/logger";
import { saveSidecar, uploadCapture, useMaxBrightness } from "../src/capture/helpers";
import { ClipPlayback } from "../src/capture/ClipPlayback";

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");
const DOT = 30;
const FLASH_MS = 200;
const XS = [0.1, 0.3, 0.5, 0.7, 0.9];
const FIX_MS = 1500;

const now = (): number => {
  const p = (globalThis as { performance?: { now?: () => number } }).performance;
  return p?.now ? p.now() : Date.now();
};
const delay = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

type Phase = "idle" | "running" | "recorded";

export default function Calibration() {
  useKeepAwake();
  useMaxBrightness();
  const router = useRouter();
  const [camPerm, requestCam] = useCameraPermissions();
  const [micPerm, requestMic] = useMicrophonePermissions();
  const camRef = useRef<CameraView>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [flashOn, setFlashOn] = useState(false);
  const [dotX, setDotX] = useState<number | null>(null);
  const [clip, setClip] = useState<{ uri: string; size: number | null; summary: string; sidecar: Sidecar } | null>(null);
  const [upload, setUpload] = useState<{ state: "idle" | "uploading" | "done" | "error"; msg?: string }>({ state: "idle" });

  const uploadClip = async () => {
    if (!clip) return;
    setUpload({ state: "uploading" });
    const r = await uploadCapture(clip.uri, clip.sidecar);
    setUpload({ state: r.ok ? "done" : "error", msg: r.detail });
  };

  const run = async () => {
    if (phase !== "idle") return;
    setPhase("running");
    const markers: SyncMarker[] = [];
    const t0 = now();
    const t0Wall = Date.now();
    try {
      const recPromise = camRef.current?.recordAsync({ maxDuration: 30 });
      logger.info("calibration", "capture.start", {});
      // FLASH start (luminosité déjà au max via useMaxBrightness)
      markers.push({ kind: "flash", edge: "start", scheduledMs: now(), durationMs: FLASH_MS });
      setFlashOn(true);
      await delay(FLASH_MS);
      setFlashOn(false);
      await delay(400);
      logger.info("calibration", "seq.afterFlash1", {});
      // FIXATIONS
      const points: FixationModel["points"] = [];
      for (const x of XS) {
        const startMs = now();
        setDotX(x);
        await delay(FIX_MS);
        points.push({ x, startMs, durMs: FIX_MS });
      }
      setDotX(null);
      await delay(400);
      // FLASH end
      markers.push({ kind: "flash", edge: "end", scheduledMs: now(), durationMs: FLASH_MS });
      setFlashOn(true);
      await delay(FLASH_MS);
      setFlashOn(false);

      logger.info("calibration", "seq.stopping", {});
      camRef.current?.stopRecording();
      const result = await recPromise;
      logger.info("calibration", "seq.recResolved", { uri: result?.uri ? "ok" : "empty" });
      if (!result?.uri) {
        setPhase("idle");
        return;
      }
      let size: number | null = null;
      try {
        size = new File(result.uri).size;
      } catch {
        /* best-effort */
      }

      const model: FixationModel = { type: "fixation_h", points };
      const sidecar: Sidecar = {
        schemaVersion: SIDECAR_SCHEMA_VERSION,
        sessionId: `calib-${t0Wall}`,
        clock: { domain: "performance.now", t0Monotonic: t0, t0Wall },
        recording: { requestedQuality: "720p", mirror: false },
        syncMarkers: markers,
        stimuli: [{ type: "fixation_h", model, samples: [] }],
      };
      sidecarSchema.parse(sidecar);
      saveSidecar(result.uri, sidecar);
      logger.info("calibration", "capture.done", { uri: result.uri, size, points: points.length });
      setClip({
        uri: result.uri,
        size,
        sidecar,
        summary: `Calibration · ${points.length} points · ${size != null ? (size / 1048576).toFixed(1) + " Mo" : "—"}`,
      });
      setPhase("recorded");
      // Envoi AUTOMATIQUE au serveur (le bouton « Envoyer » reste dispo en secours)
      setUpload({ state: "uploading" });
      const up = await uploadCapture(result.uri, sidecar);
      setUpload({ state: up.ok ? "done" : "error", msg: up.detail });
    } catch (e) {
      setFlashOn(false);
      setDotX(null);
      logger.captureException(e, { where: "calibration.run" });
      setPhase("idle");
    }
  };

  if (!camPerm || !micPerm) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color="#c4b5fd" />
      </View>
    );
  }
  if (!camPerm.granted || !micPerm.granted) {
    return (
      <View style={styles.centered}>
        <Text style={styles.title}>Caméra & micro</Text>
        <Pressable
          style={({ pressed }) => [styles.button, pressed && styles.pressed]}
          onPress={async () => {
            await requestCam();
            await requestMic();
          }}
        >
          <Text style={styles.buttonText}>Autoriser</Text>
        </Pressable>
        <Pressable onPress={() => router.back()}>
          <Text style={styles.link}>Retour</Text>
        </Pressable>
      </View>
    );
  }
  if (phase === "recorded" && clip) {
    return (
      <ClipPlayback
        uri={clip.uri}
        info={clip.summary}
        upload={upload}
        onUpload={uploadClip}
        onRedo={() => {
          setClip(null);
          setPhase("idle");
        }}
        onDone={() => router.back()}
      />
    );
  }
  return (
    <View style={styles.fill}>
      <CameraView ref={camRef} style={styles.fill} facing="front" mode="video" videoQuality="720p" />
      {dotX != null && <View style={[styles.dot, { left: dotX * (SCREEN_W - DOT), top: SCREEN_H * 0.16 }]} />}
      {flashOn && <View style={styles.flash} />}
      <View style={styles.overlay} pointerEvents="box-none">
        <View style={styles.topBar}>
          <Pressable onPress={() => router.back()} hitSlop={12} disabled={phase === "running"}>
            <Text style={[styles.link, phase === "running" && styles.dim]}>Fermer</Text>
          </Pressable>
          {phase === "running" && <Text style={styles.recDot}>● Calibration…</Text>}
        </View>
        {phase === "idle" && (
          <View style={styles.controls}>
            <Pressable style={({ pressed }) => [styles.startBtn, pressed && styles.pressed]} onPress={run}>
              <Text style={styles.startText}>Lancer la calibration</Text>
            </Pressable>
            <Text style={styles.hint}>Fixe chaque point qui apparaît (~1,5 s), tête immobile</Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: "#000" },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#0b0b12", padding: 32 },
  overlay: { ...StyleSheet.absoluteFillObject, paddingTop: 56, paddingBottom: 40, justifyContent: "space-between" },
  topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20 },
  controls: { alignItems: "center", gap: 12, paddingHorizontal: 20 },
  flash: { ...StyleSheet.absoluteFillObject, backgroundColor: "#ffffff" },
  dot: { position: "absolute", width: DOT, height: DOT, borderRadius: DOT / 2, backgroundColor: "#f59e0b", borderWidth: 3, borderColor: "#fff" },
  title: { color: "#c4b5fd", fontSize: 24, fontWeight: "800", marginBottom: 20 },
  link: { color: "#c4b5fd", fontSize: 16, fontWeight: "600" },
  dim: { opacity: 0.4 },
  recDot: { color: "#f59e0b", fontSize: 14, fontWeight: "800" },
  hint: { color: "#e5e7eb", fontSize: 13, backgroundColor: "rgba(0,0,0,0.4)", paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, overflow: "hidden" },
  startBtn: { backgroundColor: "#7c3aed", paddingHorizontal: 34, paddingVertical: 18, borderRadius: 16 },
  startText: { color: "#fff", fontSize: 18, fontWeight: "800" },
  button: { backgroundColor: "#7c3aed", paddingHorizontal: 26, paddingVertical: 14, borderRadius: 14 },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  pressed: { opacity: 0.8 },
});
