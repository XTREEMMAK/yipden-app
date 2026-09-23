# @yipden/feeds

Finds feeds, fetches them politely, and turns RSS 2.0, RSS 1.0, Atom and JSON Feed into one
`Item` type. An `Item` is what the app calls a yip.

## Use

```ts
import { discoverFeeds, FeedHttp, parseFeed } from '@yipden/feeds';

// From one URL a person pasted: their site, a profile, or a feed itself.
const found = await discoverFeeds('https://keyjay.neocities.org/');
// found.feeds is a list to show with a toggle per row. Nothing is followed automatically.

// Later, refreshing one followed feed.
const http = new FeedHttp({ fetch: nativeHttpFetch });
const response = await http.get(feedUrl, { etag, lastModified });
if (!response.notModified) {
  const feed = parseFeed(response.body, {
    feedUrl: response.url,
    contentType: response.contentType
  });
}
```

## What it does

**`discoverFeeds(url)`** works in order of decreasing confidence, which is the order the brief
lays out:

1. The URL is already a feed. Take it at face value and ask nothing else.
2. `link rel="alternate"` in the page. A page announcing its own feed is telling the truth
   about itself.
3. `rel="me"` links and h-card `u-url`, run through the documented platform patterns: Bluesky,
   Mastodon on any instance, YouTube, PeerTube, Discourse.
4. Well known paths (`/feed`, `/feed.xml`, `/rss.xml`, `/atom.xml`, `/index.xml`), tried only
   when the site announced nothing. Probing a site that already told us where its feed is would
   be spending someone else's bandwidth to learn what we were told.

It returns `canonicalUrl` (the address the site actually resolved to, after redirects), the
person's name from an h-card or the page title, the feeds, and an `unresolved` list with a
reason for anything that looked like a profile but produced no feed. The real case this exists
for: `neo.keyjayonline.com` redirects to `keyjay.neocities.org`, and those have to be one
person, not two.

**Verification** means a two way `rel="me"`: the site links to the profile and the profile
links back. Only then is a feed marked `verified`. It costs one request per profile and can be
turned off with `verifyBacklinks: false`. It works for Mastodon and personal sites; Bluesky
renders its profiles with JavaScript, so a backlink is usually not visible in the HTML and that
feed stays unverified rather than being marked verified on a guess.

**`FeedHttp`** is the only thing here that touches the network:

- conditional GET with `ETag` and `If-Modified-Since`, and 304 as a first class result
- one request at a time per host, with a configurable floor between them
- `robots.txt` honored, cached a day per host, with rules for this reader preferred over the
  wildcard group
- an honest `User-Agent` pointing at a page a server operator can read
- redirects followed by hand, five hops maximum, with every hop checked
- response size and time capped
- the `fetch` implementation is injected, so Capacitor's native HTTP client can stand in on
  Android, where it also means CORS does not apply

**`parseFeed`** sniffs the body rather than trusting the content type, because plenty of servers
send `text/xml` for JSON Feed. Items with no usable link are dropped: every yip links out to its
creator, so one with nowhere to go is not a yip.

## Security

The XML parser is `@rgrove/parse-xml`, chosen because it does not implement external entities
or DTD entity definitions at all. XXE and billion laughs are not attacks it can be talked into,
rather than attacks it has been configured against. Both have fixtures in `test/fixtures/` and
are asserted against.

`sanitizeHtml` is an allowlist re-serializer, not a filter: markup is tokenized and the output
is built from scratch from known safe elements with all text escaped, so a construct the
tokenizer did not understand cannot reach the output intact. v0.9 renders plain text through
`htmlToText`, so the sanitizer is defense in depth rather than the only line.

Every URL goes through `@yipden/ring-client`'s `safeUrl`: https only, no embedded credentials,
no private, loopback or link local hosts. See [docs/security.md](../../docs/security.md).

## Scripts

```bash
pnpm test    # vitest
pnpm check   # tsc --noEmit
pnpm build   # emit dist/ with declarations
```
