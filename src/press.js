/**
 * ─── press.js ─────────────────────────────────────────────────────
 * The whole press: type layer (2D canvas → alpha mask), WebGL1
 * material renderer, and the print-res PNG export. No libraries.
 *
 * Materials own the BACKGROUND; the type stays readable on top
 * (paper plate + near-black ink, or knocked out in paper).
 * The press exit is a screen-space fold: content bends and
 * chromatic-splits exactly where it crosses the viewport edge.
 */

/* ── Riso ink pairs — paper, ink, second ink ────────────────────── */
/* tonal pairs, portfolio-style: ink = the voice (strong), ink2 = a
   MUTED tint of the same hue for the background. Patterns build from
   ink2 + black + paper only, so posters read as one color family —
   never a fight between two saturated hues. */
export const INKS = [
  { id: "blue", paper: "#f2efe4", ink: "#0078bf", ink2: "#a3c6de" },
  { id: "pink", paper: "#f6f0e8", ink: "#ff48b0", ink2: "#f4bcd8" },
  { id: "orange", paper: "#f4efe3", ink: "#ff6c2f", ink2: "#f7c3a4" },
  { id: "green", paper: "#f2efe4", ink: "#00a95c", ink2: "#aad8bc" },
  { id: "violet", paper: "#f3f0e9", ink: "#765ba7", ink2: "#c6b9da" },
  { id: "teal", paper: "#f0efe6", ink: "#00838a", ink2: "#a2cbcc" },
  { id: "red", paper: "#f5f0e6", ink: "#ff665e", ink2: "#f6bcb4" },
  { id: "black", paper: "#efece3", ink: "#17150f", ink2: "#bcb7a9" },
];

/* order matters — index = uMode in the shader.
   THE LAW (learned from Pop): the background is the instrument and
   fills the whole sheet; the type is SET — always readable. */
export const MATERIALS = [
  { id: "pop", label: "Pop" },
  { id: "rays", label: "Rays" },
  { id: "arcs", label: "Arcs" },
  { id: "split", label: "Split" },
  { id: "melt", label: "Melt" },
];

export const LAYOUTS = [
  { id: "stack", label: "Stack" },
  { id: "corner", label: "Corner" },
  { id: "spine", label: "Spine" },
  { id: "tilt", label: "Tilt" },
];

const hexToVec = (hex) => {
  const n = hex.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16) / 255);
};

/* ── Type layer: draw the poster's ink as an alpha mask ─────────── */
export function drawType(canvas, { text, layout, seed }) {
  const W = canvas.width, H = canvas.height;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = "#000";

  const mx = W * 0.07;
  const words = (text.trim() || "TRYCK").toUpperCase().split(/\s+/).slice(0, 12);

  if (layout === "stack") {
    /* THE WALL: every word justified margin-to-margin on its own
       line; the block fills the sheet top to bottom with a capped
       vertical stretch. Works for one word or twelve — no overlap,
       no dead space, pure Swiss-poster wall of type. */
    const contentW = W - mx * 2;
    const top = H * 0.47;              /* the art gets the top half */
    const contentH = H - mx * 0.9 - top;
    const cap = H * 0.42; /* safety only — a lone "I" stays a letter */
    ctx.textBaseline = "alphabetic";
    const fillSize = (str) => {
      ctx.font = `100px "Anton", sans-serif`;
      return (100 * contentW) / Math.max(ctx.measureText(str).width, 1);
    };
    /* merge rule: only single-character words join their neighbor —
       a lone "I" justified to full width is a rectangle, but a giant
       two-letter line IS the look (see: OH HI) */
    const lines = [];
    let cur = words[0];
    for (let i = 1; i < words.length; i++) {
      if (cur.replace(/\s/g, "").length < 2) cur += " " + words[i];
      else { lines.push(cur); cur = words[i]; }
    }
    lines.push(cur);
    /* per-line: size that spans the column (capped; center if capped) */
    const fit = lines.map((w) => {
      const s = Math.min(fillSize(w), cap);
      ctx.font = `${s}px "Anton", sans-serif`;
      const m = ctx.measureText(w);
      const asc = m.actualBoundingBoxAscent || s * 0.72;
      return { w, s, asc, x: Math.max((contentW - m.width) / 2, 0) };
    });
    const LEAD = 1.06;
    const total = fit.reduce((a, f) => a + f.asc * LEAD, 0);
    const k = Math.min(contentH / total, 1.75); /* squish beats crop */
    const leftover = Math.max(contentH - total * k, 0);
    const gap = fit.length > 1 ? leftover / (fit.length - 1) : 0;
    let y = top + (fit.length === 1 ? leftover / 2 : 0);
    fit.forEach((f) => {
      y += f.asc * k;
      ctx.save();
      ctx.translate(mx + f.x, y);
      ctx.scale(1, k);
      ctx.font = `${f.s}px "Anton", sans-serif`;
      ctx.fillText(f.w, 0, 0);
      ctx.restore();
      y += f.asc * k * (LEAD - 1) + gap;
    });
    ctx.textBaseline = "top";
  } else if (layout === "corner") {
    /* gallery-poster caption: modest lines, bottom-left, under the art */
    const contentW = W - mx * 2;
    ctx.font = `100px "Anton", sans-serif`;
    const sizes = words.map((w) =>
      Math.min((100 * contentW * 0.52) / Math.max(ctx.measureText(w).width, 1), H * 0.052)
    );
    const total = sizes.reduce((a, s) => a + s * 1.08, 0);
    let y = H - mx - H * 0.035 - total;
    ctx.textBaseline = "top";
    words.forEach((w, i) => {
      ctx.font = `${sizes[i]}px "Anton", sans-serif`;
      ctx.fillText(w, mx, y);
      y += sizes[i] * 1.08;
    });
  } else if (layout === "spine") {
    /* vertical type up the left edge — reads bottom to top */
    const line = words.join(" ");
    ctx.save();
    ctx.translate(mx, H - mx - H * 0.04);
    ctx.rotate(-Math.PI / 2);
    const runway = H - mx * 2 - H * 0.05;
    ctx.font = `100px "Anton", sans-serif`;
    const s = Math.min((100 * runway) / Math.max(ctx.measureText(line).width, 1), W * 0.16);
    ctx.font = `${s}px "Anton", sans-serif`;
    ctx.textBaseline = "top";
    ctx.fillText(line, 0, 0);
    ctx.restore();
  } else {
    /* tilt: repeating rows on a slight diagonal */
    const line = words.join(" ") + "  ·  ";
    const s = W * 0.15;
    ctx.font = `${s}px "Anton", sans-serif`;
    const lw = Math.max(ctx.measureText(line).width, 1);
    const diag = Math.hypot(W, H);
    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.rotate(-0.21);
    ctx.textBaseline = "middle";
    const rows = Math.ceil(diag / (s * 1.12)) + 2;
    for (let r = 0; r < rows; r++) {
      const y = (r - rows / 2) * s * 1.12;
      const shift = -((r % 3) * lw) / 3 - lw / 2;
      for (let x = shift; x < diag / 2 + lw; x += lw) ctx.fillText(line, x - diag / 2 + lw / 2, y);
    }
    ctx.restore();
    ctx.clearRect(0, H - H * 0.055, W, H * 0.055);
  }

  const colophon = `TRYCK N°${seed} — a little poster press · viterius.com`;
  ctx.font = `500 ${Math.max(W * 0.013, 11)}px "IBM Plex Mono", monospace`;
  ctx.textBaseline = "alphabetic";
  if (layout === "stack") {
    /* the big word owns the bottom — colophon runs up the right edge */
    ctx.save();
    ctx.translate(W - mx * 0.3, H - mx);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(colophon, 0, 0);
    ctx.restore();
  } else {
    ctx.fillText(
      colophon,
      layout === "corner" || layout === "spine" ? W - mx - ctx.measureText(colophon).width : mx,
      H - mx * 0.55
    );
  }
}

/* ── Shaders ────────────────────────────────────────────────────── */
const VERT = `
attribute vec2 aPos;
varying vec2 vUv;
void main() { vUv = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }
`;

const FRAG = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uType;
uniform vec3 uPaper, uInk, uInk2;
uniform float uMode, uTime;
uniform vec2 uP;
/* screen-space fold lines: x = viewport-top line, y = viewport-bottom
   line, both in this canvas's v space (y-up). Inactive: x=1, y=0. */
uniform vec2 uLines;

const vec3 NEARBLACK = vec3(0.10, 0.09, 0.085);
const vec2 ASPECT = vec2(1.0, 1.4142);

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

/* the type pass: printed straight in the pair's INK — no outline,
   no plate. Where it crosses a same-ink band it merges; that
   figure-ground play is the reference's language, not a bug. */
vec3 typeOver(vec3 col, vec2 uv) {
  return mix(col, uInk, texture2D(uType, uv).a);
}

/* ── the full material stack as a function, so the fold zone can
   sample it three times for TRUE whole-image chromatic splitting ── */
vec3 material(vec2 uv) {
  vec3 col;
  vec3 paper = uPaper + (hash(uv * 780.0) - 0.5) * 0.03;

  if (uMode < 0.5) {
    /* POP — groovy waves. The pin PLACES the center and SHAPES it:
       y = ring density, x = wobble amount. */
    vec2 c = uP;
    vec2 dv = (uv - c) * ASPECT;
    float ang = atan(dv.y, dv.x);
    float freq = mix(7.0, 16.0, uP.y);
    float wob = mix(0.004, 0.032, uP.x);
    float d = length(dv) + sin(ang * 6.0 + uTime * 0.4) * wob;
    float band = mod(floor(d * freq), 4.0);
    vec3 soft = mix(uInk2, uPaper, 0.55);
    col = band < 1.0 ? uInk2 : (band < 2.0 ? paper : (band < 3.0 ? NEARBLACK : soft));
    col = typeOver(col, uv);
  } else if (uMode < 1.5) {
    /* RAYS — a fan from beyond the top-right corner, no visible
       center. x = how many rays, y = how thick they are. */
    vec2 c = vec2(1.12, 1.12);
    vec2 dv = (uv - c) * ASPECT;
    float ang = atan(dv.y, dv.x);
    float n = mix(9.0, 30.0, uP.x);
    float duty = mix(0.22, 0.72, uP.y);
    float t = ang / 6.28318 * n + uTime * 0.015;
    float wedge = step(fract(t), duty);
    float which = mod(floor(t), 2.0);
    col = wedge > 0.5 ? (which < 1.0 ? uInk2 : NEARBLACK) : paper;
    col = typeOver(col, uv);
  } else if (uMode < 2.5) {
    /* ARCS — hand-printed rainbow arches, legs running down the
       sheet. x = band frequency, y = hand wobble; keylines between
       bands like a screen print. One continuous wobble field —
       a split formula seams at the arch/leg boundary. */
    vec2 c = uP;
    vec2 dv = (uv - c) * ASPECT;
    float freq = mix(4.5, 11.0, uP.x);
    float wob = mix(0.001, 0.014, uP.y);
    float wfield = sin(uv.x * 22.0 + uTime * 0.2) * sin(uv.y * 17.0 + 1.7);
    float d = (dv.y > 0.0 ? length(dv) : abs(dv.x)) + wfield * wob
            + 0.5 / freq; /* half-band shift: no boundary at the core */
    float idx = mod(floor(d * freq), 6.0);
    col = idx < 1.0 ? uInk2
        : idx < 2.0 ? paper
        : idx < 3.0 ? mix(uInk2, NEARBLACK, 0.55)
        : idx < 4.0 ? paper
        : idx < 5.0 ? NEARBLACK
        : paper;
    /* screen-print keyline at every band edge (not at the very core,
       where d≈0 would draw a seam down the middle of the legs) */
    col = mix(col, NEARBLACK, step(fract(d * freq), 0.05) * 0.8 * step(0.03, d));
    col = typeOver(col, uv);
  } else if (uMode < 3.5) {
    /* SPLIT — two inks, off register, over a duotone halftone wash
       that flows in the direction of your pin */
    vec2 off = (uP - 0.5) * 0.045;
    vec2 dir = normalize(uP - vec2(0.5) + vec2(0.0001));
    float g = clamp(dot((uv - 0.5) * ASPECT, dir) + 0.5, 0.0, 1.0);
    vec2 gp = uv * ASPECT * 46.0;
    gp.y += mod(floor(gp.x), 2.0) * 0.5;
    float dd = length(fract(gp) - 0.5);
    float dotm = step(dd, 0.48 * pow(1.0 - g, 1.5));
    col = paper;
    col = mix(col, uInk2, dotm * 0.38);
    float a1 = texture2D(uType, uv + off).a;
    float a2 = texture2D(uType, uv - off).a;
    col = mix(col, uInk, a1);
    col = mix(col, mix(uInk2, uInk * uInk2 * 1.7, a1), a2 * 0.92);
  } else {
    /* MELT — the ink hasn't dried; it drips down the sheet, and the
       top edge of the print bleeds too, so the sheet is never empty */
    float cols = mix(24.0, 130.0, uP.x);
    float amt = uP.y * 0.35;
    float cid = floor(uv.x * cols);
    float drip = pow(hash(vec2(cid, 7.0)), 1.6);
    col = paper;
    /* ink bleed from the top edge — hard-edged riso drips, not haze */
    float reach = (0.06 + pow(hash(vec2(cid, 19.0)), 2.0) * 0.5) * (0.3 + uP.y);
    float topd = 1.0 - uv.y;
    float on = step(0.45, hash(vec2(cid, 31.0)));      /* not every column */
    float body = step(topd, reach) * on;
    float tip = step(reach, topd) * step(topd, reach + 0.05 * hash(vec2(cid, 57.0))) * on;
    col = mix(col, uInk2, body * (0.55 + hash(vec2(cid, 43.0)) * 0.35));
    col = mix(col, uInk2, tip * 0.25);                  /* thinning tail */
    /* the type melts on top */
    float a = 0.0;
    for (int i = 0; i < 7; i++) {
      float k = float(i) / 6.0;
      float aa = texture2D(uType, vec2(uv.x, uv.y + k * amt * drip)).a;
      a = max(a, aa * (1.0 - k * 0.5));
    }
    /* the printer's mark stays crisp — colophons don't melt */
    if (vUv.y < 0.085) a = texture2D(uType, uv).a;
    col = mix(col, uInk, a);
  }

  return col;
}

void main() {
  vec2 uv = vUv;

  /* ── the portfolio fold, screen-space: content bends exactly where
     it crosses the viewport edge; foldZ drives the chromatic split ── */
  float foldZ = 0.0;
  const float w = 0.30;
  if (uLines.x < 0.999) {              /* exiting through the top */
    float s = uLines.x - vUv.y;
    if (s > 0.0 && s < w) {
      float q = s / w;
      uv.y = uLines.x - pow(q, 0.45) * w;
      float zone = 1.0 - q;
      uv.x += sin(uv.y * 34.0 + uTime * 4.0) * 0.012 * zone;
      foldZ = zone;
    }
  }
  if (uLines.y > 0.001) {              /* entering from the bottom */
    float s = vUv.y - uLines.y;
    if (s > 0.0 && s < w) {
      float q = s / w;
      uv.y = uLines.y + pow(q, 0.45) * w;
      float zone = 1.0 - q;
      uv.x += sin(uv.y * 34.0 + uTime * 4.0) * 0.012 * zone;
      foldZ = max(foldZ, zone);
    }
  }

  vec3 col;
  if (foldZ > 0.001) {
    /* true chromatic aberration: R/G/B sampled at diverging points */
    vec2 off = vec2(0.0, 0.028 * foldZ * foldZ + 0.004 * foldZ);
    col.r = material(uv + off).r;
    col.g = material(uv).g;
    col.b = material(uv - off).b;
    col *= 1.0 - foldZ * 0.5;
    col += pow(foldZ, 5.0) * 0.45;
  } else {
    col = material(uv);
  }

  gl_FragColor = vec4(col, 1.0);
}
`;

export function createPress(glCanvas) {
  const gl = glCanvas.getContext("webgl", { preserveDrawingBuffer: true, antialias: true });
  if (!gl) return null;

  const compile = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  };
  const prog = gl.createProgram();
  gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
  gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG));
  gl.linkProgram(prog);
  gl.useProgram(prog);

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const aPos = gl.getAttribLocation(prog, "aPos");
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  const U = {};
  ["uType", "uPaper", "uInk", "uInk2", "uMode", "uTime", "uP", "uLines"].forEach((n) => {
    U[n] = gl.getUniformLocation(prog, n);
  });
  gl.uniform1i(U.uType, 0);

  return {
    setType(typeCanvas) {
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, typeCanvas);
    },
    render({ inks, mode, p, time, lines = [1, 0] }) {
      gl.viewport(0, 0, glCanvas.width, glCanvas.height);
      gl.uniform3fv(U.uPaper, hexToVec(inks.paper));
      gl.uniform3fv(U.uInk, hexToVec(inks.ink));
      gl.uniform3fv(U.uInk2, hexToVec(inks.ink2));
      gl.uniform1f(U.uMode, Math.max(0, MATERIALS.findIndex((m) => m.id === mode)));
      gl.uniform1f(U.uTime, time);
      gl.uniform2f(U.uLines, lines[0], lines[1]);
      gl.uniform2f(U.uP, p.x, 1 - p.y);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
  };
}

/* ── Export: re-render at print resolution, download PNG ───────── */
export function exportPoster(state) {
  const W = 2000, H = Math.round(2000 * Math.SQRT2);
  const typeCanvas = document.createElement("canvas");
  typeCanvas.width = W;
  typeCanvas.height = H;
  drawType(typeCanvas, state);

  const glCanvas = document.createElement("canvas");
  glCanvas.width = W;
  glCanvas.height = H;
  const press = createPress(glCanvas);
  if (!press) return;
  press.setType(typeCanvas);
  press.render({ ...state, time: state.time ?? 2.0, lines: [1, 0] }); /* no fold in the print */

  glCanvas.toBlob((blob) => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `tryck-${state.seed}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }, "image/png");
}
