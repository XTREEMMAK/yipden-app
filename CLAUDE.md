# YipDen: notes for a new session

A Creator Database and a Mobile Friendly IndieWeb Surfing Tool. SvelteKit (static) and Capacitor
(Android), a pnpm monorepo: `apps/reader` (the app), `packages/ring-client`, `packages/feeds`. No
server, no accounts, until v2.0. Read [README.md](README.md) first, then [ROADMAP.md](ROADMAP.md)
(what is left, in order) and [DECISIONS.md](DECISIONS.md) (why things are as they are).

## Commands

Run from the repo root unless noted.

```bash
pnpm test        # every package (vitest)
pnpm check       # typecheck every package
pnpm lint        # prettier --check, then eslint
cd apps/reader && npx playwright test --project=phone   # end to end, 390x844; builds a debug build
cd apps/reader && pnpm android:apk                      # a numbered debug APK, see below
```

Format only the files you changed (`npx prettier --write <files>`). Prettier run over a whole
folder under `apps/reader` ignores the repo's `.prettierignore` and rewrites the partner test
fixtures in `src/lib/partner/test-fixtures/`; restore them with `git checkout` if that happens.

## Rules that do not bend

- No account needed to read, no AI anywhere, chronological only (never ranked), every yip links out
  to the creator's own URL. Accessibility is part of the work: real buttons, 44px targets, 4.5:1
  contrast, 390px wide, reduced motion honoured.
- **Ask first** before: a native dependency, an animation or gesture library, a `ring.json` contract
  change, anything needing a server. (Patching an approved plugin is recorded in `patches/` and in
  DECISIONS.md.)
- A person, a site and a forum are different records (people from the ring, places from the sites
  index). Never turn a site into a person automatically; "made by" comes from evidence only.
- What a reader follows is a **den**; what it shares is a **yip**; the tab is **Yips**.
- Surf's bundled seed is debug-only. A release (`pnpm build`) must hold none of it, and
  `scripts/strip-surf-seed.mjs` fails the build if it does.

## Habits

- A choice that differs from the brief, or that the brief left open, goes in DECISIONS.md with the
  reason; what changed for readers goes in CHANGELOG.md; ROADMAP.md stays true.
- Debug-only code sits behind `__YIPDEN_DEBUG__` (replaced by a literal, so a release drops it). The
  debug switches and the frame and media logs are in Settings of a debug build.
- A phone test needs a fresh debug APK, not a passing Playwright run: build one with `pnpm
android:apk`, which prints a numbered file (`yipden-debug-NNN.apk`; About shows the number). The
  app's own web bundle is what a phone runs, so rebuild before saying a change is ready to try.
  Needs `JAVA_HOME` and `ANDROID_HOME` set (see [docs/android-testing.md](docs/android-testing.md)).
- `docs/reference/` (the design prototype) is kept locally and is not in the repository.
