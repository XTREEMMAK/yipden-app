# Changelog

Every notable change to YipDen, newest first. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Discover previews by type: audio members get Play, comics, art and text open a paged viewer
  of their pages, artworks or excerpts, games open their trailer or preview link, and a member
  with nothing to preview has no button. See DECISIONS.md.
- Music shuffle, on by default: a music member's tracks are queued in a shuffled order, and You
  has a Playback switch for it. Spoken word keeps its order.
- Drag to reorder the queue by its grip (arrow keys work on the grip too).

- Android Back, and the browser's, now collapses the full player instead of leaving the screen
  underneath it, through a history entry the player pushes while open. Adds `@capacitor/app`.
  See DECISIONS.md.

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
- Live reload for Android: `CAP_LIVE_RELOAD_URL` points an installed debug build at `pnpm dev`
  instead of its own bundled files, so a web layer change reaches the device the moment Vite
  rebuilds it, with no further rebuild or reinstall. Never set for a real build. See
  `docs/android-testing.md` and DECISIONS.md.
- Continuous play of the ring. "From the ring" in Listen is one card per member (cover, track
  count, play, and a "+" to queue) instead of a flat list of every track. Playing a member starts
  a session that stops at the end of their tracks and asks whether to keep going with someone
  new, chosen by `suggestNextEntry` (new in `@yipden/ring-client`: tag overlap, same form,
  never a repeat). A queue panel in the full player lists everything queued, with jump to a
  track, move earlier or later, and remove. The session survives closing the app, restored
  paused in the mini player. See DECISIONS.md.

### Fixed

- Dismissing the mini player made Discover's text (and Feeds' and the other lists' bottom
  padding) jump to its new position, because the dock changes height at once. The padding now
  eases to it.
- Discover's name, "why", tags and buttons arrived all at the same instant; as in the prototype,
  each line now comes in a beat after the one above it.

- Discover's WebGL wave never appeared on a phone even with photos loading: the wipe shader used
  half precision floats, which phone GPUs default to and its noise function cannot survive. It now
  uses full precision where the GPU supports it.

- Discover's wave still did not appear on a phone even once photos could be drawn: the photo
  was still downloading when the wipe ran, so the wipe finished unseen and the canvas only popped
  in afterwards. The neighbouring members' photos are now preloaded, so they are ready before a
  swipe or a tap on next or previous.

- Discover: members whose photo host sends no CORS headers lost their cover (a flat color was
  drawn over it), and the wipe looked absent on the device. The canvas is now shown only for
  photos it can actually draw, everything else shows through the CSS layer as before, and on
  Android hero photos are loaded through the native HTTP client so they can be drawn at all.
  See DECISIONS.md.

- After a swiped (not tapped) Discover change, the name and "why" still appeared to enter from
  the wrong side: the text block was left offset by the drag and eased back to centre while the
  new text flew in from only 32px, so the two motions cancelled into the wrong direction. The
  block now snaps to centre on commit and the text enters from roughly a third of the screen
  width, from the side opposite the swipe.

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
- Feeds' pull to refresh indicator was a normal flex sibling of the card list, so pressing down
  at the top of the scroll (before any actual drag) inserted its own height into the layout,
  pushing every card down and then back up on release. It is now an absolutely positioned
  overlay, which cannot move anything else. See DECISIONS.md.
- The WebGL hero kept retrying a photo host that had already failed, once per navigation, so a
  session where the first photo failed (the common case for a personal site with no CORS
  headers) looked like the hero was doing nothing rather than falling back. The first fix for
  this disabled the wipe for the rest of the session after that one failure, which turned out
  to be its own bug once tested against the real ring: since nearly every real photo fails
  CORS, the wipe effectively only ever ran once. It now paints a solid fallback in the member's
  own wash color per photo that fails, rather than giving up on the hero itself, so the wipe
  runs on every navigation regardless of whether any given photo loads. See DECISIONS.md.
- The WebGL wipe travelled the wrong way: next revealed the incoming photo from the left,
  previous from the right, backwards from both the reference prototype and this app's own
  text motion (which already entered from the correct edge). `HeroArt.svelte` was handing the
  shader's `dir` uniform this app's own swipe-direction convention unnegated; the two are
  opposite sign conventions by design, and only the shader's own call site needed the fix.
  See DECISIONS.md.
- A committed swipe's wipe transition always restarted from zero bend rather than continuing
  from wherever the live drag preview had already stretched it to, unlike the reference
  prototype. The drag fraction at release is now threaded through to the transition. See
  DECISIONS.md.
- Feeds' filter pills hugged the left edge of the header on a wide screen, ported unchanged
  from a prototype CSS rule that never had to answer this question inside its own fixed mobile
  frame. They now stretch to fill the header's full width on a phone, and center themselves at
  their natural width past 600px instead. See DECISIONS.md.
- A latent Android manifest merge conflict (`capacitor-cordova-android-plugins` declares
  `usesCleartextTraffic="true"`, this app declares `"false"`) would fail any genuinely clean
  build or one on CI without a warm Gradle cache; only masked locally because nothing had
  invalidated the cached merge result since the very first build. Fixed with an explicit
  `tools:replace`. See DECISIONS.md.

### Changed

- Discover's Preview and Visit site buttons are icons, sharing a row with Follow everything, and
  the IndieNodes webring chip is gone from the hero; You has an About entry, How Discover works,
  that names the webring as where Discover's members come from.

- The full player's main controls are Previous, play and Next; Previous restarts a track that has
  played more than three seconds. Speed is a small chip beside the times, and the 15 and 30 second
  skip buttons are gone from the screen (the waveform, its keyboard slider and the lock screen
  still seek).
- Discover shows the position once (the chip now says Node of the day or IndieNodes webring, and
  the counter carries the filter), and Feeds' section is titled From the IndieNodes webring
  without the ring.json note.

- The mini player's progress runs along the bottom edge of the card with a moving highlight while
  playing, and the card fades out when dismissed.

- The tab bar is 72px tall, down from the prototype's 84px, which real use found took up more
  of the screen than four tabs need.
- The mini player can now be stopped and dismissed outright, not only collapsed or paused:
  a new close button pauses playback, hides the mini player, and clears the lock screen and
  notification widget rather than leaving it paused.
- The Today tab is now Feeds, renamed throughout (route, state module, types, ids, UI copy),
  not just in the tab label. See DECISIONS.md.
- Discover's filter chips are now a single Filter button next to prev/next, opening a bottom
  sheet that lists every option, rather than a horizontal-scroll chip row competing with the
  prev/next controls for space right above the tab bar. See DECISIONS.md.

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
