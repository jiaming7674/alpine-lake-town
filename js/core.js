// Shared constants, math helpers, uniforms and geometry utilities.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
export { THREE, mergeGeometries };

// ───────────── quality tiers ─────────────
export const small = matchMedia('(max-width: 720px)').matches ||
  (navigator.maxTouchPoints > 0 && Math.min(screen.width, screen.height) < 900);
export const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
export const Q = small
  ? { dpr: 1.25, shadow: 2048, water: 256, seg: 210, nearTrees: 110, farTrees: 230, samples: 2, flora: 0.55, embers: 110, stars: 2600, milky: 1800, fireflies: 40, smoke: 260 }
  : { dpr: 1.75, shadow: 4096, water: 512, seg: 300, nearTrees: 170, farTrees: 380, samples: 4, flora: 1.0, embers: 180, stars: 4200, milky: 3200, fireflies: 70, smoke: 420 };

// ───────────── math ─────────────
export function mulberry32(a) {
  return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
export const rand = mulberry32(20260927);
export const R = (a, b) => a + (b - a) * rand();
export const pick = arr => arr[Math.floor(rand() * arr.length)];
export const clamp = THREE.MathUtils.clamp, lerp = THREE.MathUtils.lerp, D2R = Math.PI / 180;
export const smooth = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
export function hash(x, y) { const h = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return h - Math.floor(h); }
export function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export function fbm(x, y, oct = 4) { let s = 0, a = 0.5, f = 1, n = 0; for (let i = 0; i < oct; i++) { s += a * vnoise(x * f, y * f); n += a; f *= 2.03; a *= 0.5; } return s / n; }

// ───────────── shared uniforms / layers ─────────────
export const U = { time: { value: 0 }, wind: { value: 1 }, night: { value: 0 }, lit: { value: 0.3 } };
export const LAYER_NO_REFLECT = 1;   // objects only on this layer are skipped by the lake reflection
export const WIND_DIR = new THREE.Vector3(1, 0, 0.25).normalize();

// ───────────── world layout (1 unit = 1 m, Y up) ─────────────
export const SUN_AZ = 150;
export const LAKE = { x: 0, z: -64, rx: 78, rz: 50 };
// Mountains grow from distance r0 to full height at r1 (measured from the lake centre).
export const MOUNTAIN = { r0: 190, r1: 320 };
// Side length of the terrain and water planes. Keep it well beyond MOUNTAIN.r1 so the edge hides in fog.
export const WORLD_SIZE = 1100;
export const lakeD = (x, z) => { const dx = (x - LAKE.x) / LAKE.rx, dz = (z - LAKE.z) / LAKE.rz; return dx * dx + dz * dz; };
const NOTCH = { x: -6.5, z: 19.5 };
export const notchAngle = (x, z) => Math.atan2(x - NOTCH.x, -(z - NOTCH.z));
export const PASS_ANG = Math.atan2(Math.sin(SUN_AZ * D2R), -Math.cos(SUN_AZ * D2R));
export const VIEWS = {
  hero: { pos: [-40, 24, 32], target: [55, 0, -40] },
  cabin: { pos: [-6.5, 2.6, 19.5], target: [3, 3.2, -3] },
};

// ───────────── materials & geometry helpers ─────────────
export const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.9, flatShading: true, ...o });
export const box = (w, h, d, mat) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
export const BOX = new THREE.BoxGeometry(1, 1, 1);

const _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3();
export function M4(x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  return new THREE.Matrix4().compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _s.set(sx, sy, sz));
}
const X_AXIS = new THREE.Vector3(1, 0, 0), Y_AXIS = new THREE.Vector3(0, 1, 0), _d = new THREE.Vector3(), _mid = new THREE.Vector3();
/** Matrix that turns the unit BOX into a w×h beam running from a to b (world points). */
export function beamMatrix(a, b, w, h) {
  const len = a.distanceTo(b);
  _d.subVectors(b, a).normalize();
  const m = new THREE.Matrix4().lookAt(a, b, Math.abs(_d.y) > 0.98 ? X_AXIS : Y_AXIS);
  m.scale(_s.set(w, h, len));
  return m.setPosition(_mid.addVectors(a, b).multiplyScalar(0.5));
}
export function jit(hex, l = 0.05, h = 0) { return new THREE.Color(hex).offsetHSL((rand() - 0.5) * h, 0, (rand() - 0.5) * l); }

const _c = new THREE.Color();
/** Collects many small static parts (each with a flat color) and merges them into one draw call. */
export class GeoBag {
  constructor(extra = null) { this.parts = []; this.extra = extra; }
  add(geo, color, matrix, extraVals) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
    if (!g.attributes.normal) g.computeVertexNormals();
    if (matrix) g.applyMatrix4(matrix);
    const n = g.attributes.position.count;
    _c.set(color);
    const ca = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { ca[i * 3] = _c.r; ca[i * 3 + 1] = _c.g; ca[i * 3 + 2] = _c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(ca, 3));
    if (this.extra) for (const k in this.extra) g.setAttribute(k, new THREE.BufferAttribute(new Float32Array(n).fill(extraVals?.[k] ?? this.extra[k]), 1));
    this.parts.push(g);
    return this;
  }
  addRaw(g) { this.parts.push(g); return this; }
  build() { const g = this.parts.length ? mergeGeometries(this.parts) : null; this.parts = []; return g; }
}

/** Emissive "window glass" material; each vertex carries aLight in [0,1] and is lit when aLight < U.lit. */
export function makeGlass(emissive = 0xffa94d, intensity = 3) {
  const m = new THREE.MeshStandardMaterial({ color: 0x1c1108, emissive, emissiveIntensity: intensity, roughness: 0.35, flatShading: true });
  m.onBeforeCompile = sh => {
    sh.uniforms.uLit = U.lit;
    sh.vertexShader = 'attribute float aLight;\nvarying float vLight;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvLight = aLight;');
    sh.fragmentShader = 'uniform float uLit;\nvarying float vLight;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance *= step(vLight, uLit);');
  };
  return m;
}
export const propsMaterial = () => new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.9, side: THREE.DoubleSide });
