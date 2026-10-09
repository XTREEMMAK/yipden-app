# Game development and testing

Status: initial foundation, unreleased. Reader and game work use one repository with independent
branches/worktrees. Realm is the first production focus. The Stray has a player scaffold and a
prototype reference; its production handoff is still pending.

## Current worktrees

- Reader: `/home/xtreemmak/projects/node/yipden-app`, branch `main`.
- Games foundation: `/home/xtreemmak/projects/node/yipden-app-games`, branch `games/foundation`.

The initial foundation is committed and published on `games/foundation`. After that foundation is
reviewed, branch `games/realm` and `games/stray` from its accepted revision; after it merges, start
later game branches from the updated `origin/main`. Keep separate dependency installations, build
folders and strict ports.
One owner integrates changes to contracts, workspace manifests/lockfile, reader adapters and saves.
Independent game agents should own their game packages and tests, not concurrently edit shared files.

`tmp/games_handoffs/` is ignored and local to each checkout. Preserve the original handoff and
HTML files unchanged, and copy them explicitly into game worktrees that need reference previews.
They are not production modules or required CI inputs.

## Package boundaries

| Location                  | Responsibility                                                     |
| ------------------------- | ------------------------------------------------------------------ |
| `packages/game-contracts` | Host/save/page types; build capability selection; no game engine   |
| `packages/game-host`      | Cancellable launch and lifecycle controller; shared Svelte surface |
| `packages/realm-core`     | Plain TypeScript; initial legacy map schema extraction             |
| `packages/realm-player`   | Realm browser player entry, presently a lifecycle scaffold         |
| `packages/stray`          | The Stray player entry, presently a lifecycle scaffold             |
| `apps/games-lab`          | Independent static browser app and Android testing host            |
| `apps/reader`             | Optional launcher and reader hosting adapter; thin by default      |

The player scaffolds are deliberately labeled. They do not implement combat or a hunt. Realm's
supplied offline HTML prototype is playable in a separate reference iframe in Games Lab.
References do not ship in reader builds. Closing or backgrounding a reference removes its
browsing context and ends the run; this is not the production lifecycle/save implementation.

Do not import reader internals from game packages. Games receive a `GameHost`; production saves
must eventually use the reader's `Store` behind an adapter. No game state is written to the reader
in this foundation. Games Lab has disposable in-memory storage. Decide save versions, backup
inclusion and deletion semantics before enabling reader game saves. Scores and achievements must
remain game-specific, account-free, and have no effect on reading/discovery.

## Build profiles

`YIPDEN_GAMES` is `thin`, `realm`, `stray` or `all`. A misspelling fails the build. The reader
starts with `thin`; Games Lab starts with `realm`. The Vite plugin resolves a different virtual
registry for each profile. Thin has no game loaders or implementation imports, and resolves the optional host to a small
empty capability message without its lifecycle controller or CSS. In included
profiles, a loader runs only after Play. The optional You link disables SvelteKit code and data
preloading; the tab bar and root layout do not import games.

Game styles and assets belong to game modules, not unconditional reader static directories.
Every production build emits `game-build.json`: the actual chunk owners and static import edges.
Excluded packages anywhere in the build graph fail the build, as do eager static game imports.
The post-build guard additionally inspects emitted files; the APK guard scans actual packaged
assets to catch leftovers from an earlier profile's build. Discover's existing WebGL is reader
functionality, so absence checks concern game-owned resources, not every WebGL context.

```bash
# From the game worktree
pnpm games:dev                         # Realm scaffold at localhost:5180
pnpm games:dev:references --host 0.0.0.0 # Same lab, plus locally supplied Realm reference
YIPDEN_GAMES=all pnpm games:dev          # Both player scaffolds
YIPDEN_GAMES=thin pnpm --filter @yipden/reader build
YIPDEN_GAMES=all pnpm --filter @yipden/reader build
node tooling/games/check-build.mjs apps/reader/build all
pnpm games:check
pnpm games:test
pnpm games:verify                       # Browser tests of four lab profiles and thin/all reader
```

Ports: reader development 5173, Games Lab development 5180, Games Lab preview 4188, reader
profile tests 4181. Lab ports are strict; Playwright does not reuse another lab server.
`GAME_E2E_PORT` can override the lab test port.

Reference inclusion is separately opted into with `YIPDEN_GAME_REFERENCES=1`. Only references for
selected games are copied. Missing selected reference files fail that opted-in build. Ordinary
CI and builds need no ignored files. Realm is self-contained; The Stray reference still uses
external Google Fonts and the supplied Lottie CDN URL. The reference is not an offline or
production asset pipeline; no animation library has been added to the player scaffolds.

## Separate APKs

The Games Lab reuses Capacitor 8 and the existing JDK/Android SDK. Its native build contains the
App plugin, not the reader's database, media session or in-app browser plugins. No new native
library was selected. Gradle verification/checksums and the wrapper checksum use the reader's
existing pins; standard checksum verification stays enabled.

| Profile | Android application ID     | Installed label  |
| ------- | -------------------------- | ---------------- |
| realm   | `com.yipden.gamelab.realm` | YipDen Realm Lab |
| stray   | `com.yipden.gamelab.stray` | YipDen Stray Lab |
| all     | `com.yipden.gamelab.all`   | YipDen Games Lab |
| thin    | `com.yipden.gamelab.thin`  | YipDen Thin Lab  |

All install beside `com.yipden.app`. The flavor determines Android identity; the packaged web
profile is checked before assembly and against the APK afterward. These are testing identities,
not decisions to publish separate store products. The lab refuses cleartext content and backup,
keeps native bridge logging off, and does not enable live-reload URLs in packaged artifacts.
WebView inspection follows Capacitor's `FLAG_DEBUGGABLE` default: on in debug builds and off in
release builds. The APK guard rejects a lab configuration that explicitly disables inspection.

```bash
export JAVA_HOME="$HOME/.local/opt/jdk-21.0.12.1+1"
export ANDROID_HOME="$HOME/Android/sdk"
pnpm games:apk --profile=realm --references
pnpm games:apk --profile=thin
```

APKs and metadata land in `apps/games-lab/dist/apks/`. Filenames include profile, commit, a dirty
marker when applicable, UTC build time and a random build identifier. The same identifier is
visible inside the app. The JSON records application ID, SHA-256, build profile and reference
inclusion. Debug signing uses the machine's existing debug keystore; reuse it for updates.
A build lock prevents simultaneous web-copy/native builds in the same checkout. A failed build
is never published. If a process is killed, confirm no build is running before removing its lock.

## Existing download server

Inspected 2026-10-09: `http://192.168.10.55:8920/` is `python3 -m http.server 8920 --bind
192.168.10.55`, serving `/home/xtreemmak/projects/node/yipden-app/apps/reader/android/app/build/outputs/apk/debug`.
It exposes reader APKs directly; there is no deployment service or upload API. Keep those URLs and
the reader's build counter intact. Publish games into a separate `games/` subdirectory:

```bash
pnpm games:publish --profile=realm \
  --dir=/home/xtreemmak/projects/node/yipden-app/apps/reader/android/app/build/outputs/apk/debug/games
```

Publication checks the artifact digest, copies via a temporary file, then atomically renames the
APK. It refuses to overwrite an immutable filename with different bytes. `latest-realm.json`
points to the actual filename and digest; do not reuse `app-debug.apk` for games. The APK appears
under `http://192.168.10.55:8920/games/` without restarting the existing server.

This server's directory is still reader build output. A reader clean can remove downloads; these
are copies, not durable source artifacts. A later distribution cleanup can give the server a
dedicated artifact directory. The original built APKs and metadata remain in the games worktree.
This foundation does not change the existing Python processes or their bind address.

## Next: Realm production slice

1. Preserve combat/progression, water, destruction and editor roundtrip while extracting typed
   simulation/input/rendering. The legacy map parser is the only gameplay-core extraction so far.
2. Pin compatible Three/Threlte versions, migrate rendering, and implement two-stick aim/dash.
   Threlte, Three and FMOD are not installed in the production player yet.
3. Prove the installed browser plugin's layering/input APIs on a phone. Lab currently runs local
   references, not the reader's separate creator WebView. Full-page texture capture is unsolved;
   its screenshot API captures a viewport. Retain sanitized captured-page fallback.
4. Prove the chosen FMOD HTML5 runtime and banks on the browser/WebView. Reader CSP currently does
   not permit WASM; choose and test an appropriate game policy without silently weakening the
   reader. Threaded FMOD also needs cross-origin isolation. No native FMOD bridge is selected.
5. Build the first creator-approved roughly five-minute route, one site interaction, loading
   failure/cancellation, and return to the reader with position preserved. Repeat with a distinct
   second layout before generalizing live bindings.
6. Record actual phone frame times, startup, memory/GPU/voice counts, touch behavior, audio latency,
   repeated entry/exit and background/resume. Browser emulation cannot pass this device gate.
7. Independent playtest, then prioritize the next backlog from the evidence.

Creator tooling remains a separate desktop app. Establish local schema/preview/JSON interchange
before central publication; a hosted publishing service must not become a reader dependency.
Billing, entitlement providers, platform achievements, Spine and additional enemy rosters remain
outside the initial production slice.

## Initial verification, 2026-10-09

Checked with Node 24 and the installed JDK 21/SDK 36 toolchain:

- Workspace typechecking, formatting/lint, unit tests and recursive builds pass. Final shared
  game contract/map/lifecycle tests include late import/mount cancellation, host preparation,
  backgrounding during load, repeated replacement and cleanup.
- Browser production matrix: thin/realm/stray/all Games Lab at phone and desktop sizes, and
  thin/all reader shell/launcher checks. Thin is additionally checked with its empty host.
- Realm reference: starts only on explicit request, loads the first board, and is removed on
  close in both phone-sized and desktop browsers. No reference or game code requests on cold
  launch; selected player chunks load only on Play.
- Realm and thin Lab APKs build and pass actual packaged graph/asset/ZIP checks. Installed labels
  and application IDs are inspected with aapt2. WebView inspection uses the SDK's debug-only
  default, verified against installed Capacitor source and the packaged configuration.
- The actual thin reader APK builds in the game worktree and passes the same packaged asset
  exclusion check. It is not published over the existing reader download.
- Published lab APKs are downloaded back from the LAN server and checked against SHA-256 metadata.

This is build/browser evidence. No physical phone performance, live creator-page overlay, FMOD,
production gameplay migration or independent playtest is claimed by this initial setup.
