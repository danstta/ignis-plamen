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

| Family | Files                            |
| ------ | -------------------------------- |
| Garet  | `garet-400.otf`, `garet-700.otf` |

The checked-in Garet files are the free Book and Heavy weights. They are mapped
to `400` and `700` so normal and bold text render close to the Garet available in
Canva while keeping the editor and PNG renderer on the same files.

A missing file is not an error — the renderer just falls back to Inter for that
family until the file is added. Only list local fonts in the registry once their
files are present, so the editor's built-in picker stays limited to fonts the PNG
renderer can actually embed.

## Adding another local font

1. Drop the files here (e.g. `acme-700.woff`).
2. Add a `kind: "local"` entry to `FONTS` in `lib/render/font-registry.ts`
   with a `file: (w) => \`acme-${w}.woff\`` and the weights you provided.

The editor dropdown picks it up automatically from the registry.
