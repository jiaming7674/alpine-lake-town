// Terrain height field: natural hills, lake, mountains, creek, town flattening, and the graded rail corridor.
import { lerp, clamp, smooth, fbm, lakeD, LAKE, MOUNTAIN, notchAngle, PASS_ANG } from './core.js';
import { PX, PY, PZ, N, DS, LEN, S, HILLS, creekDist, trackGrid, streetGrid } from './route.js';

export const townLevel = x => lerp(0.3, 1.2, smooth(25, 60, x));

function natural(x, z) {
  const hills = (fbm(x * 0.025 + 10, z * 0.025 + 3) - 0.5) * 5 + 0.8;
  const flat = smooth(18, 38, Math.hypot(x - 3, z - 6));      // the cabin clearing
  return lerp(0.25, Math.max(hills, 0.2), flat);
}
function mountains(x, z) {
  const m = smooth(MOUNTAIN.r0, MOUNTAIN.r1, Math.hypot(x - LAKE.x, z - LAKE.z));
  if (m <= 0) return 0;
  const ridge = 1 - Math.abs(fbm(x * 0.008 + 4, z * 0.008 - 7, 5) * 2 - 1);
  const pass = 0.12 + 0.88 * smooth(0.1, 0.42, Math.abs(notchAngle(x, z) - PASS_ANG));   // sunset notch
  // the creek runs through a valley: the mountains stay low next to it and rise gradually to full height 85 m away
  const valley = 0.04 + 0.96 * smooth(12, 85, creekDist(x, z));
  return m * pass * valley * (ridge * ridge * 135 + fbm(x * 0.02, z * 0.02, 3) * 25);
}
function bumps(x, z) {
  let h = 0;
  for (const b of HILLS) { const dx = x - b.x, dz = z - b.z; h += b.H * Math.exp(-(dx * dx + dz * dz) * b.k); }
  return h;
}

/** Ground height before the rail corridor is cut in. */
export function baseHeight(x, z, withBumps = true) {
  let land = natural(x, z);
  const sd = streetGrid.dist(x, z);
  if (sd < 26) land = lerp(land, townLevel(x), 1 - smooth(9, 26, sd));
  let h = lerp(-4.5, land, smooth(0.82, 1.02, lakeD(x, z)));
  h += mountains(x, z);
  if (withBumps) h += bumps(x, z);
  const cd = creekDist(x, z);
  if (cd < 12) h = lerp(Math.min(h, -1.6), h, smooth(3.5, 12, cd));
  return h;
}

// ───────────── rail grade (height of the rail top along s) ─────────────
function blur(src, rad) {
  const n = src.length, out = new Float32Array(n), pre = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) pre[i + 1] = pre[i] + src[i];
  for (let i = 0; i < n; i++) { const lo = Math.max(0, i - rad), hi = Math.min(n - 1, i + rad); out[i] = (pre[hi + 1] - pre[lo]) / (hi - lo + 1); }
  return out;
}
{
  const raw = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const s = clamp(i * DS, S.A, S.B), j = Math.round(s / DS);        // tunnels keep the portal level
    let g = Math.max(baseHeight(PX[j], PZ[j], false), 0.4) + 0.55;
    const sd = streetGrid.dist(PX[j], PZ[j]);
    if (sd < 16) g = lerp(g, townLevel(PX[j]) + 0.3, 1 - smooth(8, 16, sd));
    if (s > S.bridge[0] - 10 && s < S.bridge[1] + 10) g = Math.max(g, 3.6);
    raw[i] = g;
  }
  let a = raw;
  for (let k = 0; k < 3; k++) a = blur(a, 20);
  PY.set(a);
}
export function gradeAt(s) {
  const f = clamp(s, 0, LEN) / DS, i = Math.min(Math.floor(f), N - 2);
  return lerp(PY[i], PY[i + 1], f - i);
}
/** 1 where the corridor is cut into the ground; 0 on the trestle and deep inside the tunnels. */
export function corridorOpen(s) {
  const tunnel = Math.min(smooth(S.A - 4, S.A - 1, s), 1 - smooth(S.B + 1, S.B + 4, s));
  const [b0, b1] = S.bridge;
  const bridge = 1 - smooth(b0 - 1.5, b0, s) * (1 - smooth(b1, b1 + 1.5, s));
  return tunnel * bridge;
}

/** Final ground height used by every mesh and placement. */
export function heightAt(x, z) {
  let h = baseHeight(x, z);
  const d = trackGrid.dist(x, z);
  if (d < 14) {
    const s = trackGrid.sAt(x, z);
    if (s >= 0) {
      const inner = (s > S.platform[0] - 6 && s < S.stop + 3) ? 7.5 : 4.5;
      const w = (1 - smooth(inner, 14, d)) * corridorOpen(s);
      if (w > 0) {
        const depth = lerp(0.05, 0.55, smooth(3, 6, Math.abs(s - S.cross)));  // level crossing sits flush
        h = lerp(h, gradeAt(s) - depth, w);
      }
    }
  }
  return h;
}
