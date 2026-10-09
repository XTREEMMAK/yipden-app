# The Stray: scaffold handoff

Status: reference prototype supplied, initial player boundary scaffolded. Realm is the first
production focus. This document records observed behavior and open decisions; it does not resolve
those decisions by treating the prototype's mock reader as the production application.

## Supplied behavior

The prototype offers a date-seeded pup hunt, clues derived from creator metadata, three page hops,
a peeking/running/sleeping coyote, pawprints and sniff assistance, and illustrated local polaroid
keepsakes. It uses Lottie with SVG fallbacks and respects reduced motion in its game presentation.
It explicitly says no streaks or scores to beat. It uses direct localStorage for keepsakes and
embeds a mock reader, player, authentication UI and creator data that are not production features.
The production module must not transplant that mock reader or its authentication flow.

The reference's default pages are stand-ins. Its optional cross-origin iframe cannot inspect a
remote site's DOM or establish that an Android overlay works. The live reader uses a separate
native creator WebView. The reference also fetches Google Fonts and Lottie from a CDN; neither is
a selected production dependency. Polaroids are illustrated, not actual page screenshots.

## Decisions still needed

- Explicit activation versus automatic hunt participation on site visits. The current registry
  requires explicit Play, including for the Stray scaffold; the prototype automatically changes
  eligible site visits. No production hunt activation policy is silently inferred from that.
- Date/timezone policy, day rollover during a run, replay and offline behavior.
- Ring ordering/version policy: seeding only from a date does not make different ring snapshots
  agree. The reader's rotation already sorts by stable ID; use an explicit compatible policy.
- Eligibility for all destinations. The prototype filters its starting creator using `play`, but
  takes its final destination from the next ring member without the same filter. Define creator
  consent and playable page data outside the current ring contract before changing `ring.json`.
- Failed/removed destinations, Back, exit/resume and interrupted animations.
- Saves, versioning, backup/export/deletion and whether polaroids stay illustrated keepsakes.
- Accessible hunt alternatives, announcements/focus, zoom, scrolling and overlay hit targets.
- Animation/audio pipeline and permissions before adding a production animation library.

## Production boundaries

Use `packages/stray` for rules and presentation, the shared game host for cancellable launch and
cleanup, and injected page/save adapters. Keep daily planning pure with explicit date and ring
inputs; do not read global time, DOM or storage inside the planner. Only activated game sessions
may consume page interactions. Progress stays game-local and never changes reader/discovery
ordering, gives a reading reward, introduces a streak, or requires an account.

Games Lab may show the supplied reference with an explicit reference opt-in. Its iframe is
removed on close/background; this intentionally resets an in-progress reference run. The
production pause/resume policy and persistent state have not been implemented.
