# Changelog

Every notable change to YipDen, newest first. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Five more webrings in What to discover: WeBringTheMusic, Smallway's Comics Line, Ink Shrines,
  WebcomicQuest and The Homebrew Webring.
- Surf: Discover's ring button becomes "What to discover", offering
  the rings (people) and Surf (sites). Surf is a list of indie web sites by category (shrines,
  personal sites, blogs, webrings), each with a picture of the page and, for some, a short moving
  preview of it scrolling, which plays only for the card being looked at and never under reduced
  motion. Search and Filter sit in the bar, so the cards get the screen. Visit, Save, Like and
  Not for me work as they do for creators. "What to discover" splits into Webrings and Surf, and
  Surf's side goes straight to a category. Tapping a site's picture shows its whole page preview.
  A third side, Forums, lists indie web forums; one that YipDen can read (Discourse) can be
  followed from its card, and the others say why they can only be visited.

### Changed

- Feeds' header is two rows: People | Forums with the filter beside it, then the panes. The new
  count is a badge on Everything, so the cards start much higher on the screen.

- A YouTube video a post shares (a Bluesky link card, a blog post's embed or link) waits behind
  the post, its top edge showing above it like a second card in a deck. The Video button swaps
  the two in 3D, the post swinging out and behind as the video swings forward, and Back to the
  post swaps them back. The video opens on YouTube (its app when installed,
  the browser otherwise), as a channel's own videos in Feeds do.
- How finding works: a guide to the in-app browser, shown before the first site opens in the app,
  and from "Found on their page", the Library and Settings. On the page itself, a held picture
  is outlined and a short line says it was picked, as does a selected passage.
- "Links, not copies": the guide, the Library, "Found on their page" and every profile say that
  nothing is kept for good, and ask readers to support creators where they make their work. A
  profile links straight to the creator's Shop, Commissions and Support places.
- Pictures kept from a creator: a View button on their partner ring card, like Listen for a
  track, and on their profile six at a time with pages, opening in a reader that pages through
  them all.

### Fixed

- In a car or on the lock screen, the scrubber moves the track, Play plays (it could pause), and
  the position stays right for YouTube and SoundCloud tracks. A queue playing on by itself steps
  over Bandcamp tracks, which cannot be started from there, instead of stopping at one.
- A liked forum's Follow, in You, opens Follow's Forums side.
- Feed cards' pictures sit under a theme-colored tint, so their text reads; the new count on
  Everything no longer pushes the last tab out of the row.
- A shared video's title reads over any picture: it sits on a frosted band. Going back from the
  video to its post starts moving at once, as quickly as going to the video does.
- robots.txt rules with wildcards (`Disallow: /*action`) are honored. They were read as plain
  prefixes and never matched, so a feed a site had asked crawlers to leave alone could be fetched.
- A card taller than the screen in Feeds (a post with a video in it, a group of crossposts) can be
  read to its end: it scrolls normally until its bottom is on screen, and only then folds away.
- A Library queue that went on to the ring stopped after one ring member: a previous session's
  members were still counted. Once Keep going is chosen, the queue now keeps going by itself.
- Scrolling a long list of follows in You is smoother: rows off screen are no longer laid out.
- A Bluesky post with a picture is headed by its words on its card, not "Untitled".

- Where a creator is, with how sure YipDen is of each place. A profile records the places their
  own site names as theirs, and marks one **linked both ways** when it names their site back.
  Places their site only links, and ones you add, come after. Each place is a Profile, Site,
  Shop, Commissions or Support page, guessed from the address and yours to set when adding. One
  you added can be removed, and one their site names can be marked **Not theirs** so it stays
  gone. Places travel in the backup.

## [0.8.0] - 2026-10-06

Everything built since 0.0.1, ahead of the first store release (0.9.0, which still needs a phone
pass of the encrypted store and release signing). YipDen is now a **Creator Database** and a
**Mobile Friendly IndieWeb Surfing Tool**:

- **Discover** the IndieNodes webring and partner rings (Musicians Webring, Knifebeetle), with
  previews, Liked and Not Liked, Save for later, and layout awareness.
- **Follow** a person across their site, Bluesky, Mastodon, YouTube, PeerTube, podcasts and
  Neocities, or a public Discourse forum, whole or by category.
- **Feeds**: one chronological stream in a 3D card stack, with pictures from every source,
  source colors, folders and a creator filter, and forum topics as a digest.
- **The player**: files, and YouTube, SoundCloud and Bandcamp through their own players, with
  a queue, waveforms, lock screen controls and background playback for files.
- **The in-app browser** finds what a creator's page plays or shows, and keeps tracks,
  pictures, screenshots and passages to the **Library**, under capture rules that only keep what
  a creator's own site links.
- **Creator profiles**: one screen per creator from everything kept about them and their own
  site, with a home address and linked addresses for creators who live on more than one.
- **Your data** stays on the phone in an encrypted store, with OPML and full backups.

The detailed entries below are in the order they were made.

### Added

- "Kept from them" starts from what it is: Track, Picture, Screenshot or Passage, as icon
  buttons, and then the fields that kind needs (a passage takes its page and its words). On a
  profile and in You.
- A profile for every creator: who they are in their own words (from their site's h-card or
  description) and in the ring's, where they are (their site, the places it links, and what you
  follow), what they posted lately, their picks for the ring, what you kept from them, and your
  layout setting. Open it from Discover's actions, a partner ring card, a person's row in You,
  the Library arranged by creator, or a person's name in Feeds when it is filtered to them. It
  replaces the "Your notes" sheet.
- Follow has a People | Forums switch, each with its own heading and field.
- Tap a creator's picture on any card in Feeds to open their profile.
- "Same person as…" on a profile: link another address of theirs (a Bluesky or Instagram profile,
  a shop, a second site), pasted or picked from creators YipDen already knows. The profile then
  gathers everything under all of them, and the Library groups them as one creator. Each linked
  address can be made their home or unlinked.
- A creator's home is their best address: their own site first. A creator with only a platform
  profile is a full entry, shown as having no site of their own. Linked addresses travel in the
  backup.

### Fixed

- Back from a creator's profile to a partner ring now takes one Back to reach Discover, not two
  or three. A partner ring also slides and fades in and out.
- Pressing View on a "Kept" toast no longer pulls a paused player up from below the screen and
  pushes the tab bar up with it.
- A ring queue restored from storage or a backup file is checked before it reaches the player.
- The 3D card stack in Feeds and partner rings no longer judders or shakes as a card folds at the
  top, and a partner ring's scroll keeps its fling.
- The phone keyboard now opens over the tab bar instead of pushing it up.
- Partner ring cards no longer jump when their picture loads.
- Android: the launch splash is the YipDen fox on brand orange (dark ground at night) instead of
  Capacitor's stock image.
- Android Back from a partner ring returns to Discover instead of closing the app.
- Rings are no longer fetched on every launch. Partner ring pages are kept on the phone and
  rechecked once a day; IndieNodes is rechecked every six hours, across launches. Both ask "has
  this changed?" first, and pull to refresh still checks at once.

### Added

- Forums. Paste a link to any page of a public forum in Follow (its front page, a category, even
  one thread) and follow the whole forum or chosen categories. Feeds has a Forums pill with one
  card per topic, "14 new replies · 3h ago", which opens at the first post you have not seen.
  Quiet topics leave by themselves after 14 days. A forums screen under You changes what is
  followed, how often each forum is checked, or unfollows it. Members-only forums are named as
  such and never asked for a password.
- Someone you follow from the IndieNodes ring now has their own picks on their row in You: their
  tracks, comic pages, artwork or writing sample, one tap away, the same as in Discover.
- A Library at the top of You: everything you kept (tracks, pictures, screenshots, passages) and
  every link you saved for later, in one place. It counts what is there, shows what is recent,
  arranges by type, creator or date, and searches titles, creators and passages. Every item says
  whose it is and reaches their site.
- Keeping something or saving it for later now says so with a View button that takes you
  straight to it in the Library.
- On a creator's site in the app, long-press a picture or select a passage, then tap YipDen's
  button to keep it for them: a comic page, a game screenshot, or a passage of their writing. Only
  the link is kept; pictures load from their site each time, and a passage opens their page
  scrolled to it.
- A feed that announces a WebSub hub has it recorded, ready for the shared feed cache in v2.0.
  Nothing uses it yet.
- Ring members can be marked explored: automatically when you visit or preview them, by swiping a
  partner card left, or with the check at its top right.
  Partner rings show how many you have explored, can hide them, and Resume jumps to the next one
  you have not seen.
- A partner ring keeps its search, genre and scroll position when you leave Discover or close the
  app.
- Add a track to any creator by pasting its link, from their row in You or "Your notes and
  tracks" in Discover and partner rings. It is labelled as added by you and plays in the app when
  it is an audio file.
- Tell YipDen whether a creator's site reads best on a phone or a bigger screen, over what the
  ring or the page said.
- Android: Visit opens a creator's site inside YipDen. Its toolbar button lists audio the page
  played or showed, to keep for that creator, with the page still open behind it; Back steps back
  through the site. Settings can turn this off.
- The player says when a track cannot be played, instead of staying silent.
- Folders: put anyone you follow in a folder from their row in You. Feeds has a Filter button
  that narrows it to one folder or one person, alongside the Everything, Posts, Watch and Listen
  pills. Folders travel in the OPML file and the full backup, and a folder in another reader's
  OPML file is kept on import.
- Musicians Webring and Knifebeetle Webring are in Discover's ring picker for everyone, each
  linking back to the ring's own site. They were debug-only before.
- A new app icon: the fox and its howl on brand orange, without the arch. The splash matches.
- Partner rings: an icon-only back arrow with search beside it at the top; the intro note scrolls
  away with the cards.
- Debug builds: a frame meter and switches to turn off the card stack, partner backdrop or
  thumbnails, for finding scroll problems on a phone.
- You has one tabbed section for Saved, Liked and Not for me, each with badges where saved, the
  newest 25 first, "Show more" in place, and a filter box once a list passes 25.
- Save for later on every creator, in Discover's More actions and on partner ring cards, not only
  sites built for desktop. The Shelf is now called Saved.
- Send on a saved link opens the phone's share sheet (Chrome "Send to your devices", Firefox "Send
  to device", or any app); the web build copies the link instead.
- Partner rings have a search box, and genre chips for rings that publish genres (Knifebeetle).
- The ring picker names rings as webrings: IndieNodes Webring, Knifebeetle Webring.
- You says why a source failed (could not connect, not found, refused, the site's own error,
  robots.txt, not a feed, too large or unsafe) instead of only counting failures.
- Replace for a source that has moved or stopped being a feed: find the new address, and it takes
  over only once it checks out.
- Debug builds have a "Debug build" section in Settings: the age limit switch (off by default, so
  old saved feeds can be used for testing). Release builds have none of it, and always enforce the age limit.
- Partner cards: Find feeds, Like and Not for me sit in the same row as Visit, with larger icons.
  The More actions menu's icons are larger too.

- Discover's secondary buttons (Like, Not for me, Visit site, and Follow for a desktop-first member)
  moved into a More actions menu; the hero keeps only the main action, preview and the menu.
- Partner cards: Visit and the other pills are round again (a stray CSS edit had squared them), and
  Find feeds, Like and Not for me are icon-only.
- Not for me now also hides a creator from Feeds' "From the IndieNodes webring" list, the Listen
  queue and player suggestions, not only Discover.
- Mark as read when scrolled past also marks the last card after a few seconds of being still on it.

- Feeds: the last card now scrolls fully to the top instead of stopping with the previous card half
  hidden.
- Mark as read when scrolled past now works with the card stack (it measured where a card was drawn,
  which never leaves the pane).

### Added

- Double tap a creator on Discover to like them: hearts burst from the finger, a synthesized yip
  plays with a short buzz, and a heart stays next to their name. The first tap makes the name hop.
  Sounds can be turned off in Settings. Double tap only likes; unliking is in More actions.

- Liked and Not for me, for the IndieNodes ring and partner rings: buttons on Discover and on each
  partner member. Not for me hides a creator everywhere; both lists live in You, can be undone, and
  are in the backup. Partner members also get Find feeds, which opens Follow with their address.
- YouTube videos play inside the feed card (the privacy-enhanced player, loaded only when tapped).
- Feeds: unread dots pulse with a ring that spreads outward, and a Settings switch marks a card
  read once it scrolls off the top.
- Like and Not for me use heart and heart-cross icons, and Find feeds a magnifier. IndieNodes has its
  own icon in the ring list, bundled locally.
- Partner rings show their own icon (and a badge when one is supplied), and a soft mosaic of their
  members' pictures behind the member list.
- Follow accepts `?url=` and recognizes any page on a ring member's own site.

- A new follow's posts are fetched right away, with a spinner on Discover's Follow button, the
  Follow screen, the person's row in You, and a bar on Feeds while it refreshes.
- Keep-posts-for limit: Settings has a slider (7 to 90 days, default 30) and each follow can
  override it in You. Older posts are not stored, and shrinking the limit prunes what is saved.
- While Discover is idle its photo drifts slowly around the frame (one continuous loop that never
  restarts on a slide change).

- Real launcher icon: a howling fox in a ring, framed by an arch, replacing the Capacitor default.
  The background switches between brand orange and this app's own dark tone with the system's
  day/night mode, and it adapts to Android 13+ themed icons too. See DECISIONS.md.
- Browse members: a sheet listing whichever members Discover's active filter currently shows, to
  jump straight to one instead of stepping through them. Replaces the node counter, which is gone.

### Changed

- Long names in Follow wrap instead of running out of the card.
- Bluesky posts show their pictures (images, video stills, link previews), read from Bluesky's
  public API beside the text-only RSS. Bluesky's own adult-content labels mark them sensitive.
- A blog post with no declared image shows the first real picture in its body on its card.
- YouTube cards show the channel's own picture, and every media card shows its creator's.
- Each source has its own color: down the full edge of a text card, and on every card's source
  chip, in Feeds too.
- Feeds' Filter sheet shows each person's picture (or a plain person) instead of a dot.
- SoundCloud's own player is no longer shown; the app's player has its artwork and waveform, and
  says "via SoundCloud".
- You's "Liked & not for me" tab is now "Liked & Not Liked".
- Following a Neocities site now also finds Neocities' own feed of the site's updates. It's picked
  by default when the site has no feed of its own, and offered unpicked when it does. A site on its
  own domain is matched through its "on Neocities" badge.
- When a queue played from the Library runs out, the player offers to keep going with a shuffle of
  everything in your Library that plays here, falling back to the ring. A ring session that runs
  out of members offers the Library the same way.
- A SoundCloud track shows its own artwork and waveform, and a YouTube one its thumbnail, in the
  player, the mini player and on the lock screen.

- A kept YouTube, SoundCloud or Bandcamp track now plays in the app's player, through that
  platform's own player shown at the top of it, instead of opening outside the app. YouTube and
  SoundCloud follow the app's play, pause, seek and Next, and move on when they end; Bandcamp
  plays with its own controls and waits for Next.
- On a Bandcamp or YouTube page in the in-app browser, "Found on their page" offers the page's own
  player, which can be kept and lasts, rather than only the stream it is playing.
- In "Found on their page", a track can be heard before you keep it; the page's own audio pauses
  so the preview is not drowned out.
- Hearing a found track plays on its own, apart from the player: it no longer becomes the
  player's track, and it stops when the sheet closes.
- "Found on their page" checks each track before offering Keep. One that cannot be kept says why
  instead; one whose address expires (a Bandcamp stream) offers "Keep page" for the Bandcamp page
  it is on.
- Audio a creator's page plays from its own script player (often files on another host, like File
  Garden) is now found while it plays.
- Feeds has a People | Forums switch at the top instead of a fifth pill: People keeps Everything,
  Posts, Watch and Listen; Forums shows the topic digest. Forum topics no longer mix into
  Everything.
- The app stays in portrait, on phones and tablets.
- A forum's long category descriptions wrap and are cut at 200 characters instead of running off
  the screen.
- A track or picture a creator links from their own page can now be kept even when the file lives
  on another host, such as File Garden. Pasted links still have to be on their own site.
- You opens on Following, with the Library and Liked & not for me as tabs beside it. A person's
  open row is split into Sources, Kept from them, and Your settings for them.
- Sites opened in the app can be pinch-zoomed.
- A card in Feeds or a partner ring takes taps wherever it is on screen, until it is folding away
  behind the next one. Before, its buttons only worked at some scroll positions.
- A partner ring's genres and explored filters moved into a Filter sheet beside its search, which
  can now show only the members you have explored. Resume sits beside the ring's name.
- Saved links moved from their own tab on You into the Library. Liked and Not for me stay where
  they were.
- The button in the in-app browser's toolbar is now a "keep" sign rather than a music note, since
  it keeps pictures and passages as well as tracks, and TalkBack reads it as "Keep something from
  this page" instead of "Button near done".
- Keeping a track now checks it first: a file has to be on the creator's own site, and a copy
  hosted anywhere else is refused, with a plain reason. Platform players (Bandcamp and the like)
  found on their page are still kept as links. Kept tracks are checked again now and then, and one
  their site no longer has shows as "No longer on their site" instead of failing to play.
- Tracks you keep from a creator's page are now saved as references, the shape images, screenshots
  and passages will share. Nothing changes on screen. Backups carry them, and still read the tracks
  in a backup made earlier.
- Everything YipDen keeps on your phone (follows, read state, cached yips, saved links, your tracks)
  is now in an encrypted database, its key held by Android's Keystore. Your existing data moves
  across on first launch, and the old unencrypted copy is deleted once the move is checked.
- Creators' images and pages cached while you browse are cleared when the app closes.
- A partner card's sample (Listen, Open on SoundCloud and the like) opens in the in-app browser,
  as Visit does, so audio found on that page can be kept for the member.
- Refreshing goes through one feed source, and each yip now carries an id that is the same on
  every device. Nothing you have stored changes yet; your yips move to the new ids with the
  encrypted store.

- Feeds no longer pages between panes by swiping sideways; it stopped working after the first
  swipe and fought the vertical scroll, and the pills are always visible.

- Discover's tab bar takes the selected skin's deep colour (Blue Glass is blue-tinted, not brown).
- Shuffle on Discover now toggles: tapping it again returns to the ring's own order.
- The swipe wipe keeps its drag and full-swipe wipe but loses the water wobble: a straight edge and
  a flat push, no noise displacement.

- Discover's header mark and the About sheet's mark are the same fox-in-an-arch mark as the new
  launcher icon, not the old hand-drawn den shape. Still a single `currentColor` SVG path, so it
  keeps recoloring itself the same way.
- Discover's Filter button moved up next to Shuffle and the ring switcher; nothing is left at the
  bottom of the screen. Shuffle now shows the same active-state mark Filter and the ring switcher
  already had, so leaving shuffle mode is still visible without the old counter's text spelling it
  out. See DECISIONS.md.
- Discover's prev/next buttons are gone; swipe and the left/right arrow keys move through the ring
  now. See DECISIONS.md and ROADMAP.md for teaching the swipe gesture itself, still to come.
- A long name no longer overflows its container on Follow's "Already in IndieNodes" matches or on
  a partner card's title.
- A partner card's site-link button is a plain "Visit"/"Open" with a globe icon, not a repeat of
  the host already shown above it.
- Discover's round buttons (Shuffle, the ring switcher) now tint with the chosen skin, the same
  way the hero behind them already does, instead of a flat color that never moved. See
  DECISIONS.md.
- A partner ring member's own badge shows at its own size (up to 96×64), not forced into a
  small 40×40 square. When it turns out to be real art rather than a button graphic, tapping it
  opens a full screen preview; a classic webring banner stays plain, since blowing one up only
  shows the same handful of pixels bigger. See DECISIONS.md.
- Reading every registered partner ring happens in parallel, not one after another, and Discover
  now shows a loading state on the ring-switch button while that read is still in flight instead
  of the button simply not existing yet. See DECISIONS.md.
- Pull to refresh, already on Feeds, is now on Discover (the ring on screen, IndieNodes and every
  registered partner ring) and You (every followed feed) too.
- Discover's ring switcher is its own button next to Shuffle, not buried inside the Filter
  sheet, once a partner ring is registered (there is still none in a normal build).
- A second testing-only partner ring, Knifebeetle (a webcomic ring), reads the same way
  Musicians Webring does, gated behind its own local flag, its maintainer not yet asked.
- A partner member's own thumbnail shows as a small badge, and a Listen/Open button shows that
  platform's own mark (SoundCloud, Bandcamp, Spotify, Apple Music, YouTube), not one icon for all
  of them.
- A partner ring member's sample link is labelled by what it actually is ("Open on SoundCloud",
  "Watch on YouTube", a plain "Listen" for a real file), not one label for everything.
- You is now two screens: You (Following, Shelf) and a new Settings, reached from You's gear icon
  (Appearance, Playback, the follows file, full backup, About). The tab bar is unchanged.

### Fixed

- A partner card's image preview no longer opens clipped to that card's own bounds; it now fills
  the real screen. See DECISIONS.md.
- Following someone now checks only what was just followed, not every followed feed, so a new
  follow's yips are reliably ready by the time Feeds is opened. See DECISIONS.md.
- A YouTube video now sorts into Feeds' Watch filter instead of Posts. YouTube's real RSS declares
  its video as a decade-old, extensionless Flash placeholder type that was never recognized as
  video at all. See DECISIONS.md.
- Leaving Discover now keeps its cover in the outgoing View Transition snapshot without retaining
  the live full-height route and displacing Feeds, Follow, or You until a creator outro finishes.
- The player's waveform draws. wavesurfer's aborted first load was being read as a failure, so
  every track showed the plain bar. See DECISIONS.md.
- Discover no longer sits on "Loading the ring" after the app resumes: the saved ring draws at
  once and the network is checked in the background, no more than once in 15 minutes, and again
  on resume. An update never moves the member on screen. See DECISIONS.md.

### Added

- The Shelf: a local list of links to open on a bigger screen. Sites declared, or found to be,
  built for desktop offer **Save for later** in Discover (as the main action, with following
  and the site still one tap away) and under their yips in Feeds. You lists the Shelf, and it
  travels in the existing OPML follows file and full backup. No account, no server; it leaves
  the phone only when exported. See DECISIONS.md and docs/shelf-format.md.
- Layout awareness: `@yipden/ring-client` reads an optional `layout` field (`mobile-friendly` or
  `desktop-first`) on ring entries, and Follow's paste-a-link discovery guesses from a missing
  viewport meta tag on the page it already fetched. Undeclared, unknown or unguessable means
  mobile friendly.
- A scaffold for partner rings: a per-ring adapter boundary in `@yipden/ring-client`, a ring
  switcher in Discover's Filter sheet, and cards labelled "via [ring name]" that link to that
  ring's own hub. No partner ring is registered yet, so nothing shows until the first adapter is
  agreed.
- About states YipDen's posture: a doorway, not a destination.
- You's About row now opens a modal with the YipDen mark, package version and build commit, the
  build-time `CHANGELOG.md`, the IndieNodes Discover explanation, privacy and source links, and
  audited dependency/content attributions. Escape and browser or Android Back close it and return
  focus to the row.
- Follow searches the locally loaded IndieNodes Ring as a creator name, hostname, tag, or declared
  feed is typed. A matching Ring record with feeds reaches the source picker without requesting the
  creator's website; entries without feeds require an explicit website check.

- Discover's first ever load shows a centered ring animation instead of a text chip, with a slot
  for artwork to replace it later.
- Discover previews by type: audio members get Play, comics, art and text open a paged viewer
  of their pages, artworks or excerpts, games open their trailer or preview link, and a member
  with nothing to preview has no button. See DECISIONS.md.
- Music shuffle, on by default: a music member's tracks are queued in a shuffled order, and You
  has a Playback switch for it. Spoken word keeps its order.
- Drag to reorder the queue by its grip (arrow keys work on the grip too).

- Android Back, and the browser's, now collapses the full player instead of leaving the screen
  underneath it, through a history entry the player pushes while open. Adds `@capacitor/app`.
  See DECISIONS.md.

- `packages/feeds`: discovery, polite fetching, and one `Item` type out of RSS 2.0, RSS 1.0,
  Atom and JSON Feed. Discovery works in order of decreasing confidence, from a page that
  announces its own feed down to a guessed path, and returns a list the reader toggles rather
  than following anything automatically. Verification means a two way `rel="me"`.
- `FeedHttp`: conditional GET, one request at a time per host, `robots.txt` honored and cached,
  an honest User-Agent, redirects followed by hand with every hop checked, and caps on response
  size and time.
- An allowlist HTML sanitizer and a plain text flattener, tested against script injection,
  event handlers, unsafe URL schemes and mutation XSS vectors.
- `apps/reader`: the app shell. SvelteKit with `adapter-static`, Svelte 5 runes, design tokens
  and self hosted fonts, the motion system, the tab bar, screen transitions through the View
  Transitions API, and the shared swipe primitive.
- A `Store` interface with one IndexedDB implementation, covering follows, yips, read state,
  the cached ring, waveform peaks and settings.
- The Android host: Capacitor 8, package `com.yipden.app`, minSdk 26, targetSdk 36, cleartext
  traffic refused at the platform level, and no cloud backup of a reader's data.
- Discover: the ring as a full bleed hero, opening on the node of the day, walked by swipe or
  by button, filtered by chips, shuffled, and rendering from cache when the ring cannot be
  reached. One tap follows a member everywhere they publish.
- A script that screenshots the build beside the reference prototype at 390x844 in both themes.
- Follow: paste a link, see every feed discovery found, toggle which of it to keep, and follow
  only what was left on. A dev only Vite proxy lets the browser try real feeds in development,
  enforcing the same address safety rules as the rest of the app, without ever shipping.
- The refresh pipeline: `refreshAll` fetches every followed feed conditionally, categorizes each
  item into Posts, Watch or Listen from its media, and stores it without disturbing a reader's
  existing read state. One feed failing never stops the rest, and a feed past five consecutive
  failures backs off from automatic refreshes.
- Today: the merged, reverse chronological feed in four panes a reader pages between by pill or
  by swipe, with a measured sliding indicator, pull to refresh, a background catch-up on the
  first visit after following someone, and a "From the ring" section of ring tracks in Listen.
  Media and text cards match the reference prototype. (The 3D card stack and the full playback
  experience, first deferred here, shipped later in this release.)
- You: the theme picker with a measured sliding indicator, the follow list with an inline
  Unfollow / Keep confirm, OPML export and import (with the same URL safety checks as
  everywhere else), and clearing cached yips without touching follows.
- The player: one shared `HTMLAudioElement` for the whole app, a mini player docked above the
  tab bar with the slow pulse while playing, and a full screen player with a wavesurfer.js
  waveform, backed by a hidden range input for keyboard and screen reader seeking, that falls
  back to a plain progress bar with no error shown if decoding fails. Waveform peaks are cached
  on device keyed by media URL and ETag, so a track decodes at most once. Speed (1x-2x), a
  queue with Up next, Media Session metadata for lock screen controls, and swipe to collapse or
  expand with a button equivalent for every gesture. Only a listen yip opens the player; a
  watch yip still opens the creator's page, per the brief.
- Today's 3D card stack: cards stand up as they rise, pin, tip back and dim as the next card
  slides over them, driven by `animation-timeline: view()` where it exists and a
  `requestAnimationFrame` fallback with the same geometry where it does not. Only the front
  card takes taps. Disabled under reduced motion, which keeps the flat, staggered list.
- The card-to-player shared element morph: opening a listen yip carries its card's art and
  title into the full screen player through a real `document.startViewTransition`, with the
  player's gradient, header and body fading and rising in only once the art has landed. Falls
  back to the plain slide up wherever the browser lacks view transition support, the reader has
  asked for reduced motion, or the card has nothing to morph from.
- Lock screen and notification media controls, and reliable background playback, through
  `@capgo/capacitor-media-session`. See DECISIONS.md for why this plugin over the alternatives.
- The Android hardware and gesture back button now steps back through Discover, Today, Follow
  and You's own navigation history before it exits the app, matching every other Android app,
  instead of exiting on the first press.
- Discover's WebGL hero: a hand-written displacement wipe between two member photos in the
  swipe direction, a liquid bend while dragging, and a slow ambient drift at rest, ported from
  the reference prototype's own shader. The plain CSS crossfade it was built on top of never
  stops running underneath, so any failure, no WebGL, a photo host with no CORS headers, a lost
  context, falls back to it rather than a blank canvas. See DECISIONS.md.
- Live reload for Android: `CAP_LIVE_RELOAD_URL` points an installed debug build at `pnpm dev`
  instead of its own bundled files, so a web layer change reaches the device the moment Vite
  rebuilds it, with no further rebuild or reinstall. Never set for a real build. See
  `docs/android-testing.md` and DECISIONS.md.
- Continuous play of the ring. "From the ring" in Listen is one card per member (cover, track
  count, play, and a "+" to queue) instead of a flat list of every track. Playing a member starts
  a session that stops at the end of their tracks and asks whether to keep going with someone
  new, chosen by `suggestNextEntry` (new in `@yipden/ring-client`: tag overlap, same form,
  never a repeat). A queue panel in the full player lists everything queued, with jump to a
  track, move earlier or later, and remove. The session survives closing the app, restored
  paused in the mini player. See DECISIONS.md.

### Fixed

- Returning to Discover still showed the cover jumping in size. The CSS cover is drawn 2% past
  every screen edge and the WebGL canvas was flush with the screen, so the hand off between them
  changed the picture's scale. The canvas is now the same box as the cover and fades in over it.

- After swiping to a new member on Discover, tapping another tab soon afterwards could do nothing
  until Discover and the tab were tried again. The browser did not always make a click out of a
  tap that closely followed a swipe. The tab bar now navigates on the lift itself for a pointer
  tap (the click still handles the keyboard), which also makes taps a touch quicker.

- Returning to Discover from another screen made the cover blink. Two causes: the cover faded in
  from transparent every time the screen mounted (now only a change of member crossfades), and the
  WebGL canvas took over from the CSS cover before it had painted a frame (it is now laid out from
  the start, invisible, and only shown once it has drawn the photo).

- Tapping a tab felt slow to respond. The tab indicator now starts moving on finger down, before
  the navigation begins (and returns if the finger slides off), all four screens' code is
  preloaded, the hero's draw loop no longer forces a layout on every frame (about 170ms of the
  wait at a 6x slower CPU), and the WebGL canvas is started after the first paint rather than
  during the screen change. See DECISIONS.md.

- Changing tabs slid the whole screen including the tab bar and the mini player. They now stay
  where they are while the screen slides, and the current tab's pill is a single indicator that
  slides between tabs, like the pills in Feeds.

- Discover's outgoing text could leave in the wrong direction when a button was pressed after a
  swipe the other way: the exit still started from the previous swipe's drag offset. It is now
  used once, by the swipe that set it.

- Dismissing the mini player made Discover's text (and Feeds' and the other lists' bottom
  padding) jump to its new position, because the dock changes height at once. The padding now
  eases to it.
- Discover's name, "why", tags and buttons arrived all at the same instant; as in the prototype,
  each line now comes in a beat after the one above it.

- Discover's WebGL wave never appeared on a phone even with photos loading: the wipe shader used
  half precision floats, which phone GPUs default to and its noise function cannot survive. It now
  uses full precision where the GPU supports it.

- Discover's wave still did not appear on a phone even once photos could be drawn: the photo
  was still downloading when the wipe ran, so the wipe finished unseen and the canvas only popped
  in afterwards. The neighbouring members' photos are now preloaded, so they are ready before a
  swipe or a tap on next or previous.

- Discover: members whose photo host sends no CORS headers lost their cover (a flat color was
  drawn over it), and the wipe looked absent on the device. The canvas is now shown only for
  photos it can actually draw, everything else shows through the CSS layer as before, and on
  Android hero photos are loaded through the native HTTP client so they can be drawn at all.
  See DECISIONS.md.

- After a swiped (not tapped) Discover change, the name and "why" still appeared to enter from
  the wrong side: the text block was left offset by the drag and eased back to centre while the
  new text flew in from only 32px, so the two motions cancelled into the wrong direction. The
  block now snaps to centre on commit and the text enters from roughly a third of the screen
  width, from the side opposite the swipe.

- Discover's incoming name and "why" text flew in from straight below regardless of swipe
  direction; it now flies in from the edge the swipe (or the prev/next buttons) actually came
  from, matching the hero image's own motion.
- Today's card stack could be tipped further than intended by a normal overscroll past the
  pane's top or bottom, since the rubber band bounce briefly reports a `scrollTop` outside the
  pane's real bounds. The bounce is now suppressed on that one pane rather than every scroll
  area in the app.
- `--dock`, the token every scroll area's bottom padding, Discover's bottom section and the
  mini player's position are all measured against, did not account for
  `env(safe-area-inset-bottom)`, even though the tab bar it is meant to clear does. On a phone
  with a tall gesture navigation inset (found on a Galaxy S23 Ultra), this hid Discover's
  filter chips, the mini player, and the bottom of any scrolled-down list behind the real
  system bar despite scrolling having reached its actual end.
- The hardware back button fix above did not actually fire on the device: it overrode the
  deprecated `Activity.onBackPressed()`, which Android's predictive back gesture, on by default
  at this app's `targetSdkVersion`, does not reliably dispatch through. It now registers an
  `OnBackPressedCallback` with `OnBackPressedDispatcher` instead, the currently supported path.
- A listen card's `content-visibility: auto` placeholder assumed 200px, its media card height,
  rather than its own real 172px, which could throw off a long Listen pane's measured
  `scrollHeight` while cards below the fold had not actually been rendered yet.
- Feeds' pull to refresh indicator was a normal flex sibling of the card list, so pressing down
  at the top of the scroll (before any actual drag) inserted its own height into the layout,
  pushing every card down and then back up on release. It is now an absolutely positioned
  overlay, which cannot move anything else. See DECISIONS.md.
- The WebGL hero kept retrying a photo host that had already failed, once per navigation, so a
  session where the first photo failed (the common case for a personal site with no CORS
  headers) looked like the hero was doing nothing rather than falling back. The first fix for
  this disabled the wipe for the rest of the session after that one failure, which turned out
  to be its own bug once tested against the real ring: since nearly every real photo fails
  CORS, the wipe effectively only ever ran once. It now paints a solid fallback in the member's
  own wash color per photo that fails, rather than giving up on the hero itself, so the wipe
  runs on every navigation regardless of whether any given photo loads. See DECISIONS.md.
- The WebGL wipe travelled the wrong way: next revealed the incoming photo from the left,
  previous from the right, backwards from both the reference prototype and this app's own
  text motion (which already entered from the correct edge). `HeroArt.svelte` was handing the
  shader's `dir` uniform this app's own swipe-direction convention unnegated; the two are
  opposite sign conventions by design, and only the shader's own call site needed the fix.
  See DECISIONS.md.
- A committed swipe's wipe transition always restarted from zero bend rather than continuing
  from wherever the live drag preview had already stretched it to, unlike the reference
  prototype. The drag fraction at release is now threaded through to the transition. See
  DECISIONS.md.
- Feeds' filter pills hugged the left edge of the header on a wide screen, ported unchanged
  from a prototype CSS rule that never had to answer this question inside its own fixed mobile
  frame. They now stretch to fill the header's full width on a phone, and center themselves at
  their natural width past 600px instead. See DECISIONS.md.
- A latent Android manifest merge conflict (`capacitor-cordova-android-plugins` declares
  `usesCleartextTraffic="true"`, this app declares `"false"`) would fail any genuinely clean
  build or one on CI without a warm Gradle cache; only masked locally because nothing had
  invalidated the cached merge result since the very first build. Fixed with an explicit
  `tools:replace`. See DECISIONS.md.

### Changed

- Discover's WebGL canvas no longer starts during a screen change (it waits for the slide to
  finish), no longer draws at all while at rest (the slow ambient drift is gone; it draws only
  while dragging or wiping), and crops a photo about the same focal point as the plain cover, so
  when it takes over from the cover nothing moves.

- Discover's outgoing text now leaves before the next member arrives, as in the prototype: it flies
  out toward the direction of travel (carrying on from where a swipe let go) and fades, then the
  new lines come in one after another. It is hidden from screen readers while it leaves.

- Discover's Preview and Visit site buttons are icons, sharing a row with Follow everything, and
  the IndieNodes webring chip is gone from the hero; You has an About entry, How Discover works,
  that names the webring as where Discover's members come from.

- The full player's main controls are Previous, play and Next; Previous restarts a track that has
  played more than three seconds. Speed is a small chip beside the times, and the 15 and 30 second
  skip buttons are gone from the screen (the waveform, its keyboard slider and the lock screen
  still seek).
- Discover shows the position once (the chip now says Node of the day or IndieNodes webring, and
  the counter carries the filter), and Feeds' section is titled From the IndieNodes webring
  without the ring.json note.

- The mini player's progress runs along the bottom edge of the card with a moving highlight while
  playing, and the card fades out when dismissed.

- The tab bar is 72px tall, down from the prototype's 84px, which real use found took up more
  of the screen than four tabs need.
- The mini player can now be stopped and dismissed outright, not only collapsed or paused:
  a new close button pauses playback, hides the mini player, and clears the lock screen and
  notification widget rather than leaving it paused.
- The Today tab is now Feeds, renamed throughout (route, state module, types, ids, UI copy),
  not just in the tab label. See DECISIONS.md.
- Discover's filter chips are now a single Filter button next to prev/next, opening a bottom
  sheet that lists every option, rather than a horizontal-scroll chip row competing with the
  prev/next controls for space right above the tab bar. See DECISIONS.md.

## [0.0.1] - 2026-09-22

The first commit. Workspace, tooling and the ring client.

### Added

- pnpm workspace with TypeScript in strict mode, ESLint, Prettier and Vitest.
- `packages/ring-client`: a framework agnostic, dependency free client for the IndieNodes
  ring document. Conditional GET with ETag and If-Modified-Since, an injectable fetch and
  cache, per entry validation that never discards the whole ring, URL safety checks, a
  deterministic daily rotation, shuffle, and filters by type, form and tag.
- A JSON Schema for the ring document as a reader consumes it, checked against the live ring,
  an extended ring carrying the fields the ring does not emit yet, and a hostile fixture.
- Repository documentation: architecture, security, the ring contract, CI and decisions.

[unreleased]: https://github.com/XTREEMMAK/yipden-app/compare/v0.0.1...HEAD
[0.0.1]: https://github.com/XTREEMMAK/yipden-app/releases/tag/v0.0.1
