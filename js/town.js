// The lakeside town: streets, plaza, a procedural Swiss-chalet generator, station building,
// church, inn, boathouses, pier with rowboats, street lamps and chimney smoke.
import { THREE, GeoBag, BOX, M4, beamMatrix, R, rand, pick, jit, lerp, smooth, lakeD, propsMaterial, makeGlass, U } from './core.js';
import { heightAt } from './world.js';
import { S, STREETS, PLAZA, CHURCH, trackAt, lakeSign, trackGrid, streetGrid } from './route.js';

const V = THREE.Vector3;
const STUCCO = [0xece4d4, 0xe8dcc2, 0xdcc9a3, 0xe9e1d6, 0xd8c7b0];
const TIMBER = [0x7a4a2a, 0x6b4127, 0x8a5a36, 0x5e3a22];
const ROOFS = [0x4a3b33, 0x3d332c, 0x7a3b2a, 0x55463c];
const SHUTTERS = [0x2f5a3a, 0x8a2a1e, 0x3a4f6b, 0x2f5a3a, 0x6b4a2e];
const FLOWERS = [0xd63a3a, 0xe0608a, 0xf2f0ea, 0xd93a5e, 0xf0a030];

export function createTown(scene, smoke, cabin) {
  const solid = new GeoBag(), glass = new GeoBag({ aLight: 0.5 });
  const lots = [];

  // ───────────── streets & plaza ─────────────
  function ribbon(curve, half, color) {
    const len = curve.getLength(), n = Math.ceil(len / 1.5);
    const pos = [], cols = [], c = new THREE.Color(), rows = [];
    for (let k = 0; k <= n; k++) {
      const u = k / n, p = curve.getPointAt(u), t = curve.getTangentAt(u);
      const nx = -t.z, nz = t.x, row = [];
      for (const o of [-half, -half * 0.35, half * 0.35, half]) { const x = p.x + nx * o, z = p.z + nz * o; row.push(new V(x, heightAt(x, z) + 0.07, z)); }
      rows.push(row);
    }
    for (let k = 0; k < n; k++) for (let j = 0; j < 3; j++) {
      const a = rows[k][j], b = rows[k][j + 1], d = rows[k + 1][j + 1], e = rows[k + 1][j];
      pos.push(a.x, a.y, a.z, b.x, b.y, b.z, d.x, d.y, d.z, a.x, a.y, a.z, d.x, d.y, d.z, e.x, e.y, e.z);
      c.copy(jit(color, 0.08)); for (let q = 0; q < 6; q++) cols.push(c.r, c.g, c.b);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    solid.addRaw(g);
  }
  ribbon(STREETS.promenade, 2.2, 0x8c8174);
  ribbon(STREETS.upper, 2.2, 0x8c8174);
  {
    const seg = 28, rings = [0, 3, 6, PLAZA.r + 0.5], pos = [], cols = [], c = new THREE.Color();
    const pt = (ri, k) => { const a = k / seg * Math.PI * 2, rr = rings[ri]; const x = PLAZA.x + Math.cos(a) * rr, z = PLAZA.z + Math.sin(a) * rr; return new V(x, heightAt(x, z) + 0.08, z); };
    for (let ri = 0; ri < rings.length - 1; ri++) for (let k = 0; k < seg; k++) {
      const a = pt(ri, k), b = pt(ri, k + 1), d = pt(ri + 1, k + 1), e = pt(ri + 1, k);
      pos.push(a.x, a.y, a.z, d.x, d.y, d.z, b.x, b.y, b.z, a.x, a.y, a.z, e.x, e.y, e.z, d.x, d.y, d.z);
      c.copy(jit(ri % 2 ? 0x9a8f80 : 0x877c6f, 0.06)); for (let q = 0; q < 6; q++) cols.push(c.r, c.g, c.b);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    solid.addRaw(g);
    // fountain
    const y = heightAt(PLAZA.x, PLAZA.z) + 0.05;
    solid.add(new THREE.CylinderGeometry(1.9, 2.0, 0.7, 10), 0x8a8378, M4(PLAZA.x, y + 0.35, PLAZA.z));
    solid.add(new THREE.CylinderGeometry(1.65, 1.65, 0.1, 10), 0x2f5e70, M4(PLAZA.x, y + 0.6, PLAZA.z));
    solid.add(new THREE.CylinderGeometry(0.22, 0.3, 1.8, 8), 0x8a8378, M4(PLAZA.x, y + 1.3, PLAZA.z));
    solid.add(new THREE.CylinderGeometry(0.75, 0.3, 0.3, 8), 0x8a8378, M4(PLAZA.x, y + 2.2, PLAZA.z));
    lots.push({ x: PLAZA.x, z: PLAZA.z, r: PLAZA.r + 0.5 });
  }

  // ───────────── chalet generator ─────────────
  const chimneys = [];
  function addWindowSet(T, x, y, z, ry, w, h, shutter, lit) {
    const L = (lx, ly, lz, sx, sy, sz) => T.clone().multiply(M4(x, y, z, 0, ry, 0)).multiply(M4(lx, ly, lz, 0, 0, 0, sx, sy, sz));
    glass.add(new THREE.PlaneGeometry(w, h), 0xffffff, T.clone().multiply(M4(x, y, z, 0, ry, 0)).multiply(M4(0, 0, 0.03)), { aLight: lit });
    const f = 0xefe8da;
    solid.add(BOX, f, L(0, h / 2 + 0.05, 0.04, w + 0.2, 0.1, 0.1));
    solid.add(BOX, f, L(0, -h / 2 - 0.05, 0.06, w + 0.3, 0.1, 0.18));
    solid.add(BOX, f, L(-w / 2 - 0.05, 0, 0.04, 0.1, h, 0.1));
    solid.add(BOX, f, L(w / 2 + 0.05, 0, 0.04, 0.1, h, 0.1));
    solid.add(BOX, f, L(0, 0, 0.05, 0.05, h, 0.05));
    if (shutter != null) for (const sg of [-1, 1]) solid.add(BOX, shutter, L(sg * (w / 2 + 0.3), 0, 0.05, 0.42, h + 0.08, 0.05));
  }
  /**
   * o: { x, z, y?, yaw, w (front width), d (depth), floors, base, timber, roof, shutter, balcony, door, ridgeAlong }
   * Local +Z is the front (gable end); the ridge runs along Z.
   */
  function chalet(o) {
    const y0 = o.y ?? Math.min(...[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([a, b]) => {
      const c = Math.cos(o.yaw), s = Math.sin(o.yaw), lx = a * o.w / 2, lz = b * o.d / 2;
      return heightAt(o.x + lx * c + lz * s, o.z - lx * s + lz * c);
    })) + 0.05;
    const T = M4(o.x, y0, o.z, 0, o.yaw, 0);
    const put = (w, h, d, c, x, y, z, rx = 0, ry = 0, rz = 0) => solid.add(BOX, c, T.clone().multiply(M4(x, y, z, rx, ry, rz, w, h, d)));
    const h1 = 2.8, hf = 2.6, floors = o.floors, W = o.w, D = o.d;
    const wallTop = h1 + (floors - 1) * hf;
    put(W + 0.35, 1.9, D + 0.35, 0x6f6960, 0, -0.65, 0);
    put(W, h1, D, o.base, 0, h1 / 2, 0);
    for (let f = 1; f < floors; f++) {
      put(W + 0.3, hf, D + 0.3, o.timber, 0, h1 + (f - 0.5) * hf, 0);
      put(W + 0.4, 0.16, D + 0.4, 0x3b2a1e, 0, h1 + (f - 1) * hf + 0.06, 0);
    }
    // roof
    const pitch = o.pitch ?? 0.42, ow = 0.9, od = 1.2;
    const wh = W / 2 + 0.15, halfW = wh + ow, rise = wh * Math.tan(pitch);
    const lenZ = D + 0.3 + 2 * od, slabW = halfW / Math.cos(pitch) + 0.1;
    for (const sg of [-1, 1]) put(slabW, 0.3, lenZ, o.roof, sg * halfW / 2, wallTop + rise - (halfW / 2) * Math.tan(pitch) + 0.2, 0, 0, 0, -sg * pitch);
    const tri = new THREE.Shape([new THREE.Vector2(-wh, 0), new THREE.Vector2(wh, 0), new THREE.Vector2(0, rise)]);
    const triGeo = new THREE.ExtrudeGeometry(tri, { depth: 0.25, bevelEnabled: false });
    const gz = (D + 0.3) / 2, gTop = floors > 1 ? o.timber : o.base;
    solid.add(triGeo, gTop, T.clone().multiply(M4(0, wallTop, gz - 0.25)));
    solid.add(triGeo, gTop, T.clone().multiply(M4(0, wallTop, -gz)));
    const ez = gz + od - 0.08, apex = new V(0, wallTop + rise + 0.32, ez);
    for (const sg of [-1, 1]) solid.add(BOX, 0x3b2a1e, T.clone().multiply(beamMatrix(apex, new V(sg * halfW, wallTop - ow * Math.tan(pitch) + 0.3, ez), 0.1, 0.35)));
    if (rise > 1.2) addWindowSet(T, 0, wallTop + rise * 0.38, gz, 0, 0.7, 0.7, null, R(0.1, 1));
    // chimney
    const cx = halfW * 0.35 * (rand() < 0.5 ? -1 : 1), cz = -D * 0.2;
    const roofY = wallTop + rise - Math.abs(cx) * Math.tan(pitch);
    put(0.6, 1.8, 0.6, 0x77706a, cx, roofY + 0.5, cz);
    put(0.75, 0.12, 0.75, 0x55504b, cx, roofY + 1.45, cz);
    const top = new V(cx, roofY + 1.6, cz).applyMatrix4(T);
    chimneys.push(top);
    // windows
    for (let f = 0; f < floors; f++) {
      const y = f === 0 ? 1.55 : h1 + (f - 1) * hf + 1.4;
      const fw = f === 0 ? W : W + 0.3, fd = f === 0 ? D : D + 0.3;
      const wh2 = f === 0 ? 1.0 : 1.05;
      for (const sz of [1, -1]) {
        const n = Math.max(1, Math.floor((fw - 0.8) / 1.8));
        for (let k = 0; k < n; k++) {
          const x = -fw / 2 + (k + 0.5) * fw / n;
          if (f === 0 && sz === 1 && o.door !== false && Math.abs(x) < 0.9) continue;
          addWindowSet(T, x, y, sz * fd / 2, sz > 0 ? 0 : Math.PI, 0.72, wh2, o.shutter, R(0.05, 0.98));
        }
      }
      for (const sx of [1, -1]) {
        const n = Math.max(1, Math.floor((fd - 0.8) / 2.0));
        for (let k = 0; k < n; k++) {
          const z = -fd / 2 + (k + 0.5) * fd / n;
          addWindowSet(T, sx * fw / 2, y, z, sx * Math.PI / 2, 0.72, wh2, o.shutter, R(0.05, 0.98));
        }
      }
    }
    // front door
    if (o.door !== false) {
      put(1.05, 2.15, 0.1, 0x4a2e1c, 0, 1.08, D / 2 + 0.04);
      put(1.3, 0.12, 0.14, 0xefe8da, 0, 2.2, D / 2 + 0.05);
      put(1.6, 0.18, 0.8, 0x8a8378, 0, 0.05, D / 2 + 0.45);
    }
    // balcony with carved boards and flower boxes
    if (o.balcony && floors > 1) {
      const bz = gz + 0.6, by = h1 + 0.05;
      put(W + 0.9, 0.12, 1.2, 0x5a3a24, 0, by, bz);
      put(W + 0.9, 0.08, 0.1, 0x5a3a24, 0, by + 1.0, bz + 0.55);
      for (let x = -W / 2 - 0.35; x <= W / 2 + 0.36; x += 0.3) put(0.18, 0.9, 0.04, 0x6b4127, x, by + 0.52, bz + 0.56);
      put(W + 0.7, 0.24, 0.26, 0x4a2e1c, 0, by + 1.16, bz + 0.62);
      for (let x = -W / 2 - 0.2; x <= W / 2 + 0.2; x += 0.34) put(0.22, 0.2, 0.2, pick(FLOWERS), x + R(-0.05, 0.05), by + 1.36, bz + 0.62, 0, R(0, 1), 0);
    }
    lots.push({ x: o.x, z: o.z, r: Math.max(W, D) / 2 + 0.6 });
    return { T, y0, wallTop };
  }

  function free(x, z, r, rs = r + 2.6, lakeMin = 1.1) {
    if (lakeD(x, z) < lakeMin) return false;
    if (trackGrid.dist(x, z) < r + 5.5) return false;
    if (streetGrid.dist(x, z) < rs) return false;
    for (const l of lots) if (Math.hypot(x - l.x, z - l.z) < r + l.r + 1.2) return false;
    if (Math.hypot(x - cabin.windmill.position.x, z - cabin.windmill.position.z) < r + 6) return false;
    if (Math.hypot(x, z) < r + 12) return false;
    return true;
  }
  const facing = (x, z, tx, tz) => Math.atan2(tx - x, tz - z);
  const houseParams = () => ({
    w: R(7, 9.5), d: R(7.5, 10), floors: pick([2, 2, 3]), base: pick(STUCCO), timber: pick(TIMBER),
    roof: pick(ROOFS), shutter: pick(SHUTTERS), balcony: rand() < 0.75,
  });

  // ───────────── station building (level with the platform) ─────────────
  const side = lakeSign(S.station);
  {
    const P = new V(), Tn = new V();
    trackAt(S.station, P, Tn);
    const L = new V().crossVectors(new V(0, 1, 0), Tn).normalize().multiplyScalar(side);
    const x = P.x + L.x * 11.2, z = P.z + L.z * 11.2;
    const yaw = Math.atan2(Tn.x, Tn.z);
    const st = chalet({ x, z, y: P.y + 0.55, yaw, w: 7.6, d: 15.5, floors: 2, base: 0xe8dcc2, timber: 0x6b4127, roof: 0x4a3b33, shutter: 0x2f5a3a, balcony: false, door: false, pitch: 0.5 });
    // doors on both long sides + a nameboard facing the platform
    for (const sx of [-1, 1]) {
      solid.add(BOX, 0x4a2e1c, st.T.clone().multiply(M4(sx * 3.83, 1.1, 0, 0, 0, 0, 0.1, 2.2, 1.3)));
      solid.add(BOX, 0xefe8da, st.T.clone().multiply(M4(sx * 3.84, 2.25, 0, 0, 0, 0, 0.14, 0.14, 1.6)));
    }
    const board = makeBoard();
    for (const sx of [-1, 1]) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 0.64), board);
      m.applyMatrix4(st.T.clone().multiply(M4(sx * 3.86, 2.95, 0, 0, sx * Math.PI / 2, 0)));
      scene.add(m);
    }
  }

  // ───────────── inn on the plaza ─────────────
  {
    const x = PLAZA.x - 12, z = PLAZA.z - 7.5;
    chalet({ x, z, yaw: facing(x, z, PLAZA.x, PLAZA.z), w: 11, d: 10, floors: 3, base: 0xece4d4, timber: 0x7a4a2a, roof: 0x7a3b2a, shutter: 0x8a2a1e, balcony: true });
  }

  // ───────────── church on its knoll ─────────────
  {
    const end = STREETS.upper.getPointAt(1);
    const yaw = facing(CHURCH.x, CHURCH.z, end.x, end.z);
    const y = heightAt(CHURCH.x, CHURCH.z) - 0.1;
    const T = M4(CHURCH.x, y, CHURCH.z, 0, yaw, 0);
    const put = (geo, c, x, yy, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => solid.add(geo, c, T.clone().multiply(M4(x, yy, z, rx, ry, rz, sx, sy, sz)));
    const W = 8, H = 7, D = 15, white = 0xece6da, roof = 0x7a3b2a, slate = 0x3d4a52;
    put(BOX, 0x6f6960, 0, -0.6, 0, 0, 0, 0, W + 0.4, 1.6, D + 0.4);
    put(BOX, white, 0, H / 2, 0, 0, 0, 0, W, H, D);
    const pitch = 0.73, halfW = W / 2 + 0.6, rise = (W / 2) * Math.tan(pitch);
    for (const sg of [-1, 1]) put(BOX, roof, sg * halfW / 2, H + rise - (halfW / 2) * Math.tan(pitch) + 0.2, 0, 0, 0, -sg * pitch, halfW / Math.cos(pitch) + 0.1, 0.3, D + 1.0);
    const tri = new THREE.ExtrudeGeometry(new THREE.Shape([new THREE.Vector2(-W / 2, 0), new THREE.Vector2(W / 2, 0), new THREE.Vector2(0, rise)]), { depth: 0.3, bevelEnabled: false });
    put(tri, white, 0, H, -D / 2);
    put(tri, white, 0, H, D / 2 - 0.3);
    // apse
    put(new THREE.CylinderGeometry(3.2, 3.2, 5.5, 12, 1, false, Math.PI / 2, Math.PI), white, 0, 2.75, -D / 2);
    put(new THREE.ConeGeometry(3.5, 2.2, 12, 1, false, Math.PI / 2, Math.PI), roof, 0, 6.6, -D / 2);
    // tower + spire + cross
    const tz = D / 2 - 1.4, TH = 17;
    put(BOX, white, 0, TH / 2, tz, 0, 0, 0, 4.2, TH, 4.2);
    put(BOX, 0x6f6960, 0, TH + 0.15, tz, 0, 0, 0, 4.6, 0.3, 4.6);
    put(new THREE.ConeGeometry(3.3, 9, 4), slate, 0, TH + 4.8, tz, 0, Math.PI / 4, 0);
    put(BOX, 0xc9a24a, 0, TH + 10.1, tz, 0, 0, 0, 0.12, 1.4, 0.12);
    put(BOX, 0xc9a24a, 0, TH + 10.3, tz, 0, 0, 0, 0.7, 0.12, 0.12);
    for (let k = 0; k < 4; k++) {
      const a = k * Math.PI / 2, sx = Math.sin(a), sz = Math.cos(a);
      put(BOX, 0x1d1a18, sx * 2.11, TH - 2.2, tz + sz * 2.11, 0, a, 0, 1.1, 2.0, 0.06);
      glass.add(new THREE.CircleGeometry(0.75, 16), 0xffffff, T.clone().multiply(M4(sx * 2.13, TH - 5.2, tz + sz * 2.13, 0, a, 0)), { aLight: 0.01 });
      put(new THREE.CircleGeometry(0.9, 16), 0x1d1a18, sx * 2.12, TH - 5.2, tz + sz * 2.12, 0, a, 0);
    }
    put(BOX, 0x4a2e1c, 0, 1.3, tz + 2.14, 0, 0, 0, 1.5, 2.6, 0.1);
    for (const sx of [-1, 1]) for (let k = 0; k < 4; k++) {
      glass.add(new THREE.PlaneGeometry(0.8, 2.4), 0xffffff, T.clone().multiply(M4(sx * (W / 2 + 0.03), 3.6, -5 + k * 2.6, 0, sx * Math.PI / 2, 0)), { aLight: 0.35 });
    }
    lots.push({ x: CHURCH.x, z: CHURCH.z, r: 10 });
  }

  // ───────────── houses along the streets ─────────────
  function lineStreet(curve, spacing, sides, u0 = 0.04, u1 = 0.96) {
    const len = curve.getLength();
    for (let s = u0 * len; s <= u1 * len; s += spacing) {
      const u = s / len, p = curve.getPointAt(u), t = curve.getTangentAt(u);
      for (const sg of sides(p, t)) {
        const hp = houseParams();
        const nx = -t.z * sg, nz = t.x * sg, off = 2.2 + 1.6 + hp.d / 2;
        const x = p.x + nx * off + R(-0.5, 0.5), z = p.z + nz * off + R(-0.5, 0.5);
        const r = Math.max(hp.w, hp.d) / 2 + 0.6;
        if (!free(x, z, r, hp.d / 2 + 3.0)) continue;
        chalet({ ...hp, x, z, yaw: Math.atan2(-nx, -nz) + R(-0.05, 0.05) });
      }
    }
  }
  const landward = (p, t) => { const a = lakeD(p.x - t.z * 5, p.z + t.x * 5), b = lakeD(p.x + t.z * 5, p.z - t.x * 5); return [a > b ? 1 : -1]; };
  lineStreet(STREETS.promenade, 11.5, landward, 0.18, 0.9);
  lineStreet(STREETS.upper, 12, () => [1, -1], 0.05, 0.9);
  // a few more houses scattered on the slope behind the town
  for (let tries = 0, n = 0; n < 7 && tries < 400; tries++) {
    const x = R(50, 130), z = R(-72, 12), hp = houseParams(), r = Math.max(hp.w, hp.d) / 2 + 0.6;
    if (!free(x, z, r) || streetGrid.dist(x, z) > 30) continue;
    chalet({ ...hp, x, z, yaw: facing(x, z, 40, -60) });
    n++;
  }
  // boathouses at the shore, lake side of the promenade
  for (const u of [0.35, 0.72]) {
    const p = STREETS.promenade.getPointAt(u), t = STREETS.promenade.getTangentAt(u);
    const sg = -landward(p, t)[0];
    let x = p.x, z = p.z;
    for (let k = 0; k < 40 && lakeD(x, z) > 1.06; k++) { x += -t.z * sg * 0.5; z += t.x * sg * 0.5; }
    x -= -t.z * sg * 3; z -= t.x * sg * 3;
    const yaw = Math.atan2(-t.z * sg, t.x * sg);
    if (free(x, z, 3.8, 5, 0.95)) chalet({ x, z, yaw, w: 5, d: 6.5, floors: 1, base: 0x6b4a30, timber: 0x6b4a30, roof: 0x3d332c, shutter: null, balcony: false, door: false, pitch: 0.55 });
  }

  // ───────────── pier + rowboats ─────────────
  const boats = [];
  {
    const u = 0.48, p = STREETS.promenade.getPointAt(u), t = STREETS.promenade.getTangentAt(u);
    const sg = -landward(p, t)[0];
    const dir = new V(-t.z * sg, 0, t.x * sg).normalize();
    let sx = p.x, sz = p.z;
    for (let k = 0; k < 80 && lakeD(sx, sz) > 0.99; k++) { sx += dir.x * 0.5; sz += dir.z * 0.5; }
    sx -= dir.x * 1.5; sz -= dir.z * 1.5;
    const yaw = Math.atan2(dir.x, dir.z);
    const T = M4(sx, 0, sz, 0, yaw, 0), len = 24, deck = 0.95;
    const put = (w, h, d, c, x, y, z) => solid.add(BOX, c, T.clone().multiply(M4(x, y, z, 0, 0, 0, w, h, d)));
    for (let z = 0; z < len; z += 0.36) put(2.4, 0.08, 0.3, jit(0x7a5a3c, 0.08), 0, deck, z);
    for (const x of [-0.9, 0.9]) put(0.2, 0.3, len, 0x4e3a28, x, deck - 0.2, len / 2);
    for (let z = 2; z < len; z += 3) for (const x of [-1.05, 1.05]) put(0.22, 4, 0.22, 0x3e2e22, x, deck - 2, z);
    put(4.4, 0.1, 3.4, 0x7a5a3c, 0, deck + 0.02, len + 1.2);
    for (const x of [-2.1, 2.1]) for (let z = len; z <= len + 2.8; z += 1.4) put(0.14, 1.1, 0.14, 0x3e2e22, x, deck + 0.55, z);
    // rowboats tied to the pier
    const boatGeo = (() => {
      const b = new GeoBag();
      const prof = new THREE.Shape([new THREE.Vector2(-1.7, 0.55), new THREE.Vector2(-1.35, 0), new THREE.Vector2(1.25, 0), new THREE.Vector2(1.75, 0.6), new THREE.Vector2(1.55, 0.62), new THREE.Vector2(-1.55, 0.58)]);
      b.add(new THREE.ExtrudeGeometry(prof, { depth: 1.2, bevelEnabled: false }).translate(0, 0, -0.6).rotateY(Math.PI / 2), 0x7a3b2a);
      b.add(BOX, 0xe8e0cc, M4(0, 0.6, 0, 0, 0, 0, 1.24, 0.06, 3.4));
      for (const z of [-0.6, 0.5]) b.add(BOX, 0x8a6a48, M4(0, 0.42, z, 0, 0, 0, 1.1, 0.06, 0.3));
      return b.build();
    })();
    const bmat = propsMaterial();
    for (const [x, z, ry] of [[2.6, 8, 0.1], [-2.7, 14, -0.15]]) {
      const m = new THREE.Mesh(boatGeo, bmat);
      const w = new V(x, 0, z).applyMatrix4(T);
      m.position.set(w.x, 0.02, w.z); m.rotation.y = yaw + ry;
      m.castShadow = true; m.receiveShadow = true;
      m.userData.phase = rand() * 6;
      scene.add(m); boats.push(m);
    }
    // lamp at the pier head
    solid.add(BOX, 0x2a2622, T.clone().multiply(M4(1.9, deck + 1.7, len + 2.6, 0, 0, 0, 0.12, 3.4, 0.12)));
    glass.add(BOX, 0xffffff, T.clone().multiply(M4(1.9, deck + 3.5, len + 2.6, 0, 0, 0, 0.32, 0.36, 0.32)), { aLight: 0.02 });
  }

  // ───────────── street lamps & benches ─────────────
  const lampPoints = [];
  function lamp(x, z) {
    const y = heightAt(x, z);
    solid.add(BOX, 0x2a2622, M4(x, y + 1.7, z, 0, 0, 0, 0.13, 3.4, 0.13));
    solid.add(BOX, 0x2a2622, M4(x, y + 3.55, z, 0, 0, 0, 0.42, 0.1, 0.42));
    glass.add(BOX, 0xffffff, M4(x, y + 3.3, z, 0, 0, 0, 0.3, 0.38, 0.3), { aLight: 0.02 });
    lampPoints.push(new V(x, y + 3.3, z));
  }
  for (const [curve, off, step] of [[STREETS.promenade, -3.1, 11], [STREETS.upper, 3.1, 14]]) {
    const len = curve.getLength();
    for (let s = 4; s < len - 2; s += step) {
      const u = s / len, p = curve.getPointAt(u), t = curve.getTangentAt(u);
      let sg = Math.sign(off);
      if (curve === STREETS.promenade) sg = -landward(p, t)[0];
      const x = p.x - t.z * sg * Math.abs(off), z = p.z + t.x * sg * Math.abs(off);
      if (trackGrid.dist(x, z) < 4) continue;
      lamp(x, z);
      if (curve === STREETS.promenade && rand() < 0.6) {
        const bx = p.x - t.z * sg * 2.9 + t.x * 2.2, bz = p.z + t.x * sg * 2.9 + t.z * 2.2, by = heightAt(bx, bz);
        const yaw = Math.atan2(t.x, t.z) + Math.PI / 2;
        solid.add(BOX, 0x6b4a2e, M4(bx, by + 0.45, bz, 0, yaw, 0, 1.6, 0.08, 0.45));
        solid.add(BOX, 0x6b4a2e, M4(bx, by + 0.75, bz, 0, yaw, 0, 1.6, 0.4, 0.06));
      }
    }
  }
  for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + 0.4; lamp(PLAZA.x + Math.cos(a) * (PLAZA.r + 1.2), PLAZA.z + Math.sin(a) * (PLAZA.r + 1.2)); }

  // ───────────── build meshes ─────────────
  const solidMesh = new THREE.Mesh(solid.build(), propsMaterial());
  solidMesh.castShadow = true; solidMesh.receiveShadow = true;
  scene.add(solidMesh);
  const glassMat = makeGlass(0xffb25e, 3);
  scene.add(new THREE.Mesh(glass.build(), glassMat));

  // a warm light over the plaza at night
  const plazaLight = new THREE.PointLight(0xffb86a, 0, 26, 1.6);
  plazaLight.position.set(PLAZA.x, heightAt(PLAZA.x, PLAZA.z) + 4.5, PLAZA.z);
  scene.add(plazaLight);

  // chimney smoke from a handful of houses
  chimneys.sort(() => rand() - 0.5).slice(0, 5).forEach(c => {
    smoke.addEmitter(0.9, emit => emit({
      x: c.x, y: c.y, z: c.z, vx: R(-0.08, 0.08), vy: R(0.4, 0.65), vz: R(-0.08, 0.08),
      dur: R(6, 9), s0: 0.25, s1: 1.6, a: 0.2, color: 0x8a8480, buoy: 0.55, drag: 0.35, windK: 0.55,
    }));
  });

  return {
    lots,
    count: lots.length,
    onTime(e, night) { glassMat.emissiveIntensity = lerp(4.0, 2.2, 1 - night); plazaLight.intensity = 30 * U.lit.value; },
    update(t) {
      for (const b of boats) {
        const ph = b.userData.phase;
        b.position.y = 0.02 + Math.sin(t * 1.1 + ph) * 0.05;
        b.rotation.z = Math.sin(t * 0.9 + ph) * 0.04;
        b.rotation.x = Math.sin(t * 0.7 + ph * 1.3) * 0.02;
      }
    },
  };
}

function makeBoard() {
  const c = document.createElement('canvas'); c.width = 512; c.height = 96;
  const x = c.getContext('2d');
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const draw = () => {
    x.fillStyle = '#2d4a36'; x.fillRect(0, 0, 512, 96);
    x.strokeStyle = '#e6d9bc'; x.lineWidth = 6; x.strokeRect(8, 8, 496, 80);
    x.fillStyle = '#efe4c8'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.font = '600 50px "Noto Serif TC", "Songti TC", "PMingLiU", serif';
    x.fillText('湖畔  SEEUFER', 256, 50);
    tex.needsUpdate = true;
  };
  draw();
  document.fonts?.load('600 50px "Noto Serif TC"').then(draw).catch(() => {});
  return new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7 });
}
