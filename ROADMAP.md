# Roadmap

Where YipDen stands and what comes next. Built from code and product audits through 2026-09-25.
The brief this started from is v0.9: no server, no accounts. [CHANGELOG.md](CHANGELOG.md) says
what shipped, [DECISIONS.md](DECISIONS.md) says why. This file says what is left, in the order to
do it.

Items marked **(ask first)** need a go-ahead under the brief's rules: a native dependency, an
animation or gesture library, a `ring.json` contract change, or anything needing a server.

## Where we are

**Shipped and working on a device**

- `packages/ring-client` and `packages/feeds`: ring fetch and validation, feed discovery, polite
  fetching, RSS, Atom and JSON Feed parsing, HTML sanitizer.
- App shell: tokens, self-hosted fonts, motion system, tab bar, View Transitions, swipe primitive.
- Android host (Capacitor 8), live reload workflow, CI on push, debug APK on `v*` tags.
- Discover: full bleed hero, node of the day, swipe or buttons, Filter sheet, shuffle, WebGL wipe
  (the half-precision shader bug is fixed), previews by member type, no auto rotate by decision.
- Follow: paste a link, discovery, toggle list. Refresh pipeline. Feeds (formerly Today): merged
  feed, four panes, pull to refresh, the 3D card stack.
- Player: shared audio element, mini and full player, queue with drag to reorder, music shuffle,
  card to player morph, Android Back collapses the player, lock screen controls and background
  playback through `@capgo/capacitor-media-session`.
- You: theme, follow list, OPML export and import, clear cache.

**Earlier "deferrals" that are now done:** the 3D card stack, the full player, Media Session and
the background audio plugin, the card to player morph. The CHANGELOG line that still calls them
deferred is stale; see Housekeeping.

**Not started (v2.0):** `apps/api`, `packages/db`, sign in, sync, the Account section.

## Now: known problems

### 1. Waveforms never draw (fixed in the browser 2026-09-24; device check and one limit left)

**Cause, found in a real browser against real ring tracks:** it was not CORS. wavesurfer starts
loading by itself when handed an element that already has a source, which the shared audio
element always does. It then aborts that load when our own `load()` starts, and reports the
abort as an `error` event. Our handler took every error as a failure and switched to the plain
bar, so every track showed the bar. The handler now ignores that abort. With it, a real track's
waveform draws in about a second, playback is untouched, and the regression is covered in
`e2e/player.spec.ts` (verified to fail without the fix).

Still open:

1. **Check it on the phone** through `chrome://inspect`. The browser run used hosts that send
   `Access-Control-Allow-Origin: *`; the Android `CapacitorHttp` `fetch` override is still
   unconfirmed. Dev builds log any real failure to the console now.
2. **Slow hosts.** wavesurfer downloads the whole file. In one headless run a 20 MB track from
   file.garden reached 60% after about 150 seconds while `curl` fetched it in under a second, so
   the wave can take minutes or never arrive on some hosts. Not understood yet; the file may be
   throttled for browsers, or the parallel playback stream may be competing. Worth measuring on
   the phone. Options if it persists: a size cap that keeps the bar, or fetching the bytes
   ourselves and passing `peaks` in.
3. **A host that blocks reads** (no CORS headers, on the web build) still falls back to the bar
   by design, and there is a test for that.
4. Longer term, cheaper option (ask first): precomputed peaks in `ring.json`. It is a contract
   change and only helps ring tracks.

### 2. Discover drops to "Loading the ring" after resume (done 2026-09-24)

Cause found in the code, not a cache expiry. `ring.load()` in
[ring.svelte.ts](apps/reader/src/lib/ring.svelte.ts) calls `fetchRing`, which **awaits the
network first** (10 second timeout) and only uses the cached ring if that fails. Meanwhile
`status` stays `'loading'`. Discover calls `load()` on every mount, and Android's WebView is often
reloaded or has its network paused on resume, so a resume waits on a slow or paused request with
nothing on screen. There is no freshness window either: the ring is refetched every mount, even
if it was fetched seconds ago.

Fix, stale while revalidate:

1. Paint the cached ring immediately, then revalidate in the background. The existing
   conditional GET (`ETag`, `If-Modified-Since`) makes the revalidation cheap.
2. Skip revalidation if the last fetch is under a freshness window (start at 15 minutes), and
   revalidate on app resume through `@capacitor/app`'s `appStateChange` (already a dependency)
   when the window has passed.
3. Guard the remount: `load()` should not reorder `all` or reset the reader's position when the
   revalidated ring is unchanged. Today it re-rotates to the node of the day each time.
4. Make "loading" a first launch state only, meaning no cache exists yet.
5. Tests: a slow network with a warm cache renders at once, a 304 changes nothing, a changed ring
   updates in place without moving the reader.

### 3. Discover loading state (done 2026-09-24, mascot slot ready)

Replace the "Loading the ring" chip with a centered ring animation on the hero background,
built so the mascot can drop in later.

1. A `RingLoader` component: an SVG ring that draws and rotates on the motion system's curve, and
   respects reduced motion (a still ring, no spin).
2. Give it a slot or a prop for the artwork, so the animated wolf (Lottie or SVG, decided later)
   replaces the ring without touching Discover. **A Lottie player is a new dependency (ask
   first);** plain SVG plus CSS or SMIL needs none.
3. Show it only in the true first launch case from item 2, and fade it out into the hero.

## Next: You, About and release readiness

### 4. About becomes a modal (done 2026-09-25)

Today About is one paragraph in [you/+page.svelte](apps/reader/src/routes/you/+page.svelte) plus
a version line at the bottom. Make it an **About row that opens a modal sheet**, styled like the
existing Filter and preview sheets so it reuses their open, close, focus and back button handling
(Android Back should close it).

**Shipped 2026-09-25:** the inline paragraph is now an About sheet with the existing YipDen den
mark, build-time package version and git short hash, `CHANGELOG.md` rendered from the source file,
privacy and source links, audited dependency and creator-content attributions, focus return, Escape,
and browser/Android Back handling.

Contents:

1. The app logo and name, version, and one line on what it is.
2. **How Discover works**, moved from the current About paragraph, naming the IndieNodes webring
   as the source.
3. **Version history:** the changelog rendered in the modal. Read `CHANGELOG.md` at build time
   (a Vite `?raw` import or a small build step) so it cannot drift from the file, and stamp the
   build with the git short hash. Do not read git at runtime; the app has no git.
4. **Attributions**, from what the code actually uses (audited 2026-09-24):

   | What                                                               | License                                        |
   | ------------------------------------------------------------------ | ---------------------------------------------- |
   | Bricolage Grotesque, Instrument Sans, JetBrains Mono (self hosted) | SIL OFL 1.1, notices already in `static/fonts` |
   | wavesurfer.js                                                      | BSD 3-Clause                                   |
   | Capacitor (`core`, `app`, `android`)                               | MIT                                            |
   | `@capgo/capacitor-media-session`                                   | MPL 2.0                                        |
   | `@rgrove/parse-xml`                                                | ISC                                            |
   | Svelte, SvelteKit                                                  | MIT                                            |
   | IndieNodes webring and every member's own art, audio and text      | belongs to its creators                        |

   Confirm each license from the installed package before shipping. Generate the list from
   `pnpm licenses` at build time if it stays accurate enough, and keep the OFL notices as they
   are. YipDen itself is GPL-3.0-or-later, with a link to the source.

5. A link to the privacy stance: no account, no analytics, follows stay on the phone.

The modal uses Discover's existing den mark. Launcher, adaptive icon, splash and store artwork remain
part of item 6 rather than blocking the information architecture here.

### 5. Device verification pass

Open questions DECISIONS.md already flags as unverified, all needing a phone:

- Foreground service lifecycle: does it stop promptly after pause, and does the persistent
  notification look right?
- Lock screen scrubber, previous and next, and the seek buttons after the player rework.
- Back button behavior with the modal, the player and the confirm rows in every combination.
- Waveform (item 1) and the resume behavior (item 2), re-tested after the fixes.
- Discover on low end hardware after the canvas changes: first paint, swipe smoothness.

### 6. App identity

- Launcher icon, adaptive icon and splash: the `mipmap` and `drawable` folders hold the Capacitor
  defaults. Final launcher and Play listing artwork is still needed.
- Reconcile the package version (`0.0.1`) with a real release number.

### 7. Housekeeping

- CHANGELOG: the Feeds/Today line still says the 3D stack and full playback are deferred. Both
  shipped. Cut a real `0.9.0` section out of Unreleased and correct that line.
- `tmp/` holds a git bundle, the handoff prompt and a prototype backup. Decide what is worth
  keeping, move it, or ignore it, so the repo root is not half scratch.
- `docs/reference` is gitignored but `docs/README.md` points at it. Make sure a fresh clone's
  docs say where to get the prototype.
- No `CLAUDE.md`. Worth a short one with the commands, the ask first rules and the DECISIONS.md
  habit, so a new session starts warm.

### 8. Feed model audit

What YipDen can read today, from `packages/feeds` (profiles.ts, kind.ts, discover.ts). Everything
is **read only, over RSS 2.0, Atom or JSON Feed**. There is no platform API and no server. The
patterns below are read from the code, not re-tested against live sites.

| Source           | Supported how                                                   | Known limits                                                                                                                  |
| ---------------- | --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Blogs, podcasts  | `link rel=alternate`, fallback paths, RSS, Atom, JSON Feed      | None known. Podcasts play in the player.                                                                                      |
| Bluesky          | Profile URL to `bsky.app/profile/<handle>/rss`                  | Whatever Bluesky puts in that feed; no threads, no replies.                                                                   |
| Mastodon         | `/@handle` on any host to `/@handle.rss`                        | Public posts only. An instance can turn RSS off. Any path other than `/@handle` is unrecognized.                              |
| Other fediverse  | Nothing specific                                                | Servers that do not use Mastodon's path (Pleroma, Misskey and others) would need their own patterns. Unverified.              |
| YouTube          | Channel id to the videos feed; `@handle` resolved from the page | Opens the creator's page, never plays in app, by decision.                                                                    |
| PeerTube         | Feed announced on the page                                      | Only if the page announces it.                                                                                                |
| Discourse forums | Category, `latest`, `top` or `categories` URL plus `.rss`       | Topic lists only. A person's own posts (a user activity feed) are not a pattern yet. Unverified whether Discourse serves one. |
| Verification     | Two way `rel="me"` between a site and a profile                 | h-card is read for a name and profile links only.                                                                             |

The brief lists Mastodon, Discourse, webmentions and fediverse features together. Sorted by what
each needs:

- **Fits v0.9 and mostly done:** the read only RSS path above for Bluesky, Mastodon, YouTube,
  PeerTube and Discourse.
- **Reader side, could follow v0.9 without a server:**
  - Forum digests (grouping a Discourse category's topics), which the brief put out of scope for
    v0.9.
  - A user activity pattern for Discourse, and patterns for other fediverse servers.
  - `h-feed` microformats, for a page that publishes posts in its markup and has no feed. The
    parser already reads `rel=me` and h-card, so this is an extension of it, not a new system.
  - Clean reader view (also out of scope in the brief).
- **Needs a server, so v2.0 or later:**
  - **Webmentions.** Receiving one needs a public endpoint and storage. A phone cannot host that.
    Sending one from a reader is possible on its own but the reader does not publish, so there is
    little to send.
  - **Real ActivityPub** (following as an actor, replies, boosts, notifications). It needs signed
    requests and an inbox. RSS covers only reading public posts.
  - **Mastodon and Bluesky sign in** (Mastodon per instance, Bluesky through AT Protocol OAuth),
    already specced in the brief's v2.0 section. It is sign in for an account, not for following.

Work for this item: check each row against a real account (one per platform), write down which
rows fail, add a fixture test for each pattern that passes, and decide which of the "reader side"
items belong in 0.9.x. Any new pattern is a change in `profiles.ts` only, with a fixture.

## Active reader-resilience batch (approved 2026-09-25)

These four items are active work rather than post-release ideas. They answer the recurring
IndieWeb/decentralized-web problems found in the product audit: fragile discovery, noisy or
all-or-nothing following, inconsistent publishing formats, and weak portability between apps.

### 9. Source health, recovery and manual attachment

**First slice shipped 2026-09-25:** You now shows health per source, exposes a retry that bypasses
the automatic five-failure backoff, and lets a reader attach a feed, website or profile to an
already-followed creator. Manual sources have explicit `manual` provenance and remain unverified:
reader intent is not proof that a creator owns an account. Duplicate URLs cannot silently move
between creators, and removing a manual source removes only its own cached yips.

Follow also searches the locally loaded IndieNodes Ring after a short typing pause. A matching member
is offered before web discovery; when the Ring declares feeds, the reader can choose and save them
without requesting the creator's website. Members without declared feeds offer an explicit website
check instead of starting one merely because their name matched.

Discovery was widened at the same time: a profile can be pasted directly; Schema.org `sameAs` is
read alongside `rel=me`; YouTube legacy custom URLs and either canonical-link attribute order are
accepted; the page's `externalId` wins over unrelated recommended `channelId` values; and ordinary
links no longer consume the profile scan budget before a useful link is reached.

Still in this item: offer a replacement-URL flow when a source stays dead, and distinguish a
parse failure from a network failure in the health copy.

### 10. Calm feed controls

**First slice shipped 2026-09-25:** the per-creator source panel has individual switches,
creator-level pause/resume, and an explicit Check now action. Pausing stops fetches and hides that
source's cached yips without deleting it. Next, add optional per-source update frequency. Defaults
stay chronological and finite; none of these controls may become ranking or engagement tuning.

### 11. A broader readable web

**First slice shipped 2026-09-25:** direct profile input, Schema.org `sameAs`, legacy YouTube
custom URLs, and a profile-budget fix broaden the readable web without adding platform APIs.
The discovery improvements in item 9 cover more sites without a platform API. Next, parse a small,
tested `h-feed` subset when a page exposes posts but no RSS, Atom or JSON Feed, then add a sanitized
reader view for linked articles. Preserve the original URL as the primary action and make fallback
content visibly different from a creator-published feed.

### 12. Portable YipDen backup

**First slice shipped 2026-09-25:** OPML remains the interoperable follows format. A versioned,
plain JSON YipDen backup now carries people, sources and provenance, preferences, read state and
cached yips. Import validates the whole file first, shows a count preview, merges existing data,
reports and skips identity collisions, and strips cached HTML before storage because it did not
pass through this install's sanitizer.

## Later: v0.9 release

1. Release signing: a Play Console identity and an upload keystore, stored as GitHub secrets, per
   [docs/ci-cd.md](docs/ci-cd.md).
2. A release build (AAB), with a check that the cleartext refusal still holds in it.
3. Play listing: description, screenshots (the screenshot script already exists), privacy policy,
   data safety form (nothing collected).
4. Branch protection with CI marked required.
5. Tag `v0.9.0`.

## Later: after 0.9

Multiring inclusion stays exploratory until after this active batch. Treat each ring as a provider
adapter, validate it at the boundary, and normalize only a small common member shape. Rich fields
such as IndieNodes media and feed metadata remain capability-gated instead of forcing every ring
into the richest schema. Initial support should be explicit per ring, with fixtures for each
adapter; do not accept arbitrary remote JSON as if all ring formats were interchangeable.

Out of scope for v0.9 in the brief, so none of this starts before it ships:

- Forum digests, creator packs and claimed creator pages. Webmentions and real ActivityPub need a
  server; see item 8. Clean reader view moved into the approved active batch in item 11.
- Ambient or display mode. Discover was built with auto advance in mind; a decision on
  2026-09-24 chose no auto rotate for now.
- Watch yips: they open the creator's page. Whether video ever plays in app is unsettled and
  the brief says it does not.

## v2.0: backend

`apps/api` and `packages/db`, Better Auth with magic link and IndieAuth, and a sync `Store`
implementation behind the existing interface, plus the Account section on You (already designed
in the prototype). Signing out must never delete local follows. Nothing in v0.9 may depend on it.

The fediverse side of the feed model belongs here too: webmention receiving, ActivityPub, and
Mastodon and Bluesky sign in. Item 8 has the split between what can stay on the phone and what
cannot.
