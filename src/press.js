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
export const INKS = [
  { id: "blue", paper: "#f2efe4", ink: "#0078bf", ink2: "#ff48b0" },
  { id: "pink", paper: "#f6f0e8", ink: "#ff48b0", ink2: "#0078bf" },
  { id: "orange", paper: "#f4efe3", ink: "#ff6c2f", ink2: "#765ba7" },
  { id: "green", paper: "#f2efe4", ink: "#00a95c", ink2: "#ff6c2f" },
  { id: "black", paper: "#efece3", ink: "#17150f", ink2: "#f15060" },
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
    const contentW = W - mx * 2;
    const contentH = H - mx * 2 - H * 0.05;
    ctx.font = `100px "Anton", sans-serif`;
    const sizes = words.map((w) => Math.min((100 * contentW) / Math.max(ctx.measureText(w).width, 1), H * 0.34));
    const total = sizes.reduce((a, s) => a + s * 1.03, 0);
    const k = total > contentH ? contentH / total : 1;
    let y = mx + (contentH - total * k) / 2;
    ctx.textBaseline = "top";
    words.forEach((w, i) => {
      const s = sizes[i] * k;
      ctx.font = `${s}px "Anton", sans-serif`;
      const ww = ctx.measureText(w).width;
      ctx.fillText(w, mx + (contentW - ww) / 2, y);
      y += s * 1.03;
    });
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

  ctx.font = `500 ${Math.max(W * 0.013, 11)}px "IBM Plex Mono", monospace`;
  ctx.textBaseline = "alphabetic";
  ctx.fillText(`TRYCK N°${seed} — a little poster press · viterius.com`, layout === "corner" || layout === "spine" ? W - mx - ctx.measureText(`TRYCK N°${seed} — a little poster press · viterius.com`).width : mx, H - mx * 0.55);
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

/* the readable-type pass: a tight paper outline + near-black ink.
   Tap radius is small so it hugs even the tiny colophon (a wide
   halo reads as ghost copies behind small text). */
vec3 typeOver(vec3 col, vec2 uv, vec3 inkCol) {
  float a = texture2D(uType, uv).a;
  float halo = a;
  const float r = 0.0017;
  const float rd = 0.0012;
  halo = max(halo, texture2D(uType, uv + vec2( r, 0.0)).a);
  halo = max(halo, texture2D(uType, uv + vec2(-r, 0.0)).a);
  halo = max(halo, texture2D(uType, uv + vec2(0.0,  r * 1.4142)).a);
  halo = max(halo, texture2D(uType, uv + vec2(0.0, -r * 1.4142)).a);
  halo = max(halo, texture2D(uType, uv + vec2( rd,  rd)).a);
  halo = max(halo, texture2D(uType, uv + vec2(-rd,  rd)).a);
  halo = max(halo, texture2D(uType, uv + vec2( rd, -rd)).a);
  halo = max(halo, texture2D(uType, uv + vec2(-rd, -rd)).a);
  col = mix(col, uPaper, halo * 0.92);
  return mix(col, inkCol, a);
}

/* ── the full material stack as a function, so the fold zone can
   sample it three times for TRUE whole-image chromatic splitting ── */
vec3 material(vec2 uv) {
  vec3 col;
  vec3 paper = uPaper + (hash(uv * 780.0) - 0.5) * 0.03;

  if (uMode < 0.5) {
    /* POP — groovy concentric waves centered on your pin */
    vec2 c = uP;
    vec2 dv = (uv - c) * ASPECT;
    float ang = atan(dv.y, dv.x);
    float d = length(dv) + sin(ang * 6.0 + uTime * 0.4) * 0.018;
    float band = mod(floor(d * 11.0), 4.0);
    col = band < 1.0 ? uInk : (band < 2.0 ? paper : (band < 3.0 ? uInk2 : NEARBLACK));
    col = typeOver(col, uv, NEARBLACK);
  } else if (uMode < 1.5) {
    /* RAYS — a sunburst of ink wedges radiating from your pin */
    vec2 c = uP;
    vec2 dv = (uv - c) * ASPECT;
    float ang = atan(dv.y, dv.x) / 6.28318 + 0.5;
    float idx = mod(floor(ang * 28.0 + uTime * 0.06), 4.0);
    col = idx < 1.0 ? uInk : (idx < 2.0 ? paper : (idx < 3.0 ? uInk2 : paper));
    /* the sun itself, right where you pinned */
    float d = length(dv);
    col = mix(col, NEARBLACK, step(d, 0.075));
    col = mix(col, uInk2, step(d, 0.055));
    col = typeOver(col, uv, NEARBLACK);
  } else if (uMode < 2.5) {
    /* ARCS — stacked rainbow arches centered on your pin; the legs
       run straight down the sheet like a proper print rainbow */
    vec2 c = uP;
    vec2 dv = (uv - c) * ASPECT;
    float d = dv.y > 0.0 ? length(dv) : abs(dv.x);
    float idx = floor(d * 7.0);
    if (idx > 5.0) {
      col = paper;
    } else if (mod(idx, 2.0) > 0.5) {
      col = paper;                          /* paper gaps between bands */
    } else {
      float which = mod(floor(idx / 2.0), 3.0);
      col = which < 1.0 ? uInk : (which < 2.0 ? uInk2 : NEARBLACK);
    }
    col = typeOver(col, uv, NEARBLACK);
  } else if (uMode < 3.5) {
    /* SPLIT — two inks, off register; overlap overprints darker */
    vec2 off = (uP - 0.5) * 0.045;
    float a1 = texture2D(uType, uv + off).a;
    float a2 = texture2D(uType, uv - off).a;
    col = paper;
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
    col = mix(col, uInk, body * (0.55 + hash(vec2(cid, 43.0)) * 0.35));
    col = mix(col, uInk, tip * 0.25);                   /* thinning tail */
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
