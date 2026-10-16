# Atelier — browser painting studio

A natural-media painting app built with **React + Vite + TypeScript** (pnpm), deployed to GitHub Pages.

**Live:** https://bonchan.github.io/drawing_tool/

## Features

### Brushes
Every brush is a small, real paint engine (not a stretched image stamp). All of them respond to pen pressure. Pencil and charcoal also respond to stylus tilt, and with a mouse the ink brush follows your speed.

| Group | Brushes |
| --- | --- |
| Dry media | **Pencil** (graphite that catches the paper grain), **Charcoal** (ragged, dusty), **Crayon** (waxy oil pastel) |
| Ink & pens | **Fineliner**, **Ink Brush** (tapered sumi strokes), **Calligraphy** (flat italic nib), **Marker** (builds up where strokes overlap), **Highlighter** (chisel tip, multiply) |
| Paint | **Round Brush**, **Watercolor / acuarela** (bleeding edges, darker dried rims, granulation, glazing), **Oil Paint** (bristle streaks, runs dry, picks up and blends canvas colour), **Airbrush** (builds up while held), **Spray Can** |
| Utility | **Eraser**, **Blender** (smudge), **Fill bucket** (tolerance, grow, sample all layers), **Eyedropper**, **Move layer**, **Pan** |

Each brush has its own settings (size, opacity, flow, stabilizer, plus brush-specific ones like wetness, granulation, nib angle, blending). The brush library shows a live preview drawn by the real engine, in your current colour.

### Layers
Add, duplicate, delete, rename (double-click), show/hide, lock, reorder by drag and drop, merge down, per-layer opacity and 16 blend modes. The paper sits underneath as a background "layer": change its colour, toggle its cold-press texture, or hide it for a transparent export.

### Live colour composition
A panel that always shows **what percentage of the painting each colour takes up**, updating *while you paint*:

- A donut chart plus a ranked list of colour groups with names (pigment-style names such as *Ultramarine*, *Burnt Sienna*, *Sap Green*), hex codes and percentages. Click any colour to paint with it again.
- **Families** (reds, blues, browns, neutrals…), **Values** (a lightness histogram with shadows / midtones / highlights) and a **warm / cool / neutral** temperature split.
- Options: analyse all visible layers or just the active one, count bare paper or not, and a *Detail* slider that merges similar tints or separates subtle shades.
- A thin palette strip in the status bar keeps the composition visible at all times.

How it works: the visible image is sampled on a grid using nearest-neighbour sampling, so the pixel colours are real and unblended. Colours are bucketed into a 15-bit histogram and grouped in the perceptual **OKLab** space (greedy seeding, then k-means refinement), all in a Web Worker. Matching then keeps each group's identity stable from one update to the next, so the chart animates instead of flickering.

### Everything else
Undo/redo (80 steps, memory-capped), pan/zoom (scroll, pinch, space-drag), straight lines with Shift-click, Alt/right-click colour picking, palm rejection (fingers pan once a stylus is used), autosave to IndexedDB, save/open `.atelier` project files, import images as layers (or drag and drop them), PNG export, keyboard shortcuts (press `?` in the app).

## Development

```bash
pnpm install
pnpm dev        # http://localhost:5173
pnpm test       # unit tests (vitest)
pnpm lint
pnpm build      # type-check + production build into dist/
```

## Deployment

`.github/workflows/deploy.yml` builds every push to `main` and publishes `dist/` to the `gh-pages` branch, which GitHub Pages serves. The Vite `base` is relative (`./`), so the site works under any repository name.

## Project layout

```
src/
  engine/            canvas painting engine (framework-free)
    Engine.ts        document, layers, compositing, strokes, fill, history
    stroke.ts        input stabiliser, curve smoothing, dab spacing
    brushes/         one module per brush family
    textures.ts      procedural paper grain / noise, dab & grain caches
    brushPreview.ts  renders brush previews with the real engine
    persistence.ts   IndexedDB autosave + project files
  analysis/          colour composition (clustering, naming, worker)
  components/        React UI
  state/             small external stores (tools, view, UI)
```
