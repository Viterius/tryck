# TRYCK

**A little poster press.** Type something, feel the ink, press.

*tryck* (Swedish): print · push · press.

**→ [Try it live](https://tryck-gamma.vercel.app)**

## What it does

Type a few words and TRYCK sets them on an A-series poster in one of
four layouts — stacked, corner caption, vertical spine, or tilted
repeat. Glide over the poster to work the material: Bauhaus shape
compositions, grainy sunrise gradients, groovy pop waves, two-ink
split, or melting ink — in classic riso pairs. Click to pin what you
found; click again to keep working. **Press** runs the press: the
sheet folds out of the screen with chromatic creases, a print-ready
PNG (2000 × 2828) downloads, and a fresh sheet feeds in. Every poster
is numbered by the global press count. It's yours.

No accounts, no uploads, no tracking. Everything renders in your
browser; the poster never leaves your machine.

## How it works

- The type is drawn to an offscreen 2D canvas as an alpha mask
  (`src/press.js → drawType`)
- A single WebGL1 fragment shader turns that mask into printed matter:
  fold curtains, halftone grain with paper tooth, or misregistered
  two-ink overprint (`src/press.js → FRAG`)
- The cursor is the only control surface: gliding previews material
  parameters, clicking pins them. No sliders on purpose.
- Export re-renders offscreen at print resolution with your pinned
  parameters. React + Vite, no other dependencies.

## Run it

```
npm install
npm run dev
```

## Credit

Made by [Christian Viterius](https://viterius.com) — designed by hand,
coded with AI in the loop.
