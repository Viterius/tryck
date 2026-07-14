/**
 * ─── press.js ─────────────────────────────────────────────────────
 * The whole press: type layer (2D canvas → alpha mask), WebGL1
 * material renderer, and the print-res PNG export. No libraries —
 * one quad, one shader, one glyph atlas for the ASCII material.
 *
 * uKick is the press moment: a fold-curtain deformation that rides
 * on top of ANY material while the sheet ejects — the same fabric
 * language as viterius.com, making a cameo.
 */

/* ── Riso ink pairs — paper, ink, second ink ────────────────────── */
export const INKS = [
  { id: "blue", paper: "#f2efe4", ink: "#0078bf", ink2: "#ff48b0" },
  { id: "pink", paper: "#f6f0e8", ink: "#ff48b0", ink2: "#0078bf" },
  { id: "orange", paper: "#f4efe3", ink: "#ff6c2f", ink2: "#765ba7" },
  { id: "green", paper: "#f2efe4", ink: "#00a95c", ink2: "#ff6c2f" },
  { id: "black", paper: "#efece3", ink: "#17150f", ink2: "#f15060" },
];

/* order matters — index = uMode in the shader */
export const MATERIALS = [
  { id: "fold", label: "Fold" },
  { id: "bauhaus", label: "Bauhaus" },
  { id: "split", label: "Split" },
  { id: "melt", label: "Melt" },
  { id: "ascii", label: "Ascii" },
  { id: "scan", label: "Scan" },
];

export const LAYOUTS = [
  { id: "stack", label: "Stack" },
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
  } else {
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
  ctx.fillText(`TRYCK N°${seed} — a little poster press · viterius.com`, mx, H - mx * 0.55);
}

/* ── ASCII glyph atlas: 10 characters, light → dark ─────────────── */
const CHARSET = " .:-=+*x#@";
function buildAtlas() {
  const cell = 64;
  const c = document.createElement("canvas");
  c.width = cell * CHARSET.length;
  c.height = cell;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.font = `500 ${cell * 0.82}px "IBM Plex Mono", monospace`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (let i = 0; i < CHARSET.length; i++) {
    ctx.fillText(CHARSET[i], i * cell + cell / 2, cell * 0.54);
  }
  return c;
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
uniform sampler2D uAtlas;
uniform vec3 uPaper, uInk, uInk2;
uniform float uMode, uTime, uKick;
uniform vec2 uP;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

/* one Bauhaus primitive in cell space (q: 0..1), oriented by o */
float shapeMask(vec2 q, float pick, float o) {
  if (o > 0.75)      q = vec2(q.y, 1.0 - q.x);
  else if (o > 0.5)  q = 1.0 - q;
  else if (o > 0.25) q = vec2(1.0 - q.y, q.x);
  if (pick < 0.30) return 1.0;                                        /* square */
  if (pick < 0.50) return step(length(q - 0.5), 0.5);                 /* circle */
  if (pick < 0.68) return step(length(q - vec2(0.5, 0.0)), 0.5);      /* semicircle */
  if (pick < 0.82) return step(length(q), 1.0);                       /* quarter disc */
  if (pick < 0.94) return step(q.x, q.y);                             /* triangle */
  return step(abs(length(q - 0.5) - 0.34), 0.10);                     /* ring */
}

void main() {
  vec2 uv = vUv;
  vec3 col;

  /* the press moment: fold curtains ride on top of any material */
  float kb = 0.0;
  if (uKick > 0.001) {
    float kph = uv.x * 22.0 + uTime * 7.0;
    uv.x += sin(kph) * 0.05 * uKick;
    uv.y += cos(kph * 0.6) * 0.022 * uKick;
    kb = (0.5 - 0.5 * cos(kph)) * uKick;
  }

  if (uMode < 0.5) {
    /* FOLD — soft curtains: displacement + shading bands */
    float waves = 2.0 + uP.x * 8.0;
    float depth = uP.y;
    float amp = 0.002 + depth * 0.028;
    float ph = uv.x * waves * 6.28318 + uTime * 0.25;
    uv.x += sin(ph) * amp * (0.65 + 0.35 * sin(uv.y * 3.1));
    uv.y += cos(ph * 0.5) * amp * 0.3;
    float a = texture2D(uType, uv).a;
    col = mix(uPaper, uInk, a);
    float band = 0.5 - 0.5 * cos(ph + 1.3);
    col *= 1.0 - depth * 0.42 * band;
    col += depth * 0.06 * (1.0 - band);
  } else if (uMode < 1.5) {
    /* BAUHAUS — the type rebuilt from geometric primitives.
       x: grid scale · y: playfulness (solid type → pure geometry) */
    float grid = mix(13.0, 36.0, uP.x);
    vec2 cells = vec2(grid, grid * 1.4142);
    vec2 cellId = floor(uv * cells);
    vec2 cellUv = fract(uv * cells);
    vec2 center = (cellId + 0.5) / cells;
    float a = texture2D(uType, center).a;
    float on = step(0.35, a);
    float play = uP.y;
    /* shape variety opens up with playfulness; squares keep it readable */
    float pick = hash(cellId) * mix(0.28, 0.9, play);
    float orient = hash(cellId + 4.7);
    float m = shapeMask(cellUv, pick, orient);
    /* palette: ink leads, second ink seconds, near-black punctuates */
    float cr = hash(cellId + 9.3);
    vec3 shapeCol = cr < 0.52 ? uInk : (cr < 0.82 ? uInk2 : vec3(0.10, 0.09, 0.085));
    vec3 paper = uPaper + (hash(uv * 750.0) - 0.5) * 0.02;
    col = mix(paper, shapeCol, m * on);
    /* sparse accents wandering the empty paper */
    float stray = step(1.0 - play * 0.055, hash(cellId + 2.2));
    float ms = shapeMask(cellUv, 0.3 + hash(cellId + 6.1) * 0.7, hash(cellId + 8.8));
    col = mix(col, cr < 0.5 ? uInk2 : vec3(0.10, 0.09, 0.085), ms * stray * (1.0 - on));
  } else if (uMode < 2.5) {
    /* SPLIT — two inks, off register; overlap overprints darker */
    vec2 off = (uP - 0.5) * 0.045;
    float a1 = texture2D(uType, uv + off).a;
    float a2 = texture2D(uType, uv - off).a;
    col = uPaper;
    col = mix(col, uInk, a1);
    col = mix(col, mix(uInk2, uInk * uInk2 * 1.7, a1), a2 * 0.92);
    col += (hash(uv * 800.0) - 0.5) * 0.03;
  } else if (uMode < 3.5) {
    /* MELT — the ink hasn't dried; it drips down the sheet */
    float cols = mix(24.0, 130.0, uP.x);
    float amt = uP.y * 0.35;
    float cid = floor(uv.x * cols);
    float drip = pow(hash(vec2(cid, 7.0)), 1.6);
    float a = 0.0;
    for (int i = 0; i < 7; i++) {
      float k = float(i) / 6.0;
      float aa = texture2D(uType, vec2(uv.x, uv.y + k * amt * drip)).a;
      a = max(a, aa * (1.0 - k * 0.5));
    }
    float tooth = (hash(uv * 700.0) - 0.5) * 0.04;
    col = mix(uPaper + tooth, uInk, a);
  } else if (uMode < 4.5) {
    /* ASCII — the poster re-typeset in terminal characters */
    float grid = mix(38.0, 105.0, uP.x);
    vec2 cells = vec2(grid, grid / 1.4142);
    vec2 cellId = floor(uv * cells);
    vec2 cellUv = fract(uv * cells);
    vec2 center = (cellId + 0.5) / cells;
    float a = texture2D(uType, center).a;
    float idx = floor(clamp(a, 0.0, 0.999) * 10.0);
    float ga = texture2D(uAtlas, vec2((idx + cellUv.x) / 10.0, cellUv.y)).a;
    float on = step(0.04, a);
    col = mix(uPaper + (hash(uv * 700.0) - 0.5) * 0.025, uInk, ga * on);
    /* background static — faint characters in the empty paper */
    float bgIdx = 1.0 + floor(hash(cellId) * 2.0);
    float gbg = texture2D(uAtlas, vec2((bgIdx + cellUv.x) / 10.0, cellUv.y)).a;
    col = mix(col, mix(uInk, uInk2, hash(cellId + 9.0)), gbg * (1.0 - on) * uP.y * 0.35);
  } else {
    /* SCAN — sliced misprint with channel drift */
    float rows = mix(10.0, 90.0, uP.x);
    float amt = uP.y;
    float row = floor(uv.y * rows);
    float jolt = (hash(vec2(row, 3.0)) - 0.5) * amt * 0.22;
    vec2 u2 = vec2(uv.x + jolt, uv.y);
    float aC = texture2D(uType, u2).a;
    float a1 = texture2D(uType, u2 + vec2(amt * 0.014, 0.0)).a;
    float a2 = texture2D(uType, u2 - vec2(amt * 0.014, 0.0)).a;
    col = uPaper + (hash(uv * 640.0) - 0.5) * 0.03;
    col = mix(col, uInk2, clamp(a1 - aC, 0.0, 1.0));
    col = mix(col, uInk2 * 0.8, clamp(a2 - aC, 0.0, 1.0) * 0.7);
    col = mix(col, uInk, aC);
  }

  col *= 1.0 - kb * 0.5;
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

  const makeTex = (unit) => {
    gl.activeTexture(gl.TEXTURE0 + unit);
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  };

  const typeTex = makeTex(0);
  makeTex(1);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, buildAtlas());

  const U = {};
  ["uType", "uAtlas", "uPaper", "uInk", "uInk2", "uMode", "uTime", "uP", "uKick"].forEach((n) => {
    U[n] = gl.getUniformLocation(prog, n);
  });
  gl.uniform1i(U.uType, 0);
  gl.uniform1i(U.uAtlas, 1);

  return {
    setType(typeCanvas) {
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, typeTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, typeCanvas);
    },
    render({ inks, mode, p, time, kick = 0 }) {
      gl.viewport(0, 0, glCanvas.width, glCanvas.height);
      gl.uniform3fv(U.uPaper, hexToVec(inks.paper));
      gl.uniform3fv(U.uInk, hexToVec(inks.ink));
      gl.uniform3fv(U.uInk2, hexToVec(inks.ink2));
      gl.uniform1f(U.uMode, Math.max(0, MATERIALS.findIndex((m) => m.id === mode)));
      gl.uniform1f(U.uTime, time);
      gl.uniform1f(U.uKick, kick);
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
  press.render({ ...state, time: state.time ?? 2.0, kick: 0 });

  glCanvas.toBlob((blob) => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `tryck-${state.seed}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }, "image/png");
}
