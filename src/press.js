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

/* order matters — index = uMode in the shader */
export const MATERIALS = [
  { id: "bauhaus", label: "Bauhaus" },
  { id: "sunrise", label: "Sunrise" },
  { id: "pop", label: "Pop" },
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

/* one geometric primitive in local space (q: 0..1), oriented by o */
float shapeMask(vec2 q, float pick, float o) {
  if (q.x < 0.0 || q.x > 1.0 || q.y < 0.0 || q.y > 1.0) return 0.0;
  if (o > 0.75)      q = vec2(q.y, 1.0 - q.x);
  else if (o > 0.5)  q = 1.0 - q;
  else if (o > 0.25) q = vec2(1.0 - q.y, q.x);
  if (pick < 0.22) return step(length(q - 0.5), 0.5);                 /* disc */
  if (pick < 0.42) return step(length(q - vec2(0.5, 0.0)), 0.5);      /* semicircle */
  if (pick < 0.58) return step(length(q), 1.0);                       /* quarter disc */
  if (pick < 0.72) return step(q.x, q.y);                             /* triangle */
  if (pick < 0.86) return step(abs(length(q - 0.5) - 0.36), 0.10);    /* ring */
  return step(abs(q.y - 0.5), 0.18);                                  /* bar */
}

/* the readable-type pass: paper plate halo + near-black ink on top */
vec3 typeOver(vec3 col, vec2 uv, vec3 inkCol) {
  float a = texture2D(uType, uv).a;
  float halo = a;
  halo = max(halo, texture2D(uType, uv + vec2( 0.006, 0.0)).a);
  halo = max(halo, texture2D(uType, uv + vec2(-0.006, 0.0)).a);
  halo = max(halo, texture2D(uType, uv + vec2(0.0,  0.0085)).a);
  halo = max(halo, texture2D(uType, uv + vec2(0.0, -0.0085)).a);
  col = mix(col, uPaper, halo * 0.9);
  return mix(col, inkCol, a);
}

/* ── the full material stack as a function, so the fold zone can
   sample it three times for TRUE whole-image chromatic splitting ── */
vec3 material(vec2 uv) {
  vec3 col;
  vec3 paper = uPaper + (hash(uv * 780.0) - 0.5) * 0.03;

  if (uMode < 0.5) {
    /* BAUHAUS — a big geometric composition behind readable type.
       x picks the arrangement (12 variants), y sets how busy. */
    float variant = floor(uP.x * 12.0);
    float count = 3.0 + floor(uP.y * 5.0);   /* 3..8 large shapes */
    col = paper;
    for (int i = 0; i < 8; i++) {
      if (float(i) >= count) break;
      vec2 sd = vec2(float(i) * 3.7 + variant * 13.1, variant * 7.3 + float(i));
      vec2 pos = vec2(0.12 + hash(sd) * 0.76, 0.18 + hash(sd + 1.3) * 0.72);
      float size = 0.16 + hash(sd + 2.6) * 0.30;
      vec2 q = (vUvToLocal(uv, pos, size));
      float m = shapeMask(q, hash(sd + 4.1), hash(sd + 5.9));
      float cr = hash(sd + 7.7);
      vec3 sc = cr < 0.42 ? uInk : (cr < 0.72 ? uInk2 : NEARBLACK);
      col = mix(col, sc, m);
    }
    col = typeOver(col, uv, NEARBLACK);
  } else if (uMode < 1.5) {
    /* SUNRISE — grainy gradient field; the sun follows your pin */
    vec2 c = vec2(uP.x, 0.45 + uP.y * 0.35);
    float d = distance(uv * ASPECT, c * ASPECT);
    vec3 glow = mix(uInk2, uInk, smoothstep(0.05, 0.85, d));
    col = mix(glow, uPaper * 0.97, smoothstep(0.45, 1.05, d));
    float sun = 1.0 - smoothstep(0.16, 0.175, d);
    col = mix(col, mix(uInk2, uPaper, 0.35), sun);
    /* horizon haze bands */
    col = mix(col, uInk, 0.10 * (0.5 + 0.5 * sin(uv.y * 28.0)) * smoothstep(0.5, 0.0, abs(uv.y - c.y)));
    /* heavy film grain — the shaders.com texture */
    col += (hash(uv * 900.0) - 0.5) * 0.085;
    /* type knocked out in paper, with a soft drop shadow */
    float sh = texture2D(uType, uv + vec2(0.004, 0.006)).a;
    col = mix(col, col * 0.55, sh * 0.5);
    col = mix(col, uPaper, texture2D(uType, uv).a);
  } else if (uMode < 2.5) {
    /* POP — groovy concentric waves centered on your pin */
    vec2 c = uP;
    vec2 dv = (uv - c) * ASPECT;
    float ang = atan(dv.y, dv.x);
    float d = length(dv) + sin(ang * 6.0 + uTime * 0.4) * 0.018;
    float band = mod(floor(d * 11.0), 4.0);
    col = band < 1.0 ? uInk : (band < 2.0 ? paper : (band < 3.0 ? uInk2 : NEARBLACK));
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
    col = mix(paper, uInk, a);
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

/* small helper injected above material() — local coords for a shape */
const HELPERS = `
vec2 vUvToLocal(vec2 uv, vec2 pos, float size) {
  return (uv * vec2(1.0, 1.4142) - pos * vec2(1.0, 1.4142)) / size + 0.5;
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
  const frag = FRAG.replace("float shapeMask", HELPERS + "\nfloat shapeMask");
  const prog = gl.createProgram();
  gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
  gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, frag));
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
