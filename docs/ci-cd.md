# CI and delivery

## What CI runs

GitHub Actions, on push and pull request to `main`, on Node 24, with actions pinned to commit
SHAs rather than tags. This mirrors how `indienodes-app` and `indienodes-ring` already run, so
there is one set of habits across the projects rather than three.

| Step                | Command                          | Why it is in this order                                            |
| ------------------- | -------------------------------- | ------------------------------------------------------------------ |
| Install             | `pnpm install --frozen-lockfile` | A lockfile that does not match the manifests fails here, not later |
| Typecheck           | `pnpm check`                     | Cheapest signal, catches the most                                  |
| Lint and formatting | `pnpm lint`                      | Prettier and ESLint                                                |
| Unit tests          | `pnpm test`                      | Every package                                                      |
| Web build           | `pnpm build`                     | Proves `adapter-static` still produces a build                     |
| End to end          | Playwright                       | Against the static build, using fixture feeds, never the network   |

For CI to actually block a merge it has to be marked required in the repository's branch
protection settings. That is a GitHub setting, not something a workflow file can express.

## Android builds

The APK is **not** built on every push. It is slow, it needs the Android SDK on the runner, and
nothing about it gates correctness that the web build has not already checked.

A tag matching `v*` builds a debug APK and attaches it to the run as an artifact, so there is
always a downloadable build for a given version without anyone needing the toolchain.

**Release signing is not set up**, deliberately. It needs a Play Console identity and an upload
keystore, and a keystore committed or handed around before then is a liability with no
purpose. When those exist: the keystore goes in GitHub secrets as base64, the workflow decodes
it to a temporary file, and the file is deleted in a step that always runs.

## Where Semaphore fits, and why it does not yet

Semaphore UI, the Ansible task runner on the infrastructure side, deploys things that run on a
server. It pulls an image that GitHub Actions built and published, and owns the environment and
secrets on the target host. That is how `indienodes-app` reaches production.

**v0.9 has no server**, so there is nothing for it to pull. The reader is a static bundle
loaded from the device's own storage; the only artifact is an APK, and an APK is distributed
through the Play Store or a download, not deployed to a host.

Semaphore becomes relevant at exactly two future points:

1. **A yipden.com marketing site**, if one is built here. It would be another static site, so
   the pattern is the one already in use: Actions builds and publishes the image, Semaphore
   pulls it. Note the constraint `indienodes-app` already ran into, that `adapter-static`
   compiles `VITE_` values in at build time, so whichever system runs `docker build` is the
   only place those values can enter. Semaphore cannot inject them later.
2. **`apps/api/` in v2.0**, which is a real server with a real database. That is the case
   Semaphore is actually for.

Until one of those exists, adding Semaphore would be a pipeline with nothing at the end of it.

## Releases

Versions start at 0.0.1 and follow semantic versioning. The version is canonical in the root
`package.json`; the Android project's `versionName` must match it when cutting a build, and
`versionCode` is an independent counter that only ever increases.

Every release updates [CHANGELOG.md](../CHANGELOG.md). Anything that departed from the brief is
recorded in [DECISIONS.md](../DECISIONS.md) when the decision is made, not at release time.
