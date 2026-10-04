# Claude Code prompt — YipDen: reference finds for more media types + encrypted local store

> Follow-up to the YipDen v0.9 brief. That brief's stack, rules and "How to work" section still
> apply unless this prompt says otherwise. Everything below is the brief.

## Context

The app already has an **audio find** tool: while browsing a partner-webring creator's site in
the app's internal browser (our fork of a Capacitor browser plugin), the user can pick audio
linked on that site and attach it to that creator in YipDen as a *reference*. The app never
downloads or stores the audio file itself; it keeps a pointer and plays from the creator's host.

Before writing code, read the existing audio find implementation and the internal browser
plugin fork, and build on their patterns, naming and UI wording. Don't build a parallel system.

This prompt does two things:

1. Extends reference finds to **comics, writing and games**, under one shared `Reference` model
   (audio migrates onto it).
2. Moves the on-device store to an **encrypted SQLite database**, so anyone reading the device's
   storage without the key sees ciphertext, not references.

## Core principle: pointers, never content

A reference is a pointer to something a creator chose to publish on their own site. YipDen does
not copy, re-host, or persist the media. The creator's server stays the source of truth: if they
remove the file, the reference dies.

- Never write media bytes to disk (no files, no blobs in the database, no persistent thumbnails).
- Render live from the creator's host. In-memory thumbnails are fine; persisted ones are not.
- Cached waveform peaks (from the Listen feature) are derived data, not the media, and may stay,
  but they move into the encrypted database (see below).

## The `Reference` model

One type for every media kind. Suggested shape (adjust to match existing code, and log any change
in `DECISIONS.md`):

```ts
type ReferenceKind = 'audio' | 'image' | 'text' | 'screenshot';

interface Reference {
  id: string;
  kind: ReferenceKind;
  creatorId: string;          // creator entry this is attached to
  ringSource: 'own' | 'partner';
  ringId: string;             // which ring the creator was found through
  url: string;                // the media URL (image/audio) or the page URL (text)
  canonicalUrl: string;       // after following redirects
  foundOnPage: string;        // public page where the user found it (proof it was linked)
  hostVerified: boolean;      // media host matches the creator's listed/verified site
  sharable: boolean;          // computed from the capture rules; see below
  etag?: string;
  contentHash?: string;       // hash of the media or of the selected text
  selector?: TextSelector;    // text only
  textFragmentUrl?: string;   // text only: foundOnPage + #:~:text=...
  status: 'live' | 'gone';
  createdAt: string;
  checkedAt: string;
}

interface TextSelector {      // modeled on W3C Web Annotation TextQuoteSelector
  exact: string;              // the selected text, length-capped
  prefix?: string;            // a few words before
  suffix?: string;            // a few words after
}
```

Migrate existing audio references onto this model, with a tested migration.

## Capture flows (internal browser)

- **Comics (`image`):** long-press an image on a creator's page → "Save to [creator]".
- **Games (`screenshot`):** same flow as comics, for screenshots on the creator's own site.
- **Writing (`text`):** select text on a creator's page → "Save to [creator]". Store a
  `TextSelector` plus a Text Fragment link so opening the snip scrolls the creator's page to the
  passage. Cap `exact` at a short length (propose a number in `DECISIONS.md`; it should allow a
  passage, never a chapter). Opening a snip always links out to the creator's page.
- **Audio:** existing flow, now writing `Reference` records.

Reuse the audio find's UI patterns. All new UI follows the v0.9 accessibility and motion rules
(real buttons, labels on icon-only controls, 44px targets, shared easing and durations, reduced
motion honored).

## Capture rules

Apply these at capture time and on every re-check:

1. **Own site only.** The media host (after redirects) must match a site listed for that creator
   in their ring entry, or a profile verified via two-way `rel="me"` (reuse `packages/feeds`).
   Otherwise refuse the capture with a short, plain explanation. This stops people attaching
   re-uploads or copies hosted elsewhere to a creator's name.
2. **Only what's publicly linked.** Capture only media actually linked or embedded on the page
   the user is viewing. No guessed paths, no directory listing, no crawling. Record `foundOnPage`.
3. **Respect "no" signals.** If the page is disallowed by `robots.txt`, or carries `noindex` in a
   robots meta tag or `X-Robots-Tag` header, the reference may still be saved for the user but
   gets `sharable: false`.
4. **Re-check, don't remember.** Periodically (and when opened) re-check with a conditional GET.
   If the file is gone, or `foundOnPage` no longer links it, set `status: 'gone'`. Never fall back
   to a stored copy, because there isn't one. Same per-host rate limit and honest User-Agent as
   `packages/feeds`.

`sharable` has no effect in this build (there is no shared index yet), but compute and store it
now so the v2.0 index can rely on it.

## Encrypted local store

Replace the on-device `Store` implementation with an encrypted one. Approved packages:

- **`@capacitor-community/sqlite`**, SQLCipher-encrypted database on Android and iOS
- **`@aparajita/capacitor-secure-storage`**, holds the database key in Android Keystore / iOS
  Keychain

Both are native dependencies and are approved for this task. Record them in `DECISIONS.md`.

- On first launch, generate a random 256-bit key with a CSPRNG, save it via secure storage, and
  open the database encrypted with it. The key never touches JS-persisted storage, logs, or
  analytics.
- Everything goes in the encrypted database: follows, read state, cached yips, references,
  cached waveform peaks.
- Keep the `Store` interface. No component may talk to SQLite, IndexedDB or secure storage
  directly; the v2.0 sync implementation still has to drop in behind the same interface.
- **Migration:** move existing on-device data into the encrypted database, verify it, then
  delete the old plaintext store. Test this path, including an interrupted migration.
- **Web build:** there is no true secure storage in a browser. Fall back to IndexedDB with
  values encrypted by a non-extractable WebCrypto AES-GCM key. Document that this is weaker.

### Leak hardening

Encryption at rest is pointless if copies leak elsewhere:

- Exclude the database and secure-storage data from Android backups (`dataExtractionRules` for
  Android 12+, `fullBackupContent` for Android 11 and lower).
- Clear the WebView/HTTP cache of creator media on app close, or load reference media with
  caching disabled. Pick one and log why.
- No reference URLs, selectors or snip text in logs or crash reports.
- Document plainly in `DECISIONS.md` that this protects data at rest; it does not protect a
  rooted device while the app is unlocked and running.

## Out of scope: recorded for v2.0, do not build

Recorded so this build's types fit it. Do not scaffold any of it now.

- **Shared community index** (needs accounts). Stores pointers only, never media or snip text:
  writing snips are shared as selector anchors plus hash and resolved against the live page by
  each client. Saves are anonymous (show "N people saved this," never who). Only `sharable`
  references enter it. Server-side dead-link sweeps.
- **Partner-ring creator protections:**
  - Account-free opt-out ("remove references to my site") plus honoring an opt-out meta tag or
    well-known file. Removal is site-wide until reversed.
  - Pages for partner-ring creators labeled "Found by listeners from [ring], not affiliated,"
    always linking out.
  - Creator claiming via IndieAuth, with controls to hide, remove or pin references.
  - Report button, takedown contact, and a registered DMCA agent.
- **Own-ring opt-in:** a `community_refs` field in ring.json. This changes the ring contract, so
  it needs approval when the time comes.

## How to work

1. Read the existing audio find, internal browser fork, and `Store` implementation. Summarize
   what you found before changing anything.
2. Encrypted store first: key handling, `Store` implementation, migration, leak hardening, tests.
3. Then the `Reference` model and the audio migration onto it.
4. Then capture rules (host verification, linked-on-page check, robots signals, re-check), with
   tests against fixture pages.
5. Then capture flows: comics → games → writing.
6. Commit per milestone; typecheck, lint and tests before each commit. Log anything that differs
   from this brief in `DECISIONS.md`.

Ask before: adding any native dependency other than the two approved above, storing any media
bytes or snip text outside the encrypted database, changing the ring.json contract, or adding
anything that needs a server.
