# TRYCK

**A little poster press.** Type something, feel the ink, press.

*tryck* (Swedish): print · push · press.

**→ [Try it live](https://tryck-gamma.vercel.app)**

## What it does

Type a few words and TRYCK sets them in big type on an A-series poster.
Glide over the poster to work the material — fold, riso grain, two-ink
split, melt, letterpress deboss, or scan — in classic riso ink pairs.
Click to pin what you found; click again to keep working. **Press**
runs the press: the sheet ejects, a print-ready PNG (2000 × 2828)
downloads, and a fresh sheet feeds in. Every poster is numbered by the
global press count. It's yours.

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
