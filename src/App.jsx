/**
 * ─── TRYCK ────────────────────────────────────────────────────────
 * A little poster press. Type something, feel the ink (glide over
 * the poster; click to pin), press. One page, no accounts.
 *
 * Same instrument grammar as viterius.com/remix — glide previews,
 * click pins — but its own brand: paper, ink, mono. The posters
 * are loud so the tool is quiet.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { INKS, MATERIALS, LAYOUTS, drawType, createPress, exportPoster } from "./press.js";

const PREVIEW_W = 1000;
const PREVIEW_H = Math.round(1000 * Math.SQRT2);

export default function App() {
  const [text, setText] = useState("PRESS SOMETHING BEAUTIFUL");
  const [inkId, setInkId] = useState("blue");
  const [mode, setMode] = useState("fold");
  const [layout, setLayout] = useState("stack");
  const [pos, setPos] = useState({ x: 0.35, y: 0.35 }); // pinned
  const [hover, setHover] = useState(null);
  const [fontsReady, setFontsReady] = useState(false);
  const [seed] = useState(() => String(Math.floor(100 + Math.random() * 900)));

  const glCanvasRef = useRef(null);
  const typeCanvasRef = useRef(null);
  const pressRef = useRef(null);
  const rafRef = useRef(0);
  const stateRef = useRef({});

  const inks = useMemo(() => INKS.find((i) => i.id === inkId), [inkId]);
  const p = hover ?? pos;
  stateRef.current = { inks, mode, p };

  useEffect(() => {
    document.fonts.load('100px "Anton"').then(() => setFontsReady(true));
  }, []);

  /* type layer — redraw when the words change */
  useEffect(() => {
    if (!fontsReady) return;
    if (!typeCanvasRef.current) {
      const c = document.createElement("canvas");
      c.width = PREVIEW_W;
      c.height = PREVIEW_H;
      typeCanvasRef.current = c;
    }
    drawType(typeCanvasRef.current, { text, layout, seed });
    pressRef.current?.setType(typeCanvasRef.current);
  }, [text, layout, seed, fontsReady]);

  /* press + render loop */
  useEffect(() => {
    if (!fontsReady) return;
    pressRef.current = createPress(glCanvasRef.current);
    if (typeCanvasRef.current) pressRef.current?.setType(typeCanvasRef.current);
    const t0 = performance.now();
    const loop = (t) => {
      pressRef.current?.render({ ...stateRef.current, time: (t - t0) / 1000 });
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [fontsReady]);

  /* glide / pin on the poster */
  const fromEvent = useCallback((e) => {
    const r = e.currentTarget.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
      y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)),
    };
  }, []);

  const press = () => exportPoster({ text, layout, seed, inks, mode, p: pos, time: 2.0 });

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      {/* ── Masthead ── */}
      <header style={{
        display: "flex", alignItems: "baseline", justifyContent: "space-between",
        gap: 16, flexWrap: "wrap", padding: "22px clamp(20px, 4vw, 44px) 0",
      }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 14 }}>
          <span style={{ fontFamily: "var(--display)", fontSize: 30, letterSpacing: "0.04em" }}>TRYCK</span>
          <span className="label">a little poster press</span>
        </div>
        <a
          href="https://viterius.com"
          className="label"
          style={{ color: "inherit", textDecoration: "none", opacity: 0.7 }}
        >
          by christian viterius ↗
        </a>
      </header>

      {/* ── Press room ── */}
      <main style={{
        flex: 1,
        display: "grid",
        gridTemplateColumns: "minmax(240px, 320px) 1fr",
        gap: "clamp(24px, 4vw, 56px)",
        alignItems: "start",
        padding: "clamp(20px, 4vh, 40px) clamp(20px, 4vw, 44px) 32px",
        maxWidth: 1200,
        width: "100%",
        margin: "0 auto",
      }}
      className="press-room"
      >
        <style>{`
          @media (max-width: 760px) {
            .press-room { grid-template-columns: 1fr !important; }
            .press-room > .controls { order: 2; }
          }
        `}</style>

        {/* Controls */}
        <div className="controls" style={{ display: "flex", flexDirection: "column", gap: 26 }}>
          <div>
            <p className="label" style={{ marginBottom: 8 }}>Words</p>
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={60}
              aria-label="Poster text"
              style={{
                width: "100%", fontSize: 14, padding: "12px 12px",
                background: "transparent", border: "1px solid var(--line)",
                borderRadius: 3, letterSpacing: "0.02em",
              }}
            />
          </div>

          <div>
            <p className="label" style={{ marginBottom: 10 }}>Ink</p>
            <div style={{ display: "flex", gap: 10 }}>
              {INKS.map((i) => (
                <button
                  key={i.id}
                  type="button"
                  className="swatch-btn"
                  aria-pressed={inkId === i.id}
                  aria-label={`Ink: ${i.id}`}
                  onClick={() => setInkId(i.id)}
                  style={{
                    width: 26, height: 26, borderRadius: "50%",
                    background: i.ink, border: `3px solid ${i.paper}`,
                  }}
                />
              ))}
            </div>
          </div>

          <div>
            <p className="label" style={{ marginBottom: 10 }}>Material</p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {MATERIALS.map((m) => (
                <button key={m.id} type="button" className="opt-btn" aria-pressed={mode === m.id} onClick={() => setMode(m.id)}>
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="label" style={{ marginBottom: 10 }}>Layout</p>
            <div style={{ display: "flex", gap: 8 }}>
              {LAYOUTS.map((l) => (
                <button key={l.id} type="button" className="opt-btn" aria-pressed={layout === l.id} onClick={() => setLayout(l.id)}>
                  {l.label}
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 6 }}>
            <button type="button" className="press-btn" onClick={press}>
              Press ↓
            </button>
            <p className="label" style={{ lineHeight: 1.7, textTransform: "none", letterSpacing: "0.03em" }}>
              Glide over the poster to work the ink. Click to pin it.
              Press downloads a print-ready PNG. It's yours.
            </p>
          </div>
        </div>

        {/* The poster */}
        <div
          role="application"
          aria-label="Poster preview. Gliding adjusts the material, clicking pins it. Arrow keys nudge; hold shift for bigger steps."
          tabIndex={0}
          onPointerMove={(e) => setHover(fromEvent(e))}
          onPointerDown={(e) => setPos(fromEvent(e))}
          onPointerUp={(e) => { setPos(fromEvent(e)); setHover(null); }}
          onPointerLeave={() => setHover(null)}
          onKeyDown={(e) => {
            const step = e.shiftKey ? 0.1 : 0.02;
            const mv = {
              ArrowLeft: [-step, 0], ArrowRight: [step, 0],
              ArrowUp: [0, -step], ArrowDown: [0, step],
            }[e.key];
            if (!mv) return;
            e.preventDefault();
            setPos((q) => ({
              x: Math.min(1, Math.max(0, q.x + mv[0])),
              y: Math.min(1, Math.max(0, q.y + mv[1])),
            }));
          }}
          style={{
            justifySelf: "center",
            width: "min(100%, calc((88vh - 120px) / 1.4142))",
            cursor: "crosshair",
            touchAction: "none",
            lineHeight: 0,
            boxShadow: "0 30px 80px rgba(22,21,19,0.28), 0 4px 14px rgba(22,21,19,0.18)",
            borderRadius: 2,
            overflow: "hidden",
          }}
        >
          <canvas
            ref={glCanvasRef}
            width={PREVIEW_W}
            height={PREVIEW_H}
            style={{ width: "100%", height: "auto", display: "block" }}
          />
        </div>
      </main>

      <footer style={{ padding: "0 clamp(20px, 4vw, 44px) 20px" }}>
        <p className="label" style={{ textTransform: "none", letterSpacing: "0.03em" }}>
          tryck (swedish): print · push · press. No accounts, no uploads, no tracking — the poster never leaves your machine.
        </p>
      </footer>
    </div>
  );
}
