# Local fonts

Drop licensed/custom font files here so the Satori renderer can embed them in
exported PNGs. These are read at render time by `lib/render/fonts.ts`.

## Requirements

- Format: **ttf, otf, or woff** — **not woff2** (Satori can't read woff2).
- One file per weight, named to match the registry entry in
  `lib/render/font-registry.ts`.

## Expected files

The registry currently references these (adjust the `weights` array there to
match whatever you actually add):

| Family     | Files                                                        |
| ---------- | ------------------------------------------------------------ |
| Canva Sans | `canva-sans-400.woff`, `canva-sans-500.woff`, `canva-sans-700.woff` |
| Garet      | `garet-400.woff`, `garet-500.woff`, `garet-700.woff`         |

A missing file is not an error — the renderer just falls back to Inter for that
family until the file is added. The editor's font picker shows a note for any
family whose face can't be embedded.

## Adding another local font

1. Drop the files here (e.g. `acme-700.woff`).
2. Add a `kind: "local"` entry to `FONTS` in `lib/render/font-registry.ts`
   with a `file: (w) => \`acme-${w}.woff\`` and the weights you provided.

The editor dropdown picks it up automatically from the registry.
