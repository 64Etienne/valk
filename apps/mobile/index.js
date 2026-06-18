import { registerRootComponent } from 'expo';
import { ExpoRoot } from 'expo-router';

// Entry monorepo-safe : require.context avec un chemin LITTÉRAL './app' évite de
// dépendre de process.env.EXPO_ROUTER_APP_ROOT, qui n'est pas injecté de façon
// fiable en npm workspaces (cf. expo/expo#27299). La fonction est exportée pour
// que Fast Refresh mette à jour le contexte de routes.
export function App() {
  const ctx = require.context('./app');
  return <ExpoRoot context={ctx} />;
}

registerRootComponent(App);
