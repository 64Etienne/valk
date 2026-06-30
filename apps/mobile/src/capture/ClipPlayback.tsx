import { Pressable, StyleSheet, Text, View } from "react-native";
import { useVideoPlayer, VideoView } from "expo-video";

/** Relecture d'un clip + actions Envoyer/Refaire/Terminé. Partagé poursuite + calibration. */
export function ClipPlayback({
  uri,
  info,
  upload,
  onUpload,
  onRedo,
  onDone,
}: {
  uri: string;
  info: string;
  upload: { state: "idle" | "uploading" | "done" | "error"; msg?: string };
  onUpload: () => void;
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
        <View style={styles.bottomStack}>
          {upload.state !== "done" && (
            <Pressable
              style={({ pressed }) => [styles.startBtn, (pressed || upload.state === "uploading") && styles.pressed]}
              onPress={onUpload}
              disabled={upload.state === "uploading"}
            >
              <Text style={styles.startText}>
                {upload.state === "uploading" ? "Envoi…" : "Envoyer au serveur"}
              </Text>
            </Pressable>
          )}
          {upload.msg && (
            <Text
              style={[
                styles.uploadMsg,
                upload.state === "error" && styles.uploadErr,
                upload.state === "done" && styles.uploadOk,
              ]}
            >
              {upload.msg}
            </Text>
          )}
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
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: "#000" },
  overlay: { ...StyleSheet.absoluteFillObject, paddingTop: 56, paddingBottom: 40, justifyContent: "space-between" },
  topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20 },
  bottomStack: { alignItems: "center", gap: 12, paddingHorizontal: 20 },
  controlsRow: { flexDirection: "row", justifyContent: "center", gap: 14, paddingHorizontal: 20 },
  meta: { color: "#e5e7eb", fontSize: 13, fontWeight: "600", backgroundColor: "rgba(0,0,0,0.5)", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10, overflow: "hidden" },
  uploadMsg: { color: "#e5e7eb", fontSize: 13, fontWeight: "600" },
  uploadErr: { color: "#f87171" },
  uploadOk: { color: "#34d399" },
  startBtn: { backgroundColor: "#7c3aed", paddingHorizontal: 34, paddingVertical: 18, borderRadius: 16 },
  startText: { color: "#fff", fontSize: 18, fontWeight: "800" },
  button: { backgroundColor: "#7c3aed", paddingHorizontal: 26, paddingVertical: 14, borderRadius: 14 },
  buttonGhost: { backgroundColor: "rgba(255,255,255,0.12)", paddingHorizontal: 26, paddingVertical: 14, borderRadius: 14 },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  pressed: { opacity: 0.8 },
});
