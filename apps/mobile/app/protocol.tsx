import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Dimensions, Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { CameraView, useCameraPermissions, useMicrophonePermissions } from "expo-camera";
import { useKeepAwake } from "expo-keep-awake";
import * as Brightness from "expo-brightness";
import { File } from "expo-file-system";
import { useVideoPlayer, VideoView } from "expo-video";
import {
  pursuitX,
  sidecarSchema,
  SIDECAR_SCHEMA_VERSION,
  type Sidecar,
  type StimulusModel,
  type SyncMarker,
} from "@valk/shared";
import { logger } from "../src/observability/logger";

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");
const DOT = 28;
const FLASH_MS = 200;
const STIMULUS_MS = 6000;

const now = (): number => {
  const p = (globalThis as { performance?: { now?: () => number } }).performance;
  return p?.now ? p.now() : Date.now();
};
const delay = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

type Phase = "idle" | "running" | "recorded";

/** Point de poursuite piloté par requestAnimationFrame (position analytique pursuitX). */
function PursuitDot({ model }: { model: StimulusModel }) {
  const [x, setX] = useState(model.center);
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      setX(pursuitX(model, now()));
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [model]);
  const left = x * (SCREEN_W - DOT);
  return <View style={[styles.dot, { left, top: SCREEN_H / 2 - DOT / 2 }]} />;
}

export default function Protocol() {
  useKeepAwake();
  const router = useRouter();
  const [camPerm, requestCam] = useCameraPermissions();
  const [micPerm, requestMic] = useMicrophonePermissions();
  const camRef = useRef<CameraView>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [flashOn, setFlashOn] = useState(false);
  const [stimulus, setStimulus] = useState<StimulusModel | null>(null);
  const [clip, setClip] = useState<{ uri: string; size: number | null; summary: string } | null>(null);
  const prevBrightness = useRef<number | null>(null);

  const brightnessMax = async () => {
    prevBrightness.current = await Brightness.getBrightnessAsync().catch(() => null);
    await Brightness.setBrightnessAsync(1).catch(() => {});
  };
  const restoreBrightness = async () => {
    if (prevBrightness.current != null) {
      await Brightness.setBrightnessAsync(prevBrightness.current).catch(() => {});
      prevBrightness.current = null;
    }
  };

  const saveSidecar = (clipUri: string, sidecar: Sidecar): string => {
    const uri = `${clipUri}.sidecar.json`;
    const f = new File(uri);
    try {
      f.create();
    } catch {
      /* existe déjà */
    }
    f.write(JSON.stringify(sidecar));
    return uri;
  };

  const runProtocol = async () => {
    if (phase !== "idle") return;
    setPhase("running");
    const markers: SyncMarker[] = [];
    const t0 = now();
    const t0Wall = Date.now();
    try {
      const recPromise = camRef.current?.recordAsync({ maxDuration: 20 });
      logger.info("protocol", "capture.start", {});

      // Flash START
      await brightnessMax();
      markers.push({ kind: "flash", edge: "start", scheduledMs: now(), durationMs: FLASH_MS });
      setFlashOn(true);
      await delay(FLASH_MS);
      setFlashOn(false);
      await restoreBrightness();

      // Stimulus de poursuite
      await delay(400);
      const model: StimulusModel = {
        type: "smooth_pursuit_h",
        center: 0.5,
        amplitude: 0.4,
        cycles: 1.5,
        startMs: now(),
        durationMs: STIMULUS_MS,
      };
      setStimulus(model);
      await delay(STIMULUS_MS);
      setStimulus(null);

      // Flash END
      await delay(400);
      await brightnessMax();
      markers.push({ kind: "flash", edge: "end", scheduledMs: now(), durationMs: FLASH_MS });
      setFlashOn(true);
      await delay(FLASH_MS);
      setFlashOn(false);
      await restoreBrightness();

      // Stop + récupération
      camRef.current?.stopRecording();
      const result = await recPromise;
      if (!result?.uri) {
        logger.warn("protocol", "capture.empty", {});
        setPhase("idle");
        return;
      }
      let size: number | null = null;
      try {
        size = new File(result.uri).size;
      } catch {
        /* best-effort */
      }

      const sidecar: Sidecar = {
        schemaVersion: SIDECAR_SCHEMA_VERSION,
        sessionId: `proto-${t0Wall}`,
        clock: { domain: "performance.now", t0Monotonic: t0, t0Wall },
        recording: { requestedQuality: "720p", mirror: false },
        syncMarkers: markers,
        stimuli: [{ type: model.type, model, samples: [] }],
      };
      sidecarSchema.parse(sidecar); // garde-fou : on n'écrit qu'un sidecar valide
      const sidecarUri = saveSidecar(result.uri, sidecar);

      const durMs = Math.round(now() - t0);
      logger.info("protocol", "capture.done", {
        uri: result.uri,
        size,
        markers: markers.length,
        durMs,
        sidecarUri,
      });
      setClip({
        uri: result.uri,
        size,
        summary: `Sidecar OK · ${markers.length} flashs · stimulus ${STIMULUS_MS / 1000}s · ${
          size != null ? (size / (1024 * 1024)).toFixed(1) + " Mo" : "—"
        }`,
      });
      setPhase("recorded");
    } catch (e) {
      await restoreBrightness();
      setFlashOn(false);
      setStimulus(null);
      logger.captureException(e, { where: "runProtocol" });
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
        <Text style={styles.body}>Nécessaires pour la capture guidée.</Text>
        <Pressable
          style={({ pressed }) => [styles.button, pressed && styles.pressed]}
          onPress={async () => {
            const c = await requestCam();
            const m = await requestMic();
            logger.info("permission", "request", { camera: c.granted, mic: m.granted });
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
      <Playback
        uri={clip.uri}
        info={clip.summary}
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
      {stimulus && <PursuitDot model={stimulus} />}
      {flashOn && <View style={styles.flash} />}
      <View style={styles.overlay} pointerEvents="box-none">
        <View style={styles.topBar}>
          <Pressable onPress={() => router.back()} hitSlop={12} disabled={phase === "running"}>
            <Text style={[styles.link, phase === "running" && styles.dim]}>Fermer</Text>
          </Pressable>
          {phase === "running" && <Text style={styles.recDot}>● Capture guidée…</Text>}
        </View>
        {phase === "idle" && (
          <View style={styles.controls}>
            <Pressable style={({ pressed }) => [styles.startBtn, pressed && styles.pressed]} onPress={runProtocol}>
              <Text style={styles.startText}>Lancer la capture guidée</Text>
            </Pressable>
            <Text style={styles.hint}>2 flashs + suivez le point des yeux (~7s)</Text>
          </View>
        )}
      </View>
    </View>
  );
}

function Playback({
  uri,
  info,
  onRedo,
  onDone,
}: {
  uri: string;
  info: string;
  onRedo: () => void;
  onDone: () => void;
}) {
  const player = useVideoPlayer({ uri }, (p) => {
    p.loop = true;
    p.muted = false;
    p.play();
  });
  return (
    <View style={styles.fill}>
      <VideoView style={styles.fill} player={player} nativeControls contentFit="contain" />
      <View style={styles.overlay} pointerEvents="box-none">
        <View style={styles.topBar}>
          <Text style={styles.meta}>{info}</Text>
        </View>
        <View style={styles.controlsRow}>
          <Pressable style={({ pressed }) => [styles.button, pressed && styles.pressed]} onPress={onRedo}>
            <Text style={styles.buttonText}>Refaire</Text>
          </Pressable>
          <Pressable style={({ pressed }) => [styles.buttonGhost, pressed && styles.pressed]} onPress={onDone}>
            <Text style={styles.buttonText}>Terminé</Text>
          </Pressable>
        </View>
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
  controlsRow: { flexDirection: "row", justifyContent: "center", gap: 14, paddingHorizontal: 20 },
  flash: { ...StyleSheet.absoluteFillObject, backgroundColor: "#ffffff" },
  dot: { position: "absolute", width: DOT, height: DOT, borderRadius: DOT / 2, backgroundColor: "#a78bfa", borderWidth: 2, borderColor: "#fff" },
  title: { color: "#c4b5fd", fontSize: 24, fontWeight: "800", marginBottom: 12 },
  body: { color: "#9ca3af", fontSize: 15, textAlign: "center", lineHeight: 22, marginBottom: 28 },
  meta: { color: "#e5e7eb", fontSize: 13, fontWeight: "600", backgroundColor: "rgba(0,0,0,0.5)", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10, overflow: "hidden" },
  link: { color: "#c4b5fd", fontSize: 16, fontWeight: "600" },
  dim: { opacity: 0.4 },
  recDot: { color: "#f87171", fontSize: 14, fontWeight: "800" },
  hint: { color: "#e5e7eb", fontSize: 13, backgroundColor: "rgba(0,0,0,0.4)", paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, overflow: "hidden" },
  startBtn: { backgroundColor: "#7c3aed", paddingHorizontal: 34, paddingVertical: 18, borderRadius: 16 },
  startText: { color: "#fff", fontSize: 18, fontWeight: "800" },
  button: { backgroundColor: "#7c3aed", paddingHorizontal: 26, paddingVertical: 14, borderRadius: 14 },
  buttonGhost: { backgroundColor: "rgba(255,255,255,0.12)", paddingHorizontal: 26, paddingVertical: 14, borderRadius: 14 },
  pressed: { opacity: 0.8 },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "700" },
});
