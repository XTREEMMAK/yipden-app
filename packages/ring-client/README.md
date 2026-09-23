# @yipden/ring-client

Reads the [IndieNodes](https://ring.indienodes.us) ring document. Plain TypeScript, no runtime
dependencies, no DOM and no framework, because this package is destined to move into the
`indienodes-ring` repository where other clients (the website, a future ambient display) will
consume it too.

## Use

```ts
import { fetchRing, filterRing, nodeOfTheDay, next } from '@yipden/ring-client';

const result = await fetchRing({ cache: myCache });
const today = nodeOfTheDay(result.document);
const audio = filterRing(result.document, { types: ['audio'] });
```

`fetchRing` never throws and never leaves the reader with a blank screen. It returns a
`source` saying where the document came from, so the UI can be honest about it:

| `source`       | Meaning                                                         |
| -------------- | --------------------------------------------------------------- |
| `network`      | Fetched and parsed fresh                                        |
| `not-modified` | The server answered 304, so the cached copy is current          |
| `cache`        | The request failed and this is the last good copy, with `error` |
| `empty`        | The request failed and there was no cached copy                 |

## API

- `fetchRing(options)`: conditional GET with `ETag` and `If-Modified-Since`, an injectable
  `fetch` (so Capacitor's native HTTP client can stand in), an injectable `cache`, a timeout
  and a response size cap.
- `validate(json, options)`: drops malformed entries one at a time and reports each one in
  `dropped`, with field level repairs in `repaired`. It never discards the whole ring.
- `normalize(entry, options)`: canonical URLs, filled in optionals, unknown fields untouched.
  Pass `resolveUrl` to fold a redirect so one creator is one person.
- `nodeOfTheDay(ring, date)`, `next(ring, id)`, `prev(ring, id)`, `positionOf(ring, id)`,
  `shuffle(ring, seed)`, `rotationOrder(ring)`.
- `filterRing(ring, filter)`, `tagFacets(ring)`, `typeFacets(ring)`.
- `safeUrl`, `normalizeUrl`, `displayHost`, `isPrivateHost`.

## Rules this package holds to

**The contract is additive only.** Unknown fields survive a round trip untouched, unknown
`type` and feed values are kept rather than dropped, and an unrecognized envelope `version` is
not a reason to refuse the document.

**Every URL is checked once, here.** Ring data is third party input that ends up in an `href`,
an `<img src>` or an audio source. `safeUrl` requires https, refuses embedded credentials, and
refuses private, loopback, link local and carrier grade NAT hosts so a ring entry can never
point a reader's device at something on their own network. This is the OWASP injection and
request forgery guidance applied on device, where there is no server to do it for us.

**Rotation is deterministic.** `nodeOfTheDay` is seeded from the UTC calendar day alone and
walks members sorted by id, so every client everywhere lands on the same person without a
server telling them who it is. `shuffle` takes a seed for the same reason.

**The bar is lower than the ring's publishing schema.** The ring enforces its full contract
before anything is published. A reader only needs what it renders, so an entry missing a field
the reader never shows still appears rather than vanishing from someone's app.

## Fixtures

`test/fixtures/ring-live.json` is the real document from `ring.indienodes.us`, refreshed by
hand. `ring-extended.json` adds the fields the ring will emit later (`feeds`, `discoverable`,
`generated_at`) plus an unknown field, to prove the additive contract. `ring-hostile.json`
holds the input this package is expected to refuse.

`schema/ring-document.schema.json` is the reader's own JSON Schema, checked against every
fixture in `test/schema.test.ts`.

## Scripts

```bash
pnpm test    # vitest
pnpm check   # tsc --noEmit
pnpm build   # emit dist/ with declarations, for the eventual move into indienodes-ring
```
