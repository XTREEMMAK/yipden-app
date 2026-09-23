<h1 align="center">YipDen</h1>

<p align="center">
  A mobile reader for the indie web. Follow people, not platforms.
</p>

<p align="center">
  <a href="#what-this-is">What this is</a> ·
  <a href="#run-it-locally">Run it locally</a> ·
  <a href="#repo-layout">Repo layout</a> ·
  <a href="#documentation">Documentation</a>
</p>

## What this is

One person publishes on their own site, on Bluesky, and on YouTube. YipDen pulls all of it
into one feed, in the order it was published, with no ranking and no account. Discovery comes
from the [IndieNodes](https://ring.indienodes.us) webring.

Everything a followed feed produces is a **yip**, whatever its format: a post, a video, an
episode, a track. Following a person is still called following. What shows up afterward in
Today is a yip.

### Rules that do not bend

- **Reading never requires an account.** If a feature seems to need one, the feature is wrong.
- **No AI anywhere in this product.** No generated summaries, no ranking model, no AI SDKs.
- **Chronological only.** No engagement ranking of any kind.
- **Every yip links out to the creator's own URL.** This is a reader, not a destination.
- **Accessibility is not a later pass.** Real buttons and links, 44px touch targets, 4.5:1
  contrast including on images and on orange, works at 390px wide, reduced motion honored.

### Scope of v0.9

No server, no accounts, no database. Everything runs on the device against public feeds and
the ring's `ring.json`. The v2.0 backend is decided but deliberately unbuilt, and nothing in
v0.9 may depend on it. See [docs/architecture.md](docs/architecture.md).

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
docs/reference/         The clickable design prototype every screen is built against
```

`apps/api/` and `packages/db/` are reserved for v2.0 and are deliberately absent.

`packages/ring-client` is destined to move into the `indienodes-ring` repository and be
consumed by other clients, so it must never import from SvelteKit, Svelte or the app.

## Documentation

| Document                                           | What is in it                                             |
| -------------------------------------------------- | --------------------------------------------------------- |
| [docs/architecture.md](docs/architecture.md)       | How the pieces fit, and what v0.9 refuses to depend on    |
| [docs/android-testing.md](docs/android-testing.md) | Setting up the toolchain and running on a real phone      |
| [docs/security.md](docs/security.md)               | The OWASP and Mozilla checks applied, and where they live |
| [docs/ring-contract.md](docs/ring-contract.md)     | What the app needs from `ring.json`, and the changes owed |
| [docs/ci-cd.md](docs/ci-cd.md)                     | What CI runs, and where Semaphore fits later              |
| [DECISIONS.md](DECISIONS.md)                       | Every choice that differs from the brief, and why         |
| [CHANGELOG.md](CHANGELOG.md)                       | Released versions                                         |

## License

GPL-3.0-or-later. See [LICENSE](LICENSE).
