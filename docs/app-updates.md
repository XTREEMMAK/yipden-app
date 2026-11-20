# Android updates through KJS Apps

YipDen uses the existing shared publisher in the sibling `j2chat-app` checkout:
`tools/apk-distribution/publish_apk.py`, its complete `apps.json`, and its existing
SSH upload, checksums, lock and atomic snapshots. Slug: `yipden`. No app backend,
account, game integration or content contract changes are involved.

## Identity and version reservations

The existing `yipden-debug-072.apk` was inspected on November 20, 2026:
package `com.yipden.app`, versionName `0.9.0`, **versionCode 900**, debuggable,
certificate SHA-256
`d9ea95b7e73fa5b50d1d8a8b3d24a30f4bf066e74436fd9296ee6a8382fda88a`.
Its file SHA-256 is
`32b5749ca0f61b1f0f60f5b1ab71b534e314309d0644d6f9ba8c2d14a993e724`.
The old filename/About counter was not an Android versionCode.

Codes now increase independently of versionName and distribution channel. Each
Gradle invocation consumes a fresh code, even if the build fails. The normal build
reserves once, uses that code in About, then passes a single-use reservation to Gradle.
Python `flock`, atomic replacement and fsync protect the persistent high-water mark at
`~/.local/state/yipden/android/high-water`; the pipeline lock serializes YipDen's web,
Capacitor and native outputs across clones/worktrees on this host. Direct Gradle calls
reserve independently; do not run them alongside the project commands, since Gradle and
Capacitor share output directories. APK verification rejects a mismatched reservation.

`apps/reader/android/version-floor.txt` is a checked-in lower bound. Never delete/reset
persistent state or restore an old counter. On a new build host, first inventory all
reserved/installed/published codes and raise the floor to at least their maximum.
Independent machines must coordinate reservations; this is a local build-host sequence,
not a network allocator. Never use the old `.debug-build-number` counter as the floor.

The build keeps the existing package and local debug signing identity. Compatibility
is verified against the existing APK, not yet against the owner's installed phone APK.
If Android reports a signature mismatch, stop and inspect the installed certificate;
never uninstall to work around it. **Release signing is still unconfigured.** Debuggable
Builds are testing only; the shared publisher rejects stable promotion of these bytes.
A future non-debuggable candidate needs compatible signing, seed-free assets, phone
validation and explicit stable approval. Do not silently introduce another key.

## Checks and local candidate preparation

From the repository root:

```sh
pnpm check
pnpm lint
pnpm test
pnpm build
pnpm --filter @yipden/reader test:distribution
```

Check disk/RAM and active Gradle/Vite build clients before starting a heavy build.
Coordinate with active J² work; do not run competing heavy builds or delete caches,
SDKs, keys, historic APKs or user data to make space. Source the toolchain environment
in [android-testing.md](android-testing.md), then:

```sh
cd apps/reader
pnpm android:apk
# Prints verified metadata and the actual yipden-b<versionCode>.apk path.
pnpm apk:inspect --file android/app/build/outputs/apk/debug/yipden-bCODE.apk
pnpm apk:prepare --file android/app/build/outputs/apk/debug/yipden-bCODE.apk \
  --notes ../../build/apk-distribution/notes.txt
```

Replace CODE with the actual verified code. Commit reviewed source after checks, before
building; prepare requires a clean tracked tree and the APK sidecar written by the build command.
The sidecar records the source commit and verified APK metadata; dirty-source builds
remain phone-testable but cannot be prepared. Build and prepare together, and retain
the reviewed artifact's SHA-256. Preparation calls the existing publisher, which snapshots
and verifies the input, pins package/certificate/floor and creates a private 0600 bundle
at `build/apk-distribution/yipden-bCODE.zip`. No upload runs during ordinary builds.
The existing `pnpm build` still strips and checks debug-only Surf/directory seeds;
`android:apk` retains the existing debug tools/seeds for protected testing.

After approval of the **specific** bundle, notes and testing audience only:

```sh
cd apps/reader
pnpm apk:publish --bundle ../../build/apk-distribution/yipden-bCODE.zip --execute
```

This delegates to the existing shared upload command targeting
`xtreemmak@192.168.10.149:/var/www/kjs-apps`. Always use the current, complete shared
registry including Chat and Yip Realms. Do not substitute a YipDen-only config or edit
HTML. The publisher generates `yipden-bCODE.apk`, metadata, checksums and history.
Reinspect current registry edits and remote state before executing a delayed approval.
Stable promotion is a separate operation on the identical tested bytes, never a rebuild.
The initial integration does not authorize upload or stable promotion.

## Obtainium on the owner's phone

Keep the existing installation and make an app backup first. Use one Obtainium entry:

| Setting                        | Value                                                      |
| ------------------------------ | ---------------------------------------------------------- |
| Source URL                     | `https://kjs.kjnet.us/yipden/builds/`                      |
| Source / Override Source       | HTML                                                       |
| App ID                         | `com.yipden.app`                                           |
| App name                       | YipDen                                                     |
| Version Extraction             | `yipden-b([0-9]+)\.apk`                                    |
| Match Group                    | `1`                                                        |
| Version Extract Whole Page     | Off                                                        |
| Use Version Code as OS Version | On                                                         |
| Track Only                     | Off                                                        |
| User-Agent                     | Retain Obtainium's default browser header                  |
| Authorization                  | Owner enters Builds authentication privately on the device |

Use a single backslash in the expression; omit Markdown backticks. Browser login alone
is not Obtainium authentication: keep the private Builds Authorization header for both
source and APK requests. Follow the shared `j2chat-app/docs/app-updates.md` guide to
create it privately; no credentials in source, URLs, logs or chat. The separate public
`https://kjs.kjnet.us/yipden/releases/` source has **no Authorization header** and stays
empty until a specific eligible candidate is approved. History is not the source URL.

References: [Obtainium HTML sources](https://wiki.obtainium.imranr.dev/sources/#html)
and [version-code detection](https://wiki.obtainium.imranr.dev/app_tracking/#version-detection).

## Required first publication and real update test

1. Review the candidate's actual code, package, certificate, SHA-256, source, notes,
   local preparation and checks. Approve that exact first protected publication.
2. Verify public HTTPS Releases remains empty and unauthenticated Builds page,
   metadata, history, checksum and APK requests return 401. Privately verify authorized
   downloads have the approved checksum. Compare Chat/Yip Realms versions, history,
   icons and APK checksums with the pre-publication inventory.
3. On the existing phone, refresh Obtainium. Record the actual installed Android code
   (historical APKs used 900 despite About's smaller debug counter). Update to the first
   candidate without uninstalling. Confirm About and Obtainium agree, and followed
   people, settings, folders, backups, Library and encrypted data remain accessible.
   Record Installed = Latest as the real baseline.
4. Build a genuinely newer APK with the same package/certificate, run relevant checks,
   inspect/prepare it, and obtain approval for its separate Builds publication. Refresh
   Obtainium and install the real higher code. Confirm Installed = Latest and the same
   data checks. Never edit Obtainium's Installed value to simulate an update.
5. Only after owner confirmation of this update, report readiness for old-host retirement.
   A separate final check must inventory every remaining user/app and verify all new URLs
   before stopping only the identified old download-server process/service. Leave other
   Python apps and historic APKs intact. The initial integration leaves the old host running.

Phone baseline, data preservation and a real newer YipDen Obtainium update are pending.
Local publisher tests do not establish those results.
