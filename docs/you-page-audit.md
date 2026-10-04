# The You page as a library: audit

An audit for the library and forums brief, Part 1, step 1. It changes no code. **The plan in
section 6 was approved and built on 2026-10-04**; see DECISIONS.md. Written
2026-10-04 against commit `2a47406`.

Decided with the developer before this was written:

- **The Library includes the Shelf.** Its saved links become one more type, "Links".
- **Its toast says "Kept to Library"**, so it does not clash with Save for later.
- **Discourse feeds already attached to people stay as they are.** Only new forum links go to the
  forum flow.

## 1. What You shows, in order

`apps/reader/src/routes/you/+page.svelte` (1,183 lines), top to bottom:

1. **Pull to refresh** over the whole screen.
2. **Header:** "You · on this phone", the title "Your den.", one line saying everything lives on
   the phone, and a gear that opens `/you/settings`.
3. **Following**, with "N people · M feeds" in its heading. One row per followed person. A row
   expands (`toggleExpanded`) to show that person's sources (health, retry, replace, pause, remove
   a manual source, add a source), then:
   - `FolderPicker`;
   - `LayoutPicker`;
   - **`ReaderTracks`**: their kept tracks, plus an add-by-link form;
   - **`ReaderFinds`**: their kept pictures and passages;
   - their age limit.
4. **`YouLists`** (`components/YouLists.svelte`): a tabbed section with **Saved** (the Shelf),
   **Liked** and **Not for me**. Each tab shows a count, pages 25 at a time, and gets a filter box
   once it holds more than one page.
5. A toast host.

`/you/settings` holds Appearance, Playback, Feeds, "Your follows file" (OPML), "YipDen backup" and
About. Nothing in it is library content.

## 2. Where kept things live

**Storage.** Kept things are `Reference` records (`src/lib/references/types.ts`) in the `references`
collection of the encrypted store. The `Store` methods are `listReferences(creatorId?)`,
`putReference`, `removeReference` and `updateReferenceCheck`. All four kinds are built: `audio`,
`image`, `screenshot` and `text`. None is a stub.

| Field                         | Notes                                                                     |
| ----------------------------- | ------------------------------------------------------------------------- |
| `id`                          | Derived from creator, kind, address and (for text) the passage            |
| `kind`                        | `audio`, `image`, `screenshot`, `text`                                    |
| `creatorId`                   | `verdictKey` of the creator's site (host and path). **No name is stored** |
| `ringSource`, `ringId`        | `own`/`indienodes`, `partner`/adapter id, or `none`                       |
| `title`                       | Track name, picture alt text, or a passage's opening words                |
| `url`, `canonicalUrl`         | The media, or for text the page                                           |
| `foundOnPage`                 | Where it was kept from; absent for a pasted link                          |
| `selector`, `textFragmentUrl` | Text only                                                                 |
| `status`, `checkedAt`         | `live` or `gone`; when last checked                                       |
| `createdAt`                   | When it was kept. The only date there is to sort by                       |

**In memory.** `creatorNotes.svelte.ts` holds every reference and gives them out by creator:
`referencesFor(url, kind?)` and `tracksFor(url)`. Nothing groups them by type or by date, or across
creators.

**The Shelf** (Save for later) is a separate collection: `ShelfItem`, through `listShelf`,
`saveToShelf` and `removeFromShelf`, held by `shelf.svelte.ts`. It has `creator` (a name), `via`,
`thumbUrl` and `savedAt`.

## 3. Every way in

| Into                  | From                                                                                                                                                 |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| You                   | The tab bar; Settings' back button; the toasts "Liked … Find them in You." and "Saved for later. Find it under Saved in You." (text only, no button) |
| Kept tracks and finds | You → expand a **followed** person's row → scroll past sources, folder and layout                                                                    |
|                       | Discover → More actions → "Your notes and tracks" (its count shows tracks only)                                                                      |
|                       | A partner card → the pencil (notes sheet)                                                                                                            |
| Keeping them          | The in-app browser's toolbar button → "Found on their page"; the add-by-link form in a notes sheet or a You row                                      |
| Playing kept tracks   | Their list's play button. They are not in Feeds' Listen pane (a ROADMAP open item)                                                                   |
| The Shelf             | You → Saved tab                                                                                                                                      |

## 4. What is hard to find

1. **Things kept for someone the reader does not follow are not on You at all.** That covers
   every partner-ring member and every IndieNodes member not followed. They show only on that
   creator's notes sheet, which means finding the creator again in Discover or the ring first.
   This is the largest gap.
2. **Things kept for someone followed are four or more taps deep:** You, the person's row, past
   their sources, folder and layout pickers, to the lists. Nothing on You says how many there
   are.
3. **Keeping something says where it went in words only.** "Added to Lena, on this phone only."
   gives no button to go there. Likes and Save for later at least name the place; keeping does not.
4. **Nothing gathers kept things across creators.** There is no view by type ("all my pictures")
   or by date ("what did I keep last week").
5. **No search** over kept things. The only filter box is in YouLists, for Saved, Liked and Not for
   me.
6. **Discover's notes entry undercounts.** "Your notes and tracks" shows a count of tracks only, so
   pictures and passages kept for that member are invisible from Discover.
7. **No empty-state guidance for keeping.** No screen explains that pages can be browsed in the
   app and things kept from them, or how.
8. **Sections are labelled, but the mental model is split.** "Saved" (the Shelf) sits in a tab
   row with Liked and Not for me, while kept tracks sit under people. A reader would expect both
   in one place.

## 5. Gaps against the target

| Target                                                | Today                                         | Gap                                                                                                                                                                                                  |
| ----------------------------------------------------- | --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A labelled Library near the top, with counts per type | None                                          | New section above Following                                                                                                                                                                          |
| A "Recent" row                                        | None                                          | Newest few, across creators                                                                                                                                                                          |
| Browse by type, by creator, by date                   | By creator only, and only for followed people | Groupings over `creatorNotes.references` plus the Shelf                                                                                                                                              |
| Search over titles, creators and snip text            | None                                          | On-device filter. **Creator names are not stored on references** (only `creatorId`), so a name has to be added at keep time, and existing ones filled from follows, or failing that from the address |
| Every item shows its creator and links out            | Shown only inside a creator's own lists       | Each Library item needs the creator's name and their site. Passages already open the creator's page; tracks and pictures need a "their site" link                                                    |
| A toast with a View action                            | The toast has no action                       | Extend `toast.svelte.ts` and `Toast.svelte` with one optional action button                                                                                                                          |
| An empty state explaining the Library                 | None                                          | Copy plus a pointer to the in-app browser's button                                                                                                                                                   |
| Encrypted at rest, through `Store`                    | Yes                                           | None. The Library only reads what is already stored                                                                                                                                                  |
| Motion tokens, reduced motion, 44px, labels           | Followed elsewhere on You                     | Same patterns                                                                                                                                                                                        |
| The Shelf as "Links"                                  | A tab in YouLists                             | Shown in the Library too. YouLists keeps Liked and Not for me; its Saved tab moves into the Library so links are not listed twice                                                                    |
| Read history                                          | Not on screen (only `readAt` on yips)         | **Not in the brief's target list.** Left out, so the Library is about what a reader chose to keep                                                                                                    |

## 6. Proposed plan, by impact and effort

1. **The Library section** (high impact, medium effort).
   - **Where:** at the top of You, above Following.
   - **Heading:** "Library", with counts that skip zero ("23 tracks · 8 passages · 4 pictures ·
     2 screenshots · 6 links").
   - **Recent:** a row of the newest 6, across creators.
   - **Browsing:** a three-way switch for By type / By creator / By date, and a search box over
     titles, creator names and passage text. The search shows from the first item, not only past a
     page.
   - **Reuse:** each item uses the existing pieces. Tracks play through `creatorNotes.play`.
     Pictures open `ImagePreview`. Passages open the creator's page. Links open as the Shelf's do
     now. Every item says whose it is and has a way to their site.
   - **Gone items** stay marked, as they are now.
2. **Creator names on references** (needed by 1, small).
   - Add an optional `creatorName`, filled at keep time from the sheet's creator.
   - Existing references get a name once from a matching follow, else they show the site address.
   - Additive. It travels in the backup and is validated there.
3. **The Shelf joins as Links** (medium impact, small).
   - The Library lists shelf items as Links, and YouLists drops its Saved tab.
   - "Saved for later. Find it under Saved in You." becomes "Saved for later, in your Library."
     with a View action.
4. **A View action on toasts** (medium impact, small).
   - `toast.show(message, { label, run })`. Every keep says "Kept to Library" with View, and View
     opens You at the Library, filtered to that item's creator, with the item highlighted.
   - Save for later gets the same.
   - The action stays on screen longer than a plain toast, and it is a real button.
5. **Empty state** (small).
   - When the Library is empty: what it is, that it lives on this phone, and how to fill it:
     Save for later in Discover, or open a creator's site and tap the keep button.
6. **Discover's count** (small).
   - "Your notes and tracks" counts everything kept for that member, not only tracks, and becomes
     "Your notes and keeps".

Not proposed:

- Moving kept things out of the followed person's row, which stays as a second view of the same
  data.
- Read history (see above).
- Playing kept tracks from Feeds' Listen pane, which is still a separate ROADMAP item.
