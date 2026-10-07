# Roadmap

Where YipDen stands and what comes next. Built from code and product audits through 2026-09-25.
The brief this started from is v0.9: no server, no accounts. [CHANGELOG.md](CHANGELOG.md) says
what shipped, [DECISIONS.md](DECISIONS.md) says why. This file says what is left, in the order to
do it.

Items marked **(ask first)** need a go-ahead under the brief's rules: a native dependency, an
animation or gesture library, a `ring.json` contract change, or anything needing a server.

## Where we are

**0.8.0 (2026-10-06).** Everything below the first store release is built: Discover with
partner rings, Follow (people and forums), Feeds, the player with platform embeds, the in-app
browser and the Library, the encrypted store, and creator profiles with home and aliases
(Creator Database steps 1 and 2). What stands between this and **0.9.0** is the phone pass of
the encrypted store and the release work under "Later: v0.9 release". The sections below are
the history of how it got here, kept for the reasons they record.

**Shipped and working on a device**

- `packages/ring-client` and `packages/feeds`: ring fetch and validation, deadline-bounded feed
  discovery, polite fetching, RSS 1.0/2.0, Atom and JSON Feed parsing, HTML sanitizer, and known
  Bluesky, Mastodon, YouTube, PeerTube and Discourse profile patterns.
- App shell: tokens, self-hosted fonts, motion system, tab bar, View Transitions, swipe primitive.
- Android host (Capacitor 8), live reload workflow, CI on push, debug APK on `v*` tags.
- Discover: full bleed hero, node of the day, swipe or buttons, Filter sheet, shuffle, WebGL wipe
  (the half-precision shader bug is fixed), previews by member type, correct slow-cover handoff,
  no auto rotate by decision.
- Follow: lazy Ring-first creator search, website/profile/direct-feed discovery with one deadline,
  and a toggle list. Refresh pipeline. Feeds (formerly Today): merged feed, four panes, pull to
  refresh, the 3D card stack, and conservative same-creator crosspost grouping.
- Player: shared audio element, mini and full player, queue with drag to reorder, music shuffle,
  card to player morph, Android Back collapses the player, lock screen controls and background
  playback through `@capgo/capacitor-media-session`; unfollowing also removes that creator from
  live and persisted playback state.
- You: theme, per-source health and controls, manual source attachment, follow list, OPML and full
  YipDen backup export/import, clear cache, and the About sheet.
- Layout awareness, the Shelf and the partner ring scaffold (2026-09-28, below).

**Earlier "deferrals" that are now done:** the 3D card stack, the full player, Media Session and
the background audio plugin, the card to player morph. The CHANGELOG line that still calls them
deferred is stale; see Housekeeping.

**Not started (v2.0):** `apps/api`, `packages/db`, sign in, sync, the Account section.

**Reliability pass closed 2026-09-25:** Follow searches have a 15-second whole-operation deadline
instead of hanging on a probe; long discovered URLs wrap inside their container; an unfollowed
creator cannot reappear in the mini player after relaunch; a slow Discover cover never remains
paired with the next creator's metadata; and leaving Discover keeps the cover in the outgoing
browser snapshot without retaining the live full-height route and shifting the incoming page.

**Doorway batch shipped 2026-09-28.** YipDen is a doorway, not a destination: reading never needs
an account or a change to anyone's site, and what we do with a site grows only with its owner's
consent. Everything here is local, with no server. The choices are in DECISIONS.md.

- **Layout awareness.** `ring-client` reads an optional `layout` on ring entries; Follow's
  paste-a-link discovery guesses from a missing viewport meta tag on the page it already fetched.
  Undeclared or unguessable means mobile friendly. Discover leads a desktop-first member with
  **Save for later**; Feeds adds the same under that person's yips.
- **The Shelf.** A local list of links, in the existing IndexedDB store (database version 2). Listed
  under You, exported through the existing OPML file and full backup, format in
  [docs/shelf-format.md](docs/shelf-format.md).
- **Partner ring scaffold.** A per-ring adapter boundary in `ring-client`, a ring switcher in
  Discover's Filter sheet, and cards labelled "via [ring name]" linking to that ring's hub, tested
  against a bundled made up ring. No real ring is registered.
- **About** states the posture. The copy is drafted from the brief and provisional.

Still open from this batch:

1. **`layout` is not published yet.** `indienodes-ring` has to add it to its schemas and
   `build-ring.js` (ring-contract.md, "Changes owed"). Until then only the heuristic ever fires.
2. **The heuristic has no disclosure (the override shipped 2026-10-02, per creator, in You and the
   notes sheets).** A hand written page with no viewport tag that
   reads fine on a phone is called desktop-first. Say so on the Follow screen when it applies, and let
   a reader turn it off per person. Measure false positives on real follows first.
3. **A follow made before this batch has no layout**, and a ring member followed before the ring
   declares one keeps none. Re-reading the ring's declaration on load would fix the second.
4. **Partner rings: Musicians Webring and Knifebeetle, on for everyone (2026-10-02).** Both
   adapters (`apps/reader/src/lib/partner/`) ship in every build with no flag. Researched and
   cleared: reading a ring as it stands is fine with a link back to the ring's own site and its
   official badges and images, which both already have. These two are the whole list for now.
   Musicians Webring scrapes a hand-written HTML table. Reads a member's own curated sample link too, folds/stands its cards the same way Feeds'
   yips do, labels the sample honestly by what it actually is with that platform's own mark
   (SoundCloud, Bandcamp, Spotify, Apple Music, YouTube, or a real file, via Simple Icons, CC0),
   and shows a member's own thumbnail as a badge where the ring publishes one, sized to its own
   shape rather than a forced square, tappable into a full screen preview when it turns out to be
   real art rather than a button graphic (all 2026-09-29). A separate, manual, developer-run script
   (`apps/reader/scripts/analyze-partner-previews.ts`) settles the one thing the label alone
   cannot, an own-domain link with no extension, with one polite `HEAD` request; the app itself
   never makes that request. The sample is always opened externally, never assumed playable in
   app.

   **Knifebeetle (a webcomic ring) is the second adapter**, proving the boundary against a structurally
   different, custom-built ring rather than a repeat of the first. Its content-warning blocks are
   deliberately not treated as `sensitive` (folded into the blurb instead; see DECISIONS.md for
   why hiding 84% of the ring by default would have been the wrong call).

   Also still open: whether partner members can be followed, not only visited or saved, and
   whether a reader should get any per-ring show/hide control now that two are registered.

5. **The desktop handoff page (follow-up, outside this repo).** A small static page on YipDen's
   marketing and docs site that opens an exported file and lists its links, per
   [docs/shelf-format.md](docs/shelf-format.md). That site is not in this repository.
6. **Found-site discovery (placeholder, not started).** Suggesting sites nobody submitted needs its
   own consent design before any code: whose sites, who agreed, and what a site owner can see and
   refuse. Not to be started as part of the items above.

Decided 2026-09-28: no dedicated IndieNodes posture page, in this app or its marketing site. About's
own paragraph is where that information lives, permanently, not a placeholder for one.

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

- **Launcher icon: done (2026-09-29, art redone 2026-09-30).** Real adaptive icon (the fox, its
  ring and an arch as a single white foreground, a monochrome layer for Android 13+ themed icons),
  the background color switching with system day/night mode. Legacy pre-26 flat icons regenerated
  too. See DECISIONS.md and `brand/README.md`. The Play Store listing icon exists
  (`apps/reader/store/play-icon-512.png`); the rest of the listing (description, screenshots,
  privacy policy, data safety form) is still needed.
- **Splash screen: done (2026-10-01).** The AndroidX splash screen, now actually installed, shows
  the same white mark as the launcher icon on the same day/night background, sized to fit Android
  12's circular splash mask. Capacitor's stock `splash.png` files are gone. See DECISIONS.md and
  `brand/README.md`. Still to see on a phone, on both Android 12+ and an older version.
- Reconcile the package version (`0.0.1`) with a real release number.

### 7. Housekeeping

- ~~CHANGELOG: the Feeds/Today line still says the 3D stack and full playback are deferred.~~
  Corrected, and 0.8.0 cut from Unreleased (2026-10-06); 0.9.0 is the first store release.
- `tmp/` holds a git bundle, the handoff prompt and a prototype backup. Decide what is worth
  keeping, move it, or ignore it, so the repo root is not half scratch. The two briefs of
  2026-10-03 moved to `docs/briefs/`.
- `docs/reference` is gitignored but `docs/README.md` points at it. Make sure a fresh clone's
  docs say where to get the prototype.
- No `CLAUDE.md`. Worth a short one with the commands, the ask first rules and the DECISIONS.md
  habit, so a new session starts warm.
- **A personal Capacitor walkthrough, for the developer, not the product (2026-09-29).** Once the
  app is done: a standalone, clickable HTML page (not published, not part of this repo's shipped
  output) walking through how this app actually uses Capacitor — the native/web bridge, the Android
  host, the plugins in use (`@capacitor/app`, `@capgo/capacitor-media-session`), the live-reload
  workflow, `CapacitorHttp`, foreground service/background audio — each part linked to the real
  code here rather than generic Capacitor docs. Requested because the developer is new to
  Capacitor specifically and wants a deeper, project-grounded understanding once the native surface
  has settled rather than while it is still moving.

### 8. Feed model audit

What YipDen can read today, from `packages/feeds` (profiles.ts, kind.ts, discover.ts). Everything
is **read only, over RSS 1.0/2.0, Atom or JSON Feed**. There is no platform API and no server. The
patterns below are read from the code and fixture-tested, but still need the live-account pass below.

| Source           | Supported how                                                                          | Known limits                                                                                |
| ---------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Blogs, podcasts  | `link rel=alternate`, fallback paths, RSS, Atom, JSON Feed                             | None known. Podcasts play in the player.                                                    |
| Bluesky          | Profile URL to `bsky.app/profile/<handle>/rss`                                         | Whatever Bluesky puts in that feed; no threads, no replies.                                 |
| Mastodon         | `/@handle` on any host to `/@handle.rss`                                               | Public posts only. An instance can turn RSS off. Other fediverse paths remain unrecognized. |
| Other fediverse  | Nothing specific                                                                       | Pleroma, Misskey and other server patterns remain unverified.                               |
| YouTube          | Channel id directly; handles and legacy custom URLs resolved from the channel page     | Opens the creator's page, never plays in app, by decision.                                  |
| PeerTube         | Known channel/account profile paths, then the feed announced on the page               | The instance must announce its feed; YipDen does not guess an instance-specific id.         |
| Discourse forums | Category, `latest`, `top` or `categories` URL plus `.rss`                              | Topic lists only; a person's activity feed is not a pattern yet.                            |
| Verification     | Candidates from `rel=me`, h-card and Schema.org `sameAs`; verified by two-way `rel=me` | Manual attachment and one-way metadata never imply ownership.                               |

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

Fixture coverage now includes Mastodon content warnings and sensitive attachments, PeerTube Media
RSS video metadata, and profile discovery for the current Mastodon, PeerTube and YouTube shapes.
Still open: check each row against a live account on a device, write down which rows fail, and decide
which of the “reader side” items belong in 0.9.x. New profile patterns stay isolated in
`profiles.ts` with fixtures.

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

Outside the Ring, Follow accepts a website, profile or direct feed URL and applies one 15-second
budget to the entire search, so a slow robots, profile or fallback probe cannot leave the UI stuck
on “Looking”. A feed pasted directly remains unverified unless the normal two-way link proves it.

Discovery was widened at the same time: a profile can be pasted directly; Schema.org `sameAs` is
read alongside `rel=me`; YouTube legacy custom URLs and either canonical-link attribute order are
accepted; the page's `externalId` wins over unrelated recommended `channelId` values; and ordinary
links no longer consume the profile scan budget before a useful link is reached.

**Second slice shipped 2026-10-01:** each failed check records why (could not connect, not found,
refused, the site's own error, robots.txt, not a feed, or over YipDen's safety limits) and You says
so, with the status code where there is one. A source that is gone, no longer a feed, or past the
automatic-check limit offers Replace: find where it moved (starting from the creator's own site),
and the new address only takes over once its first check succeeds. Item 9 is done; a device pass
on real dead feeds is still worth doing.

### 10. Calm feed controls

**First slice shipped 2026-09-25:** the per-creator source panel has individual switches,
creator-level pause/resume, and an explicit Check now action. Pausing stops fetches and hides that
source's cached yips without deleting it.

Feeds also groups conservative same-creator crossposts using explicit canonical/syndication links
first and tightly bounded content evidence second. The creator-owned copy is preferred, every copy
remains reachable, “Show separately” reverses the presentation choice, and read state is reconciled
across the group. Items from different creators are never merged.

Next, add optional per-source update frequency. Defaults stay chronological and finite; none of
these controls may become ranking or engagement tuning.

### 11. A broader readable web

**First slice shipped 2026-09-25:** direct profile input, Schema.org `sameAs`, legacy YouTube
custom URLs, a profile-budget fix, Mastodon content-warning and attachment handling, PeerTube Media
RSS metadata, and Atom/RSS canonical, syndication and reply relationships broaden the readable web
without adding platform APIs. Next, parse a small, tested `h-feed` subset when a page exposes posts
but no RSS, Atom or JSON Feed, then add a sanitized reader view for linked articles. Preserve the
original URL as the primary action and make fallback content visibly different from a
creator-published feed.

Reader view scope, agreed 2026-09-28 (see DECISIONS.md, not built yet):

- Honor `noai` (meta robots) and `X-Robots-Tag: noai` where the reader view fetches a page, the same
  way `packages/feeds/src/http.ts` honors robots.txt. It applies to the reader view's fetch only, not
  to feed or discovery fetches: YipDen has no AI, so the directive does not bear on following someone.
  Honoring it means no cleaned copy is rendered for that page, and only the original link is offered.
- The original URL is the primary action on every reader-view card.
- Fallback content, anything YipDen extracted rather than the creator published in their feed, is
  visibly styled differently from a creator-published item.

### 12. Portable YipDen backup

**Approved scope done 2026-09-25:** OPML remains the interoperable follows format. A versioned,
plain JSON YipDen backup now carries people, sources and provenance, preferences, read state and
cached yips. Import validates the whole file first, shows a count preview, merges existing data,
reports and skips identity collisions, and strips cached HTML before storage because it did not
pass through this install's sanitizer.

## Later: Discover's bottom bar and a first-run tutorial (evaluation, 2026-09-29)

**The prev/next buttons are removed (2026-09-29).** Swipe and, now, the `ArrowLeft`/`ArrowRight`
keys are the only ways to move through the ring. The keys were added in the same change, not
requested on their own: removing the only visible buttons would otherwise have taken keyboard and
switch-access navigation away entirely rather than just decluttering the screen, since swipe has
no keyboard equivalent of its own. Guarded the same way swipe already is (no sheet or partner ring
open, more than one member to move between). e2e specs that used to click these buttons now press
the arrow keys instead (`e2e/support.ts`).

**Filter moved next to Shuffle, and the node counter is gone, replaced by a real member list
(2026-09-30).** The top row is now ring-switch (when one is registered), Filter, Browse members,
Shuffle — nothing left at the bottom but the dock-clearance spacer `.bottom` still needs (see
DECISIONS.md). Browse members opens a sheet listing whichever members the active filter leaves
visible, tapping one jumps straight there (`ring.jumpTo`) rather than stepping one at a time.
Shuffle shows the same active-state treatment Filter and the ring switcher already had
(`.is-active`) so leaving "shuffled" mode is not silently unmarked now that its own status text is
gone. Scaling to ~1,000 nodes needs no change: the ring client's own fetch/validation already caps
at 5,000 entries and 1MB per fetch (`packages/ring-client/src/validate.ts`), and the member list is
a plain, unvirtualized list, fine at that size (virtualization would only matter well beyond it).

Still open from this batch:

1. **Swipe needs to actually be taught**, not just left discoverable by accident, now that the
   prev/next buttons that used to double as a hint are gone: a modal prompt on first launch, or a
   proper first-run tour, are both on the table (decided 2026-09-29, not yet built).
2. **First-run tutorial: Driver.js is the recommended library** (no dependencies, small, MIT
   licensed) if a guided tour is built, chosen over Shepherd.js or Intro.js because it fits this
   app's own posture — self-hosted, `script-src 'self'`, nothing loaded live — and would be bundled
   at build time like every other dependency here, never fetched from a CDN. Recommendation: hold
   off on a full guided tour in favor of a couple of one-time, dismissible hints on the least
   obvious actions first; a tour is an ongoing commitment (steps to keep in sync with the UI, a
   library to keep current) this app has otherwise avoided by making things discoverable in the UI
   itself rather than explaining them. **(ask first: a new dependency, even a small one.)**

## Encrypted store and reference finds (briefs of 2026-10-03)

Two briefs, kept as given in [docs/briefs/](docs/briefs/): a revised [v0.9 brief](docs/briefs/v0.9.md)
and [reference finds](docs/briefs/reference-finds.md). The revised v0.9 brief mostly describes what
has shipped. Its tab names and auto-advance predate decisions already in DECISIONS.md, which
stand. It adds three things the code does not do yet, folded in below. The reference finds brief
widens the audio find to comics, games and writing under one `Reference` model, and moves the
on-device store into an encrypted SQLite database.

**Gate: items 1 to 4 land before 0.9.0**, so no released build ever holds plaintext data that has to
be migrated out of a reader's phone. Items 5 to 7 follow in 0.9.x. Decided 2026-10-03; the reasons
are in DECISIONS.md.

1. **Partner cards' Listen opens in the in-app browser** (requested 2026-10-03). The sample button
   uses the same path as Visit, so audio found on that page can be kept for the member. With the
   setting off, or on the web build, it opens externally as before. **Done 2026-10-03**; to see on
   a phone.
2. **`FeedSource`, stable ids, WebSub hubs** (v0.9 brief gaps). Refresh goes through a `FeedSource`
   with one `DirectFetchSource`, so it no longer calls `httpFetch` itself. It fetches feeds in
   batches, with a cursor per feed and an error per feed. A yip's id becomes a hash of the feed's
   canonical URL and the entry's own id, the same on every device. A feed's hub is recorded and
   not used. New ids are written only through item 3's migration. **Done 2026-10-04**: the
   interface and the id layout are in DECISIONS.md; stored keys are unchanged until item 3.
3. **Encrypted store.** `@capacitor-community/sqlite` with SQLCipher, and its key in the Android
   Keystore through `@aparajita/capacitor-secure-storage` (both approved by the brief; check both
   support Capacitor 8 and are not deprecated before installing, and ask if not). Same `Store`
   interface. The web build uses IndexedDB with values encrypted by a non-extractable WebCrypto
   key, which is weaker and documented as such.
   - A one-time migration moves the IndexedDB data into the new database, re-keying yips to the
     stable ids with their read state intact. It checks the result, then deletes the old database,
     and survives being interrupted.
   - Leak hardening: `fullBackupContent` for Android 11 and lower (12+ is already excluded), the
     WebView cache of creator media cleared when the app closes, and no reference URLs or snip
     text in logs.
   - **Built 2026-10-04**, with the key kept by the sqlite plugin alone (no second plugin; see
     DECISIONS.md). Still to see on a phone: an upgrade carrying real data, the file unreadable
     without the key, and how long the first launch takes.
4. **The `Reference` model.** One record for audio, image, screenshot and text. Reader tracks
   migrate onto it and keep their UI. Platform embeds (Bandcamp, SoundCloud, YouTube, Spotify,
   Apple Music) stay, as links that open on the platform: `hostVerified: false`,
   `sharable: false`. The backup carries references, and still reads an old backup's tracks.
   **Done 2026-10-04** (DECISIONS.md). A writing snip exports as its link only until text capture
   is tested on a phone; exporting the passage is approved after that.
5. **Capture rules.** A media file must be on one of the creator's own sites (after redirects), and
   actually linked on the page where it was found. `robots.txt`, `noindex` or `X-Robots-Tag` on
   that page mean `sharable: false`. A reference is re-checked with a conditional GET when it is
   opened and occasionally on resume, and becomes `gone` when the file or the link disappears.
   Tested against fixture pages. **Done 2026-10-04** (DECISIONS.md). Known limit: a host shared by
   path (`example.club/~lena`) counts as everyone's on it.
6. **Capture flows: comics, then games, then writing.** The injected page script notices a
   long-pressed image or a text selection. YipDen's toolbar button, still the only trusted path,
   then offers it in "Found on their page". A writing snip keeps at most 500 characters plus a
   little context, and opens the creator's page scrolled to the passage with a Text Fragment
   link. Images always load live from the creator's host and are never saved.
   **Done 2026-10-04** (DECISIONS.md); to see on a phone, which item 7 covers.
7. **Phone pass** on a numbered debug APK: an upgrade with real data, the database unreadable
   without the key, nothing in `adb backup`, a re-upload on another host refused, a snip scrolling
   to its passage.

## The Library and Forums (brief of 2026-10-04)

From [docs/briefs/library-and-forums.md](docs/briefs/library-and-forums.md).

1. **The Library (Part 1).** The audit is in [docs/you-page-audit.md](docs/you-page-audit.md).
   **Built 2026-10-04** (DECISIONS.md), to see on a phone.
2. **Forums (Part 2). Built 2026-10-05** (DECISIONS.md), to see on a phone: follow public Discourse
   forums whole or by category, a Forums pill in Feeds with one card per topic, a forums screen
   under You, OPML and backup. On Android only until v2.0's proxy (a browser cannot read another
   site's forum JSON). Still open: a forum's own new-topic notifications belong with v2.0's
   notifications.

## Later: v0.9 release

Blocked on items 1 to 4 of "Encrypted store and reference finds" above.

1. Release signing: a Play Console identity and an upload keystore, stored as GitHub secrets, per
   [docs/ci-cd.md](docs/ci-cd.md).
2. A release build (AAB), with a check that the cleartext refusal still holds in it.
3. Play listing: description, screenshots (the screenshot script already exists), privacy policy,
   data safety form (nothing collected).
4. Branch protection with CI marked required.
5. Tag `v0.9.0`.

## Later: after 0.9

Multiring inclusion: the surface exists (2026-09-28, see above) and two real adapters ship
(2026-10-02). A further ring is ask first. Treat each ring as a provider
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

### Shared feed cache (from the revised v0.9 brief)

A poller in or beside `apps/api` fetches each feed once and serves it to every reader. It reuses
`packages/feeds`, runs on a Postgres-backed queue, and subscribes over WebSub wherever a feed
advertises a hub. The reader gets a `CachedSource` that falls back to `DirectFetchSource` for each
feed, so reading keeps working when the backend is down. A paste-a-link feed is polled only when a
client asks for it, and the cache never records who asked. The same deployable serves the web
build's fetch proxy, which blocks private and loopback addresses, including after redirects. The
stable ids and `FeedSource` work before 0.9.0 (above) is what makes this swap possible without
touching the UI.

### References, shared (from the reference finds brief)

Built on the `sharable` flag that 0.9 computes and stores, but does not use yet.

- **A shared community index**, which needs accounts. It holds pointers only, never media or snip
  text: a writing snip is shared as a selector and a hash, and each client matches it against the
  live page. Saves are anonymous ("N people saved this", never who). Dead links are swept on the
  server.
- **Partner-ring creator protections:**
  - An account-free opt-out ("remove references to my site"), and respecting an opt-out meta tag or
    well-known file. It applies to the whole site until reversed.
  - Pages labelled "Found by listeners from [ring], not affiliated", always linking out.
  - Claiming through IndieAuth, with hide, remove and pin.
  - A report button, a takedown contact, and a registered DMCA agent.
- **Own-ring opt-in:** a `community_refs` field in `ring.json`. **(ask first: a contract change.)**

### New yip notifications (deferred to here, decided 2026-09-28)

Deliberately not started in v0.9. A foreground-only version (notify from refreshes that already
happen: open, pull-to-refresh, resume) could be built now with one native dependency and no
background execution, but it would be thrown away once real delivery exists here, since v2.0 is
where a server and a sync `Store` make actual push (FCM-backed) possible instead of a local
approximation. Building the throwaway version first is double work; wait for the backend.

**The scale problem is the design work, and applies whichever delivery model lands:** at a few
hundred or a thousand follows, one notification per yip is unusable. Whatever ships:

- One notification per delivery cycle, never per yip. A cycle that finds anything new fires a
  single grouped summary ("14 new yips from 6 people"), not one push per item.
- A "last notified" cursor kept separate from read state, so a slow cycle or a paused-then-resumed
  feed never double-notifies or dumps a backlog as one blast.
- A floor between notifications regardless of how many cycles land in a window, so a burst of
  simultaneous feed updates cannot page someone repeatedly.
- Per-source mute, the same posture "calm feed controls" already has for feeds themselves.

**Default state, decided:** notifications on by default, with the control to change that surfaced
at the moment of following someone, not buried later in You. The exact trigger UI (a toggle on the
follow confirmation, a toast with a settings link, or something else) is undecided and should be
designed against the real screen once the backend exists, not guessed at here.

## After 0.9.0: reader controls (order agreed 2026-10-02)

Built on a branch now, released as 0.9.x. All four are local, with no server and no native
dependency. None may become ranking.

1. **Folders and a creator filter on Feeds (done 2026-10-02).** One folder per person, set from
   their row in You. A Filter button in the Feeds header opens a sheet, the same pattern as
   Discover's Filter, listing folders and people. Folders round-trip through OPML and ride in the
   backup. Still open: renaming a folder in one step, a folder choice at the moment of following,
   remembering the filter across launches, and a device pass.
2. **Mute and Muffle rules.** Keyword rules applied across every feed: Mute hides a yip, Muffle
   collapses it to one line that opens on a tap. Stored locally and in the backup.
3. **Search in Feeds**, over cached yips.
4. **Text size setting.**

## Browsing rings, and audio a reader finds (2026-10-02)

Shipped on the branch, not yet seen on a phone:

1. **Explored marks and kept position** in partner rings and IndieNodes.
2. **Reader tracks by link and layout overrides**, per creator.
3. **The in-app browser** with YipDen's toolbar button and the "Found on their page" sheet.
   Security review and v2.0 rules in docs/security.md.

Still open:

- A device pass: the toolbar icon, whether real ring sites' audio is found (self-hosted files,
  Bandcamp and SoundCloud embeds), Back inside the browser, and that an `http://` page is refused.
- Reader tracks for a followed person do not show in Feeds; they live on the person's row and in
  the notes sheets.
- Whether the in-app browser should also open Feeds' "Open on site" links. Today only Discover and
  partner rings use it (a partner card's Listen too, from 2026-10-03).

## Listen embeds (branch `listen-embeds`, 2026-10-06)

Built, to see on a phone (debug builds 26 to 31):

- Kept YouTube, SoundCloud and Bandcamp tracks play in the app's player through each platform's
  own player. SoundCloud's runs out of sight, with its artwork and waveform shown instead.
  Bandcamp plays with its own controls.
- Previews in "Found on their page" play apart from the player. Keep is offered only for what can
  be kept, and an expiring Bandcamp stream offers its lasting player instead.
- The end of a queue offers more from the ring or a shuffle of the Library.

Still open:

- Spotify: its player script would not load on the phone. The spike now logs why.
- Whether an embed keeps playing with the app in the background.
- Deleting the embed spike, and its CSP origins, once both are answered.

## The Creator Database (decided 2026-10-06)

YipDen is a **Creator Database** and a **Mobile Friendly IndieWeb Surfing Tool**. The aim is one
profile per creator, gathered from wherever they are, even where the app cannot read. It is
website-first, not website-only, and ranked by evidence, never by votes.

1. **The creator profile (built 2026-10-06; to see on a phone).** A view over what is already
   kept, plus their own site's h-card, description, picture and `rel=me` places. It replaces the
   "Your notes" sheet. See DECISIONS.md.
2. **Home and aliases (built 2026-10-06; to see on a phone).** One creator, several addresses. Their home is the best address known:
   their own domain, then a hand-made hosted site, then an open-platform profile, then a closed
   one. A "these are the same person" merge. Existing keys stay as they are.
3. **Places with an evidence level (built 2026-10-06; to see on a phone)**, one stored list per creator. From strongest:
   1. a two-way `rel=me`
   2. linked from their own site
   3. found on their page
   4. added by you

   Filled in from their site's `rel=me` links automatically. A shop or commission place type.

4. **v2.0: the shared contributions table**, mirroring step 3, ranked by evidence and liveness.
   Opt-out, claiming (IndieAuth), report and takedown ship with it, not after. This folds in the
   "shared community index" and "claimed creator pages" items under v2.0.

Creator types (comics, cosplay, crafts, voice-over, video) are covered by kinds of media and
place, plus the ring's `form` deciding what a profile shows first. No separate features per type.
Comics are the first non-audio type to prove end to end.

## Sites and Surf (experiment, branch `sites-surf`, 2026-10-07)

A visual index of indie web sites beside the ring, judged on a phone before it is kept. The
contract is [docs/sites-contract.md](docs/sites-contract.md); the reasoning is in DECISIONS.md.

1. **Seed and sites layer (done).** Twelve sites bundled, posters and six clips.
2. **People | Surf in Discover (built; to see on a phone).** The hero is untouched.
3. **Following sites, the way forums are followed.** People | Sites | Forums in Follow and Feeds;
   Forums may fold into Sites later.
4. **Search across both sides, and a site page with "Made by" from evidence only.**

To judge on the phone: does Surf feel like YipDen or a second app inside it; does the hero still
feel central; do clips judder in the stack, and what do they cost in data.

## Your own webrings (proposed 2026-10-06; ask before building)

A reader pastes a webring's address and browses it like a partner ring. It stays on their
phone, labelled as theirs. This changes the "an explicit adapter per ring" rule above, so
instead of accepting any JSON, one generic reader understands the three formats real rings use:

1. an IndieNodes-style `ring.json` (already validated by `ring-client`)
2. an onionring `variables.js` member list, read as text and never run
3. a plain HTML members page, read as a list of links

Every member passes the same address checks as a partner ring's.

## Code audit at 0.8.0 (2026-10-06)

Done in the audit:

- **One `hostOf`** (`lib/hosts.ts`) in place of ten copies and a dozen inline host strippings.
- **One list of sources** (`lib/sources.ts`): each feed kind's name and color, and the platform
  hosts that profiles and homes both use. It replaced five label maps, two color sets and two
  host lists.
- **One `Sheet`** for the standalone bottom sheets (Feeds' filter, a partner ring's filter,
  "Same person as…", "Found on their page"). It holds the backdrop, panel, title, close button,
  Escape and Back that each repeated.
- **One `Segmented`** for the People | Forums switches in Feeds and Follow.
- **One `KeepByLink`**: keep by link starts from what it is, and the track list is only a list.

Left for later, noted here so they are not lost:

- Discover's own sheets (actions, filter, members, rings) and the player's queue sheet still draw
  their own frame. Moving them onto `Sheet` needs care around Discover's swipe guards.
- ESLint does not read `.svelte` files (no `eslint-plugin-svelte`). An unused import there is
  only found by hand. Adding the plugin is a dev dependency: **ask first**.
- The person glyph SVG is drawn in five places; a small icon component would hold it.
- `routes/+page.svelte` (Discover, ~1,700 lines), `routes/you/+page.svelte` (~1,500) and
  `PartnerRingPanel.svelte` (~1,200) are the largest files. Each has parts that could be
  components (Discover's hero, You's person row).
- The embed spike (`EmbedSpike.svelte`) and its CSP origins go once Spotify and background
  playback are answered.

## Later: Feeds' header collapses while scrolling (noted 2026-10-06)

The header above the card stack takes much of a phone's height, and a tall card had little room
under it. Collapsing it to a slim bar as the cards scroll, and bringing it back on a scroll up,
would give the stack that room. Not started: the stack's pin offsets and the tail sizing would
both have to follow the header's height as it changes.
