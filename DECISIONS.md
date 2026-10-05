# Decisions

Choices that differ from the brief, or that the brief left open, with the reasoning. Newest
last. A decision here is not permanent; it is a record of what was chosen and why, so a later
change is an argument rather than a discovery.

## 2026-09-22: Android testing runs on this machine and a real phone, not an emulator

The development machine is a headless KVM guest with no `/dev/kvm`, so a hardware accelerated
Android emulator is not available on it. Installing one anyway would mean software rendered
frames, which is the worst possible surface on which to judge a product whose motion is part of
the specification.

**So the loop is: browser for the daily work, a real device for native work.** The JDK and the
Android command line tools live on this machine and build the APK; a physical phone runs it,
reached over wireless ADB or by installing a downloaded APK. Everything that is web technology
is checked in the browser at 390x844 against the prototype, which is most of the app.
See [docs/android-testing.md](docs/android-testing.md).

## 2026-09-22: The reader validates the ring more loosely than the ring publishes it

`indienodes-ring` requires `id`, `creator`, `type`, `why`, `source_url`, `tags`,
`verification_token` and `joined_at`, and adds conditional rules per type (a comic must have
`pages`, an audio entry must have `form`).

**The reader requires only `id`, `creator`, `type` and a usable `source_url`.** The ring
enforces its full contract before anything is published, so a reader repeating those checks
only adds a second way for a member to disappear from someone's app over a field that member
never sees. A missing `verification_token` is a publishing concern; it is not a reason to hide
a creator from a reader. Everything else is treated as optional and filled in by `normalize`.

Entries still fail individually, with a reason, and the reasons are returned to the caller
rather than swallowed.

## 2026-09-22: URL safety is enforced in ring-client, not at each use site

Ring data is third party input that reaches the device as a link, an image source and an audio
source. `src/url.ts` refuses anything that is not https, anything carrying embedded
credentials, and any private, loopback, link local or carrier grade NAT host, including IPv4
mapped IPv6 addresses in both the readable and the hex spelling that the URL parser produces.

The alternative, checking at each use site, guarantees that one component eventually forgets.
The brief asks for this on the feed side; applying it to ring data too costs nothing and closes
the same hole. See [docs/security.md](docs/security.md).

## 2026-09-22: Rotation walks the ring sorted by id, not in document order

The brief asks for a deterministic daily seed "so every client agrees." Seeding from the date
is not enough on its own: two clients that fetched `ring.json` at different moments can hold
the same members in a different array order, and would then disagree about who today's member
is and about what `next` means.

**So `rotationOrder` sorts by `id` before anything else reads it.** It also drops members with
`discoverable: false` and rows marked `_placeholder`, which are respectively a creator's own
opt out and a seed row that was never a person.

## 2026-09-22: Explicit entries are hidden by default, which the brief does not mention

The ring's schema carries a self declared `explicit` boolean, documented there as "hidden by
default; visitors opt in to seeing it in Settings." The brief for this app never mentions the
field.

**The reader honors the ring's rule**: `filterRing` excludes explicit members unless
`includeExplicit` is passed. The opt in has no home in the v0.9 You screen yet, so today the
effect is that explicit members do not appear. This is the conservative direction to be wrong
in, and it is flagged here because it is a product behavior that was inferred rather than
specified.

## 2026-09-22: The XML parser is a dependency, not hand written

The brief calls `packages/feeds` "plain TS" and specifies "XML parser with external entities
disabled." Two ways to get there: write a tokenizer, or take a dependency.

**`@rgrove/parse-xml` was chosen**, at 212KB unpacked with zero dependencies of its own and an
ISC license. The deciding property is not speed: it does not implement external entities or DTD
entity definitions **at all**, so XXE and billion laughs are not attacks it can be configured
against and then misconfigured back into. `fast-xml-parser`, the obvious alternative, pulls six
transitive dependencies and 1.3MB, and disables entity processing through an option that
someone can later turn back on.

Hand writing the parser was rejected for the ordinary reason: XML from strangers is exactly the
input where a homemade parser's edge cases become someone else's exploit. Both attacks have
fixtures in `test/fixtures/` and are asserted against, so the claim is tested rather than
assumed.

## 2026-09-22: v0.9 renders plain text, and the HTML sanitizer is defense in depth

The clean reader view is explicitly out of scope for v0.9, and the prototype's cards show plain
text. So the app calls `htmlToText`, and no feed markup reaches the DOM at all.

`sanitizeHtml` is still written and still tested hard, because `Item.contentHtml` is part of
the shape the brief specifies and the reader view will want it. It is an allowlist
re-serializer rather than a filter: markup is tokenized and the output is rebuilt from known
safe elements with all text escaped, so nothing passes through as a raw substring. That is the
property that matters against mutation XSS, where a browser re-parses markup a filter approved
and reaches a different tree than the filter saw.

The consequence worth stating: **rendering `contentHtml` anywhere is a decision, not a default.**
When the reader view is built, that is the moment to revisit the allowlist, not before.

## 2026-09-22: A feed's date can be null, and null is a real answer

Feeds publish malformed dates constantly. The tempting repair is to stamp the item with the
current time so it sorts somewhere.

**That repair is refused.** A yip stamped "now" because its feed had a broken date jumps to the
top of a chronological reader and stays there, which is a false ranking in a product whose
first rule is that there is no ranking. Undated items sort to the end, and a date more than 48
hours in the future is discarded for the same reason: otherwise any feed could pin itself to
the top of everyone's Today by lying about tomorrow.

## 2026-09-22: On device storage is IndexedDB, with no native plugin

The brief says storage lives on device "SQLite via Capacitor, or IndexedDB on web," behind a
`Store` interface with one implementation. SQLite through Capacitor means
`@capacitor-community/sqlite`, which is a native dependency, and native dependencies are asked
about before they are added.

**IndexedDB was chosen for both, so there is one implementation rather than two.** It works
identically in the Android WebView and in a browser, which means the code path exercised in
development is the code path that ships. A second implementation would double the surface and
halve the testing of each half.

The `Store` interface is unchanged by this: it is the door v2.0's syncing implementation comes
through, and it would be the door a SQLite implementation came through too, if IndexedDB ever
proves too slow on a real device with a real number of yips. That is a measurement nobody has
taken yet, and taking it is cheaper than guessing now.

## 2026-09-22: The app does not back itself up to anyone's cloud

`allowBackup` is false and the Android 12 data extraction rules exclude everything, so neither
Google's cloud backup nor device to device transfer carries a reader's data off the phone.

What a person follows and what they have read is a record of what they read and when. The
product's promise, written on the Follow screen, is that the follow stays on the phone and
nothing is posted anywhere. A silent backup of exactly that record to someone else's cloud
would be a quiet exception to a promise made in plain words on screen.

A reader who wants their follows somewhere else exports OPML from You, which is a decision they
make rather than one made for them.

## 2026-09-22: Discover's white pill uses a fixed ink, against the prototype

The reference prototype styles the "Follow everything" button as `background:#fff` with
`color:var(--ink)`. In dark mode `--ink` becomes `#F3EAE3`, so the label is near white text on
a white pill. Screenshotting the build beside the prototype at 390x844 in both themes, which is
the step the brief asks for after every screen, showed it immediately: readable in light,
invisible in dark.

**The app uses a fixed `#1F1410` there instead.** Discover is dark in both themes by design, so
nothing on it should take a color from a token that flips. This is a deliberate departure from
a prototype that is otherwise authoritative for tokens, and it is recorded because the rule it
serves is one that does not bend: 4.5:1 contrast, including text on images and on orange.

The same reasoning applies anywhere else a fixed dark surface uses a theme aware ink, including
the player, which is `--player` in both themes.

## 2026-09-23: A visually hidden input must not reuse the clipped `.visually-hidden` utility

Building the Follow switches surfaced a real interaction bug, caught by writing end to end
tests rather than by eye: every switch on the screen collapsed onto the same point and blocked
each other's clicks, both in Playwright and, it turned out, for a real finger.

Two things were wrong at once. First, `Switch.svelte`'s hidden `<input>` was `position:
absolute` with no positioned ancestor, so it sat at the origin of the page rather than inside
its own row. Second, it reused the shared `.visually-hidden` utility from `app.css`, which is
`!important` and clips to 1x1px for screen reader only text; that rule beat the component's own
override regardless of Svelte's scoping, so even after adding a positioned wrapper the input
stayed pinned to a single pixel.

**The fix, and the rule going forward**: a control that needs to receive real clicks (an input
standing in for a custom switch, checkbox or radio) is invisible but full sized, layered over
its own visual with `pointer-events: none` on the decoration beneath it, and it gets its own
class rather than sharing a name with the "clipped to nothing" utility meant for text. The two
patterns solve different problems and must never share a selector.

## 2026-09-23: The dev fetch proxy is exercised, not just present

`vite-plugins/dev-fetch-proxy.ts` was verified against the running dev server rather than only
typechecked: a private address, plain http and a `javascript:` URL are all refused with a 400,
and a real request to `ring.indienodes.us/ring.json` succeeds. The same SSRF rules the ring
client enforces on-device apply here too, on a developer's own machine, which is exactly the
network position worth protecting.

## 2026-09-23: Following does not fetch, so Today catches up on its first visit

`store.follow()` only ever saves who a person is and which feeds they publish. It was never
going to fetch what they have actually written, because that belongs to the refresh pipeline
(`refresh.ts`), not to the follow flow, and the two were built in separate milestones.

The gap that leaves: a reader follows someone from Discover or Follow, taps through to Today,
and finds it empty, because nothing has fetched that feed yet. The brief's pull to refresh and
background refresh both assume something is already there to look stale.

**`TodayState.loadAndCatchUp()`** loads from storage first, then checks whether any enabled
feed has never been fetched at all and triggers one refresh if so. This runs once, on Today's
first mount per session, not on every visit: an established follow list costs nothing beyond
the conditional GETs `refreshAll` already sends. A reader's first look at the app after
following someone is worth one extra fetch on the way in.

## 2026-09-23: The sliding pill indicator is measured, not guessed

The first build used a percentage width for Today's filter indicator, assuming all four pills
were the same width. They are not, by design: pills size to their own label, matching the
reference prototype, so "Everything" and "Watch" are different widths. Percentage math against
the container clipped the longer labels against the indicator's own rounded edge.

Screenshotting the build against the prototype at 390x844 caught this immediately, in both
themes. The fix follows the prototype's own JavaScript rather than approximating it in CSS:
each pill's real `offsetLeft` and `offsetWidth` are measured after render and on resize, and
the indicator's `transform` and `width` are driven from those numbers.

## 2026-09-23: Touch targets grow past the prototype where the brief requires it

Two controls copied the prototype's pixel values exactly and landed under the 44px minimum the
brief lists under "Rules that don't bend": Today's filter pills (38px) and the Follow screen's
switches (28px tall). Both are fixed by growing the tappable area to 44px while keeping the
visible pill or track at its original size, the same technique used elsewhere for a small
visual control that needs a bigger hit area. A Playwright assertion on target size is what
caught both; screenshots alone would not have.

## 2026-09-23: Inactive Today panes are `inert`

All four of Today's panes stay mounted side by side so each keeps its own scroll position; only
the track that holds them translates. Nothing initially stopped a reader tabbing through an
off-screen pane's buttons, or a screen reader announcing all four panes' content in sequence
regardless of which pill was selected. Every pane but the active one now carries `inert`, the
standard fix for exactly this shape of always-mounted, visually-paged content.

## 2026-09-23: Today shipped as a flat list first, deliberately, then the 3D card stack followed

The brief's card stack (cards standing up as they rise, tipping back and dimming as they pass
the top, driven by `animation-timeline: view()` with a passive-scroll fallback) is explicitly
optional in its own wording, and reduced motion's documented answer for it is "a flat list, no
stack." Today's first pass shipped exactly that, on purpose: data correctness, filters,
categorization and the refresh pipeline underneath it were worth finishing and testing properly
before adding a second, fiddlier animation system on top.

**The stack itself now exists**, in `src/lib/actions/cardStack.ts`, as a Svelte action applied
to each pane rather than anything baked into `YipCard.svelte` or the card markup: the action
finds `.yip` elements by class and reads or writes their inline styles, the same relationship
`jsStack()` has to `.yip` in the reference prototype, so the card component itself carries no
knowledge that a stack exists. Where `animation-timeline: view()` exists, a global stylesheet
(scoped to `.pane.stack-sda .yip` via `:global()`, since `.yip` belongs to a different
component) drives the whole thing on the compositor with the exact keyframes the prototype
defines. Where it does not, a passive scroll listener schedules one `requestAnimationFrame`
callback per frame and computes the same transform by hand, touching only cards within one card
height of the visible area, per the brief's own cost bound. The geometry itself,
`cardPlacement()`, is a pure function of three numbers (a card's offset, its height, the
viewport height) with no DOM in it, which is what makes it unit testable at all; the DOM
reading and writing around it is `layoutFallback()`, a thin, deliberately untested shell.

An `IntersectionObserver` marks whichever card is pinned at the top as `.behind`, which the
stylesheet turns into `pointer-events: none`, so only the front card ever receives a tap. A
`MutationObserver` on the pane re-observes new cards as they arrive, since yips load
asynchronously from storage and then again from a refresh; the action has no other way to know
a new card exists.

Real inspection in Chromium (which supports scroll-driven animations natively) confirmed the
whole thing working as designed: a card scrolled past the top carries the exact `matrix3d` the
`yip-out` keyframe describes, at zero opacity; a card standing up from the bottom carries
`yip-in`'s `scale(0.94)` and partial rotation at 0.5 opacity; a resting card in the middle
carries no transform at all. Reduced motion still disables the entire action, leaving the flat,
staggered list exactly as it shipped in the first pass.

## 2026-09-23: Listen and the full-screen player do not exist yet; a listen or watch yip opens externally for now

The brief bundles "Today (with Listen and the player)" as one screen inventory item. Splitting
it was a deliberate scope decision, not an oversight: the player is the single largest piece of
remaining work in the brief, its own shared `HTMLAudioElement`, a mini player, a full screen
player with a queue, wavesurfer.js integration with on-device peak caching, playback speed, and
the Media Session API for lock screen controls, each with its own real testing surface.

**For now, `YipCard` opens a listen or watch yip in the system browser**, the same as every
other yip, with a comment marking this as temporary. Nothing about that choice is wrong on its
own: every yip does link out to its creator, which the brief requires unconditionally. It is
temporary only in the sense that once the player exists, a listen yip should open it instead of
leaving the app. Today's data model is already built for that day: `StoredYip.category` already
distinguishes listen and watch, `formatDuration` and the waveform-shaped affordance are already
in the card, and `PeaksRecord` already exists in the `Store` interface waiting for a caller.

## 2026-09-23: OPML export and import use the browser's own file mechanisms, not a native plugin

Saving and picking a file both have a reliable native answer: `@capacitor/filesystem` paired
with `@capacitor/share` for export, and Filesystem alone covers import. Both are native
dependencies, and native dependencies are asked about before they are added.

**v0.9 uses the web platform's own mechanisms instead.** Export is a Blob, an object URL and a
click on a hidden anchor with `download` set. Import is a plain `<input type="file">` that
opens the system picker. Both are exercised end to end in `e2e/you.spec.ts`, including
Playwright's real download and file chooser interception, and both work in the browser this
project develops and tests against.

What is unverified is Android's own behavior on top of that mechanism inside a Capacitor
WebView: which app handles a WebView-triggered download, and whether the file picker reaches
every source a reader would expect (a cloud drive, not just local storage) depend on the
WebView version and the device's own app set, not on anything this app controls. That is the
gap the Filesystem and Share plugins would close, and it is why this decision is recorded
rather than left implicit: if the on-device experience turns out to be worse than a plain link
click and a file picker, propose those two plugins with that evidence, not before.

## 2026-09-23: Only a listen yip opens the player; a watch yip still opens externally

The brief's own screen inventory says it plainly: "Tapping an audio yip opens the player;
everything else opens the creator's URL." A watch yip keeps the same play icon a listen yip
has, matching a video's own affordance in the reference prototype, but the tap behavior is not
shared: this app does not play video, in app or otherwise. It opens the creator's page, the
same as a text post.

## 2026-09-23: The full player and mini player never unmount once something has played

Both stay in the DOM for the rest of the session after the first track opens, shown or hidden
with a CSS transform rather than an `{#if}` block that would destroy and recreate them. This
matters more than it looks: the full player holds the Waveform component, and destroying it on
every collapse would mean re-decoding a track's peaks every time a reader collapsed and
reopened the player, directly working against "a track is decoded at most once." `sheet` drives
visibility and `inert` for the collapsed state; nothing about mounting depends on it.

This surfaced a real bug during the first pass: the mini player originally rendered whenever
anything was loaded, with no check for whether the full player was also open, so both existed
in the DOM simultaneously (confirmed by Playwright's strict mode catching two elements both
labeled "Pause"). The mini player now also checks `sheet === 'mini'`.

## 2026-09-23: The card-to-player shared element morph shipped, and needed a Vitest fix to test

The brief describes opening a yip into the player as a shared `view-transition-name` morph from
the card's own image and title, with the player's gradient, header and body fading and rising
in only once the art has landed. The first pass shipped a plain slide up instead, the
documented fallback the brief itself allows "where the View Transitions API isn't available,"
recorded as an open, disclosed item rather than a silent cut, the same treatment as the 3D card
stack in Today.

**The morph itself now exists.** `player.play()` takes an optional third argument, the DOM
element that was tapped; `PlayerState.morphOpen()` in `src/lib/player.svelte.ts` reads that
element's `.art` and `.ttl`, names them `yip-art` and `yip-title` just before
`document.startViewTransition()` starts, then inside its callback clears those names, flushes
the queue and sheet state change with Svelte 5's `flushSync` so the player exists in the "after"
snapshot, and names its own `.pl-art`, `.pl-title`, `.pl-shade`, `.pl-top` and `.pl-body` to
match. `yip-art` and `yip-title` are shared with the card, so the browser morphs one into the
other; the rest are unique to the player, so `app.css` only fades and rises them in, delayed by
`--dur-l` so nothing pops in behind the gradient, matching the reference prototype's own
`openPlayer()` down to the two keyframe names. `YipCard.svelte` and `RingRow.svelte` both pass
their own clicked element through; every other call site is unaffected, since the argument is
optional and its absence, no browser support, or a card with no `.art` all fall back to the
plain open `play()` already had.

Building this exposed a real gap in how this project's own tests run: Vite resolves the
`svelte` package through its `default` export condition unless something asks for `browser`
explicitly, and that `default` condition is the **server** build, where `flushSync` is aliased
straight to a no-op. Every assertion in a first draft of `morphOpen()`'s tests that depended on
`flushSync` actually having run silently failed, not because the production code was wrong, but
because the test environment was running the wrong build of Svelte entirely, one that Vitest
happened to reach only because nothing had ever called `flushSync` before. `apps/reader/vite.config.ts`
now sets `resolve.conditions: ['browser']` under `process.env.VITEST`, so tests exercise the
same client build the browser gets. `src/app.d.ts`'s old custom ambient declaration for
`Document.startViewTransition`, written before this TypeScript version shipped the real DOM
type, was deleted once it started fighting that real type on assignment rather than the plain
calls it was written for.

## 2026-09-23: Two seeking bugs, both found only because a real audio file was used in tests

Testing the player against a real, if silent, generated WAV file (Chromium genuinely decodes
it, unlike a fixture that only satisfies a mock) surfaced two real defects a mocked-duration
approach would have missed entirely.

**Seeking to exactly a track's duration is a known cross-browser edge case.** Some media
engines silently reject a seek target equal to `duration` and reset position to 0 rather than
landing at the end. `skip`/`seek` now clamp to `duration - 0.25` rather than `duration` itself;
reaching the real end during ordinary playback still fires `ended` and advances the queue
exactly as before, since that path never depends on the seek target being exact.

**A seek requested before the browser knows the real duration is now held and reapplied once
`loadedmetadata` fires**, rather than guessed at with an `Infinity` fallback that could send a
`skip(30)` on a brand new track to an arbitrary position.

**A third case was found, investigated at length, and deliberately left unresolved rather than
patched over:** a paused, `preload="none"` element can abandon whatever it had buffered
entirely, so a seek requested while paused, very early into a short track's playback, can land
back at 0 instead of the target and never recover without an explicit `play()` call, because
`preload="none"` overrides even an explicit `load()`. A forced-resume-then-repause fix was
built and then removed after it proved to flap between playing and paused without reliably
landing the seek either. This is a genuine tension between "no preloading, ever" (a rule that
does not bend, for a member's bandwidth) and "seeking always works" (not itself one of the
brief's explicit rules). The trade-off is resolved in preload's favor, matching the brief's
stated priority, and the gap is disclosed here rather than hidden behind a test that was
quietly rewritten to stop noticing it. The end to end suite exercises the realistic case,
seeking during active playback, which works reliably; the pathological case is a candidate for
a native `Store`-backed local caching layer later, not a v0.9 fix.

## 2026-09-23: `@capgo/capacitor-media-session` closes the background audio gap, chosen over three alternatives

The brief asks for Media Session metadata and lock screen controls, and separately flags that
reliable background playback on Android needs a native plugin with a foreground service, to be
proposed and asked about before adding. `player.svelte.ts` shipped calling
`navigator.mediaSession` directly, which is correct web platform code and works when testing in
a real browser, but real device testing surfaced the actual gap the brief anticipated: **the
Android System WebView, unlike Chrome, never surfaces the Web Media Session API to the OS lock
screen or notification shade at all.** Nothing showed up, not because playback was wrong, but
because there was nothing on the native side for Android to show. This is the same limitation
covered by the original deferred decision; on-device testing is what turned it from a
documented risk into an observed, reproducible gap, which is why it was raised again rather
than left as a standing deferral.

Four options were compared before adding anything:

- **`@jofr/capacitor-media-session`**, the original: last published August 2024, peer
  dependency locked to `@capacitor/core ^6.0.0`. Two major Capacitor versions behind this
  app's Capacitor 8.
- **`@capawesome-team/capacitor-media-session`**: actively maintained and Capacitor 8 native,
  but proprietary, gated behind a paid license key. Every other runtime dependency in this app
  is open source; this would have been the exception.
- **`@mediagrid/capacitor-native-audio`**: Capacitor 8 native, but it replaces the WebView's
  `<audio>` element with native playback entirely. Adopting it would mean rearchitecting away
  from the one shared `HTMLAudioElement` wavesurfer.js is handed through its `media` option,
  to solve a problem that is only about what shows on the lock screen. It over-solves it.
- **`@capgo/capacitor-media-session`**, the one chosen: MPL-2.0, `@capacitor/core >=8.0.0`,
  published the day before this decision was made, 0 open issues at the time. Its Android
  source was read directly rather than trusted from documentation alone: a real
  `android.app.Service` declaring `foregroundServiceType="mediaPlayback"`, built on the
  standard, non-deprecated `MediaSessionCompat` / `PlaybackStateCompat` /
  `NotificationCompat.MediaStyle` APIs, with a `MediaButtonReceiver` for hardware and Bluetooth
  media keys. Its manifest requests only `FOREGROUND_SERVICE`; Android 14 additionally wants
  `FOREGROUND_SERVICE_MEDIA_PLAYBACK` declared for a `mediaPlayback` service, which this app's
  own `AndroidManifest.xml` now adds directly since the plugin's does not.

**Integration replaced `navigator.mediaSession` rather than sitting beside it.** The plugin
registers `web` and `ios` fallbacks that wrap the same `navigator.mediaSession` the old code
called directly, so `setMediaSessionMetadata`, `updateMediaSessionState` and `wireMediaSession`
in `player.svelte.ts` now call the plugin's `setMetadata` / `setPlaybackState` /
`setActionHandler` unconditionally, one call site for web, iOS and Android instead of two code
paths. Every call is fire-and-forget (`.catch(() => {})`): a platform with no media session
support rejects the promise, and playback itself must never depend on that succeeding, the
same principle the waveform decode failure already follows. `setPositionState`, which the
brief did not call out explicitly but which is what puts a scrubber on the lock screen widget
rather than just play and pause buttons, is now called on play, pause, seek and rate change.

Not yet verified: the exact foreground service lifecycle (does it tear itself down promptly
once paused, does the persistent "app is running" notification look right against this app's
own iconography) is a real device question the next testing pass should answer, not something
confirmed from reading source.

## 2026-09-23: The hardware back button steps back through routes only, not player or confirm state

The brief does not mention the Android back button at all. `BridgeActivity`'s platform default
is to exit the app on the first press, discovered by on-device testing: with four real routes
behind Discover, Today, Follow and You, that read as broken rather than merely unspecified.

**`MainActivity.java` defers to the WebView's own `canGoBack()` / `goBack()`** before falling
through to the platform default. This needed no new dependency: SvelteKit's router uses the
History API for its client-side navigation, which the WebView already tracks, so `goBack()`
correctly replays it.

The first version of this fix overrode the classic `Activity.onBackPressed()`, which read as
correct from the Capacitor source and compiled cleanly, but real device testing found it never
fired at all: the app's `targetSdkVersion` is 36, and Android opts an app into the predictive
back gesture by default from API 33 onward unless a manifest flag turns it off, which this
app's does not. Under that model the system dispatches through
`OnBackPressedDispatcher`/`OnBackInvokedCallback`, not the deprecated method, on both the
gesture and (on the devices that still have one) the physical button. `MainActivity` now
registers an `OnBackPressedCallback` with `getOnBackPressedDispatcher()` instead, which is the
officially current mechanism this migration is documented under. Recorded here because reading
the Capacitor source correctly was not enough on its own to predict which back API path a high
`targetSdkVersion` actually dispatches through; only the device could.

**What it does not do**: collapse the full screen player, or cancel an inline confirm (You's
Unfollow row, for instance) before falling through to route history or exiting. Neither of
those is a URL change, so nothing in the WebView's own history knows about them; reaching
them means intercepting the back button in JavaScript, which needs `@capacitor/app`'s
`backButton` event; a native dependency the brief's own rule says to ask about before adding.
Left as a known, disclosed gap rather than bundled into this fix without asking; worth doing
if collapsing the player on back turns out to matter as much on a real device as it reads on
paper.

## 2026-09-23: The tab bar shrank from the prototype's 84px, and the mini player can now be dismissed

Two product calls made from real device use, not bugs: the prototype's `--tabbar-h: 84px` is
authoritative for the visual design, but on a real phone it read as more chrome than four tabs
need, so it is 72px now. The mini player's own position was untouched (still the brief's
92px from the bottom), which had the side effect of fixing a second, related complaint for
free: with a taller tab bar the mini player sat flush against it with no visible gap; a
shorter bar opens a real one.

**The mini player also gained a stop button.** Nothing in the brief's mini player description
(art, title, creator, play/pause, a progress hairline) includes a way to end playback outright
rather than collapse or pause it, and real use found the gap: pausing leaves the bar (and, now,
the lock screen widget) sitting there with nothing to dismiss it except playing something else.
`PlayerState.stop()` pauses, sets `sheet` to `'hidden'`, and tells the media session plugin
`playbackState: 'none'` directly rather than `'paused'`, since the intent is closing the
session's own widget, not leaving it paused for a lock screen resume.

## 2026-09-23: Two reported scroll bugs did not reproduce in the browser with realistic input

Real device testing reported the hardware back button still exiting immediately (see above,
genuinely broken, now fixed), a brief downward jump the instant a scroll starts at the very top
of Today, and "From the ring" feeling stuck or jumping to the top when scrolled into. The first
of the remaining two was chased with a real Chromium touch drag through the CDP input pipeline
(not a synthetic DOM event, which does not exercise a browser's actual scroll gesture
recognition) landing on a perfectly monotonic `scrollTop` sequence, no jump. The second was
chased by scrolling to the pane's true end and reading `getBoundingClientRect()` on the heading
and the row list beneath it (immune to the `offsetTop`/offsetParent mistake an earlier pass in
this same session made and had to redo): every row sat fully inside the viewport with room to
spare, not stuck or clipped.

Both are recorded as **not reproduced in a desktop browser with realistic input**, not as
fixed. A contributing but unconfirmed cause was still worth addressing along the way:
`content-visibility: auto`'s `contain-intrinsic-size` for a card was a flat 200px even for a
172px listen card (see `YipCard.svelte`'s own `.yip.media.listen`), and the Listen pane, where
"From the ring" lives, is nothing but listen cards; that mismatch is fixed regardless of
whether it was the reported bug's cause. `MainActivity` also now sets the WebView's
`overScrollMode` to `OVER_SCROLL_NEVER`, addressing a native Android edge glow effect that CSS
`overscroll-behavior` does not reach and that a browser test cannot exercise at all. If either
bug survives the next device pass with these in place, it needs `chrome://inspect` against the
real device rather than more guessing from here, the same tool `docs/android-testing.md`
already documents for exactly this class of problem.

## 2026-09-23: The Today tab is now Feeds

Real use found "Today" a worse fit than the brief's own name suggested: the tab is not about
one day, it is the merged, reverse chronological feed of everything followed. Renamed
throughout rather than just in the tab label, since a partial rename (one visible string, an
internal module and a route still called `today`) is the kind of drift that makes the next
person's search for "where is this" fail. `src/routes/today/` is `src/routes/feeds/`,
`today.svelte.ts` is `feeds.svelte.ts` (`TodayState`/`TODAY_FILTERS`/`TodayFilterKey` all
renamed to match), the route is `/feeds`, and every UI string, comment and doc mentioning
"Today" as the screen, not the calendar day, was found and changed; `ring.svelte.ts`'s own
`today` (the node of the day) and every other genuinely calendar-related "today" elsewhere were
deliberately left alone.

**A rename is also a free audit of what the test suite actually covers.** Grepping for every
occurrence of `/today` after the fact turned up one real miss the rename would otherwise have
shipped broken: Follow's "See their yips in Today" button called `goto('/today')` directly,
and no end to end test had ever clicked it, so nothing would have caught a rename that missed
it. Fixed, and now covered by a new test in `follow.spec.ts`, a small concrete example of a
larger point: a screen with no test exercising a specific control is a screen where a
refactor can silently break that control and every check will still pass.

## 2026-09-23: Discover's WebGL hero is built, ported from the reference prototype

The brief marks this optional and names the CSS crossfade as its own sanctioned fallback,
which is why it shipped after everything else in v0.9 rather than before it. Built now:
`src/lib/webgl/heroGL.ts` is a from-scratch TypeScript port of the prototype's own GL code
(`docs/reference/yipden-prototype.html`), not the code copied over, matching the brief's own
instruction to port patterns into components rather than port the prototype's JS as written.
The shader itself, the fbm-noise displacement wipe, the liquid bend while dragging, the ~30fps
ambient drift that rests after 10 seconds and wakes on a touch, is close to line-for-line the
same math; the state machine around it is restructured as a plain object `HeroArt.svelte` owns
and tears down on its own, rather than a page level singleton closing over globals the way the
prototype's `GL` IIFE does.

**The CSS crossfade never stops running underneath**, the same relationship the prototype's own
`.hero-gl`/`.hero-art` classes have: a canvas is drawn over the existing layers and a class
toggle decides which one is actually visible, so any way `createHeroGL` can fail leaves the
already-working fallback exactly where it was, not something to reconstruct after the fact.
Two real fixes only surfaced this way, from writing a genuinely failing case rather than
trusting the design on paper:

- A photo host with no CORS headers is meant to disable the WebGL hero for the rest of the
  session (`onFatalError`), but the first version only stopped the animation loop, leaving a
  blank canvas sitting on top of a CSS layer that was still working perfectly underneath.
  `HeroArt.svelte` now actually reacts to that callback and hides the canvas.
- Whether a cross-origin image with no CORS headers fails at all turned out to be genuinely
  engine dependent, discovered by testing it rather than assuming the spec's intent: the
  taint restriction is about blocking pixel readback, which this hero never does, and in the
  Chromium build these tests run against, `texImage2D` renders such an image successfully
  with no error at all. Handled defensively on both ends anyway, `onerror` for an engine that
  refuses to even load the image in CORS mode, a `try`/`catch` around the upload for one that
  loads it and refuses the upload, since nothing here should depend on knowing which a given
  browser or WebView chose.

One deliberate simplification from the prototype: a committed swipe's wipe always starts from
a drag fraction of 0 rather than continuing from exactly where the finger was mid-drag when it
crossed the commit threshold. The prototype threads that value through directly because its
swipe handler and its transition call are the same function; here the transition is triggered
reactively off a `direction` prop change instead, and carrying the exact mid-drag value through
that path was not worth the extra plumbing for what is a small continuity difference at the
handoff moment, not a visible defect.

Verified visually, not just by absence of errors: two solid-color images with distinct stripe
patterns confirmed the wipe's boundary is genuinely noise-distorted rather than a hard line,
and the ambient drift visibly moves a static image's stripes at rest.

## 2026-09-23: The WebGL hero gives up for the rest of the session after one failed photo

Real ring member photos, tested against the actual live ring rather than a fixture, confirmed
the concern the first version of this feature only reasoned about: none of the three members
checked (hosts `candyether.space`, `pages.kjnet.us`, `keyjay.neocities.org`) sent CORS headers,
and a real browser's console showed the honest result, `Access to image at '…' … has been
blocked by CORS policy`. Expected, and the whole reason the CSS crossfade exists underneath.

**What was not expected, and was a real bug**: `onFatalError` correctly hid the canvas after
that first failure, but `go()` and `set()` had no memory of it, so navigating to a second and
third member sent two more doomed CORS-mode requests before each one's own failure hid the
(already hidden) canvas again. Visually this read as the hero doing nothing at all, not
falling back, because a request already known to fail was retried on every single navigation
rather than once. Fixed: both methods now refuse to start a new load once `taintedByCors` or
`contextLost` is set, so the very first real-world failure permanently and quietly hands the
rest of the session to the CSS crossfade, which is what "falls back" was always supposed to
mean here. A new test (`discover-webgl.spec.ts`) forces this with `route.abort()`, a reliable
network-level failure Playwright's mocked CORS responses turned out not to be (see the entry
above): confirms the canvas stays hidden and `.art` stays the visible layer across a second,
never-attempted navigation, not just after the first one.

**In practice, this means the WebGL hero will rarely be seen at all** unless a ring member's
photo happens to be hosted somewhere that sends `Access-Control-Allow-Origin`, which is not
the common case for a personal site. This is a real, disclosed limitation of hot-linking to
arbitrary third-party image hosts from a canvas, not a bug to chase further: the fix here
makes the (likely) failure cheap and silent rather than making the failure not happen, which
is not something within this app's control. If the WebGL hero seeing regular real-world use
matters enough later, the fix would live on the ring side (serving `thumb_url` through
IndieNodes' own CORS-friendly infrastructure rather than a direct link to each member's site),
not here.

## 2026-09-23: The kill-switch above was itself a bug; replaced with a per-photo fallback

Device testing on the real ring (not a fixture) found the entry above had overcorrected: since
essentially every real member photo fails CORS, the very first navigation tripped
`taintedByCors` and disabled the wipe for the rest of the session, which read as "the wave
effect only happens once, then stops." The right fix was never "give up once," it was "never
retry a failure that already happened," and those are different things: the first version
conflated a single photo's CORS failure with the whole hero being broken, when only that one
photo actually failed.

**Replaced the global kill-switch with a per-photo fallback.** `taintedByCors` is gone entirely.
`heroGL.ts`'s `textures` cache already meant a failed photo was never re-fetched; the only
change needed was to stop treating that cached failure as fatal to anything beyond itself. A
photo that will not load now paints a solid placeholder forever, in the member's own wash
color (`washColorFor` in `ring.svelte.ts`, the same hue `washFor`'s CSS gradient already used,
converted to RGB) rather than the same flat brown for every member regardless of who they are.
The wipe transition itself, the noise-driven displacement the reader actually asked to see
again, runs on every navigation unconditionally now; only the texture underneath it varies.
`onFatalError` keeps its narrower, correct meaning: a lost WebGL context, the one failure with
no per-photo recovery, since the canvas itself is unusable at that point, not just one image on
it. `ring.test.ts` covers the new color functions; `discover-webgl.spec.ts`'s fallback test was
rewritten to assert the opposite of what it asserted before (the canvas now stays active across
repeated failures, rather than falling back to CSS after the first one), since the old
assertion was testing the behavior being removed here.

**A second, separate bug surfaced once the wipe could actually be observed on every
transition**: its direction was backwards. `HeroArt.svelte` was hazarding the app's own
`direction` prop (`-1` for next, `1` for prev, chosen so `flyIn`'s `x: direction * -32` makes
next enter from the right) straight into the shader's `dir` uniform, which is ported byte for
byte from the prototype and expects the opposite sign: the prototype's own swipe handler passes
`dir = 1` for "next" so its wipe reveals from the right, matching that same text motion. Passing
the app's `direction` unnegated meant next revealed from the left, backwards from both the
prototype and this app's own text. Fixed by negating once, at the boundary where `HeroArt.svelte`
calls `gl.go()`, rather than touching the shader or the app's own `direction` convention
elsewhere. Confirmed with a new test that samples real pixels (`gl.readPixels`) at the canvas's
left and right edges during a transition between two flat placeholder colors, rather than
trusting the code: real Chromium timing turned out to be unreliable for a fixed "wait until
mid-transition" wait (headless compositing is not paced to a real display, so the nominal 640ms
duration can finish in well under that of wall time), so the test polls in short bursts right
after the navigation and checks which edge's color changes first, which does not depend on how
fast the transition actually ran.

**A third, smaller fidelity gap, found while looking at the same call site**: `HeroArt.svelte`
always called `gl.go()` with a drag fraction of `0`, rather than the fraction a swipe had
already dragged before it committed, so a committed swipe's transition always restarted from
zero bend instead of continuing smoothly from the live preview the way the prototype's own
`dx / W` argument does. Threaded through properly now: `+page.svelte` tracks a `navFraction`
state, set only by `onSwipeEnd` from the swipe's own `delta` (the prev/next buttons and shuffle
correctly stay at `0`, since nothing was dragged), and passed to `<HeroArt>` as `dragFraction`.

## 2026-09-23: The top-of-scroll jump, found: a normal-flow sibling, not scroll physics at all

The earlier "not reproduced" entry above chased the wrong signal. Both attempts to catch this
watched `scrollTop` through a real touch drag, and `scrollTop` was never the problem: the pull
to refresh indicator, `{#if pulling || pullY > 0}<div class="pull">…`, was a normal flex
sibling between the header and `.viewport`. `pulling` turns true on `pointerdown` alone, at
zero drag distance, whenever the pane is already at the top, which means the indicator's own
~34px of height was inserted into the layout the instant a reader so much as pressed down to
start scrolling, pushing every card down by that much, then removed again on release when the
gesture turned out to be an ordinary scroll rather than a pull. Nothing about `scrollTop`
changes when a sibling element's own presence pushes the pane's content down; only the cards'
own rendered position does, which is exactly the measurement neither earlier attempt took.

Found this time with a plain `pointerdown` and no movement at all, dispatched directly rather
than simulated through CDP touch input, reading `getBoundingClientRect()` on the first card
before, during, and after: it moved down about 41px on press and back up on release, with the
drag distance held at exactly zero throughout. **Fixed by taking the indicator out of the flex
flow entirely**: `.pull` is now `position: absolute` inside `.viewport`, overlaying the top of
the list rather than sitting beside it, so its own mount and unmount can never move anything
else. A new test in `feeds.spec.ts` asserts the first card's own `y` position is unchanged
across a `pointerdown`/`pointerup` pair with no movement between them; confirmed against the
pre-fix code that it actually fails there (a ~41px jump), not just that it passes now.

The lesson worth keeping: a report described as a "scroll jump" does not necessarily mean the
bug is in scroll handling. Chasing `scrollTop` twice, correctly, and cleanly both times, said
nothing about a sibling element's own layout impact, since it is a completely different
mechanism that happens to produce a similar-looking visual symptom.

## 2026-09-23: The waveform's CORS limitation is real, but likely narrower on Android than on web

Asked directly: why do waveforms never seem to draw. `Waveform.svelte` already documented the
expected cause ("Decoding failed, commonly a CORS refusal from a host that never expected
this") and it is confirmed as the actual one: wavesurfer.js's own `fetcher.js` calls a plain
`fetch(url, requestInit)` to read a track's raw bytes for decoding, and a `fetch()` reading a
cross-origin response body needs the same `Access-Control-Allow-Origin` header a member's
photo host was just found not to send. This is the same limitation as the WebGL hero's photos,
for the same underlying reason, on a different resource.

**Read `@capacitor/android`'s own native-bridge.js rather than assume the two are identical**:
`CapacitorHttp: { enabled: true }` overrides `window.fetch` itself on Android, routing a GET
through a native proxy path (`CapacitorWebFetch`) that is not subject to CORS. wavesurfer's
fetch is a plain `fetch()` call, which that override catches like any other; the WebGL hero's
`new Image()` texture loads do not go through `fetch()` at all, so they get no such benefit
and stay CORS-limited even natively (see the WebGL entries above). The two features that looked
like the same problem in the browser are not necessarily the same problem on the device: the
waveform has a real chance of actually drawing for a real track on the APK, unencoded by
anything short of the target site itself blocking the request outright (rate limiting,
hotlink protection, being offline), where the WebGL hero does not. Worth confirming on the
next device pass specifically, not assumed from the browser result.

## 2026-09-23: Live reload, and a latent manifest merge bug it happened to surface

Rebuilding and reinstalling an APK for every change tests the wrong thing most of the time:
nearly everything in this app is a web change, and Capacitor supports pointing an installed
shell at a running dev server instead of its own bundled files. Added as `CAP_LIVE_RELOAD_URL`,
read only by `capacitor.config.ts`, never set by `android:apk` or `android:install`, which
every device testing round before this one used and which a real build must keep using
untouched. `docs/android-testing.md` has the workflow.

This needs the WebView's own origin to become a plain `http://` dev server, which
`network_security_config.xml`'s `cleartextTrafficPermitted="false"` (a deliberate, hardened,
platform-enforced choice recorded when it was written, see `docs/security.md`) refuses
outright regardless of what Capacitor's own `server.cleartext` option says. Rather than loosen
that file, `android/app/src/debug/res/xml/network_security_config.xml` overrides it for debug
builds only, which is what Android's own build variant system is for: a release build has no
`src/release` equivalent and stays exactly as hardened as it already was.

**Building the debug variant with that new file present failed outright**, on a manifest merge
conflict that had nothing to do with live reload: `capacitor-cordova-android-plugins`, a module
Capacitor bundles rather than something this app added, declares its own
`usesCleartextTraffic="true"`, conflicting with this app's own `"false"`. Gradle's merger
treats a genuine value conflict as a hard failure rather than picking one silently, which is
the correct behavior; what is notable is that this had apparently never actually run since the
very first build, since Gradle caches a manifest merge result and nothing had invalidated it
since. **This was a real, pre-existing fragility a genuinely clean build, or CI without a warm
cache, would always have hit**, discovered only because a new resource file happened to
invalidate the cache. Fixed with `tools:replace="android:usesCleartextTraffic"` on the
`<application>` element, which tells the merger explicitly that this app's own value always
wins; the real enforcement was already the network security config, never this attribute, so
nothing about the app's actual hardening changed.

## 2026-09-23: Live reload's first real attempt failed on `pnpm dev`'s default bind address

The docs written alongside live reload itself said `pnpm dev`, no flags, exactly the command
the browser loop has always used. On the device it produced a plain "page not available," with
nothing informative in Capacitor's own logs, since as far as the native shell knew it asked for
a URL like any other and the connection simply never landed.

**`vite dev` binds to `localhost` only unless told otherwise.** That answers a `curl` or a
browser running on this same machine perfectly well, which is exactly why the dev server
"worked" through the entire browser-loop testing that led up to this, and answers nothing at
all from another host on the network, phone included, no matter how correct the address and
port in `CAP_LIVE_RELOAD_URL` are. `docs/android-testing.md` now says `pnpm dev --host 0.0.0.0`
for this specific loop, and explains why the flag matters rather than just adding it silently,
since the same mistake is easy to repeat without that context. The browser loop itself needed
no change: it was never reaching the dev server from outside this machine in the first place.

A second, unrelated mistake compounded this while debugging it: two separate `pnpm dev`
processes ended up running at once (one from an earlier session, one started fresh to check
the theory), on two different ports, neither reachable from outside regardless. Killing a
backgrounded `vite dev` by its shell wrapper's PID did not stop the actual Node process holding
the port; the wrapper and the process it spawned needed killing separately. Worth remembering
generally, not just for this one incident.

## 2026-09-23: Feeds' filter pills stretch on a phone, then center once there is room to spare

`.pills`' CSS (`align-self: flex-start`) was ported directly from the reference prototype,
which never had to answer this question: it renders inside a fixed 390px mobile frame, where a
content-sized row hugging the left edge is indistinguishable from one spanning the width, since
there is barely any width to spare either way. Run as a real responsive app rather than inside
that frame, the same CSS on an actual wide screen left the segmented control pinned to the
left with a large, obviously unbalanced gap of empty header to its right.

Fixed with the first width-based media query in the app (600px, roughly where a phone's
portrait width ends and a small tablet's begins; nothing existing to reuse here, since every
other layout in the app so far has been able to stay one width). Below it, `.pills` stretches
to the header's full width and each `.pill` takes `flex: 1`, splitting that width evenly,
which is what "full width" needed to mean once the row is wider than the sum of its labels.
At and above it, both revert to their original content-sized behavior, just centered
(`align-self: center`) rather than left-hugging, so a tablet gets a normal, comfortably sized
filter rather than four stretched, oversized tab buttons.

## 2026-09-23: Discover's filter chips became a Filter button and sheet

The reference prototype's `.chips` row (a horizontal-scroll strip of pills above the tab bar,
shared visually with Feeds' pill row before that one changed too) was a bounded taxonomy: the
ring maps onto at most seven fixed categories, and `ring.chips` already drops any that would
show nothing. Growth was never going to make the row literally overflow. The real complaint was
placement: squeezed into `.bottom` alongside the position counter and prev/next, it competed
for the same cramped strip of space right above the tab bar, and would only feel tighter if the
app's own taxonomy grows later.

**Replaced with a single icon button next to prev/next that opens a bottom sheet**, discussed
with three concrete options before writing any code (the other two: move the same scrolling row
higher up the screen; leave the placement and only polish it visually). The button carries a
small dot badge whenever a filter other than "All" is active, and its own accessible name
includes the active filter's label, so the state is legible without opening the sheet. The
sheet lists every option as a full-width row (`role="radio"` inside `role="radiogroup"`,
matching a single-select semantic more precisely than the old chip row's individual
`aria-pressed` buttons did) and closes on selecting one, on Escape, or on a backdrop tap;
closing returns focus to the trigger button rather than dropping it. No existing sheet or
dialog primitive was in this codebase to build on (the full player is a persistent,
always-mounted overlay for a different reason: it must never lose waveform decode state, which
a transient filter sheet has no equivalent need for), so this one is built directly in
`+page.svelte` rather than forcing a shared abstraction into existence for its first two users.

`discover.spec.ts`'s filter tests now open the sheet before picking an option; a new test
covers the sheet's own open/close/focus-return behavior specifically.

## 2026-09-23: "From the ring" became per-member cards with continuous play

**Confirmed, then built on: this app is a second client of the ring.** It already read
`ring.json` for Discover, and `entry.tracks[]` was already being played from Listen, so the only
thing missing was treating a member, not a track, as the unit a reader chooses. The flat list of
every track from every audio member is gone; each member is one card (cover, track count, a
play button, and a "+" to queue them) in `RingMemberCard.svelte`. `RingRow.svelte` had no other
user and was deleted. The reference for the behavior was the IndieNodes app's own player, read
directly rather than remembered: a queue kept separate from the audio element, a per-member
card, reorder and remove with the playhead tracked through both, and a prompt at the end of a
member's tracks instead of silently carrying on.

**One player, not a ring player.** `player.svelte.ts` stays the single queue and single
`<audio>` element; it gained only generic primitives (`addToQueue`, `move`, `removeAt`,
`removeBatch`, `jumpTo`, `hydrate`, an optional `batchKey` on a queue item). What is ring
specific lives in `ringPlayer.svelte.ts`, a thin layer that tags a member's tracks with their id,
remembers the order members joined the session, and asks `suggestNextEntry` who is next. That
function is in `@yipden/ring-client`, not the app: a tag overlap score against everything played
so far, random among ties, never leaving the session's `form` (music stays music), never
repeating a member. It is what any other audio client of the ring would also need.

**Ordinary queues still wrap, on purpose.** The obvious change, making the end of every queue
stop, was checked against the tests first and would have broken one that deliberately asserts
the wrap (`the up next tile is disabled alone in the queue`, misleadingly named: it exercises
wrapping). So `loop` is opt out: it defaults to `true`, and only a ring session passes
`{ loop: false }`, which is what lets it stop and set `ended` rather than restarting the same
member. `next` follows the same rule, so the Up next tile never promises a wrap `advance()` will
not perform.

**The queue survives closing the app, which the IndieNodes app deliberately does not.**
Chosen explicitly: a ring session is one a reader built member by member, not a snapshot of
whatever a feed happened to show. Restoring never starts audio; the mini player comes back
paused with the right track loaded. It reuses `getSetting`/`setSetting` (a new `'ringQueue'`
key), so no schema migration was needed. Two things about doing it are worth remembering. The
save had to use `$state.snapshot`: a live `$state` proxy fails IndexedDB's structured clone, and
the save is fire and forget, so it failed silently and the round trip test in `ringPlayer.test.ts`
is what caught it. And accepting "Keep going" originally appended the next member without
starting them, since `addToQueue` only auto-started from an idle player, not one sitting at the
end of a finished queue; an end to end test with real (very short) audio found that.

**Scope cuts, so they are not mistaken for oversights.** Reordering is up and down buttons per
row, not drag: no drag primitive exists in the app, and buttons are keyboard and screen reader
accessible with no custom gesture work. The IndieNodes app also has an "auto keep going" mode
that stops asking after the first yes; this always asks, since the request was for a prompt.
There is no separate "preview" versus "play" button state on a card. Each is a small addition on
top of this if wanted.

## 2026-09-23: A photo the canvas cannot draw is shown by the CSS layer; Android loads hero photos natively

Device testing showed two symptoms with one cause, and the cause was the per-photo fallback
above. That change made a photo the canvas could not read paint a flat wash-colored stand-in,
but the canvas also hides the CSS layer while it is showing, and that CSS layer is the only
thing that could display such a photo (a CSS background needs no CORS). So every member whose
photo fails CORS lost their cover, replaced by a flat color, and the wave "did not work" on the
device because it was wiping between flat colors. The browser looked fine only because more of
the dev photos happen to be readable there.

Two changes. **The canvas is now shown only for a photo it actually holds as pixels**
(`HeroArt.svelte` tracks that through a new `onTexture` callback); any other photo is shown by
the CSS crossfade, exactly as before the WebGL hero existed. The flat wash color is gone as a
visible state. **On Android the photo's bytes come through the native HTTP client**
(`platform/image.ts`), which is not subject to CORS, the same reason feeds work there, decoded
with `createImageBitmap(..., { imageOrientation: 'flipY' })` and uploaded as a texture; `Image`
is the fallback. That is what should make the wipe run on real photos on the device, since
`Image()` is not intercepted by Capacitor's fetch override (found earlier with the waveform).

Not verified on a device: the Android path is typechecked and the browser path is tested with
real, CORS-readable photos (the wipe direction test now uses two solid PNGs rather than flat
placeholder colors), but `CapacitorHttp`'s `responseType: 'blob'` returning base64 in `data` is
taken from its documented behavior, not observed. If covers still fail on the device, that
loader is the first place to look.

Follow up, same day: covers came back but the wave still did not appear on the device. The
remaining cause is timing rather than access. A wipe is only visible if the destination photo is
already a texture when it starts; on a phone the download was still in flight, so the transition
ran and finished under a hidden canvas and the canvas appeared afterwards already at rest. The
neighbours (next and previous in the visible list) are now preloaded through a `preload` prop.
A test with a 700ms photo host reproduces it and fails without the change. Still unverified on
the device: whether the native loader itself succeeds there. It falls back to `Image` silently,
so if the wave is still absent, the next step is logging that path, not more timing work.

Second follow up: the effect that was missing on the device is the WebGL bend and wipe on
drag, which only shows while the canvas is showing, and the canvas only shows for a photo it
holds as pixels. Covers came back (CSS layer) but the canvas stayed hidden, so the native photo
path is not producing textures on the device. Unable to see why from here, the native loader now
returns a `data:` URL (same origin by definition, so a canvas can never refuse it, and no
`createImageBitmap` option to be unsupported) and logs its failure with `console.warn`, visible
through `chrome://inspect` on the phone. Still unverified on the device; if the wave is absent,
that console line, or its absence, is the next thing to look at.

Resolved on the device: the wave was missing because the wipe shader declared `mediump` floats,
which phone GPUs run at half precision; it now asks for `highp` where available (desktop GPUs
treat both the same, which is why the browser never showed it). The photo loading, preloading
and CSS-layer changes above were all real problems too, but not the last one. The temporary
on-screen diagnostics were removed once it was confirmed; a failed native photo load still logs
a `console.warn`.

## 2026-09-24: Back now collapses the full player, through a history entry

This closes the gap the back button entry above left open on purpose. Opening the full player
pushes a real history entry (`Player.svelte`), so Back, from the browser or the Android button,
is an ordinary history step that a `popstate` handler turns into a collapse, and collapsing by
any other route (the chevron, a swipe down) takes that entry back off so history never gathers
stale ones. That is the mechanism that does the work, and it is why no native change was
needed: `MainActivity`'s existing callback already calls `goBack()`, which now lands on the
player's entry first. `browser Back collapses the full player without leaving the current
screen` in `player.spec.ts` covers it.

`@capacitor/app` was added, the native dependency the entry above said to ask about first, for a
`backButton` listener that also closes the queue sheet and exits explicitly when there is
nothing left to go back to. **Its priority is not established.** `MainActivity` registers its
callback after the bridge does, and Android runs the most recently added callback first, so on
the device the native callback may consume Back before the JavaScript listener ever sees it.
That is harmless for the player (the history entry handles it either way) but means the queue
sheet's Back handling, which only exists in the listener, is unproven on a device and may need
to move onto a history entry too. Tested on a phone as working "for the most part"; not yet
tested against the queue sheet specifically.

## 2026-09-24: The mini player's progress moved to its bottom edge, and it fades out

The mini player's progress bar was a thin inset line that read as a border. It now runs along
the bottom edge of the whole card, inside its rounded corners, with a subtle moving highlight
while playing (off under reduced motion, like the pulse beside it), and the card fades out
rather than vanishing when dismissed.

## 2026-09-24: The player leads with Previous and Next; speed and time skips stepped back

The full player's main row was skip back 15 seconds, play, skip forward 30, with Speed as a
second tile beside Up next. Track changes were the thing a reader of a ring session actually
wants, so the row is now Previous, play, Next. Speed is a small chip between the elapsed and
remaining times, and the two time skips are gone from the screen (seeking is still the
waveform, its keyboard slider, and the lock screen's own seek buttons, which were not touched).
Previous behaves the way every player's does: past the first three seconds it restarts the
track, and only near the start does it go to the one before; a ring session, which does not
loop, never wraps backwards from its first track. The lock screen's previous track button uses
the same rule. The Up next tile stays as the preview of what Next will do.

**Queue rows are reordered by dragging a grip**, replacing the up and down buttons. A pointer
drag on the grip moves the row with the finger while its neighbours slide aside, and the move is
applied once, on release. The grip alone carries `touch-action: none`, so the list still scrolls.
Arrow up and down on the focused grip do the same move, so reordering is not gesture only; rows
are keyed by track id so focus stays on the moved row.

## 2026-09-24: Discover offers what each type of member actually publishes

Only audio had anything to do from Discover (tracks, via "From the ring"); everything else had
just Visit site, though the ring publishes more per type. A member's own data now decides the
button, in `preview.ts`: audio with tracks gets **Play** (starts a ring session, the same as the
card in Feeds); comics, art and text open a **viewer** (comic pages, artworks with their medium
and year, text excerpts); a game gets **Watch trailer** or **Preview**, which open the link out,
since the ring gives a URL and not a format the app can be sure to play; a member with nothing
previewable simply has no button rather than a disabled one. The viewer is a native scroll-snap
strip, so a swipe in it is the browser's own and never competes with Discover's swipe. Images
are plain `img` elements, which need no CORS, unlike the canvas. Not built: a "load into the
app" for visual work beyond viewing (the IndieNodes app's node viewer does more); this covers the
ring's published previews only, and `ring-contract.md` still lists `preview_url` and
`trailer_url` as game only, which is what the code assumes.

The position was shown twice (a chip reading "Ring 3 / 6" and a counter reading "3 / 6 in the
ring"). The chip now says **Node of the day** or **IndieNodes webring**, naming where members
come from, and the counter shows the position once, with the active filter or "shuffled"
appended. Feeds' "From the ring" heading is now "From the IndieNodes webring" and the
`ring.json` note beside it, which meant nothing to a reader, is gone.

## 2026-09-24: Music shuffles by default, and the choice lives in You

A ring member's tracks are dealt into the queue in a shuffled order when they are played or
added, on by default and switchable under You, Playback. Only members whose `form` is music: a
spoken word member's episodes keep their order, since a second episode is not a fresh track to
be dealt in at random. It shuffles a member's own tracks as they are queued, so a member's
tracks stay together and members join in the order they were chosen or suggested; it does not
interleave members. Ordinary Listen queues are untouched. The preference is stored through the
`Store` (`shuffleMusic`), not localStorage, since nothing needs it before first paint. To make
shuffle testable, the tests pin `Math.random`.

## 2026-09-24: Discover does not auto rotate

Evaluated on request: should Discover advance to the next member on its own? Recommendation,
and what is built (nothing), is **no**. A moving screen is a wrong default here for four
reasons. It takes control from the reader in the one screen that is about choosing, and with a
photo wipe running each time, a change mid read is the thing people describe as a page
jumping. Content that moves on its own for more than five seconds needs a pause control to meet
WCAG 2.2.2, which is a control this screen would then have to carry. The WebGL wipe is the
costliest thing in the app, and unattended rotation would spend battery on frames nobody chose to
see. And "node of the day" already gives the screen a stable anchor that every client agrees on;
rotation would undercut that. What fits the product better if it is wanted later is opt in:
a Slideshow control in You or on the Discover screen, off by default, pausing on any touch and
under reduced motion.

## 2026-09-24: Icon only Preview and Visit on Discover; the webring is named in About, not on the hero

The Preview and Visit site buttons are icons now (a play, page or arrow glyph, with the label as
`aria-label` and `title`, and a 52px target), which puts them on the same row as Follow
everything and gives the hero its height back. Follow everything keeps its words, since it is
the one action that needs saying. The "IndieNodes webring" chip on the hero is gone: on every
screen it was a label a reader had no use for, and naming the source belongs where a reader goes to
learn how the app works. That is now You, About, "How Discover works", which says Discover's
members come from the IndieNodes webring, that the day's member is the same for everyone, and
that nothing is ranked. The "Node of the day" chip stays because it says something about the
member on screen. Feeds' "From the IndieNodes webring" heading was kept: there it separates
ring members from the people a reader follows. Worth carrying the same sentence into any
marketing copy and the README.

## 2026-09-24: Discover's text exits, then enters, as the prototype does

The prototype animates the outgoing hero text away (to 70% of the width, opposite the incoming
side, fading) and only afterwards brings the new lines in one by one. The app had only the
entrance. Both are built now, in that order, so the first line of a new member starts a full exit
duration after the change; the very first member on screen does not wait. A swipe's exit carries
on from where the finger let go rather than snapping back first (`exitFrom`).

Two implementation points worth keeping. The outgoing and incoming text share a one cell grid so
they overlap instead of stacking. And the outgoing block is marked `aria-hidden` and `inert` from
its first instant, so a screen reader never meets two names at once, but Svelte **reuses** a
block that is still leaving when the reader steps straight back to that member. A first version
that set the attributes once left the reused block hidden, and the member's name vanished from
the accessibility tree entirely; a Discover test that steps Next then Previous immediately after
load caught it. The fix is to clear them only when the exit is reversed, meaning its progress
returns to 1 after having left it.

## 2026-09-24: The tab bar and mini player are their own transition layers

Tab changes run as a View Transition over the whole document, so the tab bar and mini player,
being part of it, slid with the screen. Each now has a `view-transition-name`, which pulls it out
of the page's snapshot so the screen slides underneath it. Two constraints shaped how. The names
are applied only while a tab navigation is running (`data-nav`, which the layout already sets for
its direction): a named layer paints above the rest of the snapshot, so a permanent name would
have put the bar on top of the full screen player during the card to player morph. And the old
snapshot of each is hidden while the new one is left live, so the bar's own animation keeps
running rather than crossfading between two stills.

The current tab's highlight became one indicator that slides between tabs (placed from the icons'
measured positions, not animated on first paint, re-placed on resize), matching Feeds' pills and
You's theme control. That is what makes the bar read as one object with a marker, rather than
four tabs each lighting on its own. The DOM cannot show a snapshot's position, so the tests
watch the transition's own pseudo elements (`document.getAnimations()`), and the indicator's
travel across intermediate positions.

## 2026-09-24: Tab taps: what the delay was, what was done, and what was not

The pause between tapping a tab and the slide starting was measured before anything was changed,
at a 6x slower CPU to stand in for a phone. Navigation itself begins about 10ms after the tap. The
slide begins 230 to 340ms after it, because a screen transition cannot start until the browser has
captured the old screen and the new one has been built and laid out, and rendering is frozen for
all of that. Profiling found two avoidable costs inside it: the hero's draw loop reading
`canvas.clientWidth` every frame, forcing a layout while the next screen was mounting (about 170ms,
now a `ResizeObserver` cache, down to about 40ms), and WebGL setup plus texture uploads landing
in the same window (deferred until after the first paint).

**The second change did not measurably move when the slide starts** (230ms before and after), and
the first only shows in the profile, so neither is claimed as the fix. What does change what a
reader sees is answering earlier than the transition can: the indicator now reacts on finger down,
about a tap's length before the click, which is the only moment the bar can visibly move, since
rendering freezes once the transition starts. The bar takes it back if the finger slides off
(`pointerup` position for touch, since `pointerleave` fires on every touch lift just before the
click and would flash the indicator back). All four screens' code is also preloaded.

**What remains** is the browser's own style, layout and paint work for the incoming screen
(most of the profile), which scales with how much that screen renders. The likeliest next step if
it still feels slow on the device is rendering Feeds' inactive panes lazily; it was not done
because the test data has no yips, so the saving could not be measured here.

## 2026-09-24: The blink when returning to Discover

Two separate causes, one older and one introduced by the tab tap work above. The cover's CSS layer
ran its `hero-in` fade every time it mounted, so returning to Discover always faded the cover in
from transparent; only a change of member should crossfade, so the first layer of a mount now
appears in place. And deferring WebGL until after the first paint moved the hand off from the CSS
cover to the canvas to just after the slide, when the canvas (`display: none`, so never drawn to)
was switched on before it had painted: a blank frame. The canvas is now always laid out, at
opacity 0, and a photo is announced as drawable only once the canvas has painted a frame
(`data-painted` marks that); photos preloaded after that are announced when they load, so a wipe
to a neighbour is unaffected.

Verifying it took some care. Screenshot sampling and a CDP screencast both passed on the old code
too, because a headless run's first captured frame is already the settled screen and the blink is a
frame or two. The test instead checks every animation frame from the tap for the two conditions
directly (a running cover fade, a canvas shown before painting) on a return visit with a slow
photo host. Its comparison with the old code is weaker than it looks, since the old code has no
`data-painted` marker at all; the cover fade condition is the part that stands on its own. Not seen
on a device.

## 2026-09-24: Tabs navigate on pointer up, because the browser sometimes never sends the click

Reported as "swipe to a new member, tap another tab, nothing happens until you go back to Discover
and try again", intermittent. Reproduced with real touch input: a tab tap within roughly 300 to
500ms of a committed swipe produced `pointerdown`, `touchstart`, `pointerup` and `touchend` on the
tab, and then no `click` at all, so nothing navigated. A tap after a short drag that did not
commit, or after a drag on a screen with no swipe handler, was fine; the swipe's explicit pointer
capture and cancelling its pointermoves each shortened the window without closing it, and turning
off animations, WebGL, the text exit or `inert` changed nothing, so those were ruled out rather
than kept as speculative fixes. I did not find the browser's own reason for withholding the click.

So the fix does not depend on it. The tab bar navigates from `pointerup` for a primary, unmodified
pointer tap that ends on the tab (a finger that slid off is not a tap), and cancels the click that
may follow within 600ms so one tap is one history entry (tested). Keyboard activation still comes
through `click`, and modified clicks (open in a new tab) are left to the browser. Worth knowing:
other controls that a reader might tap right after a swipe are still on `click`; only the tab bar
has this treatment so far. Verified on real emulated touch in Chromium, not on a device.

Follow up on the blink: the reported "cover size adjust" was a real size difference. `.art` is
`inset: -2%` (oversized so a focal point near an edge still fills the frame) while `canvas.gl` was
`inset: 0`, so when the canvas took over from the CSS cover the photo changed scale by about 4%
(7.8px per side at 390 wide, which the new test measures against the old CSS). The canvas now has
the cover's exact box (explicit size, since inset does not stretch a canvas) and its hand off is a
short opacity fade over a cover that stays put underneath, replacing the old `visibility: hidden`
swap. **Not matched: the focal point.** The CSS cover honours a member's `thumb_position` and the
shader always centers, so a member with an off-center focal point will still shift slightly during
that fade. Fixing it means passing each texture's focal into the shader's `cover()`; it was left
because the fade turns it from a pop into a drift, and it can be done if it is noticed.

## 2026-09-24: The canvas is for swiping, not for arriving or resting

Prompted by the suggestion that the canvas and shader should only be in play while swiping between
members, not during page transitions. Rather than switching the canvas off around navigation (it
is already destroyed on leaving Discover, since the page unmounts), the fault was on arrival, so
three things changed there. It **does not start until the slide is over** (the layout's `data-nav`
marker gates it, bounded at 1.5s), so a shader compile and texture upload are no longer in the
middle of the transition. It **draws nothing at rest**: the slow ambient drift (a throttled redraw
for up to ten seconds after any touch, and a small noise offset on the image) is removed, so at
rest the canvas is an exact copy of the cover and costs nothing, and it draws only while a drag or
a wipe is moving. That removes a deliberate part of the prototype's look, on the reasoning that
the canvas is for swiping. And it **crops about the member's focal point**, as the CSS cover does,
which was the remaining difference after the box was matched: the shader's `cover()` now takes a
focal, passed per photo including the preloaded neighbours. Tests: a two-tone photo with the focal
point at the right edge must show only its blue half on screen (it fails on the old centered
crop), and a per-frame check that the canvas has not painted while the transition marker is up.
Side effect worth knowing: because the canvas no longer redraws at rest, its drawing buffer is
empty by the time anything reads it back, so tests read the composited screenshot instead.

## 2026-09-24: Discover draws the saved ring first, and checks the network afterwards

Reports of Discover showing "Loading the ring" after the app resumed were not a cache expiry.
`fetchRing` awaited the network (10 second timeout) and used the saved copy only if that failed,
and Discover asked on every mount, so a resume waited on a slow or paused request with nothing
on screen. `ring.load()` now applies the saved ring immediately (new `cachedRing` in
`@yipden/ring-client`), then checks the network in the background. A ring checked within 15
minutes is not asked about again, the layout asks again on resume, and a failed check is not
recorded so the next visit retries. A changed ring updates in place: the reader's order and
place are kept, new members go at the end. `loading` now means only "no saved copy and no answer
yet", which is where the new `RingLoader` shows.

The waveform got dev-only console logging of why it fell back to the bar, and that logging found
the cause. It was not CORS: wavesurfer loads a passed-in element's existing source on its own,
aborts that load when ours starts, and emits the abort as an `error`. `Waveform.svelte` treated
any error as failure. It now ignores `AbortError`. Verified in a browser against real ring
tracks, and by an e2e that fails without the change. The earlier entry about CORS on Android
still stands as unconfirmed on a device; see ROADMAP.md, which also notes one slow host.

## 2026-09-28: YipDen is a doorway, and what we do with a site grows only with its owner's consent

Agreed with the sibling project, IndieNodes: reading never requires an account or a change to
anyone's site. Everything below follows from it, and it is why nothing in this batch touches a
server. Found-site discovery (suggesting sites nobody submitted) is deliberately **not** built: it
needs its own consent design first, and is a placeholder in ROADMAP.md.

## 2026-09-28: The save for desktop list is called the Shelf, and lives in the existing local store

"Trail" was ruled out because IndieNodes has a planned "discovery trail". Of Shelf, Later and Crate,
the Shelf was chosen: it names a place things wait without implying a queue the reader owes
attention. The action still reads **Save for later**, which says what a tap does; the Shelf is where
it goes.

It is a new IndexedDB object store (`shelf`) behind the same `Store` interface as follows and
preferences, so a v2.0 sync implementation would carry it through the same door. That took the first
schema change since the store was written, database version 1 to 2. The upgrade only creates what is
missing and is tested against a real version 1 database holding a follow. The alternative, one array
in a setting, needed no migration but would have rewritten the whole list on every save and raced
two quick saves; the migration was the cheaper risk.

An item is a link and a title and nothing else: no fetched content, so there is nothing of anyone's
site stored. Its identity is its address, so saving twice is one entry and the first save's date
wins. Unfollowing a person or clearing cached yips never touches it, because a reader saved that
link for themselves, not as a byproduct of following.

**Export reuses the two paths that exist rather than adding a third.** The full backup gains an
optional `shelf` array without a version bump, since a backup without it stays valid and an older
build ignores it; restore merges. OPML gains one folder outline of standard `type="link"` entries,
which other readers skip, and `parseOpml` skips explicitly so it is never mistaken for a person.
The OPML export button is enabled by a Shelf alone. See docs/shelf-format.md. The static page that
opens an exported file and lists the links, for the desktop handoff, belongs on YipDen's marketing
and docs site, which is not in this repository. It is a follow-up there, not built here.

## 2026-09-28: Layout is declared by the ring, and guessed only for a pasted link

`layout` (`mobile-friendly` or `desktop-first`) is an additive optional field on a ring entry, added
to `ring-client` the way `feeds` and `discoverable` were: it is not published yet, so nothing changes
until it is. `docs/ring-contract.md` lists it as owed. This is a ring contract change and was made at
the maintainer's direction; the ring side still has to add it to its schemas. Only a recognized value
survives normalization, and an absent or unknown one is mobile friendly, so a member is never handled
differently on a guess, and a newer ring can add values without breaking this client.

For a site followed through Follow's paste-a-link path there is no declaration, so discovery reads a
missing viewport meta tag on the page it already fetched (no extra request) as a signal for
desktop-first. Deliberate limits, so it is not mistaken for more than it is:

- It only ever looks at HTML. A pasted feed, a known profile pattern and a fragment that is not a
  page give no signal, and no signal means mobile friendly.
- It is a guess about a site by a client that is not its owner. It changes which button leads, never
  what is reachable: the site stays one tap away and every yip still links out.
- A ring member is never guessed at, only declared.
- A hand written page with no viewport tag that reads fine on a phone will be called desktop-first.
  There is no reader override yet; ROADMAP.md lists it, along with saying so on the Follow screen.

The signal is stored on the person once, at follow time, and travels in the backup. Existing follows
have no layout and keep the old behavior.

**Discover** gives a desktop-first member Save for later as the white primary button. Following steps
back to an icon (still labelled Follow everything) so the row stays one line at 390px, the preview
and Visit site icons stay, and a "Best on desktop" chip says why the row is arranged this way.
**Feeds** adds a small bar under a desktop-first person's yips; the card itself still opens the
creator's page as before.

## 2026-09-28: Partner rings get a boundary and a scaffold, not a first adapter

Built now: `readPartnerRing` in `ring-client`, the tab and the "via" attribution in Discover. The
pattern is the one ROADMAP.md sketched. An adapter only maps a ring's own document onto loose
candidates; every candidate then crosses one boundary that validates it (public https address, a
name, a stable id), reduces it to a small common shape, and reads richer fields (`thumbnails`,
`tags`, `layout`) only when the adapter declared that capability. A partner member is a different
type from a ring entry, and nothing builds the second from the first, so mixing into the IndieNodes
rotation is a type error rather than a convention.

Discover shows a partner ring in its own panel, chosen in the Filter sheet, replacing the hero while
open, with the hero inert underneath. That is a real requirement, not polish: a first version left
the hero's buttons focusable and readable behind the overlay, which the visual pass caught. Every
card says "via [ring name]", links to that ring's own hub, and links out to the member's site; a
desktop-first member leads with Save for later like anywhere else. Choosing a category returns to
IndieNodes, since categories belong to it.

**No partner ring is registered.** The registry is empty and Discover shows no switcher while it is.
Which ring to read first and how is a ring contract decision, so it is **ask first**. The end to end
suite uses a made up ring and a made up shape, bundled with no network and compiled in only when a
build sets `VITE_YIPDEN_PARTNER_FIXTURE=1`, then only when a test opts in by a localStorage key. A
normal build was checked to contain neither the fixture nor the key.

## 2026-09-28: `noai` for the reader view is decided, not built

Recorded so it is not rediscovered later. When the clean reader view is built (ROADMAP.md item 11),
it honors `noai` (meta robots) and `X-Robots-Tag: noai` in the same place `http.ts` honors
robots.txt: the request that fetches a page for the reader view, not the feed or discovery fetches.
YipDen has no AI, so the directive does not bear on following someone; applying it to feed fetching
would break following for anyone who set it. Honoring it means the reader view declines to render a
cleaned copy for that page and offers only the original link. The original URL is the primary action
on every reader-view card, and fallback content, meaning anything YipDen extracted rather than
something the creator published in their feed, is styled visibly differently from a creator-published
item. None of this is code yet, because the reader view itself is not.

## 2026-09-28: IndieNodes' posture lives in About, not a dedicated page

Asked whether IndieNodes' new posture page existed to reuse. It did not exist in the sibling
repositories yet, so the paragraph in About was written from the three points given: every yip links
out, nothing is ranked, saved lists are local until exported, plus "a doorway, not a destination".

**No dedicated posture page is needed, in this app or on YipDen's marketing site.** The posture is
inferable from About as it stands. This is the permanent home for that copy, not a placeholder
waiting on IndieNodes to publish something to swap in.

## 2026-09-28: Two smaller things this batch surfaced

- **The older end to end fixtures gained a viewport tag.** Their minimal home pages had none, so once
  the heuristic existed they read as desktop-first and every card grew a Save for later bar, which
  broke 32 tests. The fixtures are now ordinary mobile pages, which is what they were always meant
  to model; the heuristic was not weakened to suit them. `shelf.spec.ts` covers both cases.
- **Feeds had no toast.** Saving from Feeds was silent because that page never mounted `<Toast />`,
  found by the first end to end run and fixed.
- **The e2e port is overridable (`E2E_PORT`).** The suite reuses whatever server is on 4173, and
  another project's preview was there, which would have run these tests against the wrong app.

## 2026-09-28: A YouTube video was never sorted into Watch, and never carried a video attachment

Reported from a real device follow: a real channel's yips showed up in Feeds, but never under the
Watch filter. Confirmed live against `youtube.com/feeds/videos.xml` for a real channel, not
guessed from the fixture: YouTube's own RSS has declared `media:content type="application/x-
shockwave-flash"` on an extensionless `/v/<id>?version=3` URL for over a decade. `mediaKindFor`
recognized neither the type (not `audio/`, `video/` or `image/`) nor the URL (no file extension),
so the attachment was silently dropped; only the `media:thumbnail` survived, as an image. With no
`video` attachment, `categorize()` (`apps/reader/src/lib/refresh.ts`) had nothing to call Watch, and
every YouTube item landed in Posts instead, correctly labeled "YouTube" but sorted wrong.

**`mediaKindFor` now recognizes that exact type on YouTube's own hosts as video**, scoped to those
hosts rather than the MIME type generally, since a legitimate reason for another site to still send
`application/x-shockwave-flash` for something that is not video cannot be ruled out. `test/fixtures/
youtube.xml`'s existing shape already matched YouTube's real output, so the gap had a passing test
all along; that test only ever asserted the thumbnail, never that a video attachment existed at all,
which is why this was not caught before shipping. Added: an assertion that the video attachment is
now recognized, a check that an unrelated site's `shockwave-flash` content is not swept up by the
same rule, and an end to end `refreshAll` test with a real YouTube-shaped feed asserting
`category: 'watch'`, confirmed to fail without the fix.

**Separately checked and found not broken:** `channelIdFromPage`, which resolves a pasted handle
(`youtube.com/@name`) to a channel id for Follow's discovery, against two real, live channel pages.
Both still carry the `rel="canonical"` link and `"externalId"` the parser looks for.

## 2026-09-28: Musicians Webring reads for real, for testing, pending its maintainer's approval

Asked directly to prove the partner ring boundary against a real ring rather than only the
fixture, using [Musicians Webring](https://lydels.neocities.org/musicianswebring/webring) until
its own maintainer has been asked and agreed. That approval has not happened yet, and this is not
a shipped inclusion; it exists so the boundary and Discover's UI can be tested against something
real while it is sought.

**The ring itself is exactly the uncooperative case the boundary was built for.** No JSON, no
schema, no versioning promise: one maintainer's hand-written HTML table, styled for a person to
read, not a client. Reading it (`apps/reader/src/lib/partner/musiciansWebring.ts`) walks the same
untrusted-HTML tokenizer `packages/feeds` already trusts for sanitizing feed content and scanning a
page for its own feed links (`tokenize`, now exported from `@yipden/feeds` for this third use),
rather than a hand rolled regex against a stranger's markup. It reads one thing per row: the
member's own link (their name is whatever text sits directly inside it, which correctly skips the
site's own "no button" placeholder `<div>` text sitting one level deeper) and their description; a
rare `<b>nsfw</b>` immediately after the link is the one thing beyond the common shape it declares.

Verified against a real, saved capture of the live page
(`apps/reader/src/lib/partner/test-fixtures/musicians-webring.html`, 2026-09-28), not an invented
shape, kept exactly as fetched rather than reformatted (see `.prettierignore`, the HTML case of the
same rule the XML and JSON fixtures elsewhere in this repo already follow). It found 73 of the
page's own claimed "74" members; the one difference is not a scraper miss, it is "Bailey Lockheart",
whose site is plain `http://`, which `safeUrl` correctly refuses same as anywhere else in the app.

**A `sensitive` capability was added to the partner boundary** (`ring-client`'s
`PARTNER_CAPABILITIES`), because two of this ring's members carry that `nsfw` mark. Rather than
invent a second "explicit content" concept, partner members reuse `includeExplicit`, the setting
IndieNodes' own `explicit` field already answers to (`packages/ring-client/src/filter.ts`): a
sensitive member is dropped from `partnerRings.svelte.ts`'s results unless a reader has opted in,
which is the same conservative default IndieNodes already committed to and the same reason given
for it. One setting, one meaning, across both ring types.

**Registration is gated by a local flag alone** (`localStorage: yipden:partnerMusiciansWebring`),
not the build-time flag the fixture uses: there is nothing to keep out of the bundle here, only a
live fetch to a real, small site's server this reader chooses to make, so the gate is about
politeness and intent rather than shipping size. `FeedHttp` still applies: robots.txt honored, one
request at that host at a time, the same size cap discovery already uses. **This must not still be
able to turn on when `v0.9.0` is tagged** unless the maintainer has said yes by then; see ROADMAP.md.

**Found writing the test, worth keeping in mind generally**: `vi.resetModules()` followed by a
fresh dynamic `import()` gives that import its own copy of every module it depends on, including
its own fresh `store` singleton, distinct from one imported statically at the top of the same test
file before any reset ever ran. A setting written through the top-level reference before calling
`freshState()` silently never reached the instance the freshly imported code actually opened,
which read back its default and produced an empty ring rather than a filtered one; the assertion
did fail, so nothing shipped broken, but resolving it took establishing which of two `IdbStore`
objects a given call was actually touching. `partnerRings.test.ts`'s `freshState` now sets any
needed setting through the same store reference the reset epoch it creates will actually use, and
`shelf.test.ts`'s own comment about the singleton keeping a stale database handle across a
`beforeEach`'s `globalThis.indexedDB` reassignment (found earlier this session) is the same family
of hazard from the opposite direction: a _reused_ singleton clinging to an old handle instead of a
_freshly reset_ one opening the current handle but going unwritten-to by an old reference.

## 2026-09-29: A partner member's own sample link is read too, not just its name

Raised directly: browsing Musicians Webring feels like "complete serendipitous discovery" next
to IndieNodes, where every member has something previewable in app. Two paths were on the table —
ask the ring to publish richer data, or build a tool that visits every member's own site to pull a
sample ourselves — and neither was needed. The ring's own listing page already has a third column,
either `-` or a link the member handed the maintainer specifically to be heard; the scraper simply
never read it. It does now (`packages/ring-client`'s new `preview` capability, a `previewUrl` on
`PartnerCandidate`/`PartnerMember`, and `musiciansWebring.ts` reading the row's third `<td>`).
Verified against the real, saved page: 53 of the 73 usable members carry one.

**The second path, an automated per-member crawl, was declined, not merely deferred.** It would
mean fetching from 73 individual small creators' own servers, well beyond the one ring index page
this adapter already reads, and doing it silently would run against the posture this whole project
already committed to (see the 2026-09-28 doorway entry: "what we do with a site grows only with
its owner's consent"). The listen link is the opposite case: each member chose that specific link
and gave it to the ring for exactly this purpose. Reading it is using something offered; crawling
every site ourselves would not be.

**It is deliberately never treated as playable in app.** Unlike IndieNodes' own `tracks[]`, a
`previewUrl` is neither a known audio format nor something this client fetched and verified — most
of Musicians Webring's are Bandcamp, SoundCloud or YouTube pages, not files. `PartnerRingPanel`
opens it externally with `openExternal`, same as Visit and Save for later, never attempts to embed
or stream it. A ring that does publish something YipDen can actually play would still go through
`tracks[]`-shaped richer fields under its own future capability, not this one.

**"OnionRing", checked directly, is not a richer data source.** It is a real, small open source
webring engine (joey + mord of allium house, CNPL v4+) this ring uses only for the prev/next/random
widget its members embed on their own pages. Its own file, `onionring-variables.js`, is a bare
`sites[]` array of URLs with no names or descriptions at all — less structured than the table this
adapter already reads. The richer table is this maintainer's own addition on top of OnionRing, not
something that would generalize to another OnionRing-based ring's own adapter later.

## 2026-09-29: You splits into You and Settings

Raised directly: You read as both a personal dashboard and the app's configuration screen at
once. Split along that line: **You** keeps Following and the Shelf, the reader's own data, gaining
only a gear icon in its header; **Settings**, a new route at `/you/settings`, holds Appearance,
Playback, the follows file (export/import OPML, clear cached yips) and the full YipDen backup, and
About. Not a fifth tab: the tab bar's four items, their sizing and their animation are established,
tested surface (see the 2026-09-23 tab bar entries), and a screen a reader configures occasionally
does not carry the same weight as one they check daily. `TabBar.svelte`'s own `isCurrent` already
matches by `pathname.startsWith(href)`, and `navigation.ts`'s `tabIndex` already treats anything
outside the four tab paths as a detail view that pushes in and reverses on the way back, so Settings
needed no change to either: it is exactly the category those two files already existed to handle.

Settings keeps its own explicit "Back to You" button (matching `PartnerRingPanel`'s own back
button) in addition to the hardware/gesture back that a real route already gets for free, since a
reader should not have to know that gesture exists to leave a screen they can also just tap out of.

Splitting an established, heavily tested file is also a hazard, named here so it is not
rediscovered: several existing e2e assertions crossed the new page boundary without their author
initially registering it (an OPML import checks the imported person shows up in the Following
list, previewing then restoring a backup does the same, "every control clears 44px" mixed radios
now on Settings with Unfollow buttons still on You). Each was found by actually running the suite
against the split, not by inspection, and fixed by having the test navigate to wherever its
assertion now actually lives, rather than weakening what it checks.

**Found and fixed on the way**: `you.svelte.ts`'s own page never called `shelf.load()`; the Shelf
section rendering there worked only because Discover or Feeds, visited first in the same session,
had already loaded it. Both You and the new Settings page now call it in their own `onMount`,
matching the app's existing pattern (`you.load()`) of a page ensuring its own data rather than
depending on another screen having run first.

## 2026-09-29: A partner ring's cards fold and stand the same way Feeds' yips do

Asked directly for the same treatment. `cardStack.ts` needed no change at all: it already looks
for nothing more specific than a `.yip-stack` class on a scrolling pane's children, so applying it
elsewhere is only marking `PartnerRingPanel`'s own scrolling `<section>` with `use:cardStack` and
its `<li>` cards with that same class, plus the matching CSS (kept literally line for line with
Feeds' own selectors and keyframe names, `.pane` swapped for `.partner`; Svelte scopes both
components' `@keyframes` and named view-timelines independently, so reusing the same names carries
no collision risk between them).

**Deliberately not copied**: Feeds' `content-visibility: auto` / `contain-intrinsic-size` pair.
That optimization is tuned to Feeds' own cards' known, fixed heights (200px, 172px for Listen, and
so on); a partner member's card varies with its own blurb length and how many action buttons wrap
onto a second line, and guessing a size for content that varies this much is exactly the mistake
that produced the "stuck scrollable area" bug already recorded for Feeds' own Listen pane. A
partner ring is also at most a few dozen cards, not the hundreds that optimization exists to keep
cheap, so the case for it here is weak even before the risk. `.card` also needed `position:
relative` added, which Feeds' equivalent already had on its own wrapper: the stack's dim overlay
is an absolutely positioned `::after`, and without it the overlay would have sized to `.partner`
itself (the nearest positioned ancestor, being the sheet's own `position: absolute`), covering the
whole panel rather than the one card passing behind the top.

## 2026-09-29: The partner ring stack's bleed-through, and its back bar pinned

Two adjustments to yesterday's card stack, both raised directly against how it actually looked
and behaved.

**The see-through was real, and the cause was a background, not the transform math.** A card
passing behind the next one during the fold used the same translucent tint every glass chip on
Discover uses (`rgba(255,255,255,0.07)`), so the receding card showed straight through the one
replacing it: a visible glitch, not "one card passing behind another." Feeds never has this
problem because the animated wrapper there (`.yip-stack`) contains a fully opaque `.yip`; here the
animated element and the visible card were the same element. Fixed by making `.card`'s background
opaque (`color-mix(in srgb, #fff 7%, var(--deep))`, over the panel's own solid color rather than
translucent over whatever sits behind it), which reads identically at rest and stops being
see-through in motion. The stack itself is kept, not removed: the actual defect was fixable and
narrow, not a reason to give up the feature.

**The back bar is now pinned**, the same fixed-head-over-a-separately-scrolling-pane split Feeds
already uses (`.head` / `.pane` there; `.head` / `.scroll` here). `cardStack.ts` needed no change,
only re-targeting which element it decorates.

**That restructuring surfaced a real, separate bug, found by a real click failing in the end to
end suite, not by inspection**: the very first card became permanently unclickable
(`pointer-events: none`), in every browser, with no scrolling having happened at all. Cause: the
stack's `IntersectionObserver` shrinks its own root by 4px from the top (`rootMargin: '-4px 0 0
0'`) to decide when a card has scrolled past the pane's edge and should stop taking taps. Moving
the "back to IndieNodes" spacing out of `.partner` and into `.head` left `.scroll` with zero
top padding, so the first card sat flush against the pane's top edge at rest, inside that 4px
shrunk margin, permanently marked "behind" from the first paint. Feeds never hits this because its
own `.pane` already carries 6px of top padding; `.scroll` now carries the same 6px, for the same
reason. Recorded because the failure mode is easy to reintroduce: nothing about it is visible by
eye, a screenshot looks correct, and it only shows up as buttons that quietly do nothing.

## 2026-09-29: A partner preview's platform is named honestly, no fetch, and checking the rest is a separate, manual tool

Closing the loop on the "browsing feels like Web1.0 serendipity" and "would a scrape be a
violation" discussion (see the two entries above). Three things were on the table; all three
landed where that discussion pointed.

**Platform classification (yes, ships in the app, no fetch).** `previewKindOf` in `ring-client`
guesses what a `previewUrl` actually is from the URL alone — the same technique `@yipden/feeds`'
`feedKindFromUrl` already uses for a feed. `PartnerRingPanel`'s Listen button now says "Open on
SoundCloud", "Open on Spotify", "Watch on YouTube", and so on, instead of one "Listen" that reads
the same whether it is a two-second file load or a Spotify paywall. Nothing about what happens on
tap changed: every one of these still opens externally, same as before.

**A metadata-only check for own-domain links (yes, but as a separate, manual, developer-run
script, never the app itself).** `scripts/analyze-partner-previews.ts` does one polite `HEAD`
(falling back to a one-byte ranged `GET` for a host that answers `HEAD` badly) against a small,
hand-picked list of real, ambiguous Musicians Webring links — a member's own domain, no
recognized extension, so `previewKindOf` alone cannot say whether it is a file or a page. It is
not part of the app, its build, or CI; it is run by hand, occasionally
(`npx tsx scripts/analyze-partner-previews.ts`). That split is the point: the running app's own
network footprint stays exactly what it already was (the ring's own index page, nothing more),
rather than every installed copy independently re-checking the same handful of small personal
sites on its own schedule.

Robots.txt is honored with the real parser already audited for this (`FeedHttp.allowed`), not a
naive "does the file contain Disallow anywhere" check, and running it against real sites showed
exactly why that distinction matters: one candidate's robots.txt lists `Disallow: /` for a dozen
named AI crawlers by name and has no wildcard `User-agent: *` group at all, which the standard
(and this project's own parser) reads as unrestricted for anyone not on that list, an honest
reader included. A cruder check would have refused a site that was never actually asking to be
left alone by something like this.

**First real run, four real candidates**: all four turned out to be pages, not raw files
(`content-type: text/html`), likely each with its own embedded player. That is real information
`previewKindOf` could not have produced alone, which is the whole case for the tool existing; it
is not wired into the shipped app's own data yet, since this was explicitly a "see how this works
out" run, not a decision to start shipping verified results.

**Declined, unchanged from the "more research" entry**: downloading, caching or embedding the
audio itself, and crawling a member's whole site looking for a sample the ring never pointed at.
Neither happened here, and neither is planned.

## 2026-09-29: A second real, differently-shaped ring, and what it actually cost

Asked directly for a plan, then to build it: Knifebeetle (a webcomic ring,
https://knifebeetle.neocities.org/), gated the same testing-only way as Musicians Webring
(`localStorage: yipden:partnerKnifebeetle`, no build flag, not shipped, its maintainer not yet
asked). The point was proving the boundary generalizes to a second, structurally unrelated ring
before committing further, and it mostly did, with two things worth recording precisely because
they were found by testing against the real page, not by reasoning about it.

**It is not built on OnionRing or any shared engine.** A fully custom hand-built page, ten genre
sections, and two different hand-written templates for one listing ("Read:"/"Follow:" on their
own lines, or a single combined "Links:") that happen to agree on the two things this reads: the
`<h4>`'s own link is the comic's address (checked against every real example; the "Read: website"
line, when present, always points at the same address), and the first `<p>` after it is the
description. Neither the "Read:"/"Follown:" labels nor the number of links after them needed
reading at all, which is simpler than it first looked.

**Content warnings are not `sensitive`, on purpose, by direct decision.** 57 of the ring's 68
comics carry one, for ordinary things like "mild violence", nothing like the 18+ flag IndieNodes'
own `explicit` or Musicians Webring's `nsfw` mark. Treating a content-warning block as `sensitive`
here would have hidden 84% of the ring by default, the wrong direction to be wrong in for content
warnings, which exist to inform a reader, not to gate them. `knifebeetleWebring.ts` never declares
the `sensitive` capability at all; the warning text is folded straight into the blurb instead,
visible the same way a content note on a book or film listing already is.

**The real count (31 of ~68) is not a bug, and the test says why rather than asserting a bare
number.** A third of the page's comics are commented out (`<!-- -->`, removed or inactive; `tokenize`
already discards comment content, so these produce no tokens and need no special casing), and 14
more link their own site as plain `http://`, which `safeUrl` refuses the same as anywhere else in
this app, confirmed against two of those sites directly: several answer fine on `https://` too, so
this is the creator's own listing being out of date, not a real absence of https. Both effects were
found by writing the test against the real page and getting a number that did not match the naive
assumption, then checking why by hand rather than adjusting the assertion to fit.

**A real "complete" badge image sitting before a comic's title link** (`<img
src="/images/complete-2.gif">` inside the same `<h4>`) needed no special handling: the scraper only
starts tracking the title once it reaches the `<a>`, so an image before it is walked past exactly
like the untracked `<b>` wrapping it.

## 2026-09-29: A partner member's own thumbnail, and a platform's own mark on the button

Two small, finishing pieces, both raised directly.

**The `thumbnails` capability, built earlier and never actually displayed anywhere, now is.**
`PartnerRingPanel` shows it as a small 40px badge beside the name, not a hero image: what a ring
actually publishes here varies from a classic 88x31 webring button (Musicians Webring, a banner,
not a portrait) to real cover art (Knifebeetle), and `object-fit: contain` over a soft background
reads sensibly as either without cropping or distorting one to fit the other's shape.

**A Listen/Open button now shows the platform's own mark**, not one generic play triangle for
SoundCloud, Bandcamp, Spotify, Apple Music and YouTube alike. The marks are real brand icons, not
a house style redrawn to approximate one: paths taken directly from Simple Icons (CC0 1.0,
simpleicons.org), fetched once and kept in `PlatformIcon.svelte` rather than loaded at runtime,
the same self-hosting reasoning already applied to this app's own fonts. Listed in the About
sheet's attributions, matching how every other dependency here is credited. `fill` is left to
`currentColor`; nothing hardcodes a brand color, since the same icon sits on both a white pill and
a glass button depending on which action it is.

Found while wiring this up: `PartnerRingPanel`'s own scoped CSS could not reach into
`PlatformIcon`'s markup at all. Svelte's style scoping only touches elements written directly in a
component's own template; passing a `class` prop through to a child and hoping the parent's
`.secondary .ic` rule would still apply to it does not work, regardless of whether the child
forwards the class attribute onto its root element, since the parent's compiled CSS is scoped to
elements carrying the parent's own scope attribute, which a child's markup never does. Fixed by
giving `PlatformIcon` its own default sizing in its own `<style>` block instead of depending on a
selector reaching across the component boundary.

**A real, if small, existing test needed fixing for a reason worth keeping in mind generally**:
wrapping `<h3>` in a new `.title-row` div (for the thumbnail to sit beside it) changed what
`heading.locator('..')` actually returned, from the whole card to that new wrapper alone, silently
narrowing what a "get the surrounding card" helper in `shelf.spec.ts` could see. `.locator('..')`
is fragile exactly because of this: it encodes an assumption about DOM depth that a purely visual
change, adding one wrapping element, can invalidate without changing anything a test author would
think to look at. Replaced with Playwright's `has` option (`panel.locator('li.card', { has:
page.getByText(name) })`), which finds the right ancestor regardless of how deep the matched text
sits inside it.

## 2026-09-29 — Two gaps found after the thumbnail/icon work shipped

**Musicians Webring never actually had thumbnails to show.** The generic `.thumb` display in
`PartnerRingPanel.svelte` was built and proven against Knifebeetle, which does extract its own
`<img class="comicicon">`. Musicians Webring's own scraper, though, never read the button `<img>`
in each row's first cell at all — its tokenizer walk only tracked the image for depth-counting
purposes and skipped over it, and its `capabilities` array never declared `'thumbnails'` in the
first place, so even a hand-added field would have been stripped at the `readPartnerRing()`
boundary. Fixed by capturing the row's first `<img src>` inside the member's own link (before any
name text), resolving it with `absoluteUrl()` against the ring's base URL, and adding
`'thumbnails'` to the adapter's declared capabilities. Confirmed the resolved URL empirically
(`https://lydels.neocities.org/musicianswebring/imagenes/botones/...`) rather than assuming it,
since the ring's base URL has no trailing slash and `URL` resolution of a `./relative` path
against a slash-less base replaces the base's last path segment rather than appending beneath it.

**Knifebeetle never got turned on for the test phone.** The adapter and its `localStorage` gate
were both correct and tested; the actual gap was operational. The `CAP_LIVE_RELOAD_URL` used for
the last `cap:sync` only carried `?yipden:partnerMusiciansWebring=1`, so the one-time
`adoptUrlFlag()` mechanism never had a chance to see the Knifebeetle flag on that device. Fixed by
resyncing with both flags in the query string
(`?yipden:partnerMusiciansWebring=1&yipden:partnerKnifebeetle=1`) and rebuilding the debug APK.
Neither ring is enabled by default; both remain testing-only until their maintainers are asked,
per the existing pre-`v0.9.0` note in ROADMAP.md.

## 2026-09-29 — Four more gaps, found by actually using the app

**A new follow's yips could take a long time to show up, or never visibly show up at all.**
`FeedsState.loadAndCatchUp()` already existed for exactly this ("fetch in the background if there
is a feed nobody has ever actually read"), but its implementation called the plain, unscoped
`refresh()`, which refetches _every_ followed feed, sequentially, real network per host. On a
phone already following a lot of people, one new follow meant the new feed's own content sat
behind a full re-fetch of everyone else. Worse, since Feeds' own pull-to-refresh gesture already
clears its visible spinner the instant a finger lifts (see the gesture code in
`feeds/+page.svelte`), that whole refresh ran with no visible indicator at all — indistinguishable
from a follow that did nothing. Fixed by scoping the catch-up refresh to only the feeds that have
actually never been fetched (`refresh(feedIds)`, threading through to `refreshAll({ feedIds })`,
which already supported this), so a new follow's own content is fetched on its own, fast, without
waiting on anything unrelated.

**Reading a stranger's ring page is a real fetch, and nothing said so.** `partnerRings.svelte.ts`
read every registered partner ring one at a time (`for await`), and the ring-switch button on
Discover simply did not exist until that finished (`{#if partners.rings.length}`), with nothing
distinguishing "still loading" from "nothing registered." A reader who opened the app cold had no
way to tell those apart. Fixed two ways: the reads now run in parallel (`Promise.allSettled`,
since they are independent fetches to unrelated hosts, not a queue), and a new `status` field
(`idle` / `loading` / `ready`) lets Discover show a small spinner in the button's own place the
instant the read starts, so the button's absence and the button's lateness never look identical.

**Pull to refresh existed only on Feeds.** Discover and You had no way to ask for fresh content
short of leaving and reopening the app. Extracted the gesture into its own action,
`actions/pullToRefresh.ts`, rather than copying Feeds' inline pointer handlers a second and third
time. It is not a drop-in replacement for Feeds' own version, though, and Feeds keeps its
hand-rolled one rather than being migrated onto the shared action: Feeds' pull lives on `.pane`
while an unrelated horizontal swipe (between filter panes) lives on `.viewport`, a different
element, and it works there by grabbing the pointer immediately at pointerdown whenever
`scrollTop <= 0`, gated only by a shared `pulling` boolean the swipe's `enabled()` reads. That
would not survive being placed on Discover's own `<section>`, which carries its horizontal
ring-swipe on that _same_ element: grabbing the pointer unconditionally on every touch start
would eat every ring swipe before `swipe.ts` ever saw the gesture, since a descendant's listener
already firing first was the only reason Feeds' version works at all. The shared action instead
axis-locks on the first decisive movement, the same rule `swipe.ts` already uses, so it can sit
on the very same element as a horizontal swipe with neither one starving the other. Wired into
Discover (re-checks IndieNodes and every registered partner ring, ignoring their freshness
windows) and You (re-checks every followed feed); Feeds' own version is untouched.

**A partner ring's badge was a fixed 40×40 square, and nothing let a reader see a real image
larger.** What a ring actually publishes here varies from a classic 88×31 webring button
(confirmed live, Musicians Webring) to real cover art (confirmed live, Knifebeetle's comic
covers, 300×300) — a fixed square either wasted space around a banner or cropped real art into a
shape it never had. Changed to a bounded box (max 96×64, `width`/`height: auto`) so a banner shows
at its true, crisp size and cover art fills the bound proportionally. Separately, a badge that
turns out to be real art past a threshold (`PREVIEWABLE_MIN_SIZE`, 120 on both sides — chosen
partway between the confirmed 88×31 and 300×300 cases above) becomes tappable, opening a new
`ImagePreview` overlay at full screen; a button graphic stays plain, since enlarging an 88×31
banner only shows the same handful of pixels bigger, not more picture. Decided per image, after
it loads (`naturalWidth`/`naturalHeight`), not per ring or per adapter: nothing about which kind
of image a ring will publish next is declared anywhere, so guessing from the URL or the adapter
would eventually guess wrong. Built as its own component, `PartnerThumb.svelte`, specifically so
it is not Knifebeetle-specific: any partner ring's `thumbUrl` gets the same treatment automatically,
without that ring's adapter needing to know or care.

## 2026-09-29 (later) — Four smaller adjustments after actually using the thumbnail/badge work

**A long name overflowed its container** in two unrelated places: the "Already in IndieNodes"
match row on Follow (`.match-copy b`) and a partner card's title (`PartnerRingPanel.svelte`'s
`h3`). Both are flex children whose sibling truncation styles (the `<small>` subtitle beside the
name) masked the fact that the name itself had none: a flex item's default `min-width` is its own
content size, so a name that does not wrap on its own (typically one long, unbroken word) cannot
shrink to fit and spills past its box instead. Fixed by truncating the Follow row's name with
ellipsis, matching its own subtitle's existing treatment, and by letting a partner card's name
wrap (`min-width: 0`, `overflow-wrap: anywhere`) instead, since a card has room to grow and a
member's chosen name is worth showing in full rather than eliding.

**A partner card's "Visit example.com" button repeated what `.host` right above it already
says.** Once a name can also run long, that repetition read as crowding rather than clarity.
Changed to a plain "Visit"/"Open" label beside a globe icon, with the host kept only in the
button's `aria-label` so nothing accessible was lost, just what was already redundant on screen.

**Discover's skin choice was barely felt**, even though `--deep` (the token its dark hero reads)
already has a distinct value per skin. Two things were masking it: `--deep` is usually hidden
under a real photo (`HeroArt`'s wash gradient is a fallback for a member with no photo at all, not
a constant background), and every chip over that photo — the round Shuffle/ring-switch buttons —
hardcoded a flat `rgba(24, 8, 3, …)`, the Original skin's own dark brown, spelled out literally
rather than read from a token, so it never moved with the rest of the hero underneath it. Added
`--deep-rgb` beside every skin's `--deep` (its own bytes, so a translucent chip can be composited
from it with `rgba(var(--deep-rgb), alpha)`), and pointed `.round`'s three backgrounds at it. Left
`Player.svelte`'s identical `rgba(24, 8, 3, …)` chips alone for now — same latent pattern, against
`--player` rather than `--deep`, but not raised as part of this batch.

**An `ImagePreview` opened from inside a partner card rendered clipped to that card**, not the
full screen. `ImagePreview` is `position: fixed`, and a card sits inside `cardStack`'s own
`.yip-stack`, which the stack action moves with a CSS `transform` on `card.style.transform` every
frame it is not fully at rest. A `position: fixed` element's containing block becomes the nearest
ancestor with a `transform` (among a few other properties), not the viewport, the instant one
exists in its ancestor chain — so a preview opened from a card was fixed to that card's own box,
which is also why it was never actually caught by an e2e test: nothing exercises the stack
mid-motion in the fixture ring, which has no thumbnail data of its own to open a preview from in
the first place. Fixed by moving where `ImagePreview` is rendered from, not by changing
`ImagePreview` or `cardStack` themselves: `PartnerThumb` now reports a tap via an `onpreview`
callback instead of opening its own overlay, and `PartnerRingPanel` renders the one `ImagePreview`
at its own root, a sibling of `.scroll` rather than a descendant of any card, which is never
transformed.

## 2026-09-29 (later still) — Discover's prev/next buttons removed; arrow keys added in their place

The prev/next buttons at the bottom of Discover are gone, ahead of the rest of the bottom-bar
evaluation above (ROADMAP.md): swipe is the intended way to move through the ring, and the
buttons existed as a permanent, always-visible crutch for a gesture that was never actually
taught. Removing them without anything else would have left swipe as the _only_ way to move
through the ring, with no keyboard or switch-access equivalent at all, which is a real
accessibility loss, not just a smaller screen — so `ArrowLeft`/`ArrowRight` were added in the same
change, not requested on their own, calling the same `goNext()`/`goPrev()` the buttons called,
guarded the same way swipe already is (no sheet or partner ring open, more than one member to
move between).

Teaching the gesture itself — a modal prompt, a first-run tour, or something else — is
deliberately not part of this change. See ROADMAP.md for that and for the rest of the bottom-bar
evaluation (Filter's position, the node counter, and Driver.js as the recommended tutorial library
if a guided tour is built).

Every e2e spec that used to click these buttons (18 call sites across 5 files) now presses the
arrow key instead, through a small shared helper (`e2e/support.ts`). A key press, not a simulated
swipe, is the correct replacement everywhere, including `discover-swipe.spec.ts`'s own "next goes
left from where it rests" test: that test specifically depends on the button's old zero-drag
behavior (`navFraction` of exactly 0, unlike a real swipe, which carries whatever fraction the
drag actually covered) — a simulated swipe there instead would have changed what the test was
measuring, not just how it triggered it. A key press calls the exact same function the button did,
so it carries the same zero fraction and keeps the test meaning what it always meant.

**A real timing race, found only once the buttons were gone.** Three specs — two in
`discover.spec.ts`, one in `discover-webgl.spec.ts` — failed after the swap, not because arrow
keys behave any differently from a click at the app level, but because `.click()` was quietly
doing something a raw key press does not: Playwright's own actionability check for a click waits
for its target to stop moving before acting on it. Nothing here ever asked for that; it came free
with every button click, on every one of these tests, the entire time. Pressed again immediately
(next then previous, back to back) with nothing enforcing that wait, `ArrowLeft` could land in the
narrow moment the outgoing member's fly-out transition had marked itself
`.body-inner[aria-hidden="true"]` but the incoming one had not yet mounted, which
`getByRole('heading', ...)` reports as the heading simply not existing rather than having the
wrong text. Fixed by having the shared arrow-key helpers (`e2e/support.ts`) wait for that leaving
copy to be gone before returning, restoring the synchronization `.click()` used to give away for
free.

Three tests needed the opposite of that fix, and for the same underlying reason: they sample the
leaving member mid-flight on purpose — two in `discover-swipe.spec.ts` read the outgoing heading's
own position while it is still animating away (its whole reason for existing), and
`discover-webgl.spec.ts`'s "the wipe travels..." samples canvas pixels in the instants right after
the trigger to catch the wipe itself mid-motion. Waiting for the transition to _finish_ first, the
same wait that fixed the three tests above, is exactly wrong for these three: it would mean the
element or the pixels they read are already gone or already settled by the time they start
looking. All three press the arrow key directly (`page.keyboard.press`) rather than through the
settling helper.

## 2026-09-29 (evening) — Real brand art: the launcher icon, and both in-app marks

Real artwork arrived (`brand/YipDen_Logo.webp`, then a square crop of it made for this,
`brand/YipDen_Logo_Square.webp`): a howling fox inside a ring, over a mountain silhouette. Three
questions had to be settled before touching anything, since a launcher icon and the header/About
marks are highly visible and not cheap to redo three different ways: what to crop (the fox and
ring, not the mountain — the mountain's detail would not survive down to 48px), what color
treatment (the mountain switches with the system's day/night mode rather than staying flat black),
and whether to replace the small existing hand-drawn arch mark in Discover's header and the About
sheet too (yes). See ROADMAP.md for how this was scoped down from a fourth idea (a splash screen
update) that was raised but not done here.

**The launcher icon is a real adaptive icon, not a flattened PNG.** The mountain is a full-bleed
vector background (`drawable/ic_launcher_background.xml`); the fox is a separate vector foreground
(`drawable/ic_launcher_foreground.xml`), independently scaled and centered within Android's
documented adaptive-icon safe zone (a 66dp circle inside the 108dp canvas) so it is never clipped
by whichever mask shape a given launcher applies — deliberately not registered pixel-for-pixel
against the mountain's own silhouette notch the way the original art has them, a relationship that
does not survive being shrunk this far anyway. The mountain, by contrast, is left full-bleed
exactly as composed: a plain background shape loses nothing by being cropped differently on
different devices, which is the entire reason adaptive icons separate the two layers in the first
place. A third layer (`drawable/ic_launcher_monochrome.xml`, the fox alone) supports Android 13+
themed icons, where the OS re-tints it to match the device's Material You theme — a separate,
OS-level notion of "theme" from the day/night colors below, and worth having since it is
increasingly a launcher default rather than an opt-in.

**"Change the black part depending on the theme" became two colors, not one, because a single
swap would have made the mountain invisible half the time.** By day the mountain stays close to
the source art's own near-black (`#1F1410`, this app's own light-theme ink); by night it becomes
the brand orange (`#C2410C`) instead of a darker black, since black on the near-black night sky
(`#120B08`) would stop reading as a mountain at all. The fox stays a constant white throughout,
since it needs to read against both.

**Legacy pre-Android-8 devices, which do not understand adaptive icons at all, get a flattened
day-colors-only PNG** per density (`mipmap-*/ic_launcher.png`, `_round.png`) — no night variant:
vanishingly few real devices are both this old and running a system dark mode a legacy launcher
would even act on, so a second full set of PNGs was not worth the added asset weight. The old
per-density `ic_launcher_foreground.png` files and the unused `drawable-v24/ic_launcher_foreground.xml`
(dead even before this — nothing referenced it) are removed rather than left stale.

**Discover's header mark and the About sheet's mark are now the fox and ring alone, no
mountain** — a small inline mark has no room for the mountain to read as anything but noise — as a
single `fill="currentColor"` SVG path, replacing the old hand-drawn arch shape one-for-one so it
keeps recoloring itself with whatever text color surrounds it, the same as before.

**The raster artwork was traced to vector paths (`potrace`) rather than hand-redrawn**, then
simplified (`svgo`) from about 28KB of path data down to roughly 2.5KB (fox) and 0.4KB (mountain):
potrace's default precision traces individual pixel jitter at the source resolution, which no
launcher icon or 30px header mark needs. `brand/generate-icons.cjs` keeps this whole pipeline
reproducible; `sharp`, `potrace` and `svgo` are deliberately not added to any `package.json` for
it, since nothing else in the app will ever need them and a rare, manual regeneration script is
not worth carrying as a standing dependency. `brand/README.md` has the how-to.

**The source art itself is tracked in git**, in a new top-level `brand/` folder, specifically
because it previously only existed in the gitignored `tmp/`: everywhere it gets used keeps only a
derived shape (a traced path, a generated PNG), and losing the original to a gitignore rule would
have made any future change — a different crop, a color tweak — start from nothing.

## 2026-09-30 — The brand art was redone, dropping the mountain entirely

A second pass at the artwork (`brand/YipDen_Logo.webp`, replacing the mountain-scene version from
the day before) simplified the mark itself rather than changing how it is used: the fox, its ring
and the howl are now framed by a plain arch, and the whole thing is a single white shape on
transparent — no separate black region left at all. Every consumer built the day before
(`brand/generate-icons.cjs`, the launcher icon's three layers, both in-app marks) was updated to
match rather than rebuilt from scratch, since the pipeline itself — trace to a vector path with
potrace, simplify with svgo, scale into the adaptive icon's safe zone — did not need to change,
only what it was tracing and how many colors the result had.

**"The black part changes with the theme" no longer has a black part to point at**, so the
day/night reactivity moved from the mountain's own fill color (the previous design) to the
launcher icon's background plate: brand orange by day, this app's own dark `--ground` by night,
behind a constant white mark. This is a plainer mechanism than before — one drawable swapped for
another via `drawable/` vs `drawable-night/`, rather than a color resource read into a shared
vector — and was preferred specifically because there is now only one thing colored at all (the
background), where the mountain version had two (the mountain and, separately, the sky behind it).

**The safe-zone target grew from 66 to 72 (of the 108dp adaptive icon canvas)** because this mark
earns it differently than the fox alone did: the previous icon deliberately shrank the fox well
below what the full mountain scene used, since the fox was being lifted out of a larger
composition and re-centered on its own. This mark has no larger composition to be lifted out of —
its own source frame is already cropped tight around the arch — so keeping it close to that
frame's own proportions reads as an intact icon rather than a design shrunk to be cautious.

## 2026-09-30 (later) — Filter moved, the node counter dropped for a member list

Built the rest of the evaluation ROADMAP.md had recorded but left undecided: Filter now sits next
to Shuffle at the top, the node counter is gone, and a new Browse members button opens a sheet
listing whichever members the active filter currently leaves visible — tap one to jump straight
there (`ring.jumpTo(id)`, new, alongside the existing `next()`/`prev()`), rather than stepping to
it one at a time.

**`.bottom` stays in the markup as an empty spacer, not removed outright**, because it is load
bearing for layout even with nothing left to show: `.body` (the hero text) sits with
`margin-top: auto` in the same flex column, which only pushes it to the right place because
`.bottom` still reserves the dock's own height below it. Deleting the element rather than just its
contents would have pulled the hero text down under the tab bar the instant the mini player
changed size. A comment says so at the element itself, since an empty div with no visible reason
to exist is exactly the kind of thing a later pass removes by accident.

**Shuffle now shows the same `.is-active` treatment Filter and the ring switcher already had**
when `ring.shuffled` is true. Not requested on its own: the old node counter's text
(`"N / total · shuffled"`) was the only place "you are in shuffle order" was ever actually stated,
and removing it silently would have made leaving shuffle mode (or realizing you were still in it)
undiscoverable rather than just less cluttered.

e2e coverage that used to read the counter's own text (`shelf.spec.ts`'s "never join the
IndieNodes rotation", checking the ring stayed at exactly 3 members and never absorbed a partner
ring's own) now opens the Browse members sheet and counts its rows instead — a more direct check
of the same thing the counter was only ever a proxy for. `discover-preview.spec.ts`'s "the position
is shown once" test lost the one assertion that was actually about the counter; the rest of it
(no redundant "Ring ·" / "IndieNodes webring" / "in the ring" text) was never about the counter at
all and is kept, renamed to say what it is actually guarding.

## 2026-09-30 (last) — The wave's wobble removed, an idle drift added, a post age limit, and immediate fetch on follow

**The wipe stays; the water wobble is gone.** For a short while it was removed outright (commit
`80fac42` is the snapshot before that, and the wipe was restored right after), but the drag that
pulls the background and the full-swipe wipe were wanted. What went was the fbm noise: the shader
now uses a straight edge and a flat push (`n = 0.5`), with no ripple in the edge, the warp or the
drag's vertical displacement.

**Idle drift is one continuous CSS loop on a wrapper (`.drift`) around both the CSS photo layers
and the canvas**, so it shows whichever of them is on top and the hand off never jumps. It never
restarts on a slide change (which would snap the photo back to its first pose). Two earlier
mistakes are worth remembering: putting it on the CSS layer alone was invisible once the canvas
took over, and Svelte renames scoped `@keyframes`, so a keyframe named through a CSS variable never
matched until it was declared `-global-`. It pauses under the full player and holds still for
reduced motion.

**Post age limit is a global default (30 days, 7 to 90) plus an optional per-follow override**
(`Person.maxAgeDays`). It is applied at ingest in `refreshAll` (undated posts are kept) and by
`pruneToMaxAge` when a limit changes, so following a prolific creator no longer recalls their
whole history.

**Following now fetches immediately** through `feeds.fetchNewFollow`, scoped to the new person's
feeds, instead of waiting for Feeds to open, and `feeds.fetching` drives the spinners.

**Shuffle toggles** via `ring.unshuffle()`, staying on the member being shown.

**The Discover tab bar's `.dark` tint uses `rgba(var(--deep-rgb), .62)`** so it follows the skin.

Folders were asked about and do not exist; they are on ROADMAP.md as an idea.

## 2026-09-30 (night) — Liked / not for me, YouTube embeds, robots exemption, partner art

**Robots exemption for YouTube's channel feed only.** `youtube.com/feeds/videos.xml` is listed in
YouTube's robots.txt for every agent, yet it is the feed each channel page links for readers, so
honoring it made every YouTube follow fail with status 999. `isPublishedFeedEndpoint` exempts that
exact host and path; everything else, including YouTube pages, is still checked.

**Verdicts are one record per creator, keyed by site (`verdictKey`), not per ring**, so a creator
liked in a partner ring is also liked in IndieNodes. Stored in a new `verdicts` IDB store (DB
version 3), merged not replaced on restore, and exported only in the backup, not OPML. Not for me
filters `ring.visible` and partner member lists; like and hide are mutually exclusive.

**YouTube embeds are built from a validated 11 character id** (`youtubeVideoId`) against
`youtube-nocookie.com`, after a tap, in a sandboxed iframe, with `frame-src` narrowed from `'none'`
to that one origin. Feed-supplied iframe markup is still stripped. On Android, YouTube can refuse
an app origin (error 153); the card always offers Open on YouTube. Untested on a device.

**Feeds stopped swiping sideways.** The pull-to-refresh handlers on each pane ran first and left
`pulling` set (pointer capture stole the pointerup), which disabled the swipe. The pills make it
redundant, so it was removed rather than patched.

**Read on scroll** is a separate IntersectionObserver (`readOnScroll`), not part of the card stack,
so it works under reduced motion, and it only counts a card that was seen before it left the top.

**Partner ring art** is optional per ring (`iconUrl`, `badgeUrl`), https only, set by the adapter
from the ring's own declared favicon. The backdrop is a blurred mosaic of the ring's member
thumbnails rather than anything hotlinked from elsewhere.

**Follow matches a ring member by any page on a bare-host site**, never on a shared host (a
profile path), where a host match would pick the wrong person. Folders remain unbuilt.

## 2026-10-01 — More actions menu, idle read, age limit switched off for debugging

**Discover's hero keeps three controls at most**: the main action (Follow, or Save for later for a
desktop-first member), the member's preview, and a More actions button that opens a sheet with
Like, Not for me, Visit site (and Follow for a desktop-first member). They had grown to six.

**The last card is marked read after 4 seconds of stillness** (`IDLE_READ_MS`), because nothing
scrolls past it. Needs it fully on screen, the tab visible and the pane active.

**TEMPORARY: the post age limit is off.** `isAgeLimitActive()` in `age.ts` returns false, so
`refreshAll` keeps every post and nothing is pruned, to let old saved data be used for testing. The
settings and sliders still save. Flip it back (or delete the switch) before release; the age tests
turn it on themselves.

## 2026-10-01 (later) — Double tap to like, and what the tap does

**Double tap likes; it never unlikes.** A hasty double tap cannot undo a like, so unliking stays a
deliberate choice in More actions. **The first tap reacts at once** (the name hops, a short buzz),
so the screen never feels deaf while it waits to see if a second tap is coming; the second is the
like: a burst of hearts from the finger, a yip, a heart left beside the name.

**The yip is synthesized** (Web Audio: two fast triangle chirps, the second higher), not an audio
file, so there is nothing to ship, cache or license. It and the buzz share one Settings switch,
Sounds. The hearts are CSS (transform and opacity only). A WebGL drop ripple from the tap point was
considered and left out: the hero's canvas only draws during a swipe, so it would mean a second
render path for a few hundred milliseconds of decoration. Revisit if the CSS version feels flat.

**The age limit debug switch is now in Settings** (`prefs.ageLimitEnabled`), still off by default.

## 2026-10-01 (evening) — YouTube plays in the card on the web build only

On a phone the embed tried to play inside the card and did not. The Android WebView's own origin
is what YouTube refuses (error 153), and a cross-origin frame cannot tell the page it failed, so
there is nothing to detect and fall back from. In the Android app a YouTube card therefore opens
the video in YouTube again (the play triangle becomes the open arrow); the browser build still
embeds. If a referrer/origin setup later makes the embed work in the app, drop the native check in
`YipCard.svelte`. Untested against YouTube from a device: this is the safe default, not a proven cause.

## 2026-10-01 (night) — A branded splash screen, and Back out of a partner ring

**The splash is the launcher mark, installed properly.** Capacitor's template set the launch theme's
`android:background` to a stock `splash.png`, and `BridgeActivity` never calls
`installSplashScreen()`, so Android 12+ showed its own default splash and older versions a stretched
image. `MainActivity` now installs the AndroidX splash screen before `super.onCreate`, and
`AppTheme.NoActionBarLaunch` gives it the white mark (`drawable/splash_icon.xml`) on the same
day/night background as the launcher icon: brand orange by day, the dark ground by night, which is
also Capacitor's `backgroundColor`, so a night launch hands off to the WebView without a flash. The
mark is 48 of 108 units, not the launcher's 72, so it fits inside the splash's circular mask. No
`@capacitor/splash-screen` plugin: nothing needs to hold the splash past first paint.

**A partner ring is a history entry.** Opening one pushes a state, the same pattern as the About
sheet and the full player, so Android Back (which goes back in WebView history when it can) returns
to Discover instead of leaving the app. The back bar pops that entry; closing from the ring menu
drops it on unmount, unless a route change (Follow from a member card) already moved past it.

## 2026-10-01 (night) — Why a source failed, and replacing one that moved

**Failures are sorted by what a reader can do about them**, not by HTTP detail: `classifyFailure`
in `refresh.ts` turns a thrown error into a `FeedProblem` stored on the feed as `lastError` and
cleared by the next good check. A parse failure (`FeedParseError`) and a missing feed (404/410) are
the ones waiting will not fix; a connection failure, 5xx or 429 usually will. So **Replace is only
offered for gone or not-a-feed**, or once automatic checks have stopped (five failures); a blip
gets Retry alone, so nobody rewires a working feed during an outage.

**A replacement commits only after it checks out.** Identity is the URL, so replacing adds a new
`manual`, unverified record, checks it, and only then removes the old one (and its cached yips,
which the new address refills; keeping them would duplicate posts under two feed keys). A
replacement that also fails is removed again and the old one kept, so a reader never trades one
broken source for two. The form starts from the creator's site URL, where a moved feed is most
likely announced.

## 2026-10-01 (late) — Debug tools exist only in debug builds; Liked lists page at 25

**One build-time constant, `__YIPDEN_DEBUG__`** (a Vite `define`, next to `__APP_VERSION__`), is
true for the dev server, Vitest, and any build with `VITE_YIPDEN_DEBUG=1` (`android:apk`,
`android:install`, the e2e suite), and false for a plain `pnpm build`. Being a literal at every use,
the bundler removes what it guards in a release, which was checked against the built output: no
Debug build section, no Musicians Webring or Knifebeetle adapter, no flag reads. A runtime flag was
rejected because it would still ship the code and the rings' URLs. Settings' debug rows are their
own component, imported dynamically behind the constant, because a Svelte `{#if false}` still
compiles its markup into the page. A release build always enforces the age limit and ignores any
`ageLimitEnabled` a debug build saved on the same phone.

**Why the testing rings needed a Settings switch at all:** their flags were only settable through a
`?flag=1` on the live-reload URL, and storage is per origin, so a flag set at `http://<ip>:5173`
never reaches the installed APK at `https://localhost`. That is why the ring switcher vanished on
an installed build.

**Liked and Not for me show 25 on You**, newest first, then "See all N" to `/you/liked` or
`/you/not-for-me`, which list everything through the same `VerdictList` component. Each row shows the
badge saved with the verdict (`thumbUrl`: a partner member's button or art, or an IndieNodes member's
picture), capped at button size and never stretched; a badge that fails to load simply disappears.

## 2026-10-02 — Rings rechecked by age, You's lists as tabs, Save for later everywhere, Send

**Ring freshness.** IndieNodes was rechecked on every launch, because the time of its last check
lived only in memory; it is now saved (`ringCheckedAt`) and the window is six hours, not fifteen
minutes. Partner rings had no cache at all and were downloaded whole on every launch before the
switcher could appear. Their pages are now kept (`partnerCache`, per ring id, with ETag and
Last-Modified), drawn at once on launch, and revalidated after a day; an unreachable ring keeps its
last good copy. Pull to refresh forces both. Rings are hand-edited a few times a month, so a day
costs nothing a reader would notice. The cache is not part of backups.

**Kagi Small Web was evaluated and declined** (41k feeds, no names or categories, too large for the
current panel and member cap).

**You's lists are one tabbed section** (Saved, Liked, Not for me) rather than three sections plus
separate full-list pages: newest 25, "Show more" in place, a filter past 25. Everything stays on
You; the `/you/liked` and `/you/not-for-me` pages from the day before are gone.

**Save for later is offered on every creator**, not only desktop-first ones, and the Shelf is
called Saved in the interface. A Queue tab was considered and rejected: "Queue" already means the
player's queue, and Saved already is "find them later". Saved and Liked stay distinct: Liked is
taste and permanent, Saved is undecided and meant to be cleared.

**Send uses the system share sheet (`@capacitor/share`), not a browser extension.** The sheet
already reaches desktop browsers through Chrome's and Firefox's own device sync, as well as notes,
mail and messages, with no server, pairing, or extension to build and keep in three stores. An
extension needs a relay server to receive anything from a phone, so it waits for v2.0 if ever.

**Partner search and genres are generic**: search covers name, description, address and tags for
any ring; chips appear for any ring whose adapter declares `tags`. Knifebeetle's genre is now its
section heading ("Sci-Fi") rather than the anchor ("scifi").

## 2026-10-02 (later) — The stack judder: what it was, and what it was not

Reported on a phone as a judder in partner rings, then found in Feeds too. Debug-build switches
(frame meter; stack, backdrop and thumbnails each switchable) showed it followed the 3D stack alone.

- **Cause one: `SplashScreen.installSplashScreen()`** in `MainActivity`, added that morning for the
  branded splash. Feeds' web code had not changed since the last smooth build, so the only new thing
  in the rendering path was native. Removed; the branded splash still shows from the launch theme
  alone (Android 12+ reads its `windowSplashScreen*` attributes, older versions show it as the
  starting window). Confirmed better on the phone.
- **Cause two: `transform-origin` inside the stack's keyframes.** Not animatable on the compositor,
  so the whole animation ran on the main thread a frame behind the scroll; the exit pins a card by
  moving it down as far as the scroll lifts it, so the lag showed as a shake right where it folds.
  The pivot is now folded into the transform (`translateY(±50%)` around the rotation), which is
  the same motion at both ends and within a few pixels between.
- **Cause three, partner rings only: the intro note folding out of the header on scroll**, added
  the same day. Resizing the scroller mid-fling re-laid the list out every frame and cut the fling
  short. The note now sits inside the scroll content and simply scrolls away.
- **The fold's drift up (found after the first two):** the exit's pin, a `translateY` moving the
  card down as far as the scroll lifts it, sat inside the `perspective()`, so it shrank with the
  card as it receded and the card crept up about 58px over the fold, into the header. The pin now
  sits outside the perspective, both ends of the exit share one function list so its pivot stays
  on the top edge, and the card sinks a further 32px as it fades. Measured: the top edge holds,
  then moves down steadily to 32px; it no longer rises at any point. All three confirmed smooth on
  the phone.
- **Also fixed on the way:** a partner thumbnail had no reserved size, so each card grew 39px as its
  picture arrived; it now has a fixed 96x64 slot.
- **Changed, but not the cause:** the hidden Discover hero now pauses under a partner ring, and the
  tab bar drops its backdrop blur there. Both remove work nobody can see, so they stay.
- **Tried and dropped:** shrinking thumbnails into a canvas (much worse), and redrawing the
  backdrop mosaic into a canvas (no measurable gain).

**Keyboard:** `adjustPan` did nothing here. Capacitor 8's SystemBars plugin pads the window by the
keyboard's height whenever it is open, so the WebView shrinks above it and the tab bar rode up on
top. Turning SystemBars' handling off would also drop its status-bar insets on older WebViews, so
`+layout.svelte` marks the root while a text field has focus and the window has shrunk, and the
tab bar and mini player step aside (`--dock: 0`). The keyboard now sits where the bar was.

**App icon:** fox and howl without the arch (`brand/YipDen_Fox.png`, cut by `fox-only.cjs`), at 54 of
108 units so a circular mask never clips the tail or the howl. The in-app marks keep the arch.

## 2026-10-02 (evening) — Memory: work nobody can see

None of this was measured on a phone; each removes something the code could be seen holding.

- **The card stack runs on the pane on screen only.** Feeds keeps four panes mounted, and every
  card's scroll-driven animation (and its dim overlay's) is a compositor layer: up to 400, three
  quarters of them in panes out of sight. `cardStack` takes `active`; a hidden pane keeps its
  layout (`stack`) and drops the animations (`stack-sda`). Feeds changes pane in one frame with no
  slide, so the class changes in that frame and neither pane is seen flat.
- **The stack starts over only when the cards change**, not on every change inside a card (a
  thumbnail's zoom badge arriving re-observed every card and re-measured the pane, mid-scroll).
- **The waveform lets go of the decoded track** (superseded the same night, below).
- **The hero's CSS photo is removed once the canvas has faded in over it**, and returns whenever
  the canvas is not what is showing. The photo is still downloaded twice on Android (once by the
  WebView, once through native HTTP for the canvas): the two cannot share bytes without giving up
  the CSS fallback, so that stays.

## 2026-10-02 (night) — The folding card's shake, the waveform drawn here, the mini player tucked

**The shake was two animations on one card.** Standing up (`yip-in`) and folding away (`yip-out`)
both animated `transform` and `opacity` on the same element, and Chromium will not run two
animations of the same property on one target on the compositor ("target has incompatible
animations", read from a trace in Chromium 153, the phone's WebView version). Both ran on the main
thread, behind the scroll. The fold pins a card by moving it down as far as the scroll lifts it, so
only the folding card shook; the frame meter showed nothing because main-thread frames were on
time. They are now one animation, `yip-fold`, keyed on `entry` and `exit` offsets, every keyframe
with the same function list and `perspective(none)` at rest so a resting card has no transform. The
trace no longer reports the failure. The fold's shrink now eases in slightly later than before,
because the perspective itself is interpolated.

**The last card reaches the top in partner rings too.** The tail that makes room for it existed
only in Feeds. It is now measured from the last card's top to the tail itself, so anything between
them (a ring's "hidden as not for me" note) is counted.

**The waveform is drawn here, from saved peaks; wavesurfer.js is gone.** On the phone its waveform
did not appear after a first decode until the player was reopened, and sometimes nothing showed at
all. The track is fetched and decoded directly (8kHz, as wavesurfer did), reduced to 200 peaks,
saved, and the decoded audio dropped. A plain seekable bar with a travelling light shows until the
bars fade in; a track that cannot be read keeps the plain bar.

**The mini player tucks into a small button while Feeds or a ring's members scroll**, since a
scrolling thumb kept sliding it open or hitting its close button. A tap brings it back, as does
leaving the screen. `--dock` does not change while it is tucked: changing it mid-scroll would
re-lay the list out and move the stack's timeline, which is how the last judder was made.

## 2026-10-03 — The stack pins with `position: sticky`; the mini player can be picked up

**The fold no longer pins a card by animating against the scroll.** After the single-animation
change the folding card still trembled in a slow scroll and stuttered after a relaunch, with the
frame meter clean. The pin was a translate moving the card down exactly as far as the scroll
lifted it, which is only still when animation and scroll agree to a fraction of a pixel every
frame. A card is now three boxes (`styles/card-stack.css`, shared by Feeds and partner rings):
`.yip-stack` is its place in the list and is never moved, so everything measures it; `.yip-rail`
is one screen taller without taking more room; `.yip-fold` is the drawn card, `position: sticky`,
so the scroller holds it at the top itself. The animation only tips, sinks and fades. The list is
wrapped in `.stack-list` (`overflow-y: clip`) so the last rails add no scrollable height. The
JavaScript fallback is unchanged and still moves `.yip-stack`.

**Read on scroll asks for no frames while it is off** (the default). It requested an animation
frame on every scroll event regardless.

**The waveform is never an empty space.** While a track is measured its bars are already drawn at
a low, even swell that breathes; each bar then grows to its real height and the playhead fades in.

**The mini player can be picked up and dropped on Close or Minimize**, two places that appear
along the bottom while it is carried (Close left, Minimize right, the one under the finger lit).
Minimize is the small corner button the scroll-tuck already used; it now stays on every screen
until tapped, rather than returning on leaving Feeds. No third button on the bar. Dragging up and
letting go still opens the full player. The close button on the bar stays for now.

## 2026-10-03 (later) — Numbered debug builds; the mini player moves one way; a ring's cards pin too

**Every debug APK has its own number.** A morning of phone testing ran against an APK built before
any of the day's changes: only the web bundle had been rebuilt, and the phone kept fetching the
same `app-debug.apk` name. `android:apk` now takes the next number (`scripts/stamp-apk.mjs`), shows
it in About after the commit ("debug build N"), and leaves `yipden-debug-NNN.apk` beside the
original. The counter is per machine and not committed.

**A partner ring's cards did not pin.** The card's own `position: relative` outranked the stack's
`position: sticky`, so they scrolled away while tipping instead of folding in place as Feeds' do.
The stack's rule now outranks a card's own styles, and a test holds it.

**The fold can be driven from JavaScript, for comparison** (debug switch "Fold cards from
JavaScript"). Both paths now pin with `position: sticky` and differ only in who sets the tip, sink
and fade: scroll-driven CSS, or a frame callback. It exists to find out which one stutters on a
relaunch on the phone, not as a setting.

**The mini player moves up and down only.** Up, well past its own height (96px, or a flick past
40px), opens the player: 19px was far too little. Down lights a Minimize strip and minimizes on
release. The Close drop place is gone; the bar's own button closes. Minimized, the button pulses
while playing and takes no room: the dock returns to the tab bar's height.

## 2026-10-03 (afternoon) — The fold ships from JavaScript; the minimized player sits in Discover's row

**The JavaScript fold is the default; scroll-driven CSS is behind a debug switch.** On the phone
(debug build 1, WebView 153) the CSS fold juddered on every launch after the first and the
JavaScript fold did not. Why the CSS one does is still not known; main-thread frames were on time
throughout. Both pin with `position: sticky`, so the JavaScript fold cannot shake the card.

**A folded card stays hidden while its rail still holds it.** The JavaScript fold put a card back
to its resting style once it was past the top, but the card is held there for another screen of
scrolling, so every folded card reappeared as a ghost. It is now `visibility: hidden` until its
place comes back.

**The minimized player sits at the end of Discover's action row**, in line with it (same margin,
height and baseline), and the row keeps that place clear while it is minimized. "Follow
everything" is "Follow all" to make the room.

## 2026-10-03 (evening) — The hero's textures are bounded

A member's photo was uploaded to the canvas at its full size and kept until Discover was left: 48MB
of graphics memory for a 4000x3000 original, and one more for every member a reader swiped past.
A photo is now drawn down to at most 2.5 million pixels before upload (what covering the canvas
takes; 10MB at most), and six textures are kept: the least recently used is let go, never the one
showing or the one being wiped to. A photo let go is shown by the CSS layer if the reader returns
to it, while its texture loads again.

The failing "slow current cover" test was the test's own fault: it compared the heading's text,
which carries whitespace, to a bare name, and so released the wrong photo. It also expected the CSS
copy under the canvas, which is now removed once the canvas covers it.

## 2026-10-03 (night) — Discover's buttons answer while they slide in; viewed previews are kept

**`use:tap` on Discover's action row.** A browser makes a click only when press and release land
on the same element. These buttons slide in, so a tap on one still moving was released on
whatever had replaced it under the finger, and no click came; and after a swipe the browser
sometimes makes no click at all for a while (the tab bar's old problem). `actions/tap.ts` takes
the press and the release themselves: a release that has not travelled is a tap, wherever the
button has got to. A plain click with no tap behind it (keyboard, screen reader) still works.

**A preview's pictures are held once seen** (`keptImages.ts`, the last 40). Many creators' hosts
tell a browser not to reuse a download, so reopening a preview after visiting someone else
fetched every picture again. A browser reuses a picture the page is still holding whatever the
host said, so the ones that have loaded are held. The test forces a collection between looks,
which is what makes the refetch show without the fix.

## 2026-10-04 — Back closes a preview first; a tap's own click is swallowed

**Phone Back closes an open preview before it goes anywhere** (`closeOnBack.ts`): Discover's
preview sheet and the full-screen picture in a partner ring each get a history entry while open,
taken back out if they are closed by hand. Entries stack, so a picture closing inside a ring's
panel leaves the panel open: an overlay closes only when the entry on top is no longer its own.

**More actions liked the creator.** `use:tap` opened the menu on the finger's release, and the
click the browser makes a moment later landed on the menu item now under the finger. The click
after a handled tap is now swallowed wherever it lands, for 400ms at most.

## 2026-10-02 — Musicians Webring and Knifebeetle are on for everyone

**Both partner rings ship in every build, with no flag.** They were debug-only while each
maintainer's approval was pending. Researched since: given what a webring is, reading one as it
stands is fine provided the app links back to the ring's own site, and uses the ring's official
badges and images where it has them. Both adapters already do: every card says "via [ring name]"
and links to `hubUrl`, and the ring's own icon and badge are shown. So the `__YIPDEN_DEBUG__` gate,
the two local flags and their Settings switches are gone (`partner/registry.ts`).

These two are the whole list for now. A further ring still needs its own adapter and the same
check. The end to end build sets `VITE_YIPDEN_PARTNER_LIVE=0` so the suite stays off the network.
There is no per-ring show/hide control for readers; that stays open on the roadmap.

## 2026-10-02 (later) — Folders: one per person, and only a name

**A person is in one folder at most** (`Person.folder`, `folders.ts`). Several, like tags, was
weighed for people who make more than one kind of thing. Feeds already sorts each yip by kind, so a
musician who also writes sits in one folder and the Listen pill still separates their tracks: the
folder filter and the pills combine. It also matches IndieNodes, where a member has one `type`.
Widening to several later is easy; narrowing back would not be.

**A folder is only that name**, with no record of its own, so it exists while someone is in it and
needs no migration. A typed name joins an existing folder whatever its capitals.

**Feeds' filter is a scope, not a fifth pill** (`FeedsScope`): everyone, a folder, or one person,
chosen in a sheet and applied to all four panes. It lasts the session and is never an ordering.

**OPML.** A folder is an outline around its people, marked `yipdenFolder` so a person with several
feeds inside reads back as one person. Another reader's file has no mark, and a folder of feeds
looks the same as one person's group of feeds, which is how such a folder used to import: as one
person named after it. Now an unmarked group holding feeds from more than one site, or holding
other groups, is read as a folder of separate people. Nested folders keep the outermost name.

## 2026-10-02 (evening) — Explored marks, and a ring keeps your place

**A long directory can be worked through.** A ring member is marked explored when the reader
visits, previews or finds feeds for them, or by hand from the check on their card. Keyed by the
creator's site, like Liked, so one creator met in two rings is explored once. Explored cards dim
rather than disappear; "Hide explored" hides them on request, and Resume jumps to the first one
not looked at after the last one that was. IndieNodes shows the same marks in Browse members and
More actions. Kept as one setting and in the backup, merged rather than replaced on restore.

**The partner panel's search, genre, hide switch and scroll are kept per ring** (`explored.svelte.ts`,
`ringViews`), so leaving Discover and coming back, or relaunching, lands where the reader was. They
used to live in the panel component and died with it. A changed search writes at once; a scroll
waits 400ms and is flushed when the app is hidden or the panel closes.

## 2026-10-02 (evening) — A reader can add tracks and overrule a site's layout

**Reader tracks** (`creatorNotes.svelte.ts`): a link a reader adds to a creator, by pasting it or
by keeping what a page played (below). Labelled "Added by you" everywhere, never treated as the
creator's chosen sample, and only the address is kept. A real audio file plays in the one shared
player; a platform page opens on its own site. At most 20 per creator. This changes "the sample is
always opened externally, never assumed playable in app" (2026-09-29) for audio the reader chose
themselves; it does not touch the refusal to download, cache or crawl.

**Layout overrides**: "Reads best on a phone / a bigger screen / as found", per creator, from You,
Discover's notes sheet and partner cards' notes. Wins over the ring's declaration and the
viewport guess. This is the override ROADMAP item 2 in the doorway batch asked for.

## 2026-10-02 (evening) — Creators' sites open in the app, with a button to keep their audio

**`@capgo/capacitor-inappbrowser`** (MPL-2.0, Capacitor 8), approved by the developer. Visit from Discover
and partner rings opens the site in its own WebView with YipDen's button in the toolbar. A script
we inject reads what audio the page shows or plays (audio and video elements, links to audio
files, files the page loaded, and known platform players embedded in it) and reports it. Tapping
the button closes the page and opens "Found on their page", where the reader keeps what they want
and can set the layout.

What it cannot do, by nature: see inside another site's embedded player (Bandcamp, SoundCloud,
YouTube), where only the player itself can be offered, as a link that opens on that platform;
keep a streamed (segmented) track; or keep a platform's signed, expiring file address usefully.

**Settings switch, on by default.** Off, and on the web build, Visit uses the system browser as
before. Sign-ins are separate from Chrome's.

**Security** is written up in docs/security.md: the plugin's file access settings are patched
off and its camera permission removed in our manifest, deep links from pages are blocked, page messages are untrusted and
only ever become candidates, and the native toolbar button is the only path to the keep screen.
An OWASP Mobile Top 10 review done at the same time found one existing gap, a restored ring queue
reaching the player unchecked, now validated item by item; and set the rules v2.0 accounts must
follow because this WebView shares the app's cookie jar.

The plugin's Android dependencies (AndroidX, Material, androidsvg) were added to
`verification-metadata.xml` the documented way.

## 2026-10-03 — The in-app browser is `@capgo/capacitor-inappbrowser`, not the deprecated name

The first install used `@capgo/inappbrowser` 8.6.14. Same repository, but npm marks that name
deprecated ("moved to `@capgo/capacitor-inappbrowser`"), and it stopped at 8.6.14 while the current
package is 8.21.1. Caught by the developer, not by the review, because the check looked at the
repository URL and not the `deprecated` field. Replaced, and re-reviewed against 8.21.1's source.

What changed in 8.21.1: file-URL cross-origin access is now only switched on for the plugin's own
bundled files, so the patch shrank to the two settings still hard-coded on (file and content
access). The camera permission moved out of the patch into our manifest. Deep links still need our
`preventDeeplink: true`. Its one extra Android library, `androidx.swiperefreshlayout`, was added to
`verification-metadata.xml` by hand: a write-mode run also recorded the plugin's own test
dependencies (Robolectric and the rest), which are not part of this build and were left out.

A guard test now checks the installed package name and its deprecation, so the same mistake fails
the suite. Checking `deprecated` belongs in the new-package review in docs/security.md too.

## 2026-10-03 (later) — Phone feedback on the browser, reader tracks and the partner card

- **A track that will not play says so** (`player.svelte.ts`): a media error (other than the
  element's own abort when switching sources) or a "not supported" play rejection sets
  `player.error`, shown in the full player and as a toast. Before, it loaded and sat silent.
- **Play in the notes sheet closes the sheet**, which was covering the player it had just opened.
- **The page stays open behind "Found on their page"**: YipDen's button now hides the browser
  instead of closing it. Closing the sheet (or Back) shows the page again where the reader was;
  "Done with this site" closes it.
- **Back inside the browser goes back a page** (`activeNativeNavigationForWebview`), and closes
  the browser only from its first page. Without it, the first Back dismissed the page and the next
  one left Discover or the app.
- **Explored is a swipe**: a partner card swiped left is marked (or unmarked), with a one-time hint,
  and the check at the card's top right does the same for anyone who does not swipe. The bottom-row
  explored button is gone, notes became a pencil (the sheet holds tracks and layout both), and the
  icon buttons shrank to 50px with 8px between so five fit one row. The swipe moves only the card's
  body, inside the card, so the stack's own fold transform on the card is untouched.

## 2026-10-03 (night) — Two new briefs, and what was decided before starting them

Both briefs are kept as given in `docs/briefs/`. The plan is ROADMAP's "Encrypted store and
reference finds".

- **The encrypted store comes before 0.9.0.** A released build that wrote plaintext would leave a
  migration to run on every reader's phone. Shipping the first release encrypted means the only
  migration ever run is from development builds. The new reference kinds (comics, games, writing)
  follow in 0.9.x.
- **The revised v0.9 brief's gaps go into that same move.** A stable yip id (a hash of the feed's
  canonical URL and the entry's own id) changes every stored key, so it is a data migration
  anyway. It is done once, on the way into SQLite, with read state carried across. `FeedSource` and
  hub recording land just before, so the new store is written by the new pipeline. This supersedes
  the September choice of "IndexedDB rather than SQLite" (`store/idb.ts`) on Android. The web build
  stays on IndexedDB, with each value encrypted.
- **Platform embeds stay, as links.** The brief's "own site only" rule would refuse a Bandcamp,
  SoundCloud, YouTube, Spotify or Apple Music player found on a creator's own page, which the audio
  find keeps today. Such a player is still offered, saved as a reference with
  `hostVerified: false` and `sharable: false`, and it opens on the platform. A file goes through
  the own-host rule in full.
- **Long-press and selection are seen by the page script, kept through YipDen's button.** The
  brief's "long-press → Save to [creator]" would mean new entries in the page's own native menus,
  which is a much larger patch to the browser plugin to keep and re-review. Instead the injected
  script notes the image or text the reader last pressed or selected, and the toolbar button, which
  docs/security.md already treats as the only trusted path, offers it in "Found on their page".
- **A partner card's Listen opens in the in-app browser,** with the member as the creator, the same
  path as Visit, so audio found on the sample's page can be kept for them. This changes "the sample
  is always opened externally" (2026-09-29). With the setting off, or on the web build, it still
  opens in the system browser.

## 2026-10-04 — `FeedSource`, stable yip ids and WebSub hubs

The revised v0.9 brief asks for these three, and for the final interface to be written down here.

**`FeedSource`** (`packages/feeds/src/source.ts`):

```ts
interface FeedRequest {
  id: string;
  url: string;
  cursor?: string;
}
type FeedResult =
  | { id; status: 'updated'; url; feed: ParsedFeed; cursor?; hubUrl? }
  | { id; status: 'not-modified'; cursor? }
  | { id; status: 'failed'; error: unknown };
interface FeedSource {
  fetchBatch(requests: FeedRequest[]): AsyncIterable<FeedResult>;
}
```

- **A batch in, results out one at a time.** A cache can answer the whole batch in one request.
  Direct fetching answers feed by feed, and refresh stores each result as it arrives, so a refresh
  cut short keeps what it already fetched.
- **The cursor is opaque** and stored on the feed record (`Feed.cursor`). `DirectFetchSource` puts
  the ETag and Last-Modified in it. A source that cannot read a cursor (one written by another
  source, say) treats it as no cursor, which means a full fetch, never a failure. Feed records from
  before cursors keep `etag`/`lastModified`. Refresh builds a first cursor from them and drops them
  on the next successful check; the move to the encrypted store converts the rest.
- **Failures are results.** `error` is whatever was thrown, so the app's existing
  `classifyFailure` still sorts it into the reasons You shows. The rule that a feed stops being
  retried automatically after five failures stays in refresh, which decides what to ask for.
  It is not the source's call.
- `DirectFetchSource` wraps the existing `FeedHttp`, unchanged: robots.txt, per-host spacing,
  size and time caps, and redirect checks.

**Stable ids** (`packages/feeds/src/hash.ts`):

- **The layout.** `Item.id` is the first 32 hex characters (128 bits) of SHA-256 over
  `` `${new URL(sourceFeedId).href}\n${entryId}` ``.
- **`entryId`** is the entry's own identifier: RSS `guid`, Atom `id` or JSON Feed `id`. When the
  entry has none it is the entry's URL; with no URL either, title and date (unreachable today,
  since an item with no URL is dropped).
- **`sourceFeedId`** is the URL the feed was fetched from after redirects, as before.
- **Hand-written, not WebCrypto.** `crypto.subtle` is async and the parsers are not, and the
  package has to run unchanged in the WebView, in Node, and in the v2.0 poller. The tests check it
  against Node's own SHA-256.
- **Any change to this layout is a migration.** It changes every id on every device.
- **Stored keys are not changed yet.** They stay `${feedId}::${entryId}`, byte for byte what they
  were, so refreshing matches what is already stored. Every yip is re-keyed once, read state
  included, in the move to the encrypted store (ROADMAP, encrypted store item 3). Yips stored
  before today have no `entryId`; that migration takes it from the key.

**WebSub hubs** are read from a `Link: rel="hub"` response header (which wins, as WebSub
discovery orders it), from `<link rel="hub">` in Atom or `<atom:link rel="hub">` in RSS, and from
JSON Feed's `hubs`. The hub is kept on `Feed.hubUrl`, https only, and nothing uses it.

## 2026-10-04 — The store is encrypted: SQLCipher on the phone, sealed IndexedDB on the web

ROADMAP's encrypted store item, from the reference finds brief. This supersedes the 2026-09
choice of "IndexedDB rather than SQLite" for the phone. docs/security.md says what it protects and
what it does not.

**One store over two backends.** All of a store's behaviour lives in one `DocStore` (what
following touches, that a refetched yip keeps its read state, and so on). It is written over a
small backend that only keeps records: named collections with a few indexed fields. The phone's
backend is SQLite (`sqlBackend.ts`, a table per collection with indexed fields as columns, so
counts and paging run in the database rather than after every record has crossed the native
bridge). The web's is encrypted IndexedDB. Two complete `Store` implementations would have drifted
apart. One contract suite runs against the old store and both new ones, so a behaviour the old
store had and a new one lacks fails a test.

**The key: the sqlite plugin's own Keystore storage, not a second plugin** (decided with the
developer). The brief named `@aparajita/capacitor-secure-storage` to hold the key. But
`@capacitor-community/sqlite` cannot be handed a key when it opens a database. It only opens an
encrypted database with a secret it stores itself, in EncryptedSharedPreferences under an Android
Keystore AES-256-GCM master key. The key lives there whatever else is added, so the second plugin
would only have kept a second copy. That plugin also lists `@capacitor/keyboard` and
`@capacitor/ios` as hard dependencies. It was installed, reviewed and removed.

- The key is 32 bytes from `crypto.getRandomValues`, written as SQLCipher's raw-key form `x'…'`, so
  those bits are the key itself rather than a passphrase put through PBKDF2 on every launch.
- If the key is ever missing while the file survives, nothing can read the file. It is deleted and
  the store starts empty; an exported backup is the way back. This only happens if the Keystore
  entry is lost, since clearing app data removes both together.
- No biometric prompt. The app has no lock screen of its own, and the phone's lock protects a
  running app as much as anything in the app could.

**The web build is weaker, and says so.** There is no keystore in a browser. Values are sealed
with AES-GCM and record keys replaced by an HMAC, both with non-extractable WebCrypto keys kept in
the same database. Nothing readable is left, not even the addresses used as keys. Any script on
the origin can still use the keys. An IndexedDB transaction closes itself while WebCrypto works,
so each transaction holds its writes in memory, encrypts them, then applies them in one IndexedDB
transaction. Queries decrypt the whole collection and filter in memory, which is fine for the web
build.

**The move.** On first launch the old IndexedDB is copied in one transaction:

- every yip is re-keyed to its stable id (`rekey.ts`), keeping read state and the earliest
  `seenAt`;
- old feed validators become cursors;
- the player's saved queue follows the new keys.

The copy is read back and checked, collection by collection. Only then is a marker written, and
only after the marker is the old database deleted. Interrupted before the marker, the next launch
starts the copy again from the old database. Interrupted after it, the next launch only finishes
the deletion. Tests cover both cases. Backup files from before the move are re-keyed the same way
on import. Refresh now keys new yips by their stable id.

**Around the database:**

- `full_backup_content.xml` excludes everything for Android 11 and lower, alongside
  `allowBackup="false"` and the Android 12+ rules that were already there.
- **The WebView cache is cleared, rather than caching turned off.** An `<img>` cannot ask not to
  be cached, so turning caching off for creator media was not available. `MainActivity` clears the
  HTTP cache shared by every WebView when the activity finishes, and again at every cold start for
  a close Android never reports. The cost: creators' images download again once per launch.
- The hero image's one release-build log that named an address now runs in development only.

**Gradle verification.** As with the in-app browser, write mode also recorded the plugin's test
libraries (Robolectric and others), which are not part of this build. Instead, a lenient build
listed the 36 artifacts the build really resolves: SQLCipher, Room's annotation processor and its
tools, androidx.security, Tink and the rest. Only those were added, and a strict build passes.
`sql.js` (SQLite in WebAssembly, MIT) is a dev dependency that runs the SQLite backend in tests. It
is not in the app.

The About sheet's attributions now list the sqlite plugin, SQLCipher (BSD-style, © Zetetic LLC)
and the in-app browser plugin, which was missing.

## 2026-10-04 (later) — A security check of the encrypted store: one leak, closed

Asked for after the store landed: did any of it add a risk?

- **The web build is not worse than before.** Before, IndexedDB held everything in plaintext:
  readable by any script on the origin, and off the disk. Now any script on the origin can still
  decrypt (that is the documented weakness), and the disk holds ciphertext. There are no new
  entry points: no new script sources (the CSP is unchanged) and nothing fetched from a CDN. The
  sqlite plugin's web code is in the bundle as a lazy chunk, but only the phone's driver imports
  it, and it never runs on the web. The data read back is data this app encrypted itself.
- **The phone had one leak, now closed.** Capacitor's bridge logs every plugin call with its full
  arguments (`methodData`) when native logging is on, and it is on by default in debug builds. On
  the debug APKs used for phone testing, the database key would have reached logcat once, through
  `setEncryptionSecret`, and every SQL value after it. Release builds were not affected, and only
  adb or a system app can read another app's logcat, but the brief's rule is that the key never
  reaches a log. `loggingBehavior: 'none'` now applies to every build; the web console still
  shows in chrome://inspect. A guard test keeps it off, along with the plugin's encryption flag
  and the backup settings.
- **Checked and fine:**
  - The plugin rewrites `DELETE` statements only for its own sync columns, which these tables do
    not have.
  - Every SQL value is a bound parameter. Table and column names come only from constants.
  - The plugin's own Android logs carry no data.

## 2026-10-04 (evening) — References replace reader tracks

ROADMAP's `Reference` model item, from the reference finds brief. Everything a reader keeps from a
creator's page is now one `Reference` (`apps/reader/src/lib/references/types.ts`), stored in its
own collection of the encrypted store. Reader tracks are audio references, and the track UI is
unchanged.

**How the shape differs from the brief's suggestion:**

- **`creatorId` is the existing `verdictKey`** (the site without scheme, `www.` or trailing slash),
  the key Liked, Not for me and layout overrides already use. A creator is then one creator across
  rings and into a follow.
- **`ringSource` can also be `none`, and `ringId` is then null.** A followed person found by
  pasting a link came through no ring, and claiming one would be false. IndieNodes is
  `own`/`indienodes`. A partner ring is `partner` with its adapter's id. Every screen that keeps
  something now passes where the creator came from.
- **`title` is added.** A track always had a name the reader sees.
- **`foundOnPage` is optional.** A track added by pasting a link was never found on a page, so it
  has none, and it can never be sharable.
- **`checkedAt` is absent until the first re-check.** Writing the creation time there would claim a
  check that never happened.
- **`id` is derived** from the creator, the kind, the address and, for text, the passage. Keeping
  the same thing twice is one reference, as keeping a track twice was one track.
- **Limits per creator and kind:** audio keeps its 20, and images, screenshots and passages get 50
  each. A writing snip holds at most 500 characters (`MAX_SNIP`), enough for a passage but never a
  chapter.

**What nothing has checked yet stays unclaimed.** A new or converted reference is
`hostVerified: false` and `sharable: false` until the capture rules (the next item) check it. A
track kept before today has `ringSource: 'none'`, because which ring it came through was never
recorded.

**The move.** The `readerTracks` setting becomes references once, in one transaction that also
removes the setting. It runs after the move from the old database and on stores that moved
before references existed (debug builds 12 and 13). An older backup file's tracks are converted
the same way on import. New backups carry a `references` array instead (the format stays version
1, since the array is additive), merged the way Liked is: one already kept here stays as it is,
and the per-kind limits hold.

**A writing snip leaves a backup without its passage.** The brief says to ask before storing snip
text outside the encrypted database, and an exported backup is outside it. Until that is decided,
a text reference goes into the file as the page it points at, without its selector or the Text
Fragment link that repeats the text. There are no text references yet. The question comes with
the writing capture flow.

**`IdbStore` is retired.** It is no longer a `Store`. Its code moved to `store/testing/legacyIdb.ts`
to write databases in the old format for the migration tests, and nothing in the app imports it.
Unit tests that built one now get a fresh in-memory SQLite `DocStore` (`store/testing/memory.ts`).
The SQLite schema gained its second step, a `references` table, and step one is now a fixed list
rather than "every collection", so it can never change after shipping.

## 2026-10-04 (night) — The capture rules

ROADMAP's capture rules item, from the reference finds brief. The pure rules are in
`packages/feeds/src/capture.ts`, so the v2.0 shared index can run them on the server. The app
applies them in `apps/reader/src/lib/references/capture.ts`, at capture and on every re-check.

**Own site only.** A file's host after redirects must be one of the creator's sites, or a
subdomain of one. A parent host never counts: a creator on `lena.neocities.org` does not own
`neocities.org`.

- The creator's sites are the address they were found at and where it redirects (the
  `neo.keyjayonline.com` → `keyjay.neocities.org` case). For someone followed, they also include
  their site and any of their blog or podcast feeds proved by a two-way link.
- A verified profile on a platform never counts. Bluesky's host is not theirs, so counting it
  would let any Bluesky image be kept for them.
- A copy anywhere else is refused, with one sentence that says why. That applies to pasted links
  too, which used to accept any https address.
- **The known limit:** the rule matches hosts, as the brief sets it. On a host shared by path
  (`example.club/~lena`), anyone else on that host passes too.

**Platform players stay links** (decided 2026-10-03). A Bandcamp, SoundCloud, YouTube, Spotify or
Apple Music player found on a creator's page is kept without asking anything of the platform. It
is never host-verified and never sharable.

**Only what is publicly linked.** At capture, the evidence is the live page the reader is looking
at. A re-check can only fetch the page's markup, and media a page's script inserts is not in it.
So each reference records `linkedInMarkup`, and only a link the markup showed is held to "the page
no longer links it". Without that proof, a reference is not sharable.

**"No" signals.** If robots.txt disallows the page, it is not fetched at all. `noindex` (or
`none`) in a robots or `yipden` meta tag, or in an `X-Robots-Tag` header for every agent or for
YipDen, also counts. Any of these keeps the reference for the reader but makes it not sharable.

**Re-check, never remember.**

- **How it asks:** files are asked about with `HEAD`, never downloaded, through the same polite
  client as feeds (one request per host, spacing, redirect checks, an honest agent). robots.txt is
  not consulted for that `HEAD`. It governs crawling pages, and this is a file the reader already
  plays from that address. Pages are fetched with robots.txt honoured.
- **Gone:** a 404 or 410 for the file or the page, a page that no longer links it, or a passage no
  longer on the page. It stays listed so the reader can see it and remove it, but it does not
  play. There is no copy to fall back on.
- **Never gone on a failure.** A check that could not finish (offline, a host refusing `HEAD`)
  refuses nothing and marks nothing gone. Capture judges the address as given; a re-check changes
  nothing and is not retried until the next launch.
- **When:** on launch and on resume, a few per pass, never-checked first, and not again within a
  week. Opening a track also checks it, unless it was checked within the hour.

**Snip passages in backups.** A writing snip exports as its link alone until text capture has been
tested on a phone. After that, exporting the passage is approved (the developer, 2026-10-04), and
the backup can carry `selector` and `textFragmentUrl` again.

Fixed along the way: `creatorNotes.reload()` now takes the store's word for it. It used to keep
in-memory references the store no longer had, so a restore could leave stale entries on screen.

## 2026-10-04 (late) — Keeping pictures, screenshots and passages

ROADMAP's capture flows item, from the reference finds brief: comics, games and writing.

**How a pick reaches the app** (decided 2026-10-03: the page script sees it, the toolbar button
keeps it). The script injected into a creator's page now also remembers the last picture the
reader long-pressed and the last passage they selected, each with the page it was on. It sends
them with every scan. The long-press is caught through `contextmenu`, which Chrome on Android
fires for a long press, and through a 550 ms hold that a finger moving more than 10 px cancels.
The script prevents no default and stops no event, so the page's own long-press and selection menus
work as before. The plugin patch did not grow.

- Like found audio, a pick is untrusted: the page's own code can send the same message.
  `readFound` keeps only public https addresses and plain, bounded text. A selection longer
  than a passage (500 characters) is not cut short. The sheet says so and asks for a shorter one,
  because a quietly trimmed quote would not be what the reader chose.
- "Found on their page" gains a Picture and a Passage section beside Tracks, with the same
  Keep / Checking… / Kept button. Its wording stays the sheet's own "Keep" rather than the brief's
  "Save to [creator]".

**Comic or screenshot.** A picture is kept as `image` (comics and other pictures) or `screenshot`
(games). The default comes from what the ring says the creator makes: a type or form naming
games means screenshot, and everything else, including Knifebeetle's comics, means picture. The
reader can switch it before keeping. The two differ only in their label and their limit.

**Passages.** A passage is kept as its page (any fragment dropped), a TextQuoteSelector, and a
Text Fragment link that opens the page scrolled to it.

- A short passage goes into the link whole. A long one goes in as its first and last four words.
- The selector's prefix and suffix stay out of the link: a selection that starts mid-word would
  make the browser match nothing.
- Opening a kept passage always goes out to the creator's page, in the in-app browser when that
  is on.

**Where kept things show.** `ReaderFinds` lists them on the creator's notes sheet and their row in
You. A picture loads live from the creator's host each time (`referrerpolicy="no-referrer"`). It
is never stored, and the WebView cache holding it is cleared when the app closes. Something gone
from their site stays listed, marked, so it can be removed.

**Re-checks.** A passage is re-checked by looking for its text on the page. A passage restored
from a backup carries only its link (see the backup decision above), so it has nothing to look for
and is never re-checked, never marked gone on that account.

## 2026-10-04 (late, later) — The in-app browser's button keeps anything, not only music

Feedback from the developer: the toolbar button was a note with a plus on every site, which says
nothing on a page of comics. A per-creator icon was considered and rejected. Pages are mixed (a
comic with a soundtrack, a musician's lyrics), and the sheet behind the button offers every kind.

- **The icon** is now a tray with an arrow dropping into it, the same idea as the iOS symbol it now
  uses (`tray.and.arrow.down`, replacing `music.note.list`). Not a bookmark, which Save for later
  already uses. An arched den with a plus inside was tried first, and rendered it reads as a
  gravestone.
- **The spoken label** was the plugin's own "Button near done", which TalkBack read aloud. The app
  now overrides that string resource with "Keep something from this page" (an app's resources win
  over a library's, so no patch), and a guard test keeps it.

## 2026-10-04 (evening, later) — The Library

The library and forums brief (`docs/briefs/library-and-forums.md`), Part 1, built as approved
from the audit in `docs/you-page-audit.md`.

**One place for everything kept.** A Library section at the top of You collects:

- the tracks, pictures, screenshots and passages kept from creators' pages;
- the Shelf's saved links, as "Links".

Before, things kept for someone not followed (every partner-ring member, for one) were on no part
of You at all.

- **What it offers:** counts that name only the types present, a Recent row, three arrangements
  (by type, by creator by name, and by date from Today back), and a search that needs every word
  somewhere in an item's title, creator, address or passage.
- **Every item** says whose it is and has a button to that creator's site. Tapping an item does
  what that kind does: a track plays, a picture opens full screen, a passage opens on the
  creator's page, a link opens.
- **It is a view, not storage.** It reads references and the Shelf where they already live, in
  the encrypted store, and arranges them in `library.ts` (plain functions, unit tested).

**Decided with the developer:**

- The Shelf joins as Links, and YouLists keeps only Liked and Not for me, so no link is listed
  twice.
- Keeping says "Kept to Library", not the brief's "Saved to Library", which would clash with Save
  for later.
- **Recent appears only past six items.** Below that, every item is already on screen, and
  showing each one twice only made the section longer.

**Toasts can carry one action.** The action is a real 44px button, the toast stays six seconds
rather than 2.8, and its colour is fixed at about 9:1 on the toast in every theme.

- Every keep and every Save for later offers View. View opens You at the Library, narrowed to that
  creator (or to Links) and arranged to match, with the newest item there picked out and scrolled
  to, and a "Show everything" to widen it again.
- From the in-app browser's sheet, View closes the site first.

**Creator names on references.** References stored only `creatorId`, so a name is now kept with
each new one (`creatorName`, optional, validated in backups). Older ones show a followed person's
name, or else their site's address. Nothing is rewritten to fill them in.

Discover's "Your notes and tracks" became "Your notes and keeps", and its count includes pictures
and passages. Read history stays off the Library, as the audit proposed: the Library holds what a
reader chose to keep.

## 2026-10-04 (night, later) — A followed member's own picks, on You

Raised by the developer: once someone is followed, what they put up themselves (their ring
tracks, comic pages, artwork, writing sample, trailer) could only be reached by finding them again
in Discover. Their row on You showed their sources and what the reader kept, but nothing of
theirs.

- **On the row:** a round button gives one-tap access to their own picks, with the same action as
  Discover's (`previewFor`): Play, Read a preview, View artwork, Read a sample, or the trailer link.
- **In the expanded row:** a "Their own picks" block, "chosen by {name} for the IndieNodes ring",
  set apart from "Added by you", so a reader's own keeps and a creator's choices are never confused.
- **Read live, stored nowhere new.** The member is found in the ring by the entry id kept when they
  were followed, or by their site for a follow made another way. You loads the cached ring if it
  is not already in memory, as Discover does.
- **When there is nothing to show.** Someone not in the ring, someone who has left it, or a member
  with nothing to preview gets no button and no block, rather than an error.
- **Partner rings are not covered,** because their members cannot be followed yet (a ROADMAP open
  question).
- **Not in the Library.** That holds what the reader kept; these are the creator's.

## 2026-10-05 — Four adjustments from phone use

- **You has tabs.** Following comes first and is where You opens. The Library and "Liked & not for
  me" are a tab each, which follows what a reader came for: who they read, what they kept, whom
  they have judged. The Library's View links open its tab (`?tab=library`), and arrow keys move
  along the tabs. An open follow row is split into three named parts, Sources, Kept from them and
  Your settings for them, instead of one long run.
- **Pinch to zoom in the in-app browser** (the plugin's `enableZoom`, with its on-screen zoom
  buttons hidden). A site built for a desktop is unreadable on a phone without it. A page that
  forbids zoom in its own viewport tag (`user-scalable=no`) still gets its way. Overriding that
  would mean changing the page, which the injected script deliberately never does.
- **A card takes taps until it is really going behind.** The card stack used to mark a card
  `behind` (no taps) as soon as its place passed the top of the pane. That was the moment it
  pinned, while it was still the front card and wholly readable, so its buttons only worked at
  certain scroll positions.
  - A card now refuses taps only past halfway folded (`isBehind`), worked out each frame alongside
    the fold itself.
  - Where the next card overlaps a pinned one, the next card is drawn on top and takes the tap, so
    nothing else needs refusing.
  - Feeds and partner rings share the fix. The debug-only scroll-driven path keeps the old
    observer.
- **A partner ring's filters live in a sheet.**
  - **The sheet:** a filter icon beside its search opens a Show choice (Everyone, Not explored yet,
    Explored) and its genres. The icon is filled while any filter is on, and says which to a screen
    reader.
  - **What it replaced:** the genre chips and the Hide explored button.
  - **The new filter:** "Explored" shows only the members already looked at.
  - **The count:** "x of y explored" became the count beside each Show choice.
  - **Resume** moved to the ring's name row.
  - **Saved views:** a view saved before this is read the same as before (`showOf`, which maps the
    old `hideExplored`).
