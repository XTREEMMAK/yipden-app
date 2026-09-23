# The ring contract

What YipDen needs from `https://ring.indienodes.us/ring.json`, what the ring publishes today,
and what is still owed on the ring side.

The canonical definition lives in
[`indienodes-ring`](https://github.com/XTREEMMAK/indienodes-ring), in `schema/ring.schema.json`
and `schema/ring-document.schema.json`. This document is the reader's side of the same
conversation, and `packages/ring-client/schema/ring-document.schema.json` is its machine
readable form.

## The one rule

**Additive only.** A field may be added; a field may not be removed, renamed or have its
meaning changed. A client built today must still work against a ring published in two years,
and a field this client does not model must survive a round trip untouched. `ring-client`
enforces its half of that, and has a test for it.

An unrecognized envelope `version` is not a reason to refuse the document. Read `entries`
anyway.

## What the ring publishes today

Verified against the live document on 2026-09-22.

```json
{ "version": "1.0", "entries": [ ... ] }
```

Required on every entry: `id`, `creator`, `type`, `why`, `source_url`, `tags`,
`verification_token`, `joined_at`.

Optional: `creator_id`, `form` (audio only, and required there), `tracks` (audio, up to 3),
`pages` (comic), `artworks` (art), `excerpts` (text), `thumb_url`, `thumb_position`,
`preview_url` and `trailer_url` (game), `explicit`, `updated_at`, `_placeholder`.

`type` is one of `audio`, `comic`, `text`, `game`, `art`.

## What the app needs that does not exist yet

These are the additive fields the brief names. `ring-client` already reads all of them and
tests against a fixture carrying them, so the app is ready whenever the ring starts emitting
them. Each one needs a change in `indienodes-ring`, where the entry schema is
`additionalProperties: false` and will reject them until it is updated.

### `feeds[]` on an entry, the one that matters

```json
"feeds": [
  { "type": "rss", "url": "https://keyjay.neocities.org/feed.xml", "verified": true },
  { "type": "bluesky", "url": "https://bsky.app/profile/keyjay.bsky.social/rss", "verified": true }
]
```

This is what makes "one tap follows everything this person publishes" possible without the
app guessing. `type` is free text so a new platform does not require a client release;
`rss`, `atom`, `jsonfeed`, `bluesky`, `mastodon`, `youtube` and `podcast` get a label in the
UI and anything else renders as a generic feed. `verified` means the feed's profile links back
to `source_url`, a two way `rel="me"`.

**Until it exists, the app falls back to running feed discovery against `source_url`**, which
works but is slower, guesses more, and cannot know about a creator's Bluesky or YouTube unless
their site links to it.

### `discoverable` on an entry

A boolean defaulting to true. False keeps a member in the ring, reachable by direct link, but
out of Discover's rotation. A creator's own opt out.

### `generated_at` on the document

An ISO timestamp saying when the ring published this document. Useful for showing a reader how
fresh their cached copy is, and for a future ambient display that needs to know whether to
bother refetching.

## What the reader does with the rest

- **`_placeholder: true`** entries never enter the rotation. They are seed rows, not people.
- **`explicit: true`** entries are hidden unless the reader opts in, matching the ring's own
  documented rule. See DECISIONS.md, because the app brief never mentioned this field.
- **`thumb_url` is optional**, and Discover needs a full bleed image for everyone. The fallback
  order is `thumb_url`, then the first `pages[]` image, then the first `artworks[]` image, then
  a deterministic color wash generated from the entry id. One live member, `art-slime-pond`,
  has no `thumb_url` today, so this path is exercised rather than theoretical.
- **`tracks[].media_url`** feeds the "From the ring" rows in Today's Listen filter.
- **Rotation order is the entries sorted by `id`**, not the order the document happens to
  arrive in, so every client agrees about who today's member is. See DECISIONS.md.

## Changes owed to `indienodes-ring`

Not yet opened. The app is being built first so the shape can be proven against real screens
before the ring commits to it.

1. Add `feeds[]`, `discoverable` and top level `generated_at` to the schemas.
2. Emit them from `build-ring.js`.
3. Extend the submission and update flows so a creator can declare their feeds.
4. Consider whether `member-health.js` should check feed reachability the way it checks
   `source_url`.

Item 1 is the blocking one for the app; the rest can follow.
