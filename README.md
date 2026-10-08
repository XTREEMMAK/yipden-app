<p align="center">
  <img src="apps/reader/store/play-icon-512.png" alt="YipDen logo: a white fox howling inside an arch, on orange" width="128" height="128">
</p>

<h1 align="center">YipDen</h1>

<p align="center">
  A Creator Database and a Mobile Friendly IndieWeb Surfing Tool.<br>
  Follow people, not platforms.
</p>

<p align="center"><b>Version 0.9.0</b>, the first store release, not yet published.</p>

<p align="center">
  <a href="#what-this-is">What this is</a> ·
  <a href="#run-it-locally">Run it locally</a> ·
  <a href="#repo-layout">Repo layout</a> ·
  <a href="#documentation">Documentation</a>
</p>

## What this is

One person publishes on their own site, on Bluesky, and on YouTube. YipDen pulls all of it
into one feed, in the order it was published, with no ranking and no account. Discovery comes
from the [IndieNodes](https://ring.indienodes.us) webring and other webrings.

Creative people are scattered across a site, a Bandcamp, an Instagram and three other places.
YipDen gathers that into **one profile per creator**, from what their own site says about them
and what you keep from it, even where the app cannot read: a **Creator Database** that lives on
your phone. It is website-first, not website-only, so someone who only has a Bluesky account is
still a full entry.

What you follow is a **den**: a person, a website, a forum, a member of a webring. You build your
den in one box, by name or by link, and what each of them shares arrives in **Yips**, newest
first. Everything a followed feed produces is a **yip**, whatever its format: a post, a video, an
episode, a track, a new post on a site, a topic on a forum.

### What is in the app

- **Discover**: the IndieNodes ring and partner rings one creator at a time, plus **Surf**, a
  visual index of indie sites, and a short list of forums worth knowing. Surf is an early
  experiment.
- **Follow**: build your den. One box takes a name or a link and works out whether it is a
  person, a site or a forum. A forum can be followed whole or by category, and a site by its feed.
- **Yips**: everything in your den, newest first, never ranked. Filter by what kind of thing (all,
  posts, watch, listen), by kind of den, by person or by folder. The filter is kept while you move
  around the app.
- **The player**: audio files, and tracks from **YouTube, SoundCloud and Bandcamp played inside the
  app** with YipDen's own controls: play, pause, seek, next and previous. On Android they also work
  from the lock screen and a car, and the queue plays on to the next track. Bandcamp's controls
  on Android go through a small bridge into its player; where a platform's player cannot be
  driven, the track opens on the platform instead.
- **The in-app browser**: visit a creator's site and keep what it plays or shows to your
  **Library**: tracks, comic pages, game screenshots and passages, kept as links, never copies.
- **Creator profiles**: who they are in their own words, where they are, what you kept.
- **You**: your dens in one list, your Library, Liked and Not Liked, settings and backups.

### Rules that do not bend

- **Reading never requires an account.** If a feature seems to need one, the feature is wrong.
- **No AI anywhere in this product.** No generated summaries, no ranking model, no AI SDKs.
- **Chronological only.** No engagement ranking of any kind.
- **Every yip links out to the creator's own URL.** This is a reader, not a destination.
- **Accessibility is not a later pass.** Real buttons and links, 44px touch targets, 4.5:1
  contrast including on images and on orange, works at 390px wide, reduced motion honored.

### Scope until v2.0

No server, no accounts, no server database. Everything runs on the device against public feeds,
public pages and the rings' own files, and is kept in an encrypted database on the phone. The
v2.0 backend (sync, a shared feed cache, and the shared side of the Creator Database) is decided
but deliberately unbuilt, and nothing before it may depend on it. See
[docs/architecture.md](docs/architecture.md) and [ROADMAP.md](ROADMAP.md).

## Run it locally

Requires Node 22 or newer and pnpm 11.

```bash
pnpm install
pnpm test           # every package
pnpm check          # typecheck every package
pnpm lint           # prettier and eslint
```

Building and running the Android app needs a JDK and the Android SDK as well. Setting that up,
including running on a real phone from a headless machine, is in
[docs/android-testing.md](docs/android-testing.md).

## Repo layout

```text
apps/reader/            SvelteKit and Capacitor app, adapter-static, no server routes ever
packages/ring-client/   Framework agnostic ring.json client, plain TS, zero runtime deps
packages/feeds/         Feed fetching, parsing and normalization, plain TS
docs/                   Architecture, security, testing and decisions
docs/reference/         The design prototype (kept locally, not in the repository)
```

`apps/api/` and `packages/db/` are reserved for v2.0 and are deliberately absent.

`packages/ring-client` is destined to move into the `indienodes-ring` repository and be
consumed by other clients, so it must never import from SvelteKit, Svelte or the app.

## Documentation

| Document                                           | What is in it                                             |
| -------------------------------------------------- | --------------------------------------------------------- |
| [docs/architecture.md](docs/architecture.md)       | How the pieces fit, and what v0.9 refuses to depend on    |
| [ROADMAP.md](ROADMAP.md)                           | Where things stand, and what comes next                   |
| [docs/android-testing.md](docs/android-testing.md) | Setting up the toolchain and running on a real phone      |
| [docs/security.md](docs/security.md)               | The OWASP and Mozilla checks applied, and where they live |
| [docs/ring-contract.md](docs/ring-contract.md)     | What the app needs from `ring.json`, and the changes owed |
| [docs/ci-cd.md](docs/ci-cd.md)                     | What CI runs, and where Semaphore fits later              |
| [DECISIONS.md](DECISIONS.md)                       | Every choice that differs from the brief, and why         |
| [CHANGELOG.md](CHANGELOG.md)                       | What changed, by version                                  |

## License

Copyright (C) 2026 Jamaal Ephriam. GPL-3.0-or-later. See [LICENSE](LICENSE).

## Contributing

Contributions are welcome. By submitting a pull request you agree that your contribution is
licensed under GPL-3.0-or-later, and that you grant the maintainer the right to also distribute it
under other terms, including in official app store builds of YipDen, where the GPL's terms and the
stores' terms cannot both be met by a third party. If you cannot agree to that, please open an
issue to discuss instead of a pull request. Sign off your commits (`git commit -s`) to confirm it.
