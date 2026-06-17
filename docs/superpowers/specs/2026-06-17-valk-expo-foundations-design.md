# Spec de design — Valk Mobile, Sous-projet A : Fondations & observabilité

- **Date :** 2026-06-17
- **Statut :** design validé, en attente de revue spec avant plan d'implémentation
- **Périmètre :** sous-projet **A** de la beta mobile Valk (capture → upload → stockage → relecture + observabilité). **Aucune analyse** (cf. sous-projet B).
- **Contexte de décision :** issu d'une cartographie du repo + d'une recherche doc-à-jour vérifiée par 3 skeptiques (2026-06-17).

---

## 0. Résumé exécutif

Valk est un outil expérimental, **non-médical, à usage strictement personnel** (un seul utilisateur), d'auto-contrôle de « déviation » (alcool / fatigue / substances). L'app web actuelle (Next.js 16) fait une analyse temps réel dans le navigateur via MediaPipe WASM.

La mission : une **beta testable sur iPhone via Expo Go**, avec capture vidéo/audio de meilleure qualité et une analyse poussée beaucoup plus loin. Contrainte structurante : **Expo Go ne charge aucun module natif custom**, donc pas d'analyse ML temps réel on-device. Architecture cible retenue : **l'app mobile capture du média brut de qualité avec stimuli synchronisés, et toute l'analyse part côté serveur** (où le compute est illimité).

Ce sous-projet **A** pose les fondations : un client de capture Expo Go strict + une couche d'observabilité totale + une chaîne d'ingestion/stockage locale + la relecture. Il **ne contient aucune analyse** ; il prouve la chaîne de bout en bout et installe les rails sur lesquels B–F rouleront.

---

## 1. Contexte & motivation

- **Mono-utilisateur, pas de conformité légale** comme contrainte d'ingénierie (RGPD, disclaimers médico-légaux, ToS = non-objectifs). Conséquence positive : l'approche **within-subject** (Δ vs sa propre baseline sobre) devient la voie scientifique optimale et naturelle (réparée en sous-projet C, pas A).
- **Observabilité = exigence de premier rang.** L'utilisateur veut « connaître tous les logs, savoir de façon ultra-précise ce qui se passe ». A construit cette couche en premier, pas après coup.
- **Qualité & rigueur 10/10**, pas de privilège à la vitesse, tests e2e + visuels obligatoires, designs modernes sans chevauchement.

---

## 2. Décisions d'architecture verrouillées

| # | Décision | Raison |
|---|----------|--------|
| D1 | **Expo Go + analyse serveur** (pas d'analyse temps réel on-device) | Expo Go ne charge aucun module natif custom |
| D2 | **Expo Go STRICT pour la beta** (pas de dev build, pas de compte Apple payant) | Choix utilisateur ; dev build = upgrade futur |
| D3 | **SDK Expo épinglé : 54** | Depuis mai 2026 l'Expo Go de l'App Store ne supporte QUE SDK 54 ; l'Expo Go déjà installé de l'utilisateur ouvre nos `eas update` sans réinstall |
| D4 | **Stockage 100% local** sur le serveur Next.js (pas de Supabase pour la beta) | « c'est un test » ; tout inspectable sur disque ; interface abstraite pour swap Supabase futur |
| D5 | **Monorepo npm workspaces** : `apps/web`, `apps/mobile`, `packages/shared` | Le repo a déjà package-lock.json ; node_modules plat = zéro friction Metro |
| D6 | **Capture en clips COURTS par sous-test**, 720p + codec hvc1 + bitrate plafonné, upload **premier plan** vers serveur local | Contourne tous les blocages Expo Go (cf. §3) |
| D7 | **Sync stimulus↔média par marqueur in-band** (flash + bip), reconstruit côté serveur | Aucun timestamp de début d'enregistrement fiable n'existe en RN |
| D8 | **Observabilité = Sentry JS + logger maison → SQLite locale**, dès A | Sentry natif/crashs natifs impossibles en Expo Go (angle mort assumé) |
| D9 | **Distribution via `eas update` + `EXPO_TOKEN`** | Accès autonome depuis l'iPhone sans serveur local de l'agent |

---

## 3. Contraintes vérifiées (faits porteurs + sources)

> Ces faits ont été vérifiés sur la doc Expo/Sentry/Supabase de juin 2026 et challengés par 3 vérificateurs adversariaux. Ils sont la **référence de vérité** ; toute implémentation qui les contredit doit d'abord mettre à jour cette section.

**Distribution / SDK**
- App Store Expo Go = **SDK 54 uniquement** depuis mai 2026 ; SDK 55/56 → `eas go`/TestFlight. → on épingle **SDK 54**. (changelog Expo Go/App Store mai 2026)
- `eas update` + `EXPO_TOKEN` (Personal Access Token, créé sur expo.dev → Account → Access Tokens, révocable) permet de publier en non-interactif ; l'update s'ouvre dans Expo Go. L'API `expo-updates` elle-même est indisponible dans Expo Go (sans impact : on ne s'en sert pas).

**Vidéo (`expo-camera`)**
- `recordAsync` fonctionne en Expo Go iOS, caméra frontale, `videoQuality` 2160/1080/720/480, `codec` (avc1/hvc1/ProRes via `getAvailableVideoCodecsAsync`), `videoBitrate` (honoré sur iOS **seulement si un `codec` est passé**), `maxDuration`, `maxFileSize`. Sortie `.mov` dans le cache.
- **Aucun contrôle du framerate** (ni accès par-frame).
- **Bug #27528** : basculer `mode` picture→video juste avant casse `recordAsync` → monter `CameraView` en **`mode='video'` dès le départ**.
- Fiabilité iOS historiquement fragile (échecs silencieux, écran noir au démarrage) → robustesse + télémétrie + validation device obligatoires.
- Taille ~150 Mo/min en 1080p non maîtrisé → cibler **720p + hvc1 + bitrate plafonné** (~30–60 Mo/min).

**Audio**
- **Contention micro iOS** : une seule `AVAudioSession`. `expo-camera` en mode vidéo la prend en exclusif → **pas de 2e flux audio simultané** (#40267, #36890, #31542). Non patchable en Expo Go.
- → **Flux unique** : audio AAC embarqué dans le `.mov` (synchro matérielle), extrait serveur via ffmpeg. AAC 44.1/48 kHz suffit pour la voix.
- Sous-tests **voix/cognitif sans vidéo** → `expo-audio` seul (HIGH_QUALITY .m4a, ou WAV/LINEARPCM iOS à valider device).
- Pas de PCM brut temps réel on-device en Expo Go.

**fps**
- Non contrôlable, mais le **serveur lit les vrais timestamps par frame (PTS via ffmpeg)** → plus précis que l'actuel qui supposait 30 Hz (corrige de fait l'aliasing hippus). Limite réelle : nystagmus rapide (HGN) marginal à ~30 fps — connu, concerne D1, pas A.

**Upload**
- Pas d'upload en arrière-plan en Expo Go (iOS suspend le JS ~30 s après background) → **premier plan, app ouverte**.
- `expo-file-system` upload **streamé** (pas de base64 → pas d'OOM). Reprise par offset = `tus-js-client` (pur JS, fonctionne en Expo Go, fileReader base64 custom + urlStorage AsyncStorage) — **optionnel**, ajouté si la voie simple flanche.
- Plafond Supabase 50 Mo / OOM base64 supabase-js = **hors-sujet** (serveur local, upload streamé).

**Observabilité**
- `@sentry/react-native` ≥7.x en Expo Go = **JS-only** : erreurs JS, breadcrumbs, structured logs (`enableLogs`). Crashs natifs / profiling / replay / native frames = **dev build uniquement** → garder ces options derrière `isRunningInExpoGo()`. **Angle mort assumé : crashs natifs.**
- `expo-sensors` DeviceMotion/Accelerometer inclus Expo Go, iOS **≤100 Hz** (CMMotionManager). Statut de permission **non fiable** (#30571, peut renvoyer granted=true sans prompt) → vérifier l'arrivée réelle de données, logguer l'intervalle effectif + jitter. (Concerne surtout D2/Romberg ; en A on prépare juste la couche.)

**Sync stimulus↔média**
- Aucune API caméra RN (expo-camera **ni** vision-camera) ne donne le timestamp de début réel d'enregistrement (#1016) ; latence appel→1re frame non observable.
- Solution : **marqueur in-band** — flash plein écran (illumine le visage filmé par la frontale → pic de luminance détectable image par image) + bip (capté dans la piste micro), au **début ET fin** → fit linéaire `video_t = a·stim_t + b` (absorbe offset + dérive fps). Le **flash est le marqueur primaire** (le bip peut être atténué par l'AEC).
- Timeline stimulus sur **horloge monotone** (Reanimated `frameInfo.timestamp` via `useFrameCallback`, sinon `performance.now`). **Jamais `Date.now`** pour les deltas (uniquement comme horodatage humain t0).
- `expo-keep-awake` + `expo-brightness` au max pendant la session pour fiabiliser le pic de luminance.

**Monorepo**
- Metro s'auto-configure pour les monorepos depuis SDK 52+ (pas de `watchFolders`/`nodeModulesPaths` manuels). **npm workspaces** (pas pnpm, qui casse la résolution Metro sans `nodeLinker:hoisted`).
- `packages/shared` doit rester **100% browser-free**. Portables : `types/*`, `utils/{math,fft,color-space}`, `analysis/{verdict,response-schema,reference-ranges}`. **NON portables** (restent dans `apps/web`) : `eye-tracking/*` (MediaPipe WASM, DOM), `audio/audio-context` (Web Audio).
- Next.js : `transpilePackages:['@valk/shared']` pour consommer le TS brut du package.
- React : `apps/web` et `apps/mobile` sont bundlés séparément. Pour éviter toute friction de hoisting, **aligner les deux apps sur le React de SDK 54** (React 19.1.x ; Next 16 le supporte) → une seule instance hoistée. `packages/shared` reste sans dépendance React. À valider en A0.

---

## 4. Périmètre du sous-projet A

**Inclus :**
- Restructuration monorepo (web déplacé, mobile créé, shared extrait).
- App Expo Go (navigation, permissions, capture d'un clip court avec stimulus + marqueurs de synchro, sidecar JSON, upload premier-plan).
- Couche d'observabilité : logger client → `/api/logs` → SQLite ; Sentry JS ; buffer offline ; contexte device.
- Serveur : endpoints d'ingestion (média + sidecar + logs), stockage SQLite + disque, dashboard `/debug`, relecture.
- Distribution `eas update` + `EXPO_TOKEN` (SDK 54).
- Tests unitaires, serveur, preview visuelle des écrans, e2e device.

**Exclus (sous-projets ultérieurs) :**
- MediaPipe serveur, DSP voix, scoring Claude, Claude vision (**B**).
- Baseline within-subject (**C**).
- Sous-tests Tier 2 : HGN, Romberg, cognitif STT, reaction-time, fusion (**D**).
- Corpus personnel + labeling éthylotest (**E**).
- UI résultats/analyse riche (**F**).

---

## 5. Architecture monorepo

```
/var/www/valk
├── apps/
│   ├── web/                 # app Next.js 16 actuelle (déplacée depuis la racine)
│   │   └── src/app/api/      #   + endpoints: /captures, /sessions, /logs (SQLite), /debug
│   └── mobile/              # app Expo SDK 54 (expo-router)
│       └── app/             #   écrans: index (Home), capture, sessions, sessions/[id]
├── packages/
│   └── shared/              # @valk/shared (TS pur, browser-free)
│       └── src/             #   types, sidecar+session schemas (zod), time-map sync, math/fft/color-space
├── data/                    # (gitignored) media/<sessionId>/{clip.mov, sidecar.json} + valk.sqlite
└── package.json             # workspace root: workspaces[], react/react-dom pin (SDK 54)
```

Migration `racine → apps/web` en **un commit atomique** : `tsconfig` paths `@/*`, `next.config.ts`, `eslint.config.mjs`, `vitest.config.ts`, `scripts/`, `instrumentation*.ts`, `@sentry/nextjs`. Tout ce qui est extrait vers `@valk/shared` voit ses imports `@/types`/`@/lib/analysis/*` réécrits en `@valk/shared`.

---

## 6. Application mobile (`apps/mobile`)

**Navigation (`expo-router`) :** `Home` → `Capture` → `SessionDetail` (relecture) ; `Sessions` (historique).

**Permissions :** caméra + micro + motion. Écran d'explication **avant** le prompt système. On ne se fie pas au statut (bug #30571) : on **vérifie l'arrivée réelle de données** et on logue un diagnostic `sensor_no_data`/`camera_no_frames` sinon.

**`CaptureScreen` :**
- `CameraView` monté **`mode='video'` en permanence** (#27528), `facing='front'`, `mirror` géré pour l'analyse, `expo-keep-awake` + `expo-brightness` max.
- Séquence A : **marqueur flash+bip (début)** → stimulus simple (point de fixation Reanimated) → **marqueur flash+bip (fin)** → `stopRecording`.
- `recordAsync({ codec: 'hvc1', videoQuality: '720p', videoBitrate: ~6_000_000 /* 6 Mbps, à affiner en A4 */, maxDuration: 120 /* s, garde-fou */, maxFileSize: 200 * 1024 * 1024 /* garde-fou */, mute:false })` (codec choisi via `getAvailableVideoCodecsAsync`, fallback avc1).

**Moteur stimulus & sync :**
- Position du stimulus = fonction analytique du temps, animée sur le thread UI (Reanimated), **échantillonnée réellement rendue** via `useFrameCallback` (`frameInfo.timestamp`).
- Génère le **sidecar JSON** (cf. §8) : horloge, méta recording, marqueurs début/fin, timeline stimulus.

**Uploader :**
- Déplace le `.mov` hors cache (expo-file-system), lit la **taille réelle**, écrit le sidecar.
- **Upload streamé premier-plan** du clip + sidecar + dernier batch de logs → `POST /api/captures`. Barre de progression + message « garde l'app ouverte ». **File d'attente persistante** (AsyncStorage) si échec/coupure ; reprise au prochain foreground.
- Gate pré-upload : connectivité (idéalement Wi-Fi) + espace.

**Observabilité client :**
- `logger()` unique (`trace/debug/info/warn/error` + métriques numériques) → fan-out vers (a) buffer batché → `POST /api/logs`, (b) Sentry JS (`Sentry.logger`, `enableLogs`), options natives derrière `isRunningInExpoGo()`.
- Contexte attaché à chaque event : `expo-device` (modèle), `expo-application` (version/build), `expo-constants` (`appOwnership`/executionEnvironment → tag `expoGo` vs `devBuild`).
- Buffer **offline persistant** + retry/backoff → **aucun log perdu**.

---

## 7. Serveur (`apps/web`)

**Endpoints (App Router) :**
- `POST /api/captures` — multipart (clip `.mov` + `sidecar.json`). Écrit `data/media/<sessionId>/`, crée la `SessionRecord` en SQLite, lance la détection serveur des marqueurs de synchro (fit linéaire) et stocke la `timeMap`.
- `POST /api/logs` — **existant**, rebranché sur SQLite (au lieu du store mémoire volatile `server-store.ts`).
- `GET /api/sessions`, `GET /api/sessions/:id` — métadonnées + `timeMap` + URL média.
- `GET /api/captures/:id/clip` — sert la vidéo (relecture).

**Stockage local :**
- **SQLite** via `better-sqlite3` : tables `sessions`, `telemetry`, `logs`. Média sur disque (`data/media/`).
- Interface `Storage` **abstraite** (méthodes putMedia/getMediaUrl/saveSession/appendLogs…) → implémentation locale ; swap Supabase futur sans toucher aux appelants.
- Détection des marqueurs de synchro : décodage frames via **ffmpeg** (luminance moyenne du visage par frame), détection des fronts montants début/fin, calcul `a,b` du fit linéaire. (Le ffmpeg serveur est aussi le socle de B.)

**Dashboard `/debug` (web) :**
- Timeline des logs/métriques par session (filtrable par niveau/catégorie).
- Lecteur vidéo + overlay du sidecar : marqueurs de synchro détectés, **fps réel** estimé (intervalles inter-frames), timeline stimulus reconstruite.
- État des uploads (taille, durée, succès/retry), contexte device.
- C'est la fenêtre « je sais tout ce qui se passe ».

---

## 8. Contrats de données (`@valk/shared`, zod, validés des deux côtés)

**`Sidecar` (versionné) :**
```
{
  schemaVersion: number,
  sessionId: string,
  clock: { domain: 'reanimated' | 'performance', t0Monotonic: number, t0Wall: number },
  recording: { requestedQuality: string, codec: string, requestedBitrate: number | null, mirror: boolean },
  syncMarkers: Array<{ kind: 'flash' | 'beep', edge: 'start' | 'end', scheduledMs: number, renderedMs: number, flashColor?: string, beepHz?: number, durationMs: number }>,
  stimuli: Array<{ type: string, model: object, samples: Array<{ tMs: number, x: number, y: number }> }>
}
```

**`SessionRecord` :**
```
{
  id: string, createdAt: string, device: { model, os, osVersion },
  appVersion: string, expoSdk: number, runtime: 'expoGo' | 'devBuild',
  durationMs: number, clipPath: string, fileSizeBytes: number,
  sidecar: Sidecar, timeMap: { a: number, b: number, anchors: number, status: 'verified' | 'sync_unverified' } | null,
  status: 'uploaded' | 'sync_unverified' | 'failed'
}
```

**`LogEntry` / `TelemetryEvent` :** `{ sessionId, tsWall, tsMonotonic, level, category, message, data, deviceContext }` ; télémétrie = métriques numériques agrégées (durées, tailles, fps estimé, retries).

---

## 9. Algorithme de synchronisation (résumé normatif)

1. **Mobile :** au début et à la fin de la capture, afficher un **flash plein écran blanc** (≥100 ms, ≥2–3 frames caméra) + jouer un **bip**. Enregistrer pour chaque marqueur `scheduledMs` (planifié) et `renderedMs` (réellement rendu, via `useFrameCallback`). Tenir toute la timeline sur l'horloge monotone unique.
2. **Serveur :** décoder la luminance moyenne du visage par frame (ffmpeg), détecter le **front montant** des deux flashs → deux ancres `(video_t_start, stim_t_start)` et `(video_t_end, stim_t_end)`. Résoudre `a, b` de `video_t = a·stim_t + b`. Le bip sert de **contrôle A/V secondaire**.
3. **Mapping :** tout événement de stimulus daté en temps-stimulus est projeté sur un temps-vidéo (donc une frame) exact. Si <2 flashs détectables → `status='sync_unverified'` (on conserve, on flague, on ne jette pas).

---

## 10. Observabilité (détail)

- **Deux sinks complémentaires :** (1) **logger maison → SQLite** = source primaire, exhaustive, locale, grep-able ; (2) **Sentry JS** = erreurs JS + structured logs + breadcrumbs, pour l'agrégation/alerting.
- **Une interface unique `logger()`** ; les sinks sont activables/désactivables par flag sans toucher au code appelant.
- **Garde `isRunningInExpoGo()`** sur toute option Sentry native (sinon échec silencieux/crash).
- **Robustesse :** buffer persistant + envoi batché + retry/backoff → aucun log perdu sur coupure réseau.
- **Mesures systématiques** (esprit de l'instrumentation web déjà en place) : durées de capture/upload, taille fichier, **fps réel détecté serveur**, intervalle capteur effectif + jitter (préparé pour D2), succès/échec/retry, contexte device + runtime.
- **Sentry nécessite un DSN mobile** (réutiliser le projet Sentry web existant ou en créer un) — logistique à fournir en A1.

---

## 11. Gestion d'erreurs & quality gates

| Situation | Comportement |
|-----------|--------------|
| `recordAsync` échec silencieux (timeout sans `uri`, vidéo noire) | retry borné, log `capture_failed`, message à l'écran |
| Permission refusée / capteur muet | diagnostic explicite (`sensor_no_data`), pas de statut menteur |
| <2 flashs détectés côté serveur | session `sync_unverified` (conservée, flaguée) |
| Pas de réseau / pas d'espace au pré-upload | mise en file d'attente persistante, reprise au foreground |
| App backgroundée pendant l'upload | upload interrompu détecté → repris au retour (clip + sidecar conservés localement) |

---

## 12. Stratégie de test

- **Unitaires (`@valk/shared`, vitest)** : fit linéaire `video_t=a·stim_t+b` (cas nominal, dérive, une seule ancre → unverified), validation zod du sidecar/session, sérialisation.
- **Serveur** : `/api/captures` (multipart → SQLite + disque + détection marqueurs), `/api/logs` → SQLite, relecture `/api/captures/:id/clip`, `/api/sessions`.
- **Preview visuelle** : avant d'implémenter les écrans mobiles, monter une **preview locale** (Expo web / page de démo) des écrans Capture/Sessions/Detail avec le skill `frontend-design`, la présenter pour validation (moderne, zéro chevauchement) **avant** implémentation.
- **e2e device (utilisateur dans la boucle)** : ouvrir l'update publié dans Expo Go → capture → vérifier que l'upload arrive, la vidéo est rejouable et les logs apparaissent dans `/debug`. **Critère d'acceptation de A.**

---

## 13. Distribution

- **`eas update` + `EXPO_TOKEN`** (SDK 54). L'utilisateur crée un Personal Access Token (expo.dev → Account → Access Tokens), le fournit au moment du publish (export pour la commande, révocable). Publish en `--non-interactive`.
- L'utilisateur ouvre/rafraîchit l'update **dans son Expo Go (App Store, SDK 54)** depuis son iPhone, sans serveur de l'agent.
- Câblé en **jalon A0**.

---

## 14. Dépendances (compat Expo Go)

| Package | Rôle | Expo Go |
|---|---|---|
| `expo` (SDK 54), `expo-router` | runtime + navigation | ✅ |
| `expo-camera` | enregistrement vidéo+audio (flux unique) | ✅ |
| `expo-audio` | bip de synchro + (futur) voix standalone | ✅ |
| `expo-file-system` | déplacement fichier + upload streamé + sidecar | ✅ |
| `expo-video` | relecture du clip | ✅ |
| `react-native-reanimated` | stimulus fluide + `useFrameCallback` (horodatage) | ✅ |
| `expo-keep-awake`, `expo-brightness` | fiabiliser le flash | ✅ |
| `expo-haptics` | retour UX (pas un marqueur de synchro) | ✅ |
| `expo-sensors` | (préparé pour D2 Romberg) | ✅ |
| `expo-device`, `expo-application`, `expo-constants` | contexte observabilité | ✅ |
| `@react-native-async-storage/async-storage` | buffer logs + file d'attente upload | ✅ |
| `@sentry/react-native` (≥7) | erreurs JS + structured logs (natif derrière `isRunningInExpoGo()`) | ✅ (JS-only) |
| `tus-js-client` | reprise upload par offset (optionnel) | ✅ |
| `better-sqlite3` (serveur) | stockage local sessions/logs/télémétrie | n/a (serveur) |
| `ffmpeg` (serveur) | détection marqueurs + extraction audio (socle B) | n/a (serveur) |

---

## 15. Séquence de jalons (chacun livrable & testable)

- **A0 — Distribution d'abord.** Monorepo (web déplacé, mobile + shared créés) + skeleton Expo + pipeline `eas update`/`EXPO_TOKEN`. *Acceptation :* un « hello Valk » s'ouvre sur l'iPhone de l'utilisateur via son Expo Go. *(handoff du token ici.)*
- **A1 — Observabilité.** `logger()` client + Sentry JS + `/api/logs`→SQLite + dashboard `/debug`. *Acceptation :* un log émis sur le device apparaît dans `/debug` ET Sentry.
- **A2 — Caméra.** `CameraView` mode=video, enregistrer un clip court, le rejouer **localement** sur le device. *Acceptation :* clip rejouable, taille fichier logguée.
- **A3 — Stimulus + sync in-band.** flash/bip début+fin, sidecar JSON, fit linéaire serveur. *Acceptation :* `timeMap` calculée, marqueurs détectés, overlay sidecar dans `/debug`.
- **A4 — Upload + stockage.** clip+sidecar+logs → `data/` + SQLite, création de session. *Acceptation :* session visible dans `/api/sessions` + `/debug`.
- **A5 — Bout-en-bout.** capture → upload → relecture depuis le serveur + sidecar/logs visibles. *Acceptation :* parcours complet validé visuellement + e2e device.

---

## 16. Risques & inconnues (à valider sur device)

- Fiabilité réelle de `recordAsync` en Expo Go iOS 26.5 (échecs silencieux, écran noir) — valider en A2.
- Format/fidélité exacts de la piste audio AAC du `.mov` (non documentés) — mesurer en A2.
- Détection robuste du flash : rolling shutter, auto-exposition pouvant compenser la luminance — valider le front montant en A3.
- Atténuation du bip par l'AEC micro — le flash reste primaire.
- Résolution React dans le monorepo (web 19.2.3 vs SDK 54) — aligner sur SDK 54 en A0.
- Taille des clips 720p/hvc1 réelle vs temps d'upload premier-plan — mesurer en A4 ; ajuster bitrate/durée.
- `better-sqlite3` natif côté serveur Next : vérifier compat runtime (Node, pas Edge) des routes concernées.

---

## 17. Évolution future

- **Sous-projets B–F** roulent sur ces rails : B (MediaPipe serveur + DSP voix + Claude vision), C (baseline within-subject), D (sous-tests Tier 2), E (corpus + labeling), F (UI résultats).
- **Upgrade dev build** (si besoin de 60 fps HGN, compression native, upload background, crashs natifs, MediaPipe temps réel on-device) : implique un **compte Apple Developer (~99 $/an)**. L'abstraction `Storage` et la séparation capture/analyse rendent cette bascule non-disruptive.

---

## 18. Critères de succès du sous-projet A

1. L'utilisateur lance une capture guidée courte **depuis son iPhone via Expo Go**, en autonomie (update publié).
2. Le clip + sidecar + logs arrivent sur le serveur local et la **session est persistée** (SQLite + disque).
3. La **synchro stimulus↔frame** est reconstruite côté serveur (`timeMap` vérifiée) sur au moins une capture.
4. La vidéo est **rejouable** et **tous les logs/métriques** sont inspectables dans `/debug`.
5. Écrans mobiles **validés visuellement** (modernes, sans chevauchement).
6. Tests unitaires + serveur **au vert**.
