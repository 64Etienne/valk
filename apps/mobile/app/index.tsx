import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { SHARED_SCHEMA_VERSION } from "@valk/shared";
import { logger } from "../src/observability/logger";

export default function Home() {
  const router = useRouter();
  const [count, setCount] = useState(0);

  const onTest = () => {
    const n = count + 1;
    setCount(n);
    logger.info("debug", "bouton test", { n });
    void logger.flush();
  };

  const onError = () => {
    logger.captureException(new Error(`Valk — erreur de test #${count + 1}`), { n: count + 1 });
    void logger.flush();
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Valk</Text>
      <Text style={styles.subtitle}>Beta mobile — fondations</Text>
      <Text style={styles.meta}>shared schema v{SHARED_SCHEMA_VERSION}</Text>

      <Pressable
        style={({ pressed }) => [styles.buttonPrimary, pressed && styles.buttonPressed]}
        onPress={() => router.push("/protocol")}
      >
        <Text style={styles.buttonPrimaryText}>Capture guidée</Text>
      </Pressable>
      <Pressable
        style={({ pressed }) => [styles.buttonSecondary, pressed && styles.buttonPressed]}
        onPress={() => router.push("/capture")}
      >
        <Text style={styles.buttonText}>Capture libre (test)</Text>
      </Pressable>

      <Pressable style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]} onPress={onTest}>
        <Text style={styles.buttonText}>Envoyer un log test</Text>
      </Pressable>
      <Pressable style={({ pressed }) => [styles.buttonAlt, pressed && styles.buttonAltPressed]} onPress={onError}>
        <Text style={styles.buttonText}>Tester une erreur (Sentry)</Text>
      </Pressable>
      {count > 0 && <Text style={styles.counter}>{count} log(s) envoyé(s)</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#0b0b12" },
  title: { color: "#c4b5fd", fontSize: 40, fontWeight: "800", letterSpacing: 1 },
  subtitle: { color: "#9ca3af", fontSize: 16, marginTop: 8 },
  meta: { color: "#4b5563", fontSize: 12, marginTop: 24 },
  buttonPrimary: {
    marginTop: 40,
    backgroundColor: "#7c3aed",
    paddingHorizontal: 40,
    paddingVertical: 18,
    borderRadius: 16,
  },
  buttonPrimaryText: { color: "#ffffff", fontSize: 18, fontWeight: "800", letterSpacing: 0.3 },
  buttonSecondary: {
    marginTop: 14,
    backgroundColor: "rgba(124,58,237,0.18)",
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: 14,
  },
  button: {
    marginTop: 28,
    backgroundColor: "rgba(124,58,237,0.18)",
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: 14,
  },
  buttonPressed: { backgroundColor: "#6d28d9" },
  buttonAlt: {
    marginTop: 14,
    backgroundColor: "#b45309",
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 14,
  },
  buttonAltPressed: { backgroundColor: "#92400e" },
  buttonText: { color: "#ffffff", fontSize: 16, fontWeight: "700" },
  counter: { color: "#6b7280", fontSize: 13, marginTop: 16 },
});
