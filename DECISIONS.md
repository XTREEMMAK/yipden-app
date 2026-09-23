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

## 2026-09-23: Today ships as a flat, staggered list; the 3D card stack is deferred

The brief's card stack (cards standing up as they rise, tipping back and dimming as they pass
the top, driven by `animation-timeline: view()` with a passive-scroll fallback) is explicitly
optional in its own wording, and reduced motion's documented answer for it is "a flat list, no
stack," exactly what ships now. Building the scroll-driven version correctly, including a
faithful rAF fallback for browsers without it, is a substantial, fiddly piece of work on its
own, and Today's data correctness, filters, categorization and the refresh pipeline underneath
it were worth finishing and testing properly first rather than splitting attention across both
at once.

The flat list is not a stand-in with missing pieces bolted on later: every yip already flies in
staggered by the shared motion system, which is the same entrance the stack's own resting state
would use. Adding the stand-up and tip-back animation on top is additive, not a rebuild, and is
recorded here as an open item rather than left silently undone.

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
