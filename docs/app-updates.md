# Android updates through KJS Apps

For phone setup, use [Set up YipDen in Obtainium](obtainium.md). Protected Builds
currently serves **902**; phone baseline and the subsequent real update remain pending.

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
pnpm apk:inspect --file ../../build/android-apks/yipden-bCODE.apk
pnpm apk:prepare --file ../../build/android-apks/yipden-bCODE.apk \
  --notes ../../build/apk-distribution/notes.txt
```

Replace CODE with the actual verified code. Commit reviewed source after checks, before
building; prepare requires a clean tracked tree and the APK sidecar written by the build command.
The sidecar records the source commit and verified APK metadata; dirty-source builds
remain phone-testable but cannot be prepared. Build and prepare together, and retain
the reviewed artifact's SHA-256. Preparation calls the existing publisher, which snapshots
and verifies the input, pins package/certificate/floor and creates a private 0600 bundle
at `build/apk-distribution/yipden-bCODE.zip`. No upload runs during ordinary builds.
The project build archives the existing Gradle output tree before building, restores
missing legacy files afterward, and retains each verified APK and source JSON outside
Gradle outputs in `build/android-apks/`. Backups are retained in
`build/android-output-backups/before-CODE/`; account for their disk usage before building.
`android:install` installs the immutable verified file under the same pipeline lock.
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

## Superseded candidate 901 review: November 20, 2026

Retained for history, **not uploaded**. Fresh candidate 902 below supersedes this candidate:

| Field               | Verified value                                                     |
| ------------------- | ------------------------------------------------------------------ |
| APK                 | `build/android-apks/yipden-b901.apk`                               |
| Version             | `0.9.0` / Android versionCode `901` (previously 900)               |
| Package             | `com.yipden.app`                                                   |
| Certificate SHA-256 | `d9ea95b7e73fa5b50d1d8a8b3d24a30f4bf066e74436fd9296ee6a8382fda88a` |
| APK SHA-256         | `4b1bfe20d47b1d92890d4449f6d6f06c5f9a0fccf4bdaad7d0fad0fd8f2dfcfd` |
| Size                | 21,396,973 bytes                                                   |
| Source commit       | `f6aacef6783c860e18f51e52af956b5b2eb447f1`, clean build source     |
| Private bundle      | `build/apk-distribution/yipden-b901.zip`, mode 0600                |
| Bundle SHA-256      | `bb7f3297eb0bdadc592242efd45015665e1fe29889055da9d3b900583e6045a3` |
| Eligibility         | Debuggable; protected testing only; stable signing unconfigured    |

Notes in the bundle: first KJS Apps testing candidate; fixes real version progression
and About; same package/certificate; no account, content, game or data migration changes;
existing debug tools/seeds retained; phone baseline/data checks and real newer update pending.
The later archive-protection tooling fix does not change these already prepared APK bytes.
The checked-in floor is now 901, so the next reservation is at least 902.

Passed: project typecheck and lint, 983 JavaScript/TypeScript tests, directory checks,
release web build with debug-seed exclusion, real debug APK assembly, five Python
reservation/archive tests, and all 25 unchanged shared-publisher tests. Actual APK
inspection confirmed code 901, same signer/package and About's real code. Local private
bundle/receive tests confirmed exact bytes, complete-registry rendering, idempotent
replay, conflicting-code/floor rejection and rejection of debuggable stable promotion.
No synthetic artifact was uploaded. Live KJS Chat 76/77 and Yip Realms 1346 APK/icon
checksums were inventoried read-only in `build/apk-distribution/existing-catalog-sha256.json`.

Exact command **after explicit approval of this candidate**:

```sh
cd /home/xtreemmak/projects/node/yipden-app/apps/reader
pnpm apk:publish --bundle ../../build/apk-distribution/yipden-b901.zip --execute
```

Equivalent existing shared CLI command (run only one):

```sh
/home/xtreemmak/projects/node/j2chat-app/scripts/publish-apk   --config /home/xtreemmak/projects/node/j2chat-app/tools/apk-distribution/apps.json   upload --bundle /home/xtreemmak/projects/node/yipden-app/build/apk-distribution/yipden-b901.zip   --host xtreemmak@192.168.10.149 --root /var/www/kjs-apps --execute
```

### Initial-build incident and recovery decision

The first Gradle build cleaned the entire debug output directory before historical
files were backed up. This removed YipDen's 070–072 APKs and the legacy `games/` and
`j2chat/` directories. The Python host process remains running, but affected historical
URLs are unavailable. Exact copies of YipDen 070–072 and the legacy Chat downloads
were not found in the local workspace. The owner confirmed no backup is available and
explicitly declined recovery, requesting a fresh APK instead. Recovery is closed by
that decision; missing historical URLs remain unavailable.
Game build archives survive in the sibling Yip Realms checkout, but the exact contents
of the deleted served directory were not inventoried before the build. Do not replace
missing historical APKs with rebuilt or renamed bytes. Archive preservation is now
implemented and tested before any further build. Live KJS Apps snapshots, history,
icons and APKs were not changed. Retirement readiness is not established.

The YipDen push also advanced the pre-existing local ancestor commit `6be665e`
(Yip Realm extraction) along with the integration commit; no history was rewritten.
Only integration files were newly committed in this session. The shared registry
addition was committed separately as `6bcef69`.

## Current candidate 902: fresh build requested by the owner

On November 20, 2026, the owner declined historical-APK recovery and requested a fresh
APK. Build 902 supersedes unpublished 901. The owner subsequently instructed the agent
to continue, authorizing the reviewed first protected publication. **902 is published
to Builds; no stable promotion occurred.** The old download-server process remains running.

| Field               | Verified value                                                     |
| ------------------- | ------------------------------------------------------------------ |
| APK                 | `build/android-apks/yipden-b902.apk`                               |
| Version             | `0.9.0` / real Android versionCode `902`                           |
| Package             | `com.yipden.app`                                                   |
| Certificate SHA-256 | `d9ea95b7e73fa5b50d1d8a8b3d24a30f4bf066e74436fd9296ee6a8382fda88a` |
| APK SHA-256         | `7758f72e04e6638eaa60cb2c94f7f89f897ec0ee8efc1b9b5df6e938418ecbdc` |
| Size                | 21,396,937 bytes                                                   |
| Clean source commit | `84209ed8a2967a6aaf5bbfe9078b3b2e06e48234`                         |
| Private bundle      | `build/apk-distribution/yipden-b902.zip`, mode 0600                |
| Bundle SHA-256      | `ce59c83036ee56762dc3c3043d7187e66b82e4a27b9211f236ed391fdfe3fa36` |

Verified a real 901 → 902 increase, unchanged package/certificate, About code 902,
successful APK assembly and private preparation, checksum-exact local receive,
idempotent replay, conflicting-code rejection and debuggable stable-promotion rejection.
The real Gradle build preserved build 901 and its source JSON under the old served
output path, with matching backup checksums. No phone install/update has been performed.
The prior project checks remain applicable; this follow-up changed only operator records
and the checked-in reservation floor, now 902. The next reservation is at least 903.

Bundle notes identify a fresh debug/testing build from clean source with output
preservation and durable APK storage. Package/signing identity and app behavior are
unchanged. Debug tools/seeds remain enabled. Stable signing, phone baseline and a real
newer Obtainium update with data checks remain pending.

Publication command used for the approved build 902:

```sh
cd /home/xtreemmak/projects/node/yipden-app/apps/reader
pnpm apk:publish --bundle ../../build/apk-distribution/yipden-b902.zip --execute
```

## First protected publication completed: November 20, 2026

The owner said to continue and requested local Obtainium setup documentation. Uploaded
only the reviewed `yipden-b902.zip` through the existing shared publisher with the complete
registry. The live snapshot contains one current YipDen Builds APK, code 902, whose SHA-256
matches the reviewed `7758f72e04e6638eaa60cb2c94f7f89f897ec0ee8efc1b9b5df6e938418ecbdc`.
The previous live Chat 76/77 and Yip Realms 1346 history, APK bytes and icons were compared
with the recorded inventory and preserved. YipDen Releases remains empty.

All 16 public HTTPS GET/HEAD access checks passed: home/Releases returned 200 and
the protected Builds resources returned 401. Checks cover the Builds page,
metadata, history, APK and checksum. Results are retained locally in
`build/apk-distribution/public-https-b902.json`; post-publication snapshot verification is
in `build/apk-distribution/post-publication-b902.json`. Owner-authenticated HTTP download
and phone installation/data checks require the owner's private on-device header; no
credential was read or entered by the agent.

Follow [the phone setup guide](obtainium.md), install 902 over the existing app and confirm
Installed 902 / Latest 902 plus preserved followed people/settings. Then build, review and
separately approve a higher candidate for the real Obtainium update test. Do not fake the
Installed value, promote this debug APK or stop the old host as part of this publication.

## Owner confirmation: Obtainium setup complete

The owner reported "all set" after receiving the build 902 installation and baseline
instructions. Record the phone setup as owner-confirmed complete. A separately
published newer APK update and its data-preservation checks remain pending; this
confirmation does not authorize stable promotion or retirement of the old host.
