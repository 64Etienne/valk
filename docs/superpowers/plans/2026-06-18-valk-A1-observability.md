# Valk A1 — Observabilité (logger → SQLite → dashboard) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use checkbox (`- [ ]`).

**Goal:** Donner à Valk une observabilité totale et locale : un logger structuré côté mobile qui envoie ses événements au serveur, persistés dans une SQLite locale, lisibles dans un dashboard `/debug` — avec les endpoints logs gatés par un secret.

**Architecture:** `packages/shared` définit les types/schales zod d'observabilité (producteur mobile ↔ consommateur serveur). Le serveur Next.js persiste dans une **SQLite locale via `node:sqlite`** (intégré Node 24, aucune dépendance), derrière une interface `Storage` abstraite (swap Supabase futur). Les endpoints `/api/logs*` et la page `/debug` sont gatés par `VALK_DEBUG_KEY`. Le mobile a un `logger()` structuré avec buffer offline. **Sentry est différé** (nécessite un DSN ; le logger maison fournit l'essentiel).

**Tech Stack:** Next.js 16, `node:sqlite` (DatabaseSync), zod, Expo SDK 54, expo-device/application/constants, AsyncStorage, vitest.

## Global Constraints

- **SQLite = `node:sqlite` (DatabaseSync)** — intégré Node 24, aucune dépendance npm, aucune compilation. Routes en `runtime = 'nodejs'`.
- **DB locale** : `data/valk.sqlite` (déjà gitignored via `/data/`). Créer le dossier au runtime si absent.
- **Endpoints logs + page /debug gatés** par `VALK_DEBUG_KEY` (header `x-valk-debug-key` ou query `?key=`), même pattern que `api/debug-upload`. (Corrige la dette sécu IDOR/info-disclosure.)
- **Types d'observabilité dans `@valk/shared`** (browser-free, zod).
- **Sentry différé** : ne pas exiger de DSN ; prévoir un point d'extension propre.
- Commits terminés par les trailers harness (Co-Authored-By + Claude-Session).
- Branche `feat/valk-A1-observability`.

---

## Contrats partagés (`@valk/shared`)

```ts
// LogLevel, DeviceContext, LogEntry, LogBatch
type LogLevel = 'trace'|'debug'|'info'|'warn'|'error';
interface DeviceContext { platform: string; osVersion?: string; model?: string; appVersion?: string; runtime: 'expoGo'|'devBuild'|'web'|'unknown'; }
interface LogEntry { tsMonotonic: number; tsWall: number; level: LogLevel; category: string; message: string; data?: unknown; }
interface LogBatch { sessionId: string; device: DeviceContext; entries: LogEntry[]; }
```
Zod schemas `logBatchSchema`, validés serveur ET utilisés mobile.

---

## Task 1: `@valk/shared` — types & schémas d'observabilité

**Files:** Create `packages/shared/src/observability.ts`, `packages/shared/src/__tests__/observability.test.ts`; Modify `packages/shared/src/index.ts`.

**Produces:** `logBatchSchema`, `logEntrySchema`, `deviceContextSchema`, types `LogBatch/LogEntry/DeviceContext/LogLevel`.

- [ ] **Step 1:** Écrire `observability.test.ts` : `logBatchSchema.parse` accepte un batch valide ; rejette niveau invalide ; rejette `entries` absent.
- [ ] **Step 2:** Lancer `npm test -w @valk/shared` → FAIL.
- [ ] **Step 3:** Écrire `observability.ts` (zod schemas + types inférés) et l'exporter depuis `index.ts`.
- [ ] **Step 4:** `npm test -w @valk/shared` → PASS.
- [ ] **Step 5:** Commit.

## Task 2: Serveur — module SQLite (`node:sqlite`)

**Files:** Create `apps/web/src/lib/observability/db.ts`, `apps/web/src/lib/observability/__tests__/db.test.ts`.

**Produces:** `getDb()` (singleton DatabaseSync sur `data/valk.sqlite`, migrate au 1er appel : tables `sessions`, `logs`), `insertLogs(batch)`, `listSessions()`, `getSessionLogs(sid)`. Accepte un chemin DB override (pour tests `:memory:`/tmp).

- [ ] **Step 1:** Écrire `db.test.ts` : ouvrir une DB temp, `insertLogs` d'un batch, `getSessionLogs` retourne les entrées, `listSessions` retourne la session.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implémenter `db.ts` (DatabaseSync, `CREATE TABLE IF NOT EXISTS`, prepared statements, JSON.stringify de `data`/`device`).
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit.

## Task 3: Serveur — gate `VALK_DEBUG_KEY`

**Files:** Create `apps/web/src/lib/observability/auth.ts`, `apps/web/src/lib/observability/__tests__/auth.test.ts`.

**Produces:** `checkDebugKey(req): boolean` (header `x-valk-debug-key` ou `?key=` vs `process.env.VALK_DEBUG_KEY`) ; `unauthorized()` → `NextResponse` 401. Si `VALK_DEBUG_KEY` non défini → refuser (fail-closed) sauf en dev local explicite (`VALK_DEBUG_OPEN=1`).

- [ ] **Step 1:** Écrire `auth.test.ts` : bonne clé (header & query) → true ; mauvaise/absente → false ; pas d'env → false.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implémenter `auth.ts`.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit.

## Task 4: Serveur — `/api/logs` POST→SQLite + GET gaté ; `/api/logs/[sid]` gaté

**Files:** Modify `apps/web/src/app/api/logs/route.ts`, `apps/web/src/app/api/logs/[sid]/route.ts`; Create `apps/web/src/app/api/logs/__tests__/route.test.ts`.

**Produces:** POST `/api/logs` valide `logBatchSchema` → `insertLogs` (public, c'est l'ingestion). GET `/api/logs` (liste) + GET `/api/logs/[sid]` → gatés par `checkDebugKey`, lus depuis SQLite.

- [ ] **Step 1:** Écrire `route.test.ts` : POST batch valide → 200 + persisté ; POST invalide → 400 ; GET sans clé → 401 ; GET avec clé → données.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Réécrire les deux routes (`runtime='nodejs'`, zod, `checkDebugKey`, SQLite). Conserver l'API d'ingestion compatible avec le logger mobile.
- [ ] **Step 4:** Run → PASS ; `npm run build -w @valk/web` OK.
- [ ] **Step 5:** Commit.

## Task 5: Serveur — dashboard `/debug` (gaté) + visuel

**Files:** Create `apps/web/src/app/debug/page.tsx`, et composants si besoin.

**Produces:** page server-component gatée (`?key=`), liste des sessions (device, nb logs, dernière activité) + détail des logs d'une session (niveau colorisé, horodatage, message, data). Design moderne, zéro chevauchement (skill frontend-design).

- [ ] **Step 1:** Implémenter la page (lecture directe `listSessions`/`getSessionLogs`, gate `checkDebugKey`, sinon 404/401).
- [ ] **Step 2:** `npm run build -w @valk/web` OK.
- [ ] **Step 3:** Seed un batch (POST /api/logs), lancer le serveur, **screenshot Playwright** de `/debug?key=...` → vérifier rendu (moderne, pas de chevauchement).
- [ ] **Step 4:** Commit.

## Task 6: Mobile — dépendances contexte + `logger()`

**Files:** `apps/mobile` deps (expo-device, expo-application, expo-constants, @react-native-async-storage/async-storage) ; Create `apps/mobile/src/observability/logger.ts`, `apps/mobile/src/observability/__tests__/logger.test.ts`.

**Produces:** `logger.trace/debug/info/warn/error(category, message, data?)` ; collecte `DeviceContext` ; **batch** + flush périodique/au seuil vers `${API_BASE}/api/logs` ; **buffer offline persistant** (AsyncStorage) + retry. `API_BASE` depuis `expo-constants` (`extra.apiBaseUrl`, défaut configurable). Init `initObservability()`.

- [ ] **Step 1:** Écrire `logger.test.ts` (logique pure, fetch & AsyncStorage mockés) : N logs → un batch correct (sessionId, device, entries) ; flush vide le buffer ; échec réseau → ré-enfile.
- [ ] **Step 2:** Run (vitest mobile — config minimale node) → FAIL.
- [ ] **Step 3:** Implémenter `logger.ts` (buffer, batching, flush, persistance, contexte device).
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit.

## Task 7: Mobile — init + intégration écran

**Files:** Modify `apps/mobile/app/_layout.tsx` (appel `initObservability()` + log `app.start`), `apps/mobile/app.json` (`extra.apiBaseUrl`), `apps/mobile/app/index.tsx` (un bouton « envoyer un log test » pour la démo e2e).

- [ ] **Step 1:** Câbler `initObservability()` au montage racine + `logger.info('app','start')`.
- [ ] **Step 2:** Bouton « Log test » sur Home → `logger.info('debug','bouton test', {...})`.
- [ ] **Step 3:** `expo export --platform ios` OK (bundle).
- [ ] **Step 4:** Commit.

## Task 8: Intégration e2e headless (serveur)

- [ ] **Step 1:** Démarrer le serveur web, POST un `logBatch` réaliste, vérifier persistance SQLite + affichage `/debug` (screenshot).
- [ ] **Step 2:** Documenter dans le récap. (Le chemin device→serveur réel sera validé avec l'utilisateur : nécessite serveur joignable + EXPO_TOKEN pour publier.)

---

## Différé (nécessite l'utilisateur)

- **Sentry** : `@sentry/react-native` (init JS derrière `isRunningInExpoGo()`) — nécessite un **DSN**. Point d'extension `addSink()` prévu dans le logger.
- **Publication device** : `eas update` (nécessite `EXPO_TOKEN`) pour que l'utilisateur voie les logs en live depuis son iPhone.
- **`apiBaseUrl`** : à pointer sur le serveur joignable depuis l'iPhone (tunnel/IP LAN) au moment du test device.

## Self-Review

Couverture spec A (§7 serveur, §10 observabilité, §11 erreurs, §6 logger mobile) : Tasks 1-8. Sécu IDOR/info-disclosure (#1/#2) : Task 3-4 (gate). Sentry/device : différés explicites. Types cohérents (LogBatch/LogEntry/DeviceContext définis Task 1, consommés 2/4/6).
