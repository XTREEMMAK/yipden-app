# Security

## What the threat model actually is

YipDen has no server, no account and no credential to steal. That removes most of the usual
list and leaves one thing, which it leaves in a sharper form than a normal web app has it:

**The entire product is untrusted third party content, fetched from hundreds of sites nobody
here controls, rendered inside a WebView that is also the app.** A malicious or merely
compromised feed is the attacker. There is no server between it and the reader to sanitize
anything, so every check has to happen on the device.

Two OWASP categories carry nearly all of the risk here: injection (A03) and server side
request forgery (A10, which becomes device side request forgery when the client does its own
fetching). Mozilla's web security guidance supplies the headers and the transport rules.

## Injection: feed and ring content reaching the DOM

- **Feed HTML is sanitized before it is rendered**, with an allowlist, not a blocklist. No
  `<script>`, no `<iframe>`, no `<object>` or `<embed>`, no `on*` event handler attributes, no
  `style` attributes that can load a remote resource, no `<base>`. Unknown elements and
  attributes are dropped rather than passed through.
- **URL schemes are checked wherever a URL becomes a link, an image or a media source.**
  `ring-client`'s `safeUrl` refuses anything that is not https, which rules out `javascript:`
  and `data:` by construction. `packages/feeds` applies the same rule to feed item links and
  enclosures.
- **Svelte escapes text by default and `{@html}` is used only on sanitized content.** Any use
  of `{@html}` on anything that did not come out of the sanitizer is a bug.
- **Outbound links carry `rel="noopener noreferrer"`** and open in the system browser, not in
  the app's WebView, so a creator's page never runs inside the app's origin.

## Request forgery: where the device is pointed

A ring entry or a feed can name any URL, and the device will fetch it from inside the reader's
own network. That is the same hole as classic SSRF with the reader's LAN in the position of
the internal network.

`packages/ring-client/src/url.ts` refuses, and `packages/feeds` reuses it:

- anything that is not `https:`
- URLs carrying embedded credentials (`https://user:pass@host/`)
- loopback, private, link local and carrier grade NAT addresses: `127.0.0.0/8`, `10/8`,
  `172.16/12`, `192.168/16`, `169.254/16` (which is where cloud metadata services live),
  `100.64/10`, `0/8`, multicast and reserved space
- IPv6 loopback, unique local `fc00::/7` and link local `fe80::/10`
- IPv4 mapped IPv6 addresses in both spellings, including the hex form the URL parser produces
- `localhost` and the `.local`, `.localhost`, `.internal` and `.home.arpa` suffixes

The development only fetch proxy applies the same list, **and applies it again after every
redirect**, because a redirect to `169.254.169.254` is the standard way around a check that
only runs once.

## Parsing untrusted XML

- **External entities are disabled**, and so is DTD processing. XXE is the reason the XML
  parser choice is constrained rather than left to whatever is convenient.
- **Entity expansion is bounded**, against a billion laughs style expansion.
- **Response size and parse time are capped** before parsing starts, so a feed that streams
  forever fails instead of filling the phone's memory.
- The same caps apply to `ring.json`, with a limit well above any plausible ring.

## Being a good citizen on other people's servers

These are not defensive measures; they are the reason the product is allowed to exist.

- Conditional GET (`ETag`, `If-Modified-Since`) on every refetch, so an unchanged feed costs
  its host almost nothing.
- Per host rate limiting, so following twelve feeds on one instance is not twelve simultaneous
  requests.
- `robots.txt` respected.
- An honest `User-Agent` naming the app and a URL to read about it.
- `preload="none"` on audio, and no autoplay or auto loop. Track media is hosted on members'
  own sites and playing it spends their bandwidth.

## Transport and the WebView

Following Mozilla's web security guidance, adapted to an app whose origin is local files:

- **https only**, everywhere, with no exception for development against real feeds.
- **A Content Security Policy** on the app document: `default-src 'self'`, `script-src 'self'`,
  `object-src 'none'`, `base-uri 'none'`, `frame-ancestors 'none'`, `form-action 'none'`, with
  `img-src` and `media-src` allowing `https:` because creator media comes from everywhere, and
  `frame-src` allowing only `https://www.youtube-nocookie.com`. A YouTube yip shows its thumbnail and
  loads that player only when the reader taps play; the address is built from a validated video id,
  never from markup a feed supplied.
- **`Referrer-Policy: strict-origin-when-cross-origin`**, so a creator's server never learns
  which yip the reader came from beyond the origin.
- **Android cleartext traffic disabled** in the manifest, release builds not debuggable, and
  Capacitor's `allowNavigation` left empty so no remote origin can take over the WebView.
- **Exported components** (checked in the merged manifest, 2026-10-02): the launcher activity; the
  media session plugin's `MediaSessionService` and AndroidX's `MediaButtonReceiver`, both only for
  `MEDIA_BUTTON` (another app can at most press play or pause, which is what headset buttons
  are); and AndroidX's `ProfileInstallReceiver`, guarded by the system-only `DUMP` permission.

## Creators' sites in the app (Android)

Visit, from Discover and partner rings, can open a creator's site inside the app through
`@capgo/capacitor-inappbrowser` (Settings: "Open creators' sites in YipDen", on by default; the web build
and an off switch use the system browser as before). The aim is a toolbar button that lets the
reader keep audio the page plays (see DECISIONS.md, 2026-10-02). What keeps that safe:

- **A separate WebView, never the app's.** The creator's page runs in the plugin's own WebView at
  its own origin. It cannot reach the app's origin (`https://localhost`), its database, or the
  Capacitor bridge. The only path from the page to the app is the plugin's `postMessage`.
- **Every message from the page is untrusted.** The page's own code can call the same bridge our
  scan uses, so `pageMedia.ts` keeps only `safeUrl` addresses (https, no credentials, no private or
  loopback hosts) and bounded plain-text titles with control and direction-override characters
  stripped. Nothing found is stored until the reader taps Keep in the app's own sheet.
- **The trust anchor is native chrome.** Results reach that sheet only through YipDen's toolbar
  button (`buttonNearDoneClick`), which a page cannot press. No account action, and nothing beyond
  offering candidates, may ever be driven by `messageFromWebview`.
- **No way out to other apps.** `preventDeeplink: true` blocks `intent:`, `file:` and every other
  non-http scheme. Without it the plugin launches `intent:` URLs with `Intent.parseUri` from the
  app's own context, which could start this app's non-exported activities.
- **Patched WebView settings.** The plugin hard-codes general file and content access on for
  every page. `patches/@capgo__capacitor-inappbrowser@8.21.1.patch` turns `setAllowFileAccess` and
  `setAllowContentAccess` off. pnpm applies it on every install, CI included; the Android build
  compiles the patched copy. Since 8.21 the plugin itself only allows file-URL cross-origin access
  for its own bundled files, so those two settings need no patch.
- **Camera permission removed in our own manifest** (`tools:node="remove"`), not by the patch, so
  it holds whatever a plugin version declares.
- **Guard tests** (`siteBrowser.guard.test.ts`) read the installed plugin and the manifest and fail
  if file or content access is on, the camera removal is gone, deep links or TLS checks are
  loosened in our options, or the deprecated `@capgo/inappbrowser` package comes back. They are
  the check that a plugin upgrade kept the patch, rather than relying on pnpm's own behavior when a
  patch no longer matches. An upgrade means re-making the two-line patch for the new version.
- **Left as the plugin ships it:** TLS errors are not ignored (`ignoreUntrustedSSLError: false`);
  downloads, screenshots and page-controlled show and hide stay off (their defaults); mixed
  content stays blocked (only the Google Pay mode, unused, changes it); remote debugging only in
  debug builds (`isInspectable`). Pages may autoplay media (`setMediaPlaybackRequiresUserGesture`
  is false in the plugin), which is a nuisance, not a hole.
- **Shared with the app WebView:** Android's `CookieManager` is per process, so cookies set in one
  WebView are visible to the other. v0.9 has no cookies of its own, so nothing leaks today. This is
  the main constraint the v2.0 account work below has to respect.

## Data on the device

v0.9 stores follows, read state, cached yips, cached waveform peaks, saved links, verdicts,
explored marks, folders, layout choices, and references (pointers to what a reader kept from a
creator's page, never the media itself), and nothing else. There
is no password, no token and no personal identifier, because there is no account. Follows are
private to the device: nothing is posted anywhere and the creator is not notified.

### Encrypted at rest (2026-10-04)

All of it is in one encrypted database, behind the `Store` interface (`src/lib/store/`).

- **Android: SQLite encrypted with SQLCipher** (`@capacitor-community/sqlite`). The key is 256
  random bits from `crypto.getRandomValues`, made on first launch, handed once to the plugin's
  `setEncryptionSecret` in SQLCipher's raw-key form, and never kept, logged or read back by
  JavaScript. The plugin keeps it in EncryptedSharedPreferences, under an AES-256-GCM master key in
  the Android Keystore. The brief also named a separate secure-storage plugin for the key. It was
  not added: this sqlite plugin can only open an encrypted database with a key it stores itself,
  so a second plugin would only have kept a second copy (DECISIONS.md, 2026-10-04).
- **Web build: IndexedDB with every value encrypted** with AES-GCM, and every record key replaced
  by its HMAC, using non-extractable WebCrypto keys kept in the same database. **This is weaker.**
  A browser has no keystore, so any script running on the origin can use those keys. It protects
  the files on a disk or in a profile backup, nothing more.
- **The old plaintext IndexedDB database** is copied across on first launch, checked, and only then
  deleted (`migrate.ts`). An interrupted move restarts from the old database, which stays whole
  until a checked copy exists.
- **Leaks around it are closed off.**
  - Android backups and device transfer exclude every domain (`data_extraction_rules.xml` for
    Android 12 and later, `full_backup_content.xml` and `allowBackup="false"` for older versions).
    That includes the shared preferences that hold the wrapped key.
  - The WebView HTTP cache, which holds creators' images and the in-app browser's pages, is cleared
    when the app closes and again at every cold start (`MainActivity.java`).
  - Release builds log no addresses: the two logs that name a URL run only in development.
  - Native logging is off in every build (`loggingBehavior: 'none'`). Capacitor's bridge would
    otherwise log each plugin call with its arguments in debug builds, which would put the key and
    every SQL value in logcat. `store.guard.test.ts` keeps it off.

**What this does not protect.** It protects data at rest: a copied disk image, a stolen backup, the
files read off a phone that is off or locked. It does **not** protect a rooted phone while YipDen
is unlocked and running, where the key can be read from memory or the Keystore used on the app's
behalf. Nor does it protect a backup file the reader exports, which is plain JSON on purpose.

### References: what is checked, and what is asked of creators' hosts

Keeping something, and checking it again later, applies the capture rules
(`references/capture.ts`, DECISIONS.md 2026-10-04). Only the creator's own sites are asked
anything. A file gets a `HEAD` request, never a download. A page is fetched with robots.txt
honoured. Everything goes through the same polite client as feeds. Those requests use the app's
native HTTP client, which shares the in-app browser's cookie jar, so a creator's site sees the
reader's cookies for that site. That is the exposure feed fetching already has, and it is the
reason v2.0's API host must stay out of the in-app browser (below). Nothing from a page is
executed or rendered: markup is only tokenized, to look for a link or a passage.

A picture or passage picked on a page is as untrusted as found audio: the page's own code can send
the same message. Only public https addresses and plain bounded text get through (`readFound`).
Nothing is kept until the reader taps Keep in the app's own sheet, and the own-site rule still
applies. Passage text is only ever shown as text. A kept picture is shown from the creator's host
and never stored.

The theme and skin stay in `localStorage`, outside the database. They are read before the first
paint, before the database can be opened, and they say nothing about what a reader follows.

OPML import is parsed with the same hardened XML rules as feeds, and every URL in it goes
through the same checks before it is followed.

A full YipDen backup is input from outside too. Its people, sources, saved links and verdicts are
validated before anything is written; explored marks, reader tracks and layout choices are checked
entry by entry and merged, never replaced. A restored ring queue is checked item by item in
`ringPlayer.restore` (every address through `safeUrl`) before it reaches the audio element or an
image, whether it came from a backup or from this phone's own storage. The other restored settings
are plain flags and numbers read back with type checks.

## OWASP Mobile Top 10 (2024) review, 2026-10-02

Done when the in-app browser was added, against the 2024 list and the MASVS areas it maps to,
with the v2.0 account work in mind.

| Risk                                       | Where YipDen stands                                                                                                                                                                                                                                                          |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M1 Improper credential usage               | No credentials exist. v2.0 rules below.                                                                                                                                                                                                                                      |
| M2 Inadequate supply chain security        | Lockfile with integrity hashes, install scripts denied by default, Gradle artifact checksums pinned, the plugin patched and pinned to one version. New native code is asked about first.                                                                                     |
| M3 Insecure authentication / authorization | No accounts yet. v2.0 rules below.                                                                                                                                                                                                                                           |
| M4 Insufficient input / output validation  | Feed and ring content sanitized or rendered as text; every URL through `safeUrl`; OPML and backups validated; page messages from the in-app browser validated and never acted on without a tap in the app. Fixed in this review: restored ring queue items were not checked. |
| M5 Insecure communication                  | https only, cleartext disabled, no TLS error bypass, mixed content blocked. To confirm on a phone: that an `http://` link followed inside the in-app browser is refused by the network security config.                                                                      |
| M6 Inadequate privacy controls             | No analytics, no account, no cloud backup (`allowBackup` false). The in-app browser is a normal browser session on the creator's site; the creator sees a visit, as they would from Chrome. Captured tracks stay on the phone.                                               |
| M7 Insufficient binary protections         | Release builds not debuggable, WebView debugging off in release. No obfuscation; nothing in the app is secret.                                                                                                                                                               |
| M8 Security misconfiguration               | Plugin WebView file access and the camera permission fixed by patch; deep links from pages blocked; exported components reviewed above.                                                                                                                                      |
| M9 Insecure data storage                   | SQLCipher on Android with its key in the Keystore; encrypted IndexedDB on the web (weaker, stated above). Excluded from backup and device transfer; WebView cache cleared on close. Not protection on a rooted, unlocked phone.                                              |
| M10 Insufficient cryptography              | SQLCipher (AES-256) with a CSPRNG key on Android; AES-GCM with HMAC-hidden keys via WebCrypto on the web. No hand-rolled cryptography; the SHA-256 in `packages/feeds` makes ids, not secrets.                                                                               |

### Rules the v2.0 account work must follow

The in-app browser shares Android's cookie jar with the app WebView and exposes a message bridge
to any page it loads, so accounts must not lean on either:

1. **No session cookies for the API.** Use short-lived bearer access tokens held in memory and a
   refresh token in Android Keystore-backed storage (a native secure-storage plugin, asked about
   first). Never IndexedDB, localStorage or a cookie. If a cookie is ever unavoidable, it is
   `Secure`, `HttpOnly`, `SameSite=Strict` and scoped to the API host.
2. **Put the API host in the in-app browser's `blockedHosts`**, so a creator's page can never
   navigate that WebView to it.
3. **Sign-in never happens in the in-app browser.** Magic link and IndieAuth go through the system
   browser or Custom Tabs, with the result returned by a verified App Link or PKCE redirect
   (RFC 8252), never by `messageFromWebview` or `executeScript`.
4. **Never pass a token, user id or account data into `executeScript`**, or anything else that runs
   in a creator's page.
5. **The API allows CORS only from the app origin** (`https://localhost`) and checks `Origin` on
   state-changing requests.
6. **Signing out clears tokens only**, never local follows (already a v2.0 rule), and clears the
   shared cookie jar in case anything set one.

## Dependencies

The brief's "no UI framework, no gesture library, no animation library" is also a security
position: every dependency is code trusted while building the app or shipped to a device that
renders hostile input. The reader's direct runtime dependencies are Capacitor's core and app
plugins, `@capgo/capacitor-media-session`, `@capgo/capacitor-inappbrowser`, `@rgrove/parse-xml`, wavesurfer.js and the two local
workspace packages. `ring-client` has zero external runtime dependencies; `feeds` depends only on
`@rgrove/parse-xml`. Svelte, SvelteKit, Vite and the test and lint tools are development
dependencies.

The npm side is pinned and fail closed:

- The repository pins pnpm through `packageManager`, commits `pnpm-lock.yaml`, and CI installs with
  `--frozen-lockfile`. Every registry artifact in the lockfile has a SHA-512 integrity value.
- Dependency install scripts are denied unless `pnpm-workspace.yaml` explicitly allows them. Only
  esbuild is allowed because its platform binary is installed by its postinstall script.
- A new package is reviewed by exact name and scope, whether npm marks it deprecated or moved,
  registry age and maintainers, source
  repository, license, lifecycle scripts and transitive dependencies. Its manifest and lockfile
  changes are reviewed together with the code that uses it.

Anything with native code is asked about before it is added, which is how
`@capgo/capacitor-media-session` (lock screen and notification controls, and the foreground
service background playback needs) was chosen over the alternatives: see DECISIONS.md for the
comparison. It adds one manifest permission, `FOREGROUND_SERVICE_MEDIA_PLAYBACK`, declared in
this app's own `AndroidManifest.xml` since the plugin's own only declares the older,
unqualified `FOREGROUND_SERVICE`.

The Android build has an independent integrity boundary. `gradle-wrapper.properties` pins the
SHA-256 checksum of the Gradle distribution, and `gradle/verification-metadata.xml` pins SHA-256
checksums for Maven artifacts and their metadata. An unknown or changed artifact fails the build.
When intentionally updating a Gradle or native dependency, regenerate the affected entries with
`./gradlew --write-verification-metadata sha256 assembleDebug`, review the dependency declaration
and verification metadata diffs together, then run `./gradlew assembleDebug` normally to prove
verification passes without write mode. Do not bypass verification to make an unexplained
checksum change build.

CI pins GitHub Actions to commit SHAs rather than tags.

## Where to look when changing things

| Concern                | File                                                              |
| ---------------------- | ----------------------------------------------------------------- |
| URL safety, SSRF       | `packages/ring-client/src/url.ts`                                 |
| Ring validation caps   | `packages/ring-client/src/validate.ts`                            |
| Fetch size and timeout | `packages/ring-client/src/fetch.ts`                               |
| Feed HTML sanitizing   | `packages/feeds/` (see that package)                              |
| In-app browser         | `apps/reader/src/lib/platform/siteBrowser.svelte.ts`, `patches/`  |
| Page scan messages     | `apps/reader/src/lib/pageMedia.ts`                                |
| Backup validation      | `apps/reader/src/lib/backup.ts`                                   |
| Encrypted store, key   | `apps/reader/src/lib/store/` (`capacitorDriver.ts`, `migrate.ts`) |
| Backup and cache rules | `android/app/src/main/res/xml/`, `MainActivity.java`              |
| CSP and manifest       | `apps/reader/` (see that app)                                     |
