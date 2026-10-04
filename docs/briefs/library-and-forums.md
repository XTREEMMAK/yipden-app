# Claude Code prompt — YipDen: You-page Library audit + Forums (Discourse)

> Two parts. Run Part 1 first and stop for review before Part 2.
> All rules in the v0.9 brief still apply: no server, no accounts for reading, no AI,
> chronological only, every yip links out, `Store` interface only, motion tokens from
> `src/lib/motion.ts`, accessibility rules, "yip" vocabulary. Log any deviation in `DECISIONS.md`.

---

## Part 1 — Audit the You page as a personal library (report first, then build)

### Goal

Saved references (audio finds, and later comic/image, text-snip and screenshot references),
follows, and read history should feel like **a personal library** the user can find and
browse, not a settings page. Most of this may already exist on the You page. Find out what's
there before changing anything.

### Step 1: audit, no code changes

Read the codebase and write `docs/you-page-audit.md` covering:

- What the You page currently shows, in order, with the components and routes involved
- Where saved references live: which `Store` methods, what record shape, how they're
  grouped (by type? by creator? by date?), and whether text, image or screenshot reference
  types are stubbed or missing
- Every path into the You page and into saved items (tab, toasts after saving, the
  audio-find tool, the internal browser, Listen)
- What's hard to discover: items more than two taps deep, saves that give no feedback
  about where the item went, unlabeled sections, empty states with no guidance
- Gaps against the target below
- A short proposed plan, ordered by impact and effort

**Stop after the audit and ask me to review it before building anything.**

### Step 2: target (build only what the approved plan covers)

- A clearly labeled **Library** section on You, near the top, with counts per type
  ("23 tracks · 8 snips · 4 images") and a "Recent saves" row
- Browse by **type**, by **creator** (grouped by person, matching how Follow works), and
  by **date saved**; a simple on-device text search over titles, creators and snip text
- Every saved item shows its creator and links out to the creator's original URL.
  References stay references: never download or re-host the media
- After any save, show a toast: "Saved to Library" with a "View" action that opens the
  item in the Library
- Empty state that explains what the Library is and how to save into it
- Keep encrypted-at-rest storage as it is; everything goes through `Store`
- Fly-ins and transitions use the existing motion tokens. Reduced motion is honored.
  Real buttons and links, 44px targets, labels on icon-only controls

---

## Part 2 — Forums: follow public Discourse forums as digests (v1.x)

### Goal

Make YipDen a **digestion layer for public Discourse forums in general**: a user follows
whole forums (or chosen categories within them) and reads them as a **calm, per-topic
digest**. Forums are standalone sources in their own right, not tied to creators or the
ring. The user should never see a feed URL or the word "Discourse."

The unit you follow is a **forum or a category**, never a single thread. Individual
threads are thin and go quiet, so following one leaves a dead source behind. Topics come
and go inside the digest automatically.

### packages/feeds: detection and fetching

- **Detect** a Discourse forum from any pasted URL on it (home, category, topic, user
  profile): look for the `generator` meta tag naming Discourse, then confirm by
  requesting `/site.json` or `/about.json`. Record the forum's canonical base URL, title
  and logo.
- **Categories**: read `/categories.json` and return categories (and subcategories) as the
  same toggle list the existing discovery flow uses. Nothing is followed until the user
  toggles it on.
- **Topics**: use the public JSON list endpoints (latest for the whole forum, a category's
  latest list, a single topic) to get title, URL, reply count, last activity time and
  category. Use the `.rss` variants only as a fallback.
- **Login-required forums or categories** (401/403, or login-only site settings): don't
  follow them. Return a typed result the UI shows as "This forum is members-only." Never
  ask for credentials.
- Apply the existing rules: conditional GET, robots.txt, honest User-Agent, size and time
  caps, sanitized HTML. Use a **stricter per-host rate limit for forums** (they're often
  small self-hosted servers), and refresh forums less often than creator feeds by default.
- Unit tests with recorded fixtures for: detection from each URL kind, a categories list,
  a latest list, a members-only response, a redirect to a canonical host.

### Data model

- A followed forum source is either a whole forum or a category, keyed by the canonical
  forum base URL plus the optional category id
- **Read state is per topic**: store the last-seen reply count and time so "new replies"
  means new since the user last looked
- Topics are transient: drop a topic from the digest once it has had no activity for a
  set window (default 14 days, tunable in settings), and prune its stored read state with it
- All of it goes through the `Store` interface, and is included in OPML export where it
  maps cleanly (the `.rss` URL). Note in `DECISIONS.md` anything OPML can't represent.

### apps/reader: UX

- **Add a forum**: the existing "paste a link" entry recognizes a forum from any link on it,
  including a single thread's URL, and shows its name and logo ("This is a forum"), then
  the category toggle list, with "Whole forum" as the first toggle. A pasted thread link
  just identifies the forum; it never follows the thread itself.
- **Forum list**: a simple screen listing followed forums, where the user can change
  category toggles, set per-forum refresh frequency, or unfollow.
- **Digest, never post-by-post**: one card per topic. Example: "Topic title · 14 new replies ·
  3h ago," with the forum name and category as the source chip. The card links out to the
  topic on the forum, at the first unread post where the forum supports it.
- **Where it lives**: add a **Forums** filter pill to Today, after Listen, with forum topics
  excluded from Everything by default, plus a setting to include them. Keep the existing
  swipe-between-filters behavior working with the extra pill.
- Header counts stay human: "5 active topics · 2 forums."
- Empty and error states: members-only, forum unreachable, nothing new ("You're caught up").

### Independence from the ring and from creators

- **This feature does not touch the IndieNodes ring or `ring.json` in any way.** Don't read
  forum data from the ring, don't add fields or feed types to it, and don't change
  `packages/ring-client` for this work. Forum follows are entirely on-device.
- Forums are not attached to people. They don't appear under a creator, and creator
  discovery doesn't add forums.

### Out of scope

Following single threads, linking forums to creators, posting, replying, liking, signing
in to forums, private messages, non-Discourse forum software, and any server or proxy.

### Done means

Typecheck, lint and tests pass. One commit for the feeds package and one for the app UI,
each with a short message. `DECISIONS.md` updated.
