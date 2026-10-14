# YipDen's creator directory

Creators YipDen lists for discovery, beside the IndieNodes ring's members. Published as static
files on yipden.com; the app reads them like it reads the ring. The rule and the reasons are in
[DECISIONS.md](../DECISIONS.md), 2026-10-14.

| File                     | What it is                                                            |
| ------------------------ | --------------------------------------------------------------------- |
| `people.json`            | The list. Public. No private data of any kind.                        |
| `optouts.json`           | Hashes of identities of people who asked not to be listed. No names.  |
| `schema/`                | JSON Schemas for both. Additive: unknown fields are allowed and kept. |
| `seed/people.test.json`  | **The test seed.** Tests and debug builds only; never published.      |
| `seed/optouts.test.json` | The test seed's opt-outs.                                             |

## Who belongs here

**Creators**: people who make things and publish them, such as music, comics, art, games,
writing, video, podcasts, crafts. Not personal sites in general, and not companies. The list is
**hand-picked by YipDen**: it is not complete and does not claim to be neutral. Being left out
says nothing about anyone.

## How someone gets listed

1. **Contact them first**, privately, when they have a contact method. Say what YipDen is, what
   would be listed, and that they can say no or be removed at any time.
2. **List them after they say yes, or after 14 days with no reply.** Keep outreach records (who,
   when, what they said) **out of this repository**.
3. **Only list what they already publish**: their site, and feeds they publish publicly. No
   scraping beyond the feed discovery `packages/feeds` already does.
4. **Imagery is their own** (`thumb_url` from their site, avatar or feed image), never re-hosted
   or edited.
5. Add the entry to `people.json` (see the schema), then:

```bash
pnpm directory:resolve <entry-id>   # records every form of their addresses and accounts (network)
pnpm directory:check                # must pass; it runs in pnpm test and CI too
```

A person with no website is fine: an entry needs a site **or** a feed. `verified` is true only for
a two-way `rel="me"` link, or a Bluesky handle that is the person's own site's domain (resolve
sets that one). Unverified shows nothing in the app, never a warning.

## Removal

Anyone can ask to be removed or corrected at **yipden.com/is-this-you**. Requests are
**moderated**: they reach the maintainer, and an approved removal runs

```bash
pnpm directory:optout --id <entry-id>     # or an address or handle instead of --id
```

which hashes every known form of the person into `optouts.json`, removes their entry, and opens a
pull request when run by the `directory-optout` workflow. Removals are honoured; no reason is
asked. The app drops anyone matching an opt-out from **every** source, lists readers add
included.

**What the hashes do and don't do.** They keep `optouts.json` from being read as a list of names.
They do not stop someone who already suspects a person from hashing that person's address and
checking: the app must check the list, so the hash cannot be secret. And a removal is visible in
this repository's history, as the listing was. The real protection is that an opt-out removes the
entry before anything is published, and the app's check is a backstop.

## The test seed

`seed/people.test.json` holds Jericho George (public details from their own page only) and an
example person who opted out and must never appear. It drives the unit tests and debug builds.
`directory:check` fails if any of it reaches `people.json`, and a release build fails if any of it
is in the app. They are listed for real only after being contacted and the 14 days passing.
