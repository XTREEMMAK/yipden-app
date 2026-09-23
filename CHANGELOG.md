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
