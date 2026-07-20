/**
 * ─── TRYCK ────────────────────────────────────────────────────────
 * A little poster press. Type something, work the ink (glide to
 * preview, click to pin — click again to keep working), press.
 *
 * Pressing is physical: the press bites, the poster ejects out the
 * bottom mid-surge, the PNG downloads, and a fresh numbered sheet
 * feeds in from the top. Poster numbers come from the global press
 * count (/api/press) when a store is connected; otherwise local.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { INKS, MATERIALS, LAYOUTS, drawType, createPress, exportPoster } from "./press.js";

const PREVIEW_W = 1000;
const PREVIEW_H = Math.round(1000 * Math.SQRT2);
const EJECT_MS = 500;

export default function App() {
  const [text, setText] = useState("PRESS SOMETHING BEAUTIFUL");
  const [inkId, setInkId] = useState("blue");
  const [mode, setMode] = useState("pop");
  const [layout, setLayout] = useState("corner");
  const [pos, setPos] = useState({ x: 0.35, y: 0.35 }); // pinned params
  const [hover, setHover] = useState(null);
  const [locked, setLocked] = useState(false);
  const [phase, setPhase] = useState("idle"); // idle | squash | eject | reload
  const [no, setNo] = useState(() => Math.floor(100 + Math.random() * 900));
  const [fontsReady, setFontsReady] = useState(false);

  const glCanvasRef = useRef(null);
  const typeCanvasRef = useRef(null);
  const pressRef = useRef(null);
  const rafRef = useRef(0);
  const stateRef = useRef({});
  /* quality floor: users who ask their OS for stillness get a still
     press — frozen material time, no choreography, same posters */
  const reducedRef = useRef(
    typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );

  const inks = useMemo(() => INKS.find((i) => i.id === inkId), [inkId]);
  const p = hover ?? pos;
  stateRef.current = { inks, mode, p, phase };

  useEffect(() => {
    document.fonts.load('100px "Anton"').then(() => setFontsReady(true));
    // global press count → next poster number
    fetch("/api/press")
      .then((r) => r.json())
      .then((j) => { if (j.n != null) setNo(j.n + 1); })
      .catch(() => {});
  }, []);

  /* type layer — redraw when words / layout / number change */
  useEffect(() => {
    if (!fontsReady) return;
    if (!typeCanvasRef.current) {
      const c = document.createElement("canvas");
      c.width = PREVIEW_W;
      c.height = PREVIEW_H;
      typeCanvasRef.current = c;
    }
    drawType(typeCanvasRef.current, { text, layout, seed: no });
    pressRef.current?.setType(typeCanvasRef.current);
  }, [text, layout, no, fontsReady]);

  /* press + render loop — every frame we measure where the viewport
     edges cross the canvas and hand those lines to the shader, so the
     fold lives at the SCREEN edge while the sheet travels through it
     (the portfolio fold, exactly). Inactive lines: top=1, bottom=0. */
  useEffect(() => {
    if (!fontsReady) return;
    pressRef.current = createPress(glCanvasRef.current);
    if (typeCanvasRef.current) pressRef.current?.setType(typeCanvasRef.current);
    const t0 = performance.now();
    const loop = (t) => {
      const s = stateRef.current;
      let lines = [1, 0];
      if (s.phase === "floatout" || s.phase === "floatin" || s.phase === "reset") {
        const rect = glCanvasRef.current.getBoundingClientRect();
        if (rect.height > 0) {
          const vT = 1 + rect.top / rect.height;                      // viewport top in v-space
          const vB = 1 - (window.innerHeight - rect.top) / rect.height; // viewport bottom
          lines = [Math.min(1, Math.max(0, vT)), Math.min(1, Math.max(0, vB))];
        }
      }
      pressRef.current?.render({
        inks: s.inks, mode: s.mode, p: s.p,
        time: reducedRef.current ? 2.0 : (t - t0) / 1000, lines,
      });
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [fontsReady]);

  const fromEvent = useCallback((e) => {
    const r = e.currentTarget.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
      y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)),
    };
  }, []);

  /* ── PRESS: bite → the sheet floats up out of the screen, folding
     with chromatic creases as it goes + download → the next sheet
     floats in from below, unfolding as it rises ── */
  const press = async () => {
    if (phase !== "idle") return;
    const pNow = hover ?? pos;

    let n = no;
    const bump = async () => {
      try {
        const r = await fetch("/api/press", { method: "POST" });
        const j = await r.json();
        if (j.n != null) n = j.n;
      } catch { /* local number is fine */ }
    };

    /* reduced motion: no choreography — press, download, next sheet */
    if (reducedRef.current) {
      await bump();
      exportPoster({ text, layout, seed: n, inks, mode, p: pNow, time: 2.0 });
      setNo(n + 1);
      return;
    }

    setPhase("squash");
    await bump();

    setTimeout(() => setPhase("floatout"), 90);
    setTimeout(() => {
      exportPoster({ text, layout, seed: n, inks, mode, p: pNow, time: 2.0 });
    }, 90 + 450);
    setTimeout(() => {
      setNo(n + 1); // redraw the type while the sheet is offscreen
      setPhase("reset");
      requestAnimationFrame(() => requestAnimationFrame(() => setPhase("floatin")));
    }, 90 + 880);
    setTimeout(() => setPhase("idle"), 90 + 880 + 950);
  };

  /* pure vertical slide — the fold at the viewport edge does the
     drama, exactly like the portfolio's fold transitions */
  const sheetTransform = {
    idle: "translateY(0)",
    squash: "scale(0.985)",
    floatout: "translateY(-170%)",
    reset: "translateY(150%)",
    floatin: "translateY(0)",
  }[phase];
  const sheetTransition = {
    idle: "transform 0.5s cubic-bezier(0.22, 1, 0.36, 1)",
    squash: "transform 0.09s ease",
    floatout: "transform 1.05s cubic-bezier(0.55, 0.0, 0.65, 0.35)",
    reset: "none",
    floatin: "transform 0.95s cubic-bezier(0.22, 1, 0.36, 1)",
  }[phase];
  const shadowOn = phase === "idle" || phase === "squash" || phase === "floatin";

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      {/* ── Masthead ── */}
      <header style={{
        display: "flex", alignItems: "baseline", justifyContent: "space-between",
        gap: 16, flexWrap: "wrap", padding: "22px clamp(20px, 4vw, 44px) 0",
      }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 14 }}>
          {/* the press's own ink on its own name, not quite dry */}
          <span style={{
            position: "relative", display: "inline-block",
            fontFamily: "var(--display)", fontSize: 30,
            letterSpacing: "0.04em", lineHeight: 1,
          }}>
            TRYCK
            <span aria-hidden="true" style={{
              position: "absolute", left: "0.52em", bottom: "-0.20em",
              width: "0.055em", height: "0.26em", background: "var(--ink)",
              borderRadius: "0 0 0.03em 0.03em",
            }} />
            <span aria-hidden="true" style={{
              position: "absolute", left: "1.48em", bottom: "-0.10em",
              width: "0.045em", height: "0.16em", background: "var(--ink)",
              borderRadius: "0 0 0.025em 0.025em",
            }} />
            <span aria-hidden="true" style={{
              position: "absolute", left: "2.58em", bottom: "-0.14em",
              width: "0.05em", height: "0.20em", background: "var(--ink)",
              borderRadius: "0 0 0.03em 0.03em",
            }} />
          </span>
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
      <main
        className="press-room"
        style={{
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
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
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
            <button type="button" className="press-btn" onClick={press} disabled={phase !== "idle"}>
              Press ↓
            </button>
            <p className="label" style={{ lineHeight: 1.7, textTransform: "none", letterSpacing: "0.03em" }}>
              Glide over the poster to work the ink. Click to pin it, click
              again to keep working. Press prints N°{no} as a print-ready
              PNG. It's yours.
            </p>
          </div>
        </div>

        {/* The sheet — folds out of existence in the shader; the canvas
            goes transparent outside the shrinking band, the shadow
            underlay fades in sync. Nothing translates. */}
        <div
          style={{
            justifySelf: "center",
            width: "min(100%, calc((88vh - 120px) / 1.4142))",
          }}
        >
          <div
            role="application"
            aria-label="Poster preview. Gliding adjusts the material, clicking pins it, clicking again resumes. Arrow keys nudge; hold shift for bigger steps."
            tabIndex={0}
            onPointerMove={(e) => { if (!locked) setHover(fromEvent(e)); }}
            onPointerDown={(e) => {
              if (locked) { setLocked(false); setHover(fromEvent(e)); }
              else { setPos(fromEvent(e)); setLocked(true); setHover(null); }
            }}
            onPointerLeave={() => { if (!locked) setHover(null); }}
            onKeyDown={(e) => {
              const step = e.shiftKey ? 0.1 : 0.02;
              const mv = {
                ArrowLeft: [-step, 0], ArrowRight: [step, 0],
                ArrowUp: [0, -step], ArrowDown: [0, step],
              }[e.key];
              if (!mv) return;
              e.preventDefault();
              setLocked(true);
              setHover(null);
              setPos((q) => ({
                x: Math.min(1, Math.max(0, q.x + mv[0])),
                y: Math.min(1, Math.max(0, q.y + mv[1])),
              }));
            }}
            style={{
              position: "relative",
              zIndex: 20, /* the sheet floats over the chrome on its way out */
              cursor: locked ? "default" : "crosshair",
              touchAction: "none",
              lineHeight: 0,
              borderRadius: 2,
              transform: sheetTransform,
              transition: sheetTransition,
              willChange: "transform",
            }}
          >
            {/* shadow underlay — fades while the sheet is folded away */}
            <span
              aria-hidden="true"
              style={{
                position: "absolute",
                inset: 0,
                borderRadius: 2,
                boxShadow: "0 30px 80px rgba(22,21,19,0.28), 0 4px 14px rgba(22,21,19,0.18)",
                opacity: shadowOn ? 1 : 0,
                transition: `opacity ${shadowOn ? 0.55 : 0.4}s ease`,
              }}
            />
            <canvas
              ref={glCanvasRef}
              width={PREVIEW_W}
              height={PREVIEW_H}
              style={{ width: "100%", height: "auto", display: "block", borderRadius: 2, position: "relative" }}
            />
            {locked && (
              <span
                aria-hidden="true"
                style={{
                  position: "absolute", top: 10, right: 10,
                  fontFamily: "var(--mono)", fontSize: 9, letterSpacing: "0.16em",
                  textTransform: "uppercase", lineHeight: 1,
                  background: "var(--ink)", color: "var(--paper)",
                  padding: "5px 8px 4px", borderRadius: 2, opacity: 0.85,
                }}
              >
                pinned
              </span>
            )}
          </div>
        </div>
      </main>

      <footer style={{ padding: "0 clamp(20px, 4vw, 44px) 20px" }}>
        <p className="label" style={{ textTransform: "none", letterSpacing: "0.03em" }}>
          tryck (swedish): print · push · press. No accounts, no uploads — the
          poster never leaves your machine. The only thing we count is presses.
        </p>
      </footer>
    </div>
  );
}
