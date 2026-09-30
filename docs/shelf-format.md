# The Shelf in an export

The Shelf is a local list of links a reader set aside to open on a bigger screen. It has no export
of its own: it rides in the two files You already produces. This page is the format, for anything
that wants to read one, such as the static "open my exported file and list the links" page for the
desktop handoff. That page belongs on YipDen's marketing and docs site, which is not in this
repository, so it is a follow-up there; nothing here depends on it.

Everything in an export is untrusted input for whoever reads it. Every `url` is an address the
reader's app already checked (public https), but a reader of the file should check again before
rendering a link, and should render titles as text.

## Full backup (`yipden-backup.json`)

The optional `shelf` array, beside `people`, `feeds` and `yips`. A backup without it is still valid.
Newest first.

```json
{
  "format": "yipden-backup",
  "version": 1,
  "shelf": [
    {
      "id": "https://wide.example.com/essay",
      "url": "https://wide.example.com/essay",
      "title": "A wide essay",
      "creator": "Wide",
      "via": "Some Ring",
      "from": "feeds",
      "savedAt": "2026-09-26T10:00:00.000Z"
    }
  ]
}
```

`id` equals `url`. `creator` and `via` are optional (`via` is the partner ring a link came through).
`from` is `discover` or `feeds`. Restoring merges: what is already saved stays, with its own date.

## OPML (`yipden-follows.opml`)

One folder outline marked `yipdenShelf="true"`, holding OPML's own `type="link"` outlines. Absent
when the Shelf is empty. Other feed readers ignore it, because the links have no `xmlUrl`.

```xml
<outline text="YipDen Shelf" title="YipDen Shelf" yipdenShelf="true">
  <outline type="link" text="A wide essay" title="A wide essay"
           url="https://wide.example.com/essay" yipdenCreator="Wide"
           yipdenFrom="feeds" yipdenSavedAt="2026-09-26T10:00:00.000Z"/>
</outline>
```

`yipdenVia` appears when the link came through a partner ring. A reader that only wants the links
can read every `outline[type=link]` under the marked folder.
