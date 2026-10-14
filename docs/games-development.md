# Game development and testing

Status: unreleased. The Stray is the only game in this repository; it has a player scaffold and a
prototype reference, and its production handoff is still pending
([stray-handoff.md](stray-handoff.md)). Yip Realm, Games Lab and the separate lab APKs moved to
their own repository, [`yiprealm`](https://github.com/XTREEMMAK/yiprealm), on 2026-10-14; its copy
of this document carries their history.

`tmp/games_handoffs/` is ignored and local to each checkout. Keep the original handoff and HTML
files there unchanged. They are not production modules or required CI inputs.

## Package boundaries

| Location                  | Responsibility                                                     |
| ------------------------- | ------------------------------------------------------------------ |
| `packages/game-contracts` | Host/save/page types; build capability selection; no game engine   |
| `packages/game-host`      | Cancellable launch and lifecycle controller; shared Svelte surface |
| `packages/stray`          | The Stray player entry, presently a lifecycle scaffold             |
| `apps/reader`             | Optional launcher and reader hosting adapter; thin by default      |

The player scaffold is deliberately labeled. It does not implement a hunt.

Do not import reader internals from game packages. Games receive a `GameHost`; production saves
must eventually use the reader's `Store` behind an adapter. No game state is written to the reader
yet. Decide save versions, backup inclusion and deletion semantics before enabling game saves.
Scores and achievements must remain game-specific, account-free, and have no effect on
reading/discovery.

## Build profiles

`YIPDEN_GAMES` is `thin` or `stray`. A misspelling fails the build. The reader starts with `thin`.
The Vite plugin resolves a different virtual registry for each profile. Thin has no game loaders or
implementation imports, and resolves the optional host to a small empty capability message without
its lifecycle controller or CSS. With `stray`, the loader runs only after Play. The optional You
link disables SvelteKit code and data preloading; the tab bar and root layout do not import games.

Game styles and assets belong to game modules, not unconditional reader static directories. Every
production build emits `game-build.json`: the actual chunk owners and static import edges. An
excluded package anywhere in the build graph fails the build, as does an eager static game import.
The post-build guard additionally inspects emitted files. Discover's existing WebGL is reader
functionality, so absence checks concern game-owned resources, not every WebGL context.

```bash
YIPDEN_GAMES=thin pnpm --filter @yipden/reader build
YIPDEN_GAMES=stray pnpm --filter @yipden/reader build
node tooling/games/check-build.mjs apps/reader/build stray
pnpm games:check
pnpm games:test
pnpm games:verify    # browser tests and build checks of the thin and stray reader profiles
```

Reader profile tests use port 4181. To try The Stray on a phone, build a debug APK with
`YIPDEN_GAMES=stray` set; there is no separate games APK.
