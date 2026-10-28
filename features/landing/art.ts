/*
 * Procedural "generated" artwork for the landing page.
 * Each palette is rendered once with a domain-warped noise shader and handed out
 * as a JPEG object URL for elements carrying data-art="<key>".
 */

export type ArtKey = "chat" | "persona" | "memory" | "image" | "agents" | "stone" | "dawn" | "moss";

interface Palette {
  /** shadow, mid, light, highlight */
  c: [string, string, string, string];
  scale: number;
  warp: number;
  seed: number;
}

export const ART_PALETTES: Record<ArtKey, Palette> = {
  chat: { c: ["#2a1d18", "#9c4f30", "#e3b48c", "#f6e9d8"], scale: 1.8, warp: 3.6, seed: 1.3 },
  persona: { c: ["#13241d", "#3f6b52", "#a8c39d", "#ece6cc"], scale: 2.1, warp: 4.0, seed: 4.7 },
  memory: { c: ["#121a2e", "#34507f", "#9fb5da", "#ebe6f3"], scale: 1.6, warp: 3.2, seed: 8.1 },
  image: { c: ["#2b1a2a", "#b45d71", "#f1b39c", "#f7e8da"], scale: 2.0, warp: 4.2, seed: 2.9 },
  agents: { c: ["#0a1d1a", "#16735f", "#8fcfb0", "#e9e778"], scale: 1.7, warp: 3.8, seed: 6.2 },
  stone: { c: ["#1f1d1f", "#6b6669", "#c9c3ba", "#f2efea"], scale: 2.4, warp: 3.4, seed: 3.3 },
  dawn: { c: ["#3a2a3f", "#c98a7a", "#f0d1b0", "#fbf3e6"], scale: 1.5, warp: 3.9, seed: 5.5 },
  moss: { c: ["#1c2416", "#6b7d3f", "#c9cf8f", "#f1efd6"], scale: 2.2, warp: 3.7, seed: 9.4 },
};

export function isArtKey(value: string | undefined): value is ArtKey {
  return !!value && Object.prototype.hasOwnProperty.call(ART_PALETTES, value);
}

function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/** CSS stand-in shown until (or instead of) the rendered artwork. */
export function artFallback(key: ArtKey): string {
  const p = ART_PALETTES[key].c;
  return (
    `radial-gradient(120% 90% at 22% 18%, ${p[3]} 0%, transparent 55%),` +
    `radial-gradient(90% 80% at 82% 78%, ${p[2]} 0%, transparent 62%),` +
    `linear-gradient(160deg, ${p[1]}, ${p[0]})`
  );
}

const VS = "attribute vec2 aPos; void main(){ gl_Position = vec4(aPos, 0.0, 1.0); }";

const FS = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform vec2 uRes; uniform float uSeed; uniform float uScale; uniform float uWarp;
uniform vec3 uA; uniform vec3 uB; uniform vec3 uC; uniform vec3 uD;
float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise(vec2 p){
  vec2 i = floor(p); vec2 f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash(i); float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0)); float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float fbm(vec2 p){
  float v = 0.0; float a = 0.5; mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
  for (int i = 0; i < 6; i++) { v += a * noise(p); p = m * p; a *= 0.5; }
  return v;
}
void main(){
  vec2 uv = gl_FragCoord.xy / uRes;
  vec2 p = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y * uScale + vec2(uSeed * 1.37, uSeed * 0.73);
  vec2 q = vec2(fbm(p), fbm(p + vec2(5.2, 1.3)));
  vec2 r = vec2(fbm(p + uWarp * q + vec2(1.7, 9.2)), fbm(p + uWarp * q + vec2(8.3, 2.8)));
  float f = fbm(p + uWarp * r);
  vec3 col = mix(uA, uB, smoothstep(0.12, 0.82, f));
  col = mix(col, uC, smoothstep(0.35, 1.05, length(q)) * 0.85);
  col = mix(col, uD, smoothstep(0.55, 0.95, r.x) * 0.7);
  col *= 0.84 + 0.28 * smoothstep(0.0, 1.0, uv.y);
  col += pow(smoothstep(0.45, 0.92, f), 3.0) * 0.12;
  vec2 d = uv - 0.5; col *= 1.0 - dot(d, d) * 0.55;
  col += (hash(gl_FragCoord.xy + uSeed * 17.0) - 0.5) * 0.035;
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;

function compile(gl: WebGLRenderingContext, type: number, src: string) {
  const s = gl.createShader(type);
  if (!s) throw new Error("shader");
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? "shader");
  return s;
}

/**
 * Render the requested palettes. Resolves to { key: objectURL }.
 * Keys that cannot be rendered (no WebGL) are simply missing and keep their CSS fallback.
 */
export function renderArt(keys: ArtKey[], width = 1600, height = 1000): Promise<Partial<Record<ArtKey, string>>> {
  return new Promise((resolve) => {
    const out: Partial<Record<ArtKey, string>> = {};
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    let gl: WebGLRenderingContext | null = null;
    try {
      gl = canvas.getContext("webgl", { preserveDrawingBuffer: true, antialias: false, alpha: false });
    } catch {
      gl = null;
    }
    if (!gl) return resolve(out);

    let prog: WebGLProgram | null;
    try {
      prog = gl.createProgram();
      if (!prog) throw new Error("program");
      gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VS));
      gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FS));
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error("link");
    } catch {
      return resolve(out);
    }

    gl.useProgram(prog);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "aPos");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    gl.viewport(0, 0, width, height);

    const u = (name: string) => gl!.getUniformLocation(prog!, name);
    gl.uniform2f(u("uRes"), width, height);

    const jobs: Promise<void>[] = [];
    for (const key of keys) {
      const pal = ART_PALETTES[key];
      gl.uniform1f(u("uSeed"), pal.seed);
      gl.uniform1f(u("uScale"), pal.scale);
      gl.uniform1f(u("uWarp"), pal.warp);
      (["uA", "uB", "uC", "uD"] as const).forEach((name, i) => {
        const [r, g, b] = rgb(pal.c[i]);
        gl!.uniform3f(u(name), r, g, b);
      });
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      // Copy now: the WebGL canvas is reused for the next palette.
      const copy = document.createElement("canvas");
      copy.width = width;
      copy.height = height;
      copy.getContext("2d")?.drawImage(canvas, 0, 0);
      jobs.push(
        new Promise((done) => {
          copy.toBlob((blob) => {
            if (blob) out[key] = URL.createObjectURL(blob);
            done();
          }, "image/jpeg", 0.9);
        }),
      );
    }

    Promise.all(jobs).then(() => {
      gl?.getExtension("WEBGL_lose_context")?.loseContext();
      resolve(out);
    });
  });
}
