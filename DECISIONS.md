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
