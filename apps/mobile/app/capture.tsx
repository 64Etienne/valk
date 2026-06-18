import { useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { CameraView, useCameraPermissions, useMicrophonePermissions } from "expo-camera";
import { useKeepAwake } from "expo-keep-awake";
import * as Brightness from "expo-brightness";
import { File } from "expo-file-system";
import { useVideoPlayer, VideoView } from "expo-video";
import { logger } from "../src/observability/logger";

type Phase = "idle" | "recording" | "recorded";

function fmtSize(bytes: number | null): string {
  if (bytes == null) return "—";
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

export default function Capture() {
  useKeepAwake();
  const router = useRouter();
  const [camPerm, requestCam] = useCameraPermissions();
  const [micPerm, requestMic] = useMicrophonePermissions();
  const camRef = useRef<CameraView>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [clipUri, setClipUri] = useState<string | null>(null);
  const [clipSize, setClipSize] = useState<number | null>(null);
  const [clipMs, setClipMs] = useState<number>(0);
  const startedAt = useRef(0);
  const prevBrightness = useRef<number | null>(null);

  const restoreBrightness = async () => {
    if (prevBrightness.current != null) {
      await Brightness.setBrightnessAsync(prevBrightness.current).catch(() => {});
      prevBrightness.current = null;
    }
  };

  const startRecording = async () => {
    try {
      prevBrightness.current = await Brightness.getBrightnessAsync().catch(() => null);
      await Brightness.setBrightnessAsync(1).catch(() => {});
      setPhase("recording");
      startedAt.current = Date.now();
      logger.info("capture", "record.start", {});
      const result = await camRef.current?.recordAsync({ maxDuration: 15 });
      const ms = Date.now() - startedAt.current;
      await restoreBrightness();
      if (!result?.uri) {
        logger.warn("capture", "record.empty", { ms });
        setPhase("idle");
        return;
      }
      let size: number | null = null;
      try {
        size = new File(result.uri).size;
      } catch {
        /* taille best-effort */
      }
      setClipUri(result.uri);
      setClipSize(size);
      setClipMs(ms);
      setPhase("recorded");
      logger.info("capture", "record.done", { uri: result.uri, size, ms });
    } catch (e) {
      await restoreBrightness();
      logger.captureException(e, { where: "recordAsync" });
      setPhase("idle");
    }
  };

  const stopRecording = () => {
    logger.info("capture", "record.stop", {});
    camRef.current?.stopRecording();
  };

  // Permissions encore inconnues
  if (!camPerm || !micPerm) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color="#c4b5fd" />
      </View>
    );
  }

  // Permissions à demander
  if (!camPerm.granted || !micPerm.granted) {
    return (
      <View style={styles.centered}>
        <Text style={styles.title}>Caméra & micro</Text>
        <Text style={styles.body}>
          Valk a besoin de la caméra et du micro pour enregistrer la capture. Rien n&apos;est
          partagé à ce stade.
        </Text>
        <Pressable
          style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
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

  // Relecture
  if (phase === "recorded" && clipUri) {
    return (
      <Playback
        uri={clipUri}
        size={clipSize}
        ms={clipMs}
        onRedo={() => {
          setClipUri(null);
          setPhase("idle");
        }}
        onDone={() => router.back()}
      />
    );
  }

  // Capture
  return (
    <View style={styles.fill}>
      <CameraView ref={camRef} style={styles.fill} facing="front" mode="video" videoQuality="720p" />
      <View style={styles.overlay} pointerEvents="box-none">
        <View style={styles.topBar}>
          <Pressable onPress={() => router.back()} hitSlop={12}>
            <Text style={styles.link}>Fermer</Text>
          </Pressable>
          {phase === "recording" && <Text style={styles.recDot}>● REC</Text>}
        </View>
        <View style={styles.controls}>
          {phase === "idle" ? (
            <Pressable style={styles.recordBtn} onPress={startRecording}>
              <View style={styles.recordInner} />
            </Pressable>
          ) : (
            <Pressable style={styles.recordBtn} onPress={stopRecording}>
              <View style={styles.stopInner} />
            </Pressable>
          )}
          <Text style={styles.hint}>
            {phase === "idle" ? "Touche pour enregistrer (max 15s)" : "Enregistrement… touche pour arrêter"}
          </Text>
        </View>
      </View>
    </View>
  );
}

function Playback({
  uri,
  size,
  ms,
  onRedo,
  onDone,
}: {
  uri: string;
  size: number | null;
  ms: number;
  onRedo: () => void;
  onDone: () => void;
}) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = true;
  });

  return (
    <View style={styles.fill}>
      <VideoView style={styles.fill} player={player} nativeControls contentFit="contain" />
      <View style={styles.overlay} pointerEvents="box-none">
        <View style={styles.topBar}>
          <Text style={styles.meta}>
            {fmtSize(size)} · {(ms / 1000).toFixed(1)}s
          </Text>
        </View>
        <View style={styles.controlsRow}>
          <Pressable style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]} onPress={onRedo}>
            <Text style={styles.buttonText}>Refaire</Text>
          </Pressable>
          <Pressable style={({ pressed }) => [styles.buttonGhost, pressed && styles.buttonPressed]} onPress={onDone}>
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
  title: { color: "#c4b5fd", fontSize: 24, fontWeight: "800", marginBottom: 12 },
  body: { color: "#9ca3af", fontSize: 15, textAlign: "center", lineHeight: 22, marginBottom: 28 },
  meta: { color: "#e5e7eb", fontSize: 14, fontWeight: "600", backgroundColor: "rgba(0,0,0,0.45)", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10, overflow: "hidden" },
  link: { color: "#c4b5fd", fontSize: 16, fontWeight: "600" },
  recDot: { color: "#f87171", fontSize: 14, fontWeight: "800", letterSpacing: 1 },
  hint: { color: "#e5e7eb", fontSize: 13, backgroundColor: "rgba(0,0,0,0.4)", paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, overflow: "hidden" },
  recordBtn: { width: 78, height: 78, borderRadius: 39, borderWidth: 4, borderColor: "#ffffff", alignItems: "center", justifyContent: "center" },
  recordInner: { width: 60, height: 60, borderRadius: 30, backgroundColor: "#ef4444" },
  stopInner: { width: 30, height: 30, borderRadius: 6, backgroundColor: "#ef4444" },
  button: { backgroundColor: "#7c3aed", paddingHorizontal: 26, paddingVertical: 14, borderRadius: 14 },
  buttonGhost: { backgroundColor: "rgba(255,255,255,0.12)", paddingHorizontal: 26, paddingVertical: 14, borderRadius: 14 },
  buttonPressed: { opacity: 0.8 },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "700" },
});
