# The sites contract (draft)

What YipDen reads from the sites index: a visual index of indie web sites (shrines, fandom pages,
personal sites, blogs, webrings, resources), published as its own JSON document beside the
IndieNodes `ring.json` and never mixed into it.

**Status: kept** (tried on the `sites-surf` branch, merged 2026-10-07). The pipeline that will publish this (PR submission, a
GitHub Action, a Playwright capture) does not exist yet. Until it does, the app reads a seed copy
bundled in `apps/reader/src/lib/sites/seed.json`, with its posters and clips in
`apps/reader/static/sites/`.

## People and sites

ring.json lists **people**: creators, followed across everywhere they publish. This document lists
**sites**: places on the web, visited, saved and, when they publish a feed, followed the way a forum
is. What a listing is comes from the document that lists it, never from guessing about the person
behind it. The same human can be a person in the ring and the owner of a site here; the two are
linked only by evidence (an h-card, a `rel=me`, a site under a ring member's own address), never
merged, and a site never becomes a person by itself.

## The one rule

**Additive only**, as with the ring. A field may be added; none may be removed, renamed or change
meaning. Unknown fields survive untouched, and an unknown `category` is kept rather than refused.

## Shape

```json
{
  "version": "0.1",
  "generated_at": "2026-10-07T00:00:00Z",
  "entries": [
    {
      "id": "medjed",
      "url": "https://medjed.nekoweb.org/",
      "title": "Medjed",
      "category": "personal",
      "tags": ["nekoweb", "blog"],
      "blurb": "A personal site with a blog about whatever its owner is into.",
      "poster_url": "https://media.example/sites/medjed.jpg",
      "preview_url": "https://media.example/sites/medjed.mp4",
      "feeds": [{ "type": "rss", "url": "https://medjed.nekoweb.org/rss.xml" }],
      "layout": "mobile-friendly",
      "explicit": false,
      "added_at": "2026-10-07"
    }
  ]
}
```

Required on every entry: `id` (lowercase words joined by hyphens), `url` (public https), `title`,
`category`.

Optional: `tags` (lowercase; namespaced tags such as `fandom:sonic` are ordinary tags), `blurb`,
`poster_url` (a still, shown first and always), `preview_url` (a short muted scroll clip, MP4 for the
real feed), `feeds[]`, `layout` (`mobile-friendly` or `desktop-first`, absent means mobile friendly),
`explicit` (hidden unless the reader opts in, the same switch as the ring's), `added_at`.

Known categories: `shrines`, `fandom`, `personal`, `blogs`, `webrings`, `resources`.

## The forum index

A second document in the same shape lists **forums** (Discover's Forums side): indie web
communities, gathered by hand. Seed: `apps/reader/src/lib/sites/forums-seed.json`, media in
`apps/reader/static/forums/`. Two fields are its own:

- `software`: what the forum runs (`discourse`, `smf`, `proboards`, …). It decides whether YipDen
  can follow it. Only `discourse` can be followed today, through the app's existing forum follow.
- `follow_note`: for a forum YipDen cannot follow, why, in a reader's words ("its robots.txt asks
  apps not to read its feed"). Shown where Follow would be.

The publisher works these out when it checks a forum (software, a readable feed or API, robots.txt,
a bot wall) and should re-check them, since a forum's robots.txt can change.

There is deliberately no owner field. Who made a site is worked out from the site itself, by the
same evidence ladder the Creator Database uses; a submitter's claim may be added later as weak
evidence.

## Getting into the index, and permission (agreed 2026-10-07, not built)

Three different permissions, and passing the checks gives only the second:

1. **A list of addresses from elsewhere** (Kagi Small Web's lists, say) may be used when its
   license allows it. Kagi's are MIT: keep its notice with any copy, credit it ("nominations drawn
   from the Kagi Small Web list (MIT)"), take the lists from its GitHub repository rather than
   kagi.com's endpoints, and never brand anything as Kagi's.
2. **Listing a site** (its name, address and a link out) is fine for any site that passes the
   Surf checks. It is what webrings and directories have always done.
3. **Capturing it** (a poster, a scroll clip, kept on our storage) copies its owner's work, and
   needs its owner's say-so:
   - **Owner submission is the main way in**, through the PR pipeline: consent by design.
   - **A nominated site starts without our captures.** It shows the picture it offers for sharing
     (`og:image`), no clip, until its owner claims or approves the listing.
   - **Every "no" a site can say is honored**: robots.txt (wildcards included), `noindex`, and
     "no AI" or "no image AI" style meta tags. A site that turns away crawlers it does not name gets
     no capture.
   - **Captures are small and credited**: low resolution, a few seconds, the site's name and a link
     on every card.
   - **Opt-out and takedown come before scale**: an "Is this your site?" link on every card, and a
     stated time within which a site is removed from the index and from storage.

The 12 sites in today's seed were chosen by the maintainer, not submitted by their owners, so the
same rules apply to them once the pipeline exists.

## Ceilings

At most 2,000 entries and 16 tags per entry, the partner ring's own limits: past them the lists
need paging, which waits for real numbers.
