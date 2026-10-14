# Claude Code prompt — YipDen v0.9 change brief: people-first discovery

> Everything below is the brief. It amends the existing v0.9 brief; where the two conflict,
> this one wins. Read the current code, the original brief and `DECISIONS.md` before changing
> anything, and build on what exists rather than rewriting it.

## Why this change

YipDen is moving away from presenting itself as an indie web / webring app. The product is
"follow people, not platforms." The IndieNodes webring stays as a first-class discovery
source, but it is now **one source among several**, not the app's identity. People without a
personal website (only Bluesky, YouTube, Mastodon, a podcast, etc.) are fully supported.

Two shifts:

1. **The user chooses their start page**: Today (their yips) or Discover.
2. **Discovery becomes multi-source**: the IndieNodes ring plus a YipDen-curated directory of
   creators, with a real opt-out path.

Everything in the original brief that isn't changed here still applies: no server, no
accounts, no AI features, chronological only, every yip links out, accessibility and motion
rules, and asking before native deps, animation libraries, ring.json contract changes, or
anything needing a server.

## 1. Start page setting

- New setting **Start on: Today / Discover**, stored through the `Store` interface (no
  component touches storage directly).
- First launch, and any launch while the user follows nobody: always open Discover, because
  Today would be empty.
- Once the user follows at least one person, respect the setting. Default value: Today.
- The setting lives in a simple Settings screen reachable from both tabs (gear icon button,
  labeled, 44px target). No onboarding wizard.
- Changing the setting takes effect on the next launch; don't navigate away mid-session.

## 2. The person is the core unit

Introduce a normalized `Person` type in a new package, `packages/directory` (plain TS, zero
deps, no Svelte imports):

```ts
type Person = {
  id: string;              // stable, source-prefixed: "indienodes:<id>" | "yipden:<id>"
  name: string;
  note?: string;           // ring `why` or curator note
  thumbUrl?: string;       // creator-provided image only
  thumbPosition?: { x: number; y: number };
  tags: string[];
  siteUrl?: string;        // OPTIONAL: a person with no website is valid
  feeds: { type: FeedType; url: string; verified: boolean }[];
  tracks?: { label: string; mediaUrl: string }[];
  source: 'indienodes' | 'yipden';
  listing: 'member' | 'curated'; // opted in (ring member) vs listed by YipDen
  discoverable: boolean;
};
```

- A `Person` with zero `siteUrl` and only social or video feeds is first-class everywhere:
  Discover cards, Follow, Today source chips.
- **Verification without a site**: `verified` stays true only for a two-way `rel="me"`
  link, or a Bluesky handle that is the person's own domain. Everything else is simply
  unverified. Never show "unverified" as a warning or badge. Verified gets a small check;
  unverified gets nothing.
- Dedupe across sources by canonical feed URL (after redirects) and canonical site URL. When
  the same person appears in both sources, show one card and prefer the ring entry
  (`listing: 'member'`) since that person opted in.

## 3. Sources

`packages/directory` exposes a `DirectorySource` interface and two adapters:

- **`indieNodesSource`**: wraps the existing `packages/ring-client`. **Do not modify
  ring-client or the ring.json contract**; it is destined for the indienodes-ring repo. The
  adapter maps ring entries to `Person`.
- **`yipdenSource`**: reads the curated directory (section 4).

Each source has its own conditional GET, cache, cached-last-good fallback and validation that
drops bad entries individually, mirroring ring-client's behavior. Write that shared logic once
inside `packages/directory`; don't copy it.

Merged rotation lives in `packages/directory`:
`featuredToday(people, date)` (deterministic daily seed so every client agrees),
`next`, `prev`, `shuffle(seed)`, and filters by tags and feed type. ring-client's own rotation
functions stay as they are for other consumers.

## 4. The curated directory

### Files (in this repo, published as static files on yipden.com)

```
directory/
  people.json        public: the curated list
  optouts.json       public: hashed identifiers of people who asked not to be listed
  schema/            JSON Schemas for both
  README.md          how to add a person, how removals work
```

- `people.json`: `{ version: "1.0", generated_at, entries: [...] }`. Entry fields match the
  `Person` inputs plus `added_at`. Include **no private data**: no emails, no contact notes,
  no "contacted on" dates. Outreach tracking stays out of the repo.
- `optouts.json`: `{ version: "1.0", hashes: [...] }`, where each hash is a SHA-256 of a
  normalized identifier (canonical site URL, feed URL, or social handle). The opt-out list
  must not itself become a public list of who opted out, so it holds only hashes.
- Same additive-only contract as ring.json: unknown fields ignored, never dropped on
  round-trip.

### Enforcement (in code, not just policy)

- The client drops any directory entry whose identifiers hash-match `optouts.json`, and any
  entry with `discoverable: false`, from **every** surface: Discover, search, featured,
  shuffle.
- Add a small script, `pnpm directory:check`, that validates `people.json` against the schema,
  rejects any entry that matches an opt-out hash, and fails on duplicate people. Run it in the
  same pre-commit checks as typecheck, lint and tests.
- Add `pnpm directory:optout <url-or-handle>`, which normalizes the input, appends its hash to
  `optouts.json`, and removes the matching entry from `people.json`.

### Curation workflow (document in `directory/README.md`)

1. Contact the creator privately before listing when a contact method exists; list after they
   say yes or don't reply within a stated window.
2. Only list feeds the creator already publishes publicly. Don't scrape profiles beyond the
   feed discovery `packages/feeds` already does.
3. Imagery is the creator's own (`thumbUrl` from their site, avatar or feed image), never
   re-hosted or edited.
4. A removal request is honored with `directory:optout` and no questions asked.

## 5. Discover changes

- **Sources toggle** in Settings: IndieNodes ring and YipDen directory, both on by default.
  Discover shows the merged, deduped list from the enabled sources.
- The top card is **"Featured today"** from `featuredToday`, drawn from all enabled sources.
  Swipe and next/prev rotate through the merged list. Auto-advance and offline-from-cache
  still work.
- Each card shows where the person comes from, honestly:
  - ring members: "IndieNodes member"
  - curated: "Listed by YipDen"
- Every curated card has a visible, labeled **"Is this you?"** link to a removal page. The
  URL is a single constant (`REMOVAL_URL` in `src/lib/config.ts`). In v0.9 it points to a
  static page on yipden.com with a `mailto:` link, since there is no server.
- Filters: tags and feed type (Posts / Watch / Listen), working across both sources.

## 6. Copy and identity

- Remove "indie web" / "webring" framing from app UI strings, except where naming the
  IndieNodes source itself. Product line: "Follow people, not platforms."
- Keep the yip vocabulary and tab names unchanged.
- Settings gets a short static **About** section stating plainly that YipDen has no AI
  features, no ranking, no accounts and no tracking, and that every yip links to the creator.

## 7. Brief rule change

Replace the original rule

> Public pages/discovery only for people who opted in (ring members).

with

> Discovery lists ring members (opted in) and creators curated by YipDen (listed with an
> opt-out). Opt-outs are enforced in code and honored everywhere. Paste-a-link follows stay
> private to the device.

Log this change, and the reasoning, in `DECISIONS.md`.

## Out of scope for this change

Importing follows from YouTube, Bluesky or Mastodon accounts; user-shared lists; claimed
creator pages; any server-side removal form. Note them in `DECISIONS.md` as candidates for
later.

## How to work

1. `packages/directory`: `Person` type, `DirectorySource`, the two adapters, dedupe,
   rotation, opt-out hashing. Tests first, including a fixture of the real ring.json and a
   small sample `people.json` with an opted-out entry that must never surface.
2. `directory/` files, schemas, and the two scripts.
3. Start page setting and Settings screen.
4. Discover rework on top of `packages/directory`.
5. Copy pass and the About section.
6. Commit per step with a short message; typecheck, lint, tests and `directory:check` before
   each commit.

Ask before: changing ring-client or the ring.json contract, adding any dependency with native
code, or adding anything that needs a server.
