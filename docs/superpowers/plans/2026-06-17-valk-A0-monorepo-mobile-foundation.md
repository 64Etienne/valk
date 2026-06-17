# Valk A0 — Fondations monorepo + skeleton mobile + distribution — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transformer le repo Next.js mono-app en monorepo npm workspaces, créer une app Expo SDK 54 squelette qui consomme un package TS partagé, et la distribuer via EAS Update pour qu'elle s'ouvre dans l'Expo Go de l'utilisateur sur son iPhone.

**Architecture:** Monorepo npm workspaces : `apps/web` (l'app Next.js actuelle, déplacée), `apps/mobile` (nouvelle app Expo SDK 54, expo-router), `packages/shared` (TS pur, browser-free, consommé par les deux). Distribution mobile sans serveur local via `eas update` + `EXPO_TOKEN`.

**Tech Stack:** Next.js 16.1.7, React 19, Expo SDK 54 (RN 0.81), expo-router, TypeScript, vitest, npm workspaces, EAS Update.

## Global Constraints

- **SDK Expo = 54** (l'Expo Go de l'App Store ne supporte que SDK 54 depuis mai 2026). Ne jamais scaffolder sur SDK 55/56.
- **Gestionnaire = npm workspaces** uniquement (pas pnpm/yarn ; pnpm casse la résolution Metro).
- **Versions React/React Native dérivées du SDK**, jamais codées en dur : toujours via `npx expo install` / `npx expo install --fix`.
- **`packages/shared` = 100% browser-free** : aucun import de `@mediapipe/*`, `document`, `window`, `navigator`, Web Audio, DOM, React.
- **Pas de Supabase** dans ce plan (stockage local plus tard).
- **Une seule instance React hoistée** : `apps/web` et `apps/mobile` alignés sur le React de SDK 54 ; `packages/shared` sans dépendance React.
- **Chaque commit** se termine par les trailers harness :
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>` puis `Claude-Session: https://claude.ai/code/session_01CTQCX3c3cRVBnZEBvaWSSh`.
- Travailler sur la branche `feat/valk-expo-foundations` (déjà créée).

---

## File Structure

**Déplacés (Task 1) — depuis la racine vers `apps/web/` :**
`src/`, `public/`, `next.config.ts`, `tsconfig.json`, `eslint.config.mjs`, `postcss.config.mjs`, `vitest.config.ts`, `vitest.setup.ts`, `instrumentation.ts`, `instrumentation-client.ts`, `next-env.d.ts`, `package.json` (→ `@valk/web`), `scripts/`, `.env.local`, `.env.example`.

**Inchangés à la racine :** `docs/`, `supabase/`, `README.md`, `.gitignore`, `.git/`.

**Créés :**
- `package.json` (racine) — workspace root.
- `packages/shared/{package.json, tsconfig.json, vitest.config.ts, src/index.ts, src/time-map.ts, src/__tests__/time-map.test.ts}`.
- `apps/mobile/*` — projet Expo (scaffold), dont `app/index.tsx`, `metro.config.js`, `app.json`, `eas.json`.

---

## Task 1: Monorepo npm workspaces + déplacement de l'app Next vers `apps/web`

**Files:**
- Create: `package.json` (racine, nouveau workspace root)
- Move: tout l'arbre Next listé ci-dessus → `apps/web/`
- Modify: `apps/web/package.json` (renommage `name`)

**Interfaces:**
- Consumes: rien (point de départ).
- Produces: workspace root avec `workspaces: ["apps/*","packages/*"]` ; l'app web buildable/test via `-w @valk/web`.

- [ ] **Step 1: Déplacer l'app Next dans `apps/web`**

```bash
mkdir -p apps/web
git mv src public next.config.ts tsconfig.json eslint.config.mjs postcss.config.mjs \
       vitest.config.ts vitest.setup.ts instrumentation.ts instrumentation-client.ts \
       next-env.d.ts package.json scripts .env.local .env.example apps/web/
```

- [ ] **Step 2: Créer le `package.json` racine (workspace root)**

Create `package.json`:
```json
{
  "name": "valk-monorepo",
  "private": true,
  "workspaces": [
    "apps/*",
    "packages/*"
  ],
  "scripts": {
    "web": "npm run dev -w @valk/web",
    "web:build": "npm run build -w @valk/web",
    "test": "npm test --workspaces --if-present",
    "mobile": "npm run start -w @valk/mobile"
  }
}
```

- [ ] **Step 3: Renommer le package web en `@valk/web`**

Modify `apps/web/package.json` ligne `"name"` : remplacer `"name": "valk"` par `"name": "@valk/web"`. Ne pas toucher aux dépendances ni aux scripts existants (`dev`, `build`, `start`, `lint`, `test`, `test:watch`, `test:coverage`, `replay`).

- [ ] **Step 4: Régénérer l'arbre de dépendances au niveau workspace**

```bash
rm -rf node_modules apps/web/node_modules .next apps/web/.next package-lock.json tsconfig.tsbuildinfo apps/web/tsconfig.tsbuildinfo
npm install
```
Expected: `npm install` se termine sans erreur ; un unique `package-lock.json` à la racine ; `node_modules` hoisté à la racine.

- [ ] **Step 5: Vérifier que l'app web build et que les tests passent depuis la nouvelle position**

```bash
npm test -w @valk/web
npm run build -w @valk/web
```
Expected: les suites vitest existantes (`response-schema`, `verdict`, `reading-text`, `baseline`, `signal`, `partial-json`, `preflight-checks`, `session-result`, `math.smoke`, hooks) PASSENT ; `next build` réussit. Si le build casse sur un chemin, corriger le chemin (pas la logique) et relancer.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor(monorepo): déplace l'app Next vers apps/web + workspace root npm

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01CTQCX3c3cRVBnZEBvaWSSh"
```

---

## Task 2: `packages/shared` (TS pur) + consommation par l'app web

**Files:**
- Create: `packages/shared/package.json`
- Create: `packages/shared/tsconfig.json`
- Create: `packages/shared/vitest.config.ts`
- Create: `packages/shared/src/index.ts`
- Create: `packages/shared/src/time-map.ts`
- Create: `packages/shared/src/__tests__/time-map.test.ts`
- Modify: `apps/web/next.config.ts` (ajout `transpilePackages`)
- Modify: `apps/web/src/lib/analysis/response-schema.ts` (import de démonstration de `@valk/shared`)

**Interfaces:**
- Consumes: workspace root de Task 1.
- Produces:
  - `export const SHARED_SCHEMA_VERSION: number` (= 1)
  - `export function fitLinearTimeMap(anchors: Array<{ stim: number; video: number }>): { a: number; b: number; anchors: number }` — résout `video = a·stim + b` par moindres carrés (≥2 ancres requises ; lève si <2).

- [ ] **Step 1: Écrire le test qui échoue (TDD `fitLinearTimeMap`)**

Create `packages/shared/src/__tests__/time-map.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { fitLinearTimeMap, SHARED_SCHEMA_VERSION } from '../index';

describe('fitLinearTimeMap', () => {
  it('résout a et b à partir de deux ancres exactes', () => {
    const { a, b, anchors } = fitLinearTimeMap([
      { stim: 0, video: 100 },
      { stim: 1000, video: 1100 },
    ]);
    expect(a).toBeCloseTo(1, 6);
    expect(b).toBeCloseTo(100, 6);
    expect(anchors).toBe(2);
  });

  it('ajuste une pente (dérive fps) sur deux ancres', () => {
    const { a, b } = fitLinearTimeMap([
      { stim: 0, video: 0 },
      { stim: 1000, video: 1020 },
    ]);
    expect(a).toBeCloseTo(1.02, 6);
    expect(b).toBeCloseTo(0, 6);
  });

  it('moindres carrés sur 3+ ancres bruitées', () => {
    const { a, b } = fitLinearTimeMap([
      { stim: 0, video: 1 },
      { stim: 10, video: 11 },
      { stim: 20, video: 21 },
    ]);
    expect(a).toBeCloseTo(1, 6);
    expect(b).toBeCloseTo(1, 6);
  });

  it('lève si moins de 2 ancres', () => {
    expect(() => fitLinearTimeMap([{ stim: 0, video: 0 }])).toThrow();
  });

  it('expose la version de schéma', () => {
    expect(SHARED_SCHEMA_VERSION).toBe(1);
  });
});
```

- [ ] **Step 2: Créer la config du package et lancer le test (échec attendu)**

Create `packages/shared/package.json`:
```json
{
  "name": "@valk/shared",
  "version": "0.1.0",
  "private": true,
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": { ".": "./src/index.ts" },
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "typescript": "^5",
    "vitest": "^2.1.9"
  }
}
```

Create `packages/shared/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "declaration": true,
    "noEmit": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "lib": ["ES2022"]
  },
  "include": ["src"]
}
```

Create `packages/shared/vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { environment: 'node' },
});
```

```bash
npm install
npm test -w @valk/shared
```
Expected: FAIL — `Cannot find module '../index'` (pas encore créé).

- [ ] **Step 3: Implémenter `time-map.ts` et `index.ts`**

Create `packages/shared/src/time-map.ts`:
```ts
/**
 * Résout la carte temporelle linéaire video = a·stim + b reliant le temps-stimulus
 * (horloge monotone du device) au temps-vidéo (frames décodées côté serveur),
 * à partir d'ancres de synchronisation in-band (flash début/fin). Moindres carrés.
 */
export function fitLinearTimeMap(
  anchors: Array<{ stim: number; video: number }>,
): { a: number; b: number; anchors: number } {
  const n = anchors.length;
  if (n < 2) {
    throw new Error(`fitLinearTimeMap requiert au moins 2 ancres, reçu ${n}`);
  }
  let sumX = 0, sumY = 0, sumXX = 0, sumXY = 0;
  for (const { stim, video } of anchors) {
    sumX += stim;
    sumY += video;
    sumXX += stim * stim;
    sumXY += stim * video;
  }
  const denom = n * sumXX - sumX * sumX;
  if (denom === 0) {
    throw new Error('fitLinearTimeMap : ancres dégénérées (même temps-stimulus)');
  }
  const a = (n * sumXY - sumX * sumY) / denom;
  const b = (sumY - a * sumX) / n;
  return { a, b, anchors: n };
}
```

Create `packages/shared/src/index.ts`:
```ts
export const SHARED_SCHEMA_VERSION = 1;
export { fitLinearTimeMap } from './time-map';
```

- [ ] **Step 4: Lancer le test (succès attendu)**

```bash
npm test -w @valk/shared
```
Expected: PASS (5 tests verts).

- [ ] **Step 5: Faire consommer `@valk/shared` par l'app web**

Modify `apps/web/next.config.ts` : ajouter `transpilePackages: ['@valk/shared']` à l'objet de config Next (avant le wrapping Sentry s'il existe).

Modify `apps/web/src/lib/analysis/response-schema.ts` : ajouter en haut du fichier l'import de démonstration et l'utiliser pour annoter le schéma (preuve runtime que la résolution monorepo marche) :
```ts
import { SHARED_SCHEMA_VERSION } from '@valk/shared';

export const ANALYSIS_SCHEMA_VERSION = SHARED_SCHEMA_VERSION;
```

Ajouter `"@valk/shared": "*"` dans les `dependencies` de `apps/web/package.json`, puis :
```bash
npm install
```

- [ ] **Step 6: Vérifier build web + tests partagés**

```bash
npm test -w @valk/shared
npm run build -w @valk/web
```
Expected: tests shared PASS ; `next build` réussit en résolvant `@valk/shared` (transpilé). Si erreur « cannot transpile », vérifier que `transpilePackages` contient bien `@valk/shared`.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(shared): package @valk/shared (fitLinearTimeMap + version) consommé par web

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01CTQCX3c3cRVBnZEBvaWSSh"
```

---

## Task 3: Scaffold de l'app Expo SDK 54 (`apps/mobile`)

**Files:**
- Create: `apps/mobile/*` (scaffold Expo expo-router), dont `apps/mobile/app/index.tsx`, `apps/mobile/metro.config.js`, `apps/mobile/package.json`, `apps/mobile/app.json`.

**Interfaces:**
- Consumes: workspace root (Task 1).
- Produces: app Expo `@valk/mobile` épinglée SDK 54, intégrée au monorepo, qui bundle via Metro.

- [ ] **Step 1: Scaffolder l'app Expo (template expo-router/TypeScript)**

```bash
npx create-expo-app@latest apps/mobile --template default --no-install
```
Expected: arbre `apps/mobile` créé (expo-router, `app/`, `app.json`, `tsconfig.json`). `--no-install` évite un node_modules isolé (on installe au niveau workspace).

- [ ] **Step 2: Renommer le package, épingler SDK 54, intégrer au workspace**

Modify `apps/mobile/package.json` : `"name"` → `"@valk/mobile"`. S'assurer que les scripts incluent `"start": "expo start"`, `"android": "expo start --android"`, `"ios": "expo start --ios"`.

```bash
# Aligner tout le projet sur Expo SDK 54
npm install expo@~54.0.0 -w @valk/mobile
npx expo install --fix --workspace @valk/mobile 2>/dev/null || (cd apps/mobile >/dev/null && npx expo install --fix)
npm install
```
Expected: `expo` et tous les `expo-*` + `react`/`react-native` alignés sur SDK 54. (Si `expo install --fix` ne supporte pas le flag workspace dans cette version, exécuter depuis `apps/mobile`.)

- [ ] **Step 3: Aligner React au niveau racine (instance unique)**

Lire la version de React résolue pour SDK 54 :
```bash
npm ls react -w @valk/mobile
```
Reporter cette version exacte (ex. `19.1.0`) dans `apps/web/package.json` (`react`, `react-dom`) ET, par sûreté, l'ajouter en `overrides` du `package.json` racine :
```json
"overrides": { "react": "<VERSION SDK54>", "react-dom": "<VERSION SDK54>" }
```
Puis `npm install`. Expected: `npm ls react` à la racine montre une seule version.

- [ ] **Step 4: Config Metro monorepo minimale**

Create `apps/mobile/metro.config.js`:
```js
// Metro s'auto-configure pour les monorepos depuis Expo SDK 52+ : aucune
// configuration watchFolders/nodeModulesPaths manuelle requise en npm workspaces.
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

module.exports = config;
```

- [ ] **Step 5: Écran d'accueil minimal**

Replace `apps/mobile/app/index.tsx`:
```tsx
import { StyleSheet, Text, View } from 'react-native';

export default function Home() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Valk</Text>
      <Text style={styles.subtitle}>Beta mobile — fondations</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0b0b12' },
  title: { color: '#c4b5fd', fontSize: 40, fontWeight: '800', letterSpacing: 1 },
  subtitle: { color: '#9ca3af', fontSize: 16, marginTop: 8 },
});
```

- [ ] **Step 6: Vérifier le bundling Metro (gate headless)**

```bash
npx expo export --platform ios --output-dir /tmp/valk-mobile-export -p apps/mobile 2>/dev/null \
  || (cd apps/mobile >/dev/null && npx expo export --platform ios --output-dir /tmp/valk-mobile-export)
```
Expected: l'export Metro réussit (bundle iOS généré) sans erreur de résolution de module. (`npx expo-doctor` depuis `apps/mobile` ne doit pas signaler de duplication React/React Native.)

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(mobile): scaffold app Expo SDK 54 (expo-router) intégrée au monorepo

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01CTQCX3c3cRVBnZEBvaWSSh"
```

---

## Task 4: Consommation de `@valk/shared` depuis l'app mobile

**Files:**
- Modify: `apps/mobile/package.json` (dépendance `@valk/shared`)
- Modify: `apps/mobile/app/index.tsx` (import + affichage)

**Interfaces:**
- Consumes: `SHARED_SCHEMA_VERSION` de `@valk/shared` (Task 2).
- Produces: preuve que Metro résout le package TS partagé (architecture monorepo validée des deux côtés).

- [ ] **Step 1: Déclarer la dépendance workspace**

Modify `apps/mobile/package.json` : ajouter `"@valk/shared": "*"` dans `dependencies`. Puis :
```bash
npm install
```

- [ ] **Step 2: Importer et afficher la version partagée**

Modify `apps/mobile/app/index.tsx` — ajouter l'import et une ligne d'affichage :
```tsx
import { StyleSheet, Text, View } from 'react-native';
import { SHARED_SCHEMA_VERSION } from '@valk/shared';

export default function Home() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Valk</Text>
      <Text style={styles.subtitle}>Beta mobile — fondations</Text>
      <Text style={styles.meta}>shared schema v{SHARED_SCHEMA_VERSION}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0b0b12' },
  title: { color: '#c4b5fd', fontSize: 40, fontWeight: '800', letterSpacing: 1 },
  subtitle: { color: '#9ca3af', fontSize: 16, marginTop: 8 },
  meta: { color: '#4b5563', fontSize: 12, marginTop: 24 },
});
```

- [ ] **Step 3: Vérifier que Metro résout `@valk/shared`**

```bash
rm -rf /tmp/valk-mobile-export
cd apps/mobile >/dev/null && npx expo export --platform ios --output-dir /tmp/valk-mobile-export
```
Expected: export réussi, aucune erreur « Unable to resolve @valk/shared ». (Le bundle contient `SHARED_SCHEMA_VERSION`.)

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(mobile): consomme @valk/shared (résolution Metro du package partagé validée)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01CTQCX3c3cRVBnZEBvaWSSh"
```

---

## Task 5: Distribution EAS Update + premier publish dans Expo Go

> Cette tâche nécessite le `EXPO_TOKEN` de l'utilisateur (Personal Access Token créé sur expo.dev → Account → Access Tokens) et une validation device **par l'utilisateur** (ouverture dans Expo Go). C'est le critère d'acceptation de A0.

**Files:**
- Create: `apps/mobile/eas.json`
- Modify: `apps/mobile/app.json` (`runtimeVersion`, `updates`, `owner`, `slug`)

**Interfaces:**
- Consumes: app mobile fonctionnelle (Tasks 3-4).
- Produces: un canal EAS Update ouvrable dans l'Expo Go SDK 54 de l'utilisateur.

- [ ] **Step 1: Installer expo-updates et configurer EAS**

```bash
cd apps/mobile >/dev/null && npx expo install expo-updates
cd apps/mobile >/dev/null && EXPO_TOKEN="$EXPO_TOKEN" npx eas-cli@latest update:configure
```
Expected: `eas.json` créé, `app.json` enrichi d'un bloc `updates` + `runtimeVersion`. (Le `EXPO_TOKEN` est fourni par l'utilisateur à cette étape ; ne jamais le committer.)

- [ ] **Step 2: Figer le runtimeVersion sur la policy SDK et le canal**

Vérifier dans `apps/mobile/app.json` que `expo.runtimeVersion` utilise une policy compatible Expo Go (ex. `{ "policy": "sdkVersion" }`) et que `expo.slug`/`expo.owner` correspondent au compte de l'utilisateur. Create/compléter `apps/mobile/eas.json` avec un canal `preview` :
```json
{
  "cli": { "version": ">= 16.0.0", "appVersionSource": "remote" },
  "build": {},
  "update": { "preview": { "channel": "preview" } }
}
```

- [ ] **Step 3: Publier le premier update**

```bash
cd apps/mobile >/dev/null && EXPO_TOKEN="$EXPO_TOKEN" npx eas-cli@latest update --branch preview --message "A0: hello Valk" --non-interactive
```
Expected: l'update est publié ; la commande affiche un lien `https://expo.dev/...` et un QR (et/ou un lien `exp://`/`u.expo.dev`).

- [ ] **Step 4: Validation device (utilisateur dans la boucle)**

Demander à l'utilisateur d'ouvrir l'app dans son **Expo Go (App Store, SDK 54)** via le QR / lien du Step 3, et de confirmer qu'il voit l'écran « Valk — Beta mobile — fondations » avec « shared schema v1 ».
Expected: l'écran s'affiche sur l'iPhone **sans serveur local**. Si « incompatible SDK », vérifier que le projet est bien épinglé SDK 54 (Task 3) ; si l'update ne se charge pas, vérifier `runtimeVersion`/canal.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/eas.json apps/mobile/app.json apps/mobile/package.json
git commit -m "feat(mobile): distribution EAS Update (canal preview) ouvrable dans Expo Go SDK 54

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01CTQCX3c3cRVBnZEBvaWSSh"
```

---

## Roadmap des plans suivants (hors A0)

Détaillés chacun dans leur propre plan, après validation device du palier précédent (raison : les paliers capture dépendent du comportement réel de l'iPhone) :

- **Plan 2 — A1 Observabilité :** SQLite serveur (`better-sqlite3`) + `Storage` abstrait, réécriture `/api/logs`→SQLite, dashboard `/debug`, `logger()` mobile (batch→`/api/logs` + Sentry JS gardé par `isRunningInExpoGo()`, buffer offline, contexte device). *Nécessite un DSN Sentry mobile.*
- **Plan 3 — A2 Caméra :** `CameraView` `mode='video'`, clip court 720p/hvc1, relecture locale (`expo-video`). Validation device de la fiabilité `recordAsync`.
- **Plan 4 — A3 Stimulus + sync in-band :** flash/bip début+fin, sidecar JSON, détection serveur (ffmpeg) + `fitLinearTimeMap`.
- **Plan 5 — A4 Upload + stockage :** upload streamé premier-plan → `/api/captures` → `data/` + SQLite (`SessionRecord`).
- **Plan 6 — A5 Bout-en-bout :** parcours complet + overlay sidecar/logs dans `/debug` ; validation visuelle + e2e device.

---

## Self-Review

**1. Spec coverage (A0 uniquement) :** monorepo npm workspaces (D5) → Task 1 ; `packages/shared` browser-free + `transpilePackages` → Task 2 ; app Expo SDK 54 + alignement React → Task 3 ; partage TS mobile↔shared → Task 4 ; distribution `eas update`+`EXPO_TOKEN` SDK 54 (D9) → Task 5. Les paliers A1–A5 du spec sont explicitement reportés en plans dédiés (raison device-dépendance) — couverture A0 complète.

**2. Placeholder scan :** les `<VERSION SDK54>` du Task 3 sont **dérivés à l'exécution** via `npm ls react -w @valk/mobile` (rigueur : ne pas coder en dur une version non vérifiée) — c'est une instruction, pas un trou. Aucun « TODO/à compléter » de logique. Le code TS (time-map, écrans, configs) est complet.

**3. Type consistency :** `fitLinearTimeMap(anchors: {stim,video}[]) → {a,b,anchors}` et `SHARED_SCHEMA_VERSION` sont définis en Task 2 et consommés à l'identique (Task 2 web, Task 4 mobile). `@valk/web`, `@valk/mobile`, `@valk/shared` cohérents partout.

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-06-17-valk-A0-monorepo-mobile-foundation.md`. Deux options d'exécution :**

**1. Subagent-Driven (recommandé)** — je dispatche un subagent frais par tâche, revue entre chaque tâche, itération rapide.

**2. Inline Execution** — j'exécute les tâches dans cette session via executing-plans, exécution par lots avec checkpoints.

**Laquelle ?**
