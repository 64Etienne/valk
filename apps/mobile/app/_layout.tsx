import { useEffect } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { initObservability, logger } from "../src/observability/logger";

export default function RootLayout() {
  useEffect(() => {
    void initObservability().then(() => logger.info("app", "app.start"));
  }, []);

  return (
    <>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false }} />
    </>
  );
}
