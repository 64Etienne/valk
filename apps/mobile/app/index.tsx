import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SHARED_SCHEMA_VERSION } from "@valk/shared";
import { logger } from "../src/observability/logger";

export default function Home() {
  const [count, setCount] = useState(0);

  const onTest = () => {
    const n = count + 1;
    setCount(n);
    logger.info("debug", "bouton test", { n });
    void logger.flush();
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Valk</Text>
      <Text style={styles.subtitle}>Beta mobile — fondations</Text>
      <Text style={styles.meta}>shared schema v{SHARED_SCHEMA_VERSION}</Text>

      <Pressable style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]} onPress={onTest}>
        <Text style={styles.buttonText}>Envoyer un log test</Text>
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
  button: {
    marginTop: 40,
    backgroundColor: "#7c3aed",
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 14,
  },
  buttonPressed: { backgroundColor: "#6d28d9" },
  buttonText: { color: "#ffffff", fontSize: 16, fontWeight: "700" },
  counter: { color: "#6b7280", fontSize: 13, marginTop: 16 },
});
