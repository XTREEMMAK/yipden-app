# Architecture

## The shape of v0.9

```text
                       ring.indienodes.us/ring.json
                                  |
                        packages/ring-client
                                  |
   creators' own sites   ---> packages/feeds --->  apps/reader (SvelteKit, adapter-static)
   Bluesky, YouTube,                                       |
   Mastodon, podcasts                            Capacitor Android host
                                                          |
                                              SQLite on device, behind Store
```

There is no server. There is no account. There is no database anywhere but the phone. That is
not a stage the product is passing through on the way to something else: reading is meant to
work with nothing but a device and the public web, and v2.0 adds sync beside that rather than
underneath it.

## Packages

### `packages/ring-client`

The ring document, and nothing else. Plain TypeScript, zero runtime dependencies, no DOM and
no framework, because it is destined to move into the `indienodes-ring` repository where the
website and other clients will consume it. It must never import from SvelteKit, Svelte or the
app. Its own README covers the API.

### `packages/feeds`

Feed fetching, parsing and normalization. RSS 2.0, Atom and JSON Feed all become one `Item`,
which is what the UI layer calls a yip. Discovery takes one URL and finds the feeds behind it.
Also plain TypeScript with no framework imports.

### `apps/reader`

SvelteKit with `adapter-static`, Svelte 5 runes, TypeScript in strict mode. Capacitor loads
the built files from the device, so **the reader app has no server routes, ever**. A
`+server.js` in this app could not run in production even if someone wrote one.

## Boundaries that are load bearing

**Nothing talks to storage directly.** Follows, read state, cached yips and cached waveform
peaks live behind a `Store` interface with one on device implementation (SQLite through
Capacitor, IndexedDB on web). No component may reach past it. v2.0 adds a syncing
implementation behind the same interface, and that is only possible if the interface is the
only door.

**Fetching is injected, never imported.** `ring-client` and `feeds` take a `fetch` rather than
reaching for the global, because on Android the request has to go through Capacitor's native
HTTP client and in tests it has to go nowhere at all.

**The ring contract is additive only.** Unknown fields survive a round trip untouched. See
[ring-contract.md](ring-contract.md).

## What v0.9 does not build

`apps/api/` and `packages/db/` are reserved for v2.0 and must not be scaffolded. Also out of
scope: clean reader view, forum digests, creator packs, claimed creator pages, payments, sync,
sign in, webmentions, and any server at all.

The v2.0 backend is already decided so that v0.9's interfaces fit it: Postgres reached only
through a `DATABASE_URL`, Drizzle with `postgres.js`, Better Auth with its Drizzle adapter and
a bearer token for the app. None of it exists here, and nothing in v0.9 may depend on it.

## Two lanes for fetching, and why

On Android, Capacitor's native HTTP client patches `fetch`, so a request to a creator's feed is
a native request and CORS does not apply. In a plain browser it does apply, and most feeds will
refuse a cross origin read.

So the web build is for development and testing only, and it has two lanes:

1. **A local fixture server** for Vitest and Playwright. Deterministic, offline and fast, which
   is what a test suite needs.
2. **A development only proxy** in Vite middleware, for trying a real feed in a browser. It
   blocks private and loopback addresses including after redirects, caps response size and
   time, and does not exist in the static build.

Neither ships. The app never depends on a server, which is the whole point of the rule.
