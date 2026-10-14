# @yipden/directory

People to discover, from every source YipDen reads, as one `Person` type:

- the **IndieNodes ring**, read through `@yipden/ring-client` unchanged (`indieNodesSource`);
- **YipDen's curated directory**, `directory/people.json` (`yipdenSource`);
- **creator lists a reader adds**, in the directory format or as an IndieNodes-style `ring.json`
  (`listSource`).

Then:

- `mergePeople` drops anyone hidden by their source or on YipDen's opt-out list (whatever source
  names them), and shows one card for one person, preferring the one who opted in;
- `featuredToday`, `next`, `prev` and `shuffle` walk the merged list the same way on every device;
- `filterPeople` narrows by tag and by Posts, Watch or Listen.

Every load is conditional, falls back to the last good copy, and drops a bad entry without
dropping the document (`loadDocument`, written once for every source).

## Identities and opt-outs

`identity.ts` turns an address or a handle into normalized identities (`url:`, `youtube:`, `bsky:`,
`fedi:`). Dedupe joins people who share one; an opt-out matches any of them. `optouts.json` holds
SHA-256 hashes of identities, which keeps it from being read as a list of names, but does not stop
someone who already suspects a person from checking: the real protection is that an opt-out
removes the entry before anything is published. See DECISIONS.md, 2026-10-14.

## In the app

The app already has a `Person` (someone the reader follows), so it imports this one as:

```ts
import type { Person as DirectoryPerson } from '@yipden/directory';
```

No third-party dependencies, no Svelte, no DOM.
