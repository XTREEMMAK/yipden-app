# Security

## What the threat model actually is

YipDen has no server, no account and no credential to steal. That removes most of the usual
list and leaves one thing, which it leaves in a sharper form than a normal web app has it:

**The entire product is untrusted third party content, fetched from hundreds of sites nobody
here controls, rendered inside a WebView that is also the app.** A malicious or merely
compromised feed is the attacker. There is no server between it and the reader to sanitize
anything, so every check has to happen on the device.

Two OWASP categories carry nearly all of the risk here: injection (A03) and server side
request forgery (A10, which becomes device side request forgery when the client does its own
fetching). Mozilla's web security guidance supplies the headers and the transport rules.

## Injection: feed and ring content reaching the DOM

- **Feed HTML is sanitized before it is rendered**, with an allowlist, not a blocklist. No
  `<script>`, no `<iframe>`, no `<object>` or `<embed>`, no `on*` event handler attributes, no
  `style` attributes that can load a remote resource, no `<base>`. Unknown elements and
  attributes are dropped rather than passed through.
- **URL schemes are checked wherever a URL becomes a link, an image or a media source.**
  `ring-client`'s `safeUrl` refuses anything that is not https, which rules out `javascript:`
  and `data:` by construction. `packages/feeds` applies the same rule to feed item links and
  enclosures.
- **Svelte escapes text by default and `{@html}` is used only on sanitized content.** Any use
  of `{@html}` on anything that did not come out of the sanitizer is a bug.
- **Outbound links carry `rel="noopener noreferrer"`** and open in the system browser, not in
  the app's WebView, so a creator's page never runs inside the app's origin.

## Request forgery: where the device is pointed

A ring entry or a feed can name any URL, and the device will fetch it from inside the reader's
own network. That is the same hole as classic SSRF with the reader's LAN in the position of
the internal network.

`packages/ring-client/src/url.ts` refuses, and `packages/feeds` reuses it:

- anything that is not `https:`
- URLs carrying embedded credentials (`https://user:pass@host/`)
- loopback, private, link local and carrier grade NAT addresses: `127.0.0.0/8`, `10/8`,
  `172.16/12`, `192.168/16`, `169.254/16` (which is where cloud metadata services live),
  `100.64/10`, `0/8`, multicast and reserved space
- IPv6 loopback, unique local `fc00::/7` and link local `fe80::/10`
- IPv4 mapped IPv6 addresses in both spellings, including the hex form the URL parser produces
- `localhost` and the `.local`, `.localhost`, `.internal` and `.home.arpa` suffixes

The development only fetch proxy applies the same list, **and applies it again after every
redirect**, because a redirect to `169.254.169.254` is the standard way around a check that
only runs once.

## Parsing untrusted XML

- **External entities are disabled**, and so is DTD processing. XXE is the reason the XML
  parser choice is constrained rather than left to whatever is convenient.
- **Entity expansion is bounded**, against a billion laughs style expansion.
- **Response size and parse time are capped** before parsing starts, so a feed that streams
  forever fails instead of filling the phone's memory.
- The same caps apply to `ring.json`, with a limit well above any plausible ring.

## Being a good citizen on other people's servers

These are not defensive measures; they are the reason the product is allowed to exist.

- Conditional GET (`ETag`, `If-Modified-Since`) on every refetch, so an unchanged feed costs
  its host almost nothing.
- Per host rate limiting, so following twelve feeds on one instance is not twelve simultaneous
  requests.
- `robots.txt` respected.
- An honest `User-Agent` naming the app and a URL to read about it.
- `preload="none"` on audio, and no autoplay or auto loop. Track media is hosted on members'
  own sites and playing it spends their bandwidth.

## Transport and the WebView

Following Mozilla's web security guidance, adapted to an app whose origin is local files:

- **https only**, everywhere, with no exception for development against real feeds.
- **A Content Security Policy** on the app document: `default-src 'self'`, `script-src 'self'`,
  `object-src 'none'`, `base-uri 'none'`, `frame-ancestors 'none'`, `form-action 'none'`, with
  `img-src` and `media-src` allowing `https:` because creator media comes from everywhere.
- **`Referrer-Policy: strict-origin-when-cross-origin`**, so a creator's server never learns
  which yip the reader came from beyond the origin.
- **Android cleartext traffic disabled** in the manifest, release builds not debuggable,
  Capacitor's `allowNavigation` left empty so no remote origin can take over the WebView, and
  no exported components beyond the launcher activity.

## Data on the device

v0.9 stores follows, read state, cached yips and cached waveform peaks, and nothing else. There
is no password, no token and no personal identifier, because there is no account. Follows are
private to the device: nothing is posted anywhere and the creator is not notified.

OPML import is parsed with the same hardened XML rules as feeds, and every URL in it goes
through the same checks before it is followed.

## Dependencies

The brief's "no UI framework, no gesture library, no animation library" is also a security
position: every dependency is code shipped to a device that renders hostile input. v0.9's
runtime dependency list is Svelte, SvelteKit, Capacitor and wavesurfer.js. `ring-client` and
`feeds` have zero runtime dependencies.

Anything with native code, including the background audio plugin, is asked about before it is
added. CI pins GitHub Actions to commit SHAs rather than tags.

## Where to look when changing things

| Concern                | File                                   |
| ---------------------- | -------------------------------------- |
| URL safety, SSRF       | `packages/ring-client/src/url.ts`      |
| Ring validation caps   | `packages/ring-client/src/validate.ts` |
| Fetch size and timeout | `packages/ring-client/src/fetch.ts`    |
| Feed HTML sanitizing   | `packages/feeds/` (see that package)   |
| CSP and manifest       | `apps/reader/` (see that app)          |
