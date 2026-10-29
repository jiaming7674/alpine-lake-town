// Railway alignment, streets, creek and the distance grids the terrain uses to grade around them.
import { THREE, clamp, lerp, LAKE } from './core.js';

// Track centerline (x, z). It starts inside the west hill, runs along the far (north) shore,
// crosses the creek on a trestle, turns south down the east shore through the station, then
// bends south-west around the town and disappears into the south-east hill.
// PORTAL_A and PORTAL_B are the control points where the track leaves the hills; everything
// before PORTAL_A and after PORTAL_B is hidden inside a hill and only shapes the curve.
const PORTAL_A = [-150, -139];
const PORTAL_B = [134, 67];
const CTRL = [
  [-226, -164], [-200, -154], [-175, -146], PORTAL_A,
  [-125, -136], [-100, -132], [-78, -129], [-55, -126],
  [-30, -124], [0, -123], [30, -119], [52, -110], [70, -95], [86, -78], [96, -58],
  [99, -38], [100, -22], [104, -9], [112, 0], [124, 7],
  // 40 m radius right-hand bend from the station throat around to the south-west (centre ~ (104, 42))
  [137, 19], [143, 35], [142, 52], PORTAL_B,
  [121, 78], [104, 82], [87, 78], [73, 67], [65, 52],   // hidden inside the south-east hill (long enough to hold a whole train)
];
const curve = new THREE.CatmullRomCurve3(CTRL.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, 'centripetal');
curve.arcLengthDivisions = 8000;
export const LEN = curve.getLength();
export const DS = 0.5;
export const N = Math.floor(LEN / DS) + 1;
export const PX = new Float32Array(N), PY = new Float32Array(N), PZ = new Float32Array(N);
{
  const v = new THREE.Vector3();
  for (let i = 0; i < N; i++) { curve.getPointAt(Math.min(i * DS / LEN, 1), v); PX[i] = v.x; PZ[i] = v.z; }
}
export function sNear(x, z) {
  let best = 0, bd = Infinity;
  for (let i = 0; i < N; i++) { const d = (PX[i] - x) ** 2 + (PZ[i] - z) ** 2; if (d < bd) { bd = d; best = i; } }
  return best * DS;
}

const Y = new THREE.Vector3(0, 1, 0);
const _p = new THREE.Vector3(), _t = new THREE.Vector3(), _l = new THREE.Vector3(), _u = new THREE.Vector3();
/** Position (rail top) and unit tangent at arc length s. PY is filled by world.js once the grade is known. */
export function trackAt(s, pos, tan) {
  const f = clamp(s, 0, LEN) / DS, i = Math.min(Math.floor(f), N - 2), t = f - i;
  if (pos) pos.set(lerp(PX[i], PX[i + 1], t), lerp(PY[i], PY[i + 1], t), lerp(PZ[i], PZ[i + 1], t));
  if (tan) {
    const i0 = Math.max(i - 1, 0), i1 = Math.min(i + 2, N - 1);
    tan.set(PX[i1] - PX[i0], PY[i1] - PY[i0], PZ[i1] - PZ[i0]).normalize();
  }
}
/** Local frame on the track: X = left of travel, Y = up, Z = forward (increasing s), origin on rail top. */
export function frameAt(s, out = new THREE.Matrix4()) {
  trackAt(s, _p, _t);
  _l.crossVectors(Y, _t).normalize();
  _u.crossVectors(_t, _l).normalize();
  return out.makeBasis(_l, _u, _t).setPosition(_p);
}
/** +1 if the lake lies on the local +X side of the track at s, else -1. */
export function lakeSign(s) {
  trackAt(s, _p, _t);
  _l.crossVectors(Y, _t);
  return Math.sign(_l.x * (LAKE.x - _p.x) + _l.z * (LAKE.z - _p.z)) || 1;
}

// ───────────── named places along the line ─────────────
export const S = {};
S.A = sNear(...PORTAL_A);          // west portal
S.B = sNear(...PORTAL_B);          // south-east portal
S.stop = sNear(101.6, -16);        // where the locomotive's front stops
S.cross = S.stop + 6;              // level crossing just ahead of the stop
S.platform = [S.stop - 62, S.stop - 16];
S.station = S.stop - 30;           // station building, beside the platform
S.tower = S.stop - 15;             // water tower beside the tender
S.signal = S.stop + 15;
S.start = sNear(-20, -124);        // where the train is on page load

// ───────────── creek (crossed by the trestle) ─────────────
export const CREEK = { ax: 40, az: -86, bx: 86, bz: -140 };
export function creekDist(x, z) {
  const { ax, az, bx, bz } = CREEK, vx = bx - ax, vz = bz - az;
  const t = clamp(((x - ax) * vx + (z - az) * vz) / (vx * vx + vz * vz), 0, 1);
  return Math.hypot(x - (ax + vx * t), z - (az + vz * t));
}
{
  let b0 = Infinity, b1 = -Infinity;
  for (let i = 0; i < N; i++) if (creekDist(PX[i], PZ[i]) < 11) { b0 = Math.min(b0, i * DS); b1 = Math.max(b1, i * DS); }
  S.bridge = [b0, b1];
}

// ───────────── hills over the tunnels + church knoll ─────────────
export const HILLS = [];
function hillAt(s, H, sig) { const i = Math.round(clamp(s, 0, LEN) / DS); HILLS.push({ x: PX[i], z: PZ[i], H, k: 1 / (2 * sig * sig) }); }
hillAt(S.A - 25, 34, 26);
hillAt(S.B + 25, 34, 26);
export const CHURCH = { x: 128, z: -37 };
HILLS.push({ x: CHURCH.x, z: CHURCH.z, H: 5, k: 1 / (2 * 12 * 12) });
export const PORTALS = [S.A, S.B].map(s => { const i = Math.round(s / DS); return { s, x: PX[i], z: PZ[i] }; });

// ───────────── streets ─────────────
export const PLAZA = { x: 80, z: -26, r: 9 };
const v3 = (x, z) => new THREE.Vector3(x, 0, z);
export const STREETS = {
  promenade: new THREE.CatmullRomCurve3([v3(80, -26), v3(70, -21), v3(60, -16), v3(49, -11), v3(38, -6), v3(28, -2), v3(19, 0)], false, 'centripetal'),
};
{
  // the upper street crosses the track at right angles at S.cross, then climbs to the church
  const i = Math.round(S.cross / DS);
  const cx = PX[i], cz = PZ[i];
  const tx = PX[i + 2] - PX[i - 2], tz = PZ[i + 2] - PZ[i - 2], tl = Math.hypot(tx, tz);
  let lx = tz / tl, lz = -tx / tl;                         // lateral unit vector
  if (lx * (PLAZA.x - cx) + lz * (PLAZA.z - cz) < 0) { lx = -lx; lz = -lz; }   // point toward the plaza side
  S.crossPoint = { x: cx, z: cz, lx, lz };
  STREETS.upper = new THREE.CatmullRomCurve3([
    v3(PLAZA.x + 5, PLAZA.z + 5), v3(cx + lx * 15, cz + lz * 15), v3(cx + lx * 6, cz + lz * 6), v3(cx, cz),
    v3(cx - lx * 6, cz - lz * 6), v3(cx - lx * 15, cz - lz * 15), v3(CHURCH.x - 5, CHURCH.z + 10), v3(CHURCH.x - 3, CHURCH.z + 7),
  ], false, 'centripetal');
}

// ───────────── distance grids ─────────────
class DistGrid {
  constructor(x0, z0, x1, z1, c = 1) {
    this.x0 = x0; this.z0 = z0; this.c = c;
    this.nx = Math.ceil((x1 - x0) / c) + 1; this.nz = Math.ceil((z1 - z0) / c) + 1;
    this.d = new Float32Array(this.nx * this.nz).fill(1e8);
    this.s = new Float32Array(this.nx * this.nz).fill(-1);
  }
  stamp(px, pz, sv, r, off = 0) {
    const { x0, z0, c, nx, nz, d, s } = this;
    const i0 = Math.max(0, Math.floor((px - r - off - x0) / c)), i1 = Math.min(nx - 1, Math.ceil((px + r + off - x0) / c));
    const j0 = Math.max(0, Math.floor((pz - r - off - z0) / c)), j1 = Math.min(nz - 1, Math.ceil((pz + r + off - z0) / c));
    for (let j = j0; j <= j1; j++) {
      const dz = z0 + j * c - pz;
      for (let i = i0; i <= i1; i++) {
        const dx = x0 + i * c - px;
        let dd = Math.sqrt(dx * dx + dz * dz) - off; if (dd < 0) dd = 0;
        const k = j * nx + i;
        if (dd < d[k]) { d[k] = dd; s[k] = sv; }
      }
    }
  }
  dist(x, z) {
    const fx = (x - this.x0) / this.c, fz = (z - this.z0) / this.c;
    if (fx < 0 || fz < 0 || fx >= this.nx - 1 || fz >= this.nz - 1) return 1e4;
    const i = Math.floor(fx), j = Math.floor(fz), tx = fx - i, tz = fz - j, k = j * this.nx + i, d = this.d;
    return lerp(lerp(d[k], d[k + 1], tx), lerp(d[k + this.nx], d[k + this.nx + 1], tx), tz);
  }
  sAt(x, z) {
    const i = Math.round((x - this.x0) / this.c), j = Math.round((z - this.z0) / this.c);
    if (i < 0 || j < 0 || i >= this.nx || j >= this.nz) return -1;
    return this.s[j * this.nx + i];
  }
}

export const trackGrid = (() => {
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (let i = 0; i < N; i++) { x0 = Math.min(x0, PX[i]); x1 = Math.max(x1, PX[i]); z0 = Math.min(z0, PZ[i]); z1 = Math.max(z1, PZ[i]); }
  const g = new DistGrid(x0 - 20, z0 - 20, x1 + 20, z1 + 20, 1);
  for (let i = 0; i < N; i++) g.stamp(PX[i], PZ[i], i * DS, 18);
  return g;
})();

export const streetGrid = (() => {
  const g = new DistGrid(-10, -80, 155, 35, 1);
  for (const c of Object.values(STREETS)) {
    const n = Math.ceil(c.getLength() / 0.5);
    for (let k = 0; k <= n; k++) { const p = c.getPointAt(k / n); g.stamp(p.x, p.z, 0, 28); }
  }
  g.stamp(PLAZA.x, PLAZA.z, 0, 28, PLAZA.r);
  return g;
})();
