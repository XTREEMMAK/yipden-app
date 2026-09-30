# Brand source art

`YipDen_Logo.webp` is the artwork everything here is built from (redone 2026-09-30, replacing an
earlier version that put the same fox over a mountain silhouette instead of this arch): a howling
fox framed by an arch (redone again since: the ring behind the fox was dropped), as a single white shape on a transparent background. It is
kept here, tracked in git, specifically because everywhere else it gets used only keeps a
_derived_ shape (a traced vector path or a generated PNG), and derived work is not a substitute
for the original if it ever needs to change (a different crop, a color tweak, higher resolution
source art). Nothing under `apps/reader/` reads this file directly; regeneration is a manual,
occasional step, not a build step.

## What was derived from it, and where

- **Android launcher icon** (`apps/reader/android/app/src/main/res/`): an adaptive icon, not a
  flat image. The mark (arch, fox, howl) is a single white vector foreground
  (`drawable/ic_launcher_foreground.xml`), scaled and centered inside Android's adaptive icon safe
  zone (roughly a 72dp span inside the 108dp canvas) so it is never clipped by a launcher's own
  mask shape. The background is a plain full-bleed color that switches with the system's day/night
  mode — `drawable/ic_launcher_background.xml` (brand orange, `#C2410C`) by day,
  `drawable-night/ic_launcher_background.xml` (this app's own dark `--ground`, `#120B08`) by
  night — since the mark itself has no color of its own left to switch, unlike the mountain the
  previous art had. A third layer, `drawable/ic_launcher_monochrome.xml` (the same mark), supports
  Android 13+ themed icons, where the OS re-tints it to match the device's Material You theme.
  Legacy flat `ic_launcher.png`/`ic_launcher_round.png` per density (for pre-Android-8 devices,
  which do not understand adaptive icons at all) use the day color only.
  `apps/reader/store/play-icon-512.png` is the same day composition at Play Store listing size —
  not part of the APK.
- **Discover's header mark and the About sheet's mark** (`apps/reader/src/routes/+page.svelte`,
  `apps/reader/src/lib/components/AboutSheet.svelte`): the whole mark (arch, fox, howl), as
  a single inline SVG path with `fill="currentColor"`, the same pattern the mark it replaced
  already used, so it still recolors itself with whatever text color surrounds it rather than
  being a fixed-color image.

See DECISIONS.md (2026-09-29, and the later entry for the redo) for the reasoning behind the
safe-zone scaling and the day/night color choice.

## Regenerating

Nothing here runs as part of `pnpm build` or `cap sync`; this is a one-off, manual step for
whenever the art or the color choices change. `generate-icons.cjs` needs three packages that are
deliberately **not** project dependencies, since nothing else ever needs them:

```sh
cd brand
npm init -y                      # if package.json doesn't exist yet
npm install sharp potrace svgo
node generate-icons.cjs
```

It reads `YipDen_Logo.webp`, traces the mark to a vector path, writes the Android vector drawables
and legacy PNGs directly into `apps/reader/android/app/src/main/res/`, and writes
`apps/reader/store/play-icon-512.png`. It does not touch the in-app SVG marks (Discover header,
About sheet) — copy the path it prints out into those by hand, the same way it was done the first
time, since they are ordinary Svelte markup, not generated files.
