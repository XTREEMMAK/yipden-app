# Documentation

| Document                                 | What is in it                                                  |
| ---------------------------------------- | -------------------------------------------------------------- |
| [architecture.md](architecture.md)       | How the pieces fit, and what v0.9 refuses to depend on         |
| [android-testing.md](android-testing.md) | The toolchain, the browser loop, and running on a real phone   |
| [security.md](security.md)               | The OWASP and Mozilla checks applied, and where each one lives |
| [ring-contract.md](ring-contract.md)     | What the app needs from `ring.json`, and the changes owed      |
| [ci-cd.md](ci-cd.md)                     | What CI runs, and where Semaphore fits later                   |
| [../DECISIONS.md](../DECISIONS.md)       | Every choice that differs from the brief, and why              |

## reference/

`reference/yipden-prototype.html` is the clickable prototype of every v0.9 screen, plus the
v2.0 sign in screens. Open it at 390x844 before building a screen, and compare against it
after.

**Authoritative**: layout, copy, tokens, type, motion values and curves, gesture thresholds,
interaction states, reduced motion and dark mode behavior.

**Not authoritative**: the notes panel beside the phone, the sample creators and yips, the
canvas generated artwork, the simulated playback clock, toasts claiming a link "opens", and
its structure. It is one file of plain DOM and JS. Port the patterns into Svelte components,
never the code as written.
