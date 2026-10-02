# Brand source art

`YipDen_Logo.webp` is the artwork everything here is built from (redone 2026-09-30, replacing an
earlier version that put the same fox over a mountain silhouette instead of this arch): a howling
fox framed by an arch (redone again since: the ring behind the fox was dropped), as a single white shape on a transparent background. It is
kept here, tracked in git, specifically because everywhere else it gets used only keeps a
_derived_ shape (a traced vector path or a generated PNG), and derived work is not a substitute
for the original if it ever needs to change (a different crop, a color tweak, higher resolution
source art). Nothing under `apps/reader/` reads this file directly; regeneration is a manual,
occasional step, not a build step.

## The fox-only cut (2026-10-02)

The app icon and splash use `YipDen_Fox.png`: the same fox and howl with the arch taken off, white
on transparent, made from `YipDen_Logo.webp` by `fox-only.cjs`. The howl marks are fused into the
arch where they cross its stroke, so that script removes the arch band (its mark-free left side,
mirrored) and bridges each mark back across the gap. The in-app marks (Discover header, About)
keep the arched version, `mark.path.txt`; the fox-only trace is `fox.path.txt`.

## What was derived from it, and where

- **Android launcher icon** (`apps/reader/android/app/src/main/res/`): an adaptive icon, not a
  flat image. The fox-only mark (fox and howl, no arch) is a single white vector foreground
  (`drawable/ic_launcher_foreground.xml`), 54 of the 108dp canvas: a launcher shows the middle 72
  through its mask, a circle at worst, and the fox's tail and howl reach toward two corners, so at
  54 neither is ever clipped. The background is a plain full-bleed color that switches with the system's day/night
  mode — `drawable/ic_launcher_background.xml` (brand orange, `#C2410C`) by day,
  `drawable-night/ic_launcher_background.xml` (this app's own dark `--ground`, `#120B08`) by
  night — since the mark itself has no color of its own left to switch, unlike the mountain the
  previous art had. A third layer, `drawable/ic_launcher_monochrome.xml` (the same mark), supports
  Android 13+ themed icons, where the OS re-tints it to match the device's Material You theme.
  Legacy flat `ic_launcher.png`/`ic_launcher_round.png` per density (for pre-Android-8 devices,
  which do not understand adaptive icons at all) use the day color only, framed to the middle 72
  units the way a launcher shows it. `apps/reader/store/play-icon-512.png` is the same day
  composition at Play Store listing size (and what the repo README shows) — not part of the APK.
- **Launch splash screen** (`apps/reader/android/app/src/main/res/`): `drawable/splash_icon.xml`
  is the same mark as the launcher foreground at the same size (54 of 108 units): the splash masks
  its icon to the same 72-unit circle a round launcher does, so what fits one fits the other. The background is `@color/splash_background` in `values/colors.xml` (brand
  orange) and `values-night/colors.xml` (the dark ground), the launcher icon's own day/night pair.
  Wired up by `AppTheme.NoActionBarLaunch` in `values/styles.xml`.
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
node fox-only.cjs                # only when YipDen_Logo.webp itself changes
node generate-icons.cjs
```

It reads `YipDen_Fox.png`, traces the mark to a vector path, writes the Android vector drawables
and legacy PNGs directly into `apps/reader/android/app/src/main/res/`, and writes
`apps/reader/store/play-icon-512.png`, plus the splash icon. It does not touch the in-app SVG marks (Discover header,
About sheet) — copy the path it prints out into those by hand, the same way it was done the first
time, since they are ordinary Svelte markup, not generated files.
