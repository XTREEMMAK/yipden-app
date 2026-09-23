# Changelog

Every notable change to YipDen, newest first. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- `packages/feeds`: discovery, polite fetching, and one `Item` type out of RSS 2.0, RSS 1.0,
  Atom and JSON Feed. Discovery works in order of decreasing confidence, from a page that
  announces its own feed down to a guessed path, and returns a list the reader toggles rather
  than following anything automatically. Verification means a two way `rel="me"`.
- `FeedHttp`: conditional GET, one request at a time per host, `robots.txt` honored and cached,
  an honest User-Agent, redirects followed by hand with every hop checked, and caps on response
  size and time.
- An allowlist HTML sanitizer and a plain text flattener, tested against script injection,
  event handlers, unsafe URL schemes and mutation XSS vectors.
- `apps/reader`: the app shell. SvelteKit with `adapter-static`, Svelte 5 runes, design tokens
  and self hosted fonts, the motion system, the tab bar, screen transitions through the View
  Transitions API, and the shared swipe primitive.
- A `Store` interface with one IndexedDB implementation, covering follows, yips, read state,
  the cached ring, waveform peaks and settings.
- The Android host: Capacitor 8, package `com.yipden.app`, minSdk 26, targetSdk 36, cleartext
  traffic refused at the platform level, and no cloud backup of a reader's data.
- Discover: the ring as a full bleed hero, opening on the node of the day, walked by swipe or
  by button, filtered by chips, shuffled, and rendering from cache when the ring cannot be
  reached. One tap follows a member everywhere they publish.
- A script that screenshots the build beside the reference prototype at 390x844 in both themes.
- Follow: paste a link, see every feed discovery found, toggle which of it to keep, and follow
  only what was left on. A dev only Vite proxy lets the browser try real feeds in development,
  enforcing the same address safety rules as the rest of the app, without ever shipping.
- The refresh pipeline: `refreshAll` fetches every followed feed conditionally, categorizes each
  item into Posts, Watch or Listen from its media, and stores it without disturbing a reader's
  existing read state. One feed failing never stops the rest, and a feed past five consecutive
  failures backs off from automatic refreshes.
- Today: the merged, reverse chronological feed in four panes a reader pages between by pill or
  by swipe, with a measured sliding indicator, pull to refresh, a background catch-up on the
  first visit after following someone, and a "From the ring" section of ring tracks in Listen.
  Media and text cards match the reference prototype. The 3D card stack and the full playback
  experience (the shared audio element, the mini and full screen players, Media Session) are
  deferred; see DECISIONS.md.
- You: the theme picker with a measured sliding indicator, the follow list with an inline
  Unfollow / Keep confirm, OPML export and import (with the same URL safety checks as
  everywhere else), and clearing cached yips without touching follows.
- The player: one shared `HTMLAudioElement` for the whole app, a mini player docked above the
  tab bar with the slow pulse while playing, and a full screen player with a wavesurfer.js
  waveform, backed by a hidden range input for keyboard and screen reader seeking, that falls
  back to a plain progress bar with no error shown if decoding fails. Waveform peaks are cached
  on device keyed by media URL and ETag, so a track decodes at most once. Speed (1x-2x), a
  queue with Up next, Media Session metadata for lock screen controls, and swipe to collapse or
  expand with a button equivalent for every gesture. Only a listen yip opens the player; a
  watch yip still opens the creator's page, per the brief.
- Today's 3D card stack: cards stand up as they rise, pin, tip back and dim as the next card
  slides over them, driven by `animation-timeline: view()` where it exists and a
  `requestAnimationFrame` fallback with the same geometry where it does not. Only the front
  card takes taps. Disabled under reduced motion, which keeps the flat, staggered list.
- The card-to-player shared element morph: opening a listen yip carries its card's art and
  title into the full screen player through a real `document.startViewTransition`, with the
  player's gradient, header and body fading and rising in only once the art has landed. Falls
  back to the plain slide up wherever the browser lacks view transition support, the reader has
  asked for reduced motion, or the card has nothing to morph from.
- Lock screen and notification media controls, and reliable background playback, through
  `@capgo/capacitor-media-session`. See DECISIONS.md for why this plugin over the alternatives.
- The Android hardware and gesture back button now steps back through Discover, Today, Follow
  and You's own navigation history before it exits the app, matching every other Android app,
  instead of exiting on the first press.
- Discover's WebGL hero: a hand-written displacement wipe between two member photos in the
  swipe direction, a liquid bend while dragging, and a slow ambient drift at rest, ported from
  the reference prototype's own shader. The plain CSS crossfade it was built on top of never
  stops running underneath, so any failure, no WebGL, a photo host with no CORS headers, a lost
  context, falls back to it rather than a blank canvas. See DECISIONS.md.

### Fixed

- Discover's incoming name and "why" text flew in from straight below regardless of swipe
  direction; it now flies in from the edge the swipe (or the prev/next buttons) actually came
  from, matching the hero image's own motion.
- Today's card stack could be tipped further than intended by a normal overscroll past the
  pane's top or bottom, since the rubber band bounce briefly reports a `scrollTop` outside the
  pane's real bounds. The bounce is now suppressed on that one pane rather than every scroll
  area in the app.
- `--dock`, the token every scroll area's bottom padding, Discover's bottom section and the
  mini player's position are all measured against, did not account for
  `env(safe-area-inset-bottom)`, even though the tab bar it is meant to clear does. On a phone
  with a tall gesture navigation inset (found on a Galaxy S23 Ultra), this hid Discover's
  filter chips, the mini player, and the bottom of any scrolled-down list behind the real
  system bar despite scrolling having reached its actual end.
- The hardware back button fix above did not actually fire on the device: it overrode the
  deprecated `Activity.onBackPressed()`, which Android's predictive back gesture, on by default
  at this app's `targetSdkVersion`, does not reliably dispatch through. It now registers an
  `OnBackPressedCallback` with `OnBackPressedDispatcher` instead, the currently supported path.
- A listen card's `content-visibility: auto` placeholder assumed 200px, its media card height,
  rather than its own real 172px, which could throw off a long Listen pane's measured
  `scrollHeight` while cards below the fold had not actually been rendered yet.

### Changed

- The tab bar is 72px tall, down from the prototype's 84px, which real use found took up more
  of the screen than four tabs need.
- The mini player can now be stopped and dismissed outright, not only collapsed or paused:
  a new close button pauses playback, hides the mini player, and clears the lock screen and
  notification widget rather than leaving it paused.
- The Today tab is now Feeds, renamed throughout (route, state module, types, ids, UI copy),
  not just in the tab label. See DECISIONS.md.

## [0.0.1] - 2026-09-22

The first commit. Workspace, tooling and the ring client.

### Added

- pnpm workspace with TypeScript in strict mode, ESLint, Prettier and Vitest.
- `packages/ring-client`: a framework agnostic, dependency free client for the IndieNodes
  ring document. Conditional GET with ETag and If-Modified-Since, an injectable fetch and
  cache, per entry validation that never discards the whole ring, URL safety checks, a
  deterministic daily rotation, shuffle, and filters by type, form and tag.
- A JSON Schema for the ring document as a reader consumes it, checked against the live ring,
  an extended ring carrying the fields the ring does not emit yet, and a hostile fixture.
- Repository documentation: architecture, security, the ring contract, CI and decisions.

[unreleased]: https://github.com/XTREEMMAK/yipden-app/compare/v0.0.1...HEAD
[0.0.1]: https://github.com/XTREEMMAK/yipden-app/releases/tag/v0.0.1
