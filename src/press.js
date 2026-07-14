/**
 * ─── press.js ─────────────────────────────────────────────────────
 * The whole press: type layer (2D canvas → alpha mask), WebGL1
 * material renderer (fold / riso grain / two-ink split), and the
 * print-res PNG export. No libraries — one quad, one shader.
 */

/* ── Riso ink pairs — paper, ink, second ink for the split ──────── */
export const INKS = [
  { id: "blue", paper: "#f2efe4", ink: "#0078bf", ink2: "#ff48b0" },
  { id: "pink", paper: "#f6f0e8", ink: "#ff48b0", ink2: "#0078bf" },
  { id: "orange", paper: "#f4efe3", ink: "#ff6c2f", ink2: "#765ba7" },
  { id: "green", paper: "#f2efe4", ink: "#00a95c", ink2: "#ff6c2f" },
  { id: "black", paper: "#efece3", ink: "#17150f", ink2: "#f15060" },
];

export const MATERIALS = [
  { id: "fold", label: "Fold" },
  { id: "grain", label: "Grain" },
  { id: "split", label: "Split" },
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
    // each word fills the column; scale the stack to fit the page
    const contentW = W - mx * 2;
    const contentH = H - mx * 2 - H * 0.05; // reserve colophon strip
    ctx.font = `100px "Anton", sans-serif`;
    const sizes = words.map((w) => Math.min((100 * contentW) / Math.max(ctx.measureText(w).width, 1), H * 0.34));
    const total = sizes.reduce((a, s) => a + s * 1.03, 0);
    const k = total > contentH ? contentH / total : 1;
    let y = mx + (contentH - total * k) / 2;
    ctx.textBaseline = "top";
    words.forEach((w, i) => {
      const s = sizes[i] * k;
      ctx.font = `${s}px "Anton", sans-serif`;
      // center words narrower than the column
      const ww = ctx.measureText(w).width;
      ctx.fillText(w, mx + (contentW - ww) / 2, y);
      y += s * 1.03;
    });
  } else {
    // tilt: the text as repeating rows on a slight diagonal
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
    // keep the colophon strip clean
    ctx.clearRect(0, H - H * 0.055, W, H * 0.055);
  }

  // colophon — baked into the print, tiny and proud
  ctx.font = `500 ${Math.max(W * 0.013, 11)}px "IBM Plex Mono", monospace`;
  ctx.textBaseline = "alphabetic";
  ctx.fillText(`TRYCK N°${seed} — a little poster press · viterius.com`, mx, H - mx * 0.55);
}

/* ── WebGL material renderer ────────────────────────────────────── */
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

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

void main() {
  vec2 uv = vUv;
  vec3 col;

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
    /* GRAIN — riso halftone + paper tooth */
    float cell = mix(200.0, 58.0, uP.y);
    float grain = uP.x;
    float a = texture2D(uType, uv).a;
    vec2 g = uv * cell;
    g.y += mod(floor(g.x), 2.0) * 0.5;
    float d = length(fract(g) - 0.5);
    float dotm = smoothstep(0.025, -0.025, d - a * 0.6 - 0.02);
    float tooth = (hash(uv * 900.0) - 0.5) * 0.045;
    float inkVar = 1.0 - grain * 0.6 * hash(uv * 620.0 + 3.7);
    col = mix(uPaper + tooth, mix(uPaper, uInk, inkVar), dotm);
  } else {
    /* SPLIT — two inks, off register; overlap overprints darker */
    vec2 off = (uP - 0.5) * 0.045;
    float a1 = texture2D(uType, uv + off).a;
    float a2 = texture2D(uType, uv - off).a;
    col = uPaper;
    col = mix(col, uInk, a1);
    col = mix(col, mix(uInk2, uInk * uInk2 * 1.7, a1), a2 * 0.92);
    col += (hash(uv * 800.0) - 0.5) * 0.03;
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

  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  const U = {};
  ["uType", "uPaper", "uInk", "uInk2", "uMode", "uTime", "uP"].forEach((n) => {
    U[n] = gl.getUniformLocation(prog, n);
  });
  gl.uniform1i(U.uType, 0);

  return {
    setType(typeCanvas) {
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, typeCanvas);
    },
    render({ inks, mode, p, time }) {
      gl.viewport(0, 0, glCanvas.width, glCanvas.height);
      gl.uniform3fv(U.uPaper, hexToVec(inks.paper));
      gl.uniform3fv(U.uInk, hexToVec(inks.ink));
      gl.uniform3fv(U.uInk2, hexToVec(inks.ink2));
      gl.uniform1f(U.uMode, mode === "fold" ? 0 : mode === "grain" ? 1 : 2);
      gl.uniform1f(U.uTime, time);
      gl.uniform2f(U.uP, p.x, 1 - p.y); // y up in shader space
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
  };
}

/* ── Export: re-render at print resolution, download PNG ───────── */
export function exportPoster(state) {
  const W = 2000, H = Math.round(2000 * Math.SQRT2); // A-series ratio
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
  press.render({ ...state, time: state.time ?? 2.0 });

  glCanvas.toBlob((blob) => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `tryck-${state.seed}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }, "image/png");
}
