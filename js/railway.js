// Permanent way: rails, sleepers, ballast, trestle bridge, tunnel portals, platform, crossing, water tower, signal.
import { THREE, GeoBag, BOX, M4, beamMatrix, R, jit, std, propsMaterial, makeGlass, LAYER_NO_REFLECT } from './core.js';
import { S, frameAt, lakeSign } from './route.js';
import { baseHeight } from './world.js';

const V = THREE.Vector3;
const _m = new THREE.Matrix4();

/** Sweeps a 2D profile [[lateral, dy], ...] along the track between sa and sb. */
function sweep(bag, sa, sb, step, prof, color, side = 1, colorFn = null) {
  const n = Math.max(1, Math.ceil((sb - sa) / step)), rows = [];
  for (let k = 0; k <= n; k++) { frameAt(sa + (sb - sa) * k / n, _m); rows.push(prof.map(([lx, dy]) => new V(lx * side, dy, 0).applyMatrix4(_m))); }
  const pos = [], cols = [], c = new THREE.Color();
  for (let k = 0; k < n; k++) for (let j = 0; j < prof.length - 1; j++) {
    const a = rows[k][j], b = rows[k][j + 1], cc = rows[k + 1][j + 1], d = rows[k + 1][j];
    pos.push(a.x, a.y, a.z, b.x, b.y, b.z, cc.x, cc.y, cc.z, a.x, a.y, a.z, cc.x, cc.y, cc.z, d.x, d.y, d.z);
    if (colorFn) { c.copy(colorFn(k, j)); for (let q = 0; q < 6; q++) cols.push(c.r, c.g, c.b); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  if (colorFn) { g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3)); bag.addRaw(g); }
  else bag.add(g, color);
}
const at = (s, lx, ly, lz = 0) => new V(lx, ly, lz).applyMatrix4(frameAt(s, _m));
const local = (s, x, y, z, rx, ry, rz, sx, sy, sz) => frameAt(s, new THREE.Matrix4()).multiply(M4(x, y, z, rx, ry, rz, sx, sy, sz));

export function createRailway(scene) {
  const props = new GeoBag(), rails = new GeoBag(), voids = new GeoBag(), lamps = new GeoBag({ aLight: 0.02 });
  const s0 = S.A - 14, s1 = S.B + 14;
  const [b0, b1] = S.bridge;
  const side = lakeSign(S.station);            // platform & station on the lake side

  // ───────────── rails ─────────────
  const G = 0.7175, w = 0.04, h = 0.16;
  for (const sg of [-1, 1]) {
    sweep(rails, s0, s1, 1, [[sg * G - w, -h], [sg * G - w, 0], [sg * G + w, 0], [sg * G + w, -h]], 0x4b433d);
    sweep(rails, s0, s1, 1, [[sg * G - w * 0.8, 0.003], [sg * G + w * 0.8, 0.003]], 0xb9b4ad);
  }

  // ───────────── sleepers ─────────────
  const sl = [];
  for (let s = s0; s <= s1; s += 0.65) sl.push(s);
  const sleepers = new THREE.InstancedMesh(BOX, std(0xffffff, { roughness: 0.95 }), sl.length);
  sl.forEach((s, i) => {
    sleepers.setMatrixAt(i, local(s, 0, -0.235, 0, 0, 0, 0, 2.5, 0.15, 0.24));
    sleepers.setColorAt(i, jit(0x4a3526, 0.1));
  });
  sleepers.receiveShadow = true;
  sleepers.computeBoundingSphere();
  sleepers.layers.set(LAYER_NO_REFLECT);
  scene.add(sleepers);

  // ───────────── ballast (not on the bridge) ─────────────
  const bprof = [[-3.3, -1.0], [-1.85, -0.24], [1.85, -0.24], [3.3, -1.0]];
  const ballastCol = () => jit(0x746b60, 0.12);
  sweep(props, s0, b0 - 0.5, 1, bprof, null, 1, ballastCol);
  sweep(props, b1 + 0.5, s1, 1, bprof, null, 1, ballastCol);

  // ───────────── trestle bridge ─────────────
  const tim = 0x5b4330, deckTop = -0.31;
  for (let s = b0 - 2; s <= b1 + 2.01; s += 3.4) {
    frameAt(s, _m);
    const P = new V().setFromMatrixPosition(_m);
    const top = deckTop - 0.55, bot = baseHeight(P.x, P.z) - P.y - 0.4;
    if (bot > top - 1.0) continue;
    const H = top - bot, p = (lx, ly) => at(s, lx, ly);
    for (const lx of [-0.7, 0.7]) props.add(BOX, jit(tim), beamMatrix(p(lx, bot), p(lx, top), 0.26, 0.26));
    for (const sg of [-1, 1]) props.add(BOX, jit(tim), beamMatrix(p(sg * (1.5 + 0.2 * H), bot), p(sg * 1.5, top), 0.26, 0.26));
    props.add(BOX, jit(tim), beamMatrix(p(-1.95, top + 0.15), p(1.95, top + 0.15), 0.4, 0.3));
    props.add(BOX, jit(tim), beamMatrix(p(-2.0 - 0.2 * H, bot + 0.15), p(2.0 + 0.2 * H, bot + 0.15), 0.35, 0.3));
    const nb = Math.max(1, Math.round(H / 3));
    for (let k = 0; k < nb; k++) {
      const ya = bot + H * k / nb + 0.2, yb = bot + H * (k + 1) / nb - 0.2;
      const wa = 1.5 + 0.2 * (top - ya), wb = 1.5 + 0.2 * (top - yb);
      props.add(BOX, jit(tim), beamMatrix(p(-wa, ya), p(wb, yb), 0.12, 0.2));
      props.add(BOX, jit(tim), beamMatrix(p(wa, ya), p(-wb, yb), 0.12, 0.2));
      props.add(BOX, jit(tim), beamMatrix(p(-wb - 0.1, yb), p(wb + 0.1, yb), 0.14, 0.18));
    }
  }
  for (const lx of [-0.72, 0.72]) sweep(props, b0 - 2, b1 + 2, 1, [[lx - 0.18, deckTop - 0.55], [lx - 0.18, deckTop], [lx + 0.18, deckTop], [lx + 0.18, deckTop - 0.55]], tim);
  for (const sg of [-1, 1]) {
    sweep(props, b0 - 2, b1 + 2, 1, [[sg * 1.3, -0.3], [sg * 2.0, -0.3]], 0x6a5038);
    sweep(props, b0 - 2, b1 + 2, 1, [[sg * 1.95, 0.72], [sg * 1.95, 0.84], [sg * 2.03, 0.84], [sg * 2.03, 0.72]], 0x4b3726);
    for (let s = b0 - 2; s <= b1 + 2; s += 1.7) props.add(BOX, 0x4b3726, local(s, sg * 1.99, 0.25, 0, 0, 0, 0, 0.1, 1.1, 0.1));
  }

  // ───────────── tunnel portals ─────────────
  function portal(s, inward) {
    const m = frameAt(s, new THREE.Matrix4());
    const W = 14, H = 10, aw = 2.7, ah = 3.4;
    const shape = new THREE.Shape();
    shape.moveTo(-W / 2, -1.5); shape.lineTo(W / 2, -1.5); shape.lineTo(W / 2, H); shape.lineTo(-W / 2, H); shape.closePath();
    const hole = new THREE.Path();
    hole.moveTo(-aw, -0.7); hole.lineTo(aw, -0.7); hole.lineTo(aw, ah); hole.absarc(0, ah, aw, 0, Math.PI, false); hole.lineTo(-aw, -0.7);
    shape.holes.push(hole);
    props.add(new THREE.ExtrudeGeometry(shape, { depth: 1.8, bevelEnabled: false, curveSegments: 12 }).translate(0, 0, -0.9), 0x7b746a, m);
    props.add(BOX, 0x655e55, m.clone().multiply(M4(0, H + 0.3, 0, 0, 0, 0, W + 0.8, 0.6, 2.4)));
    for (const sg of [-1, 1]) props.add(BOX, 0x6f685e, m.clone().multiply(M4(sg * (W / 2 - 0.6), H / 2 - 0.9, -inward * 0.5, 0, 0, 0, 1.2, H + 1.2, 2.2)));
    for (let k = 0; k <= 8; k++) {
      const a = Math.PI * k / 8, rr = aw + 0.4;
      props.add(BOX, jit(0x8e877b, 0.06), m.clone().multiply(M4(Math.cos(a) * rr, ah + Math.sin(a) * rr, -inward * 0.95, 0, 0, a, 0.8, 0.5, 0.2)));
    }
    for (const sg of [-1, 1]) props.add(BOX, 0x8e877b, m.clone().multiply(M4(sg * (aw + 0.4), ah / 2 - 0.3, -inward * 0.95, 0, 0, 0, 0.8, ah + 0.8, 0.2)));
    voids.add(BOX, 0x000000, m.clone().multiply(M4(0, 2.9, inward * 2.6, 0, 0, 0, 5.9, 7.4, 3.2)));
  }
  portal(S.A, -1);
  portal(S.B, 1);

  // ───────────── platform + canopy + lamps ─────────────
  const [p0, p1] = S.platform;
  sweep(props, p0, p1, 1, [[1.72, -0.45], [1.72, 0.55], [6.2, 0.55], [6.2, -0.9]], 0xa39a88, side);
  sweep(props, p0, p1, 1, [[1.74, 0.565], [2.05, 0.565]], 0xe8e2cc, side);
  for (const s of [p0, p1]) props.add(BOX, 0x958c7a, local(s, side * 3.96, 0.05, 0, 0, 0, 0, 4.48, 1.0, 0.12));
  for (let s = S.station - 12; s < S.station + 12; s += 5) {
    props.add(BOX, 0x3a2a1e, local(s + 2.5, side * 6.0, 2.55, 0, 0, 0, 0, 0.2, 4.0, 0.2));
    props.add(BOX, 0x4a3b33, local(s + 2.5, side * 4.4, 4.62, 0, 0, 0, side * 0.08, 4.8, 0.16, 5.25));
    props.add(BOX, 0x6b4a2e, local(s + 2.5, side * 2.05, 4.52, 0, 0, 0, 0, 0.1, 0.35, 5.25));
    lamps.add(BOX, 0xffffff, local(s + 2.5, side * 3.4, 4.25, 0, 0, 0, 0, 0.3, 0.3, 0.3));
  }
  for (let s = p0 + 3; s < p1; s += 10) {
    if (Math.abs(s - S.station) < 13) continue;
    props.add(BOX, 0x2a2622, local(s, side * 5.6, 2.1, 0, 0, 0, 0, 0.12, 3.1, 0.12));
    props.add(BOX, 0x2a2622, local(s, side * 5.25, 3.6, 0, 0, 0, 0, 0.8, 0.08, 0.08));
    lamps.add(BOX, 0xffffff, local(s, side * 4.9, 3.42, 0, 0, 0, 0, 0.3, 0.34, 0.3));
  }

  // ───────────── level crossing ─────────────
  props.add(BOX, 0x6b5540, local(S.cross, 0, -0.07, 0, 0, 0, 0, 1.3, 0.12, 5.2));
  for (const sg of [-1, 1]) {
    props.add(BOX, 0x6b5540, local(S.cross, sg * 1.75, -0.07, 0, 0, 0, 0, 1.9, 0.12, 5.2));
    const lz = sg * 3.3, lx = sg * 3.8;
    props.add(BOX, 0x33302c, local(S.cross, lx, 1.1, lz, 0, 0, 0, 0.12, 3.2, 0.12));
    props.add(BOX, 0xe8e4dc, local(S.cross, lx + sg * 0.08, 2.4, lz, Math.PI / 4, 0, 0, 0.04, 0.2, 1.4));
    props.add(BOX, 0xb3261e, local(S.cross, lx + sg * 0.08, 2.4, lz, -Math.PI / 4, 0, 0, 0.04, 0.2, 1.4));
  }

  // ───────────── water tower (outer side, beside the tender) ─────────────
  {
    const ox = -side * 6.4, gy = -0.55;
    const leg = (dx, dz) => props.add(BOX, jit(0x4e3a28), beamMatrix(at(S.tower, ox + dx * 1.25, gy, dz * 1.25), at(S.tower, ox + dx * 1.0, 5.3, dz * 1.0), 0.28, 0.28));
    leg(-1, -1); leg(1, -1); leg(-1, 1); leg(1, 1);
    for (const dz of [-1, 1]) {
      props.add(BOX, 0x4e3a28, beamMatrix(at(S.tower, ox - 1.2, 0.6, dz * 1.2), at(S.tower, ox + 1.05, 4.9, dz * 1.05), 0.12, 0.16));
      props.add(BOX, 0x4e3a28, beamMatrix(at(S.tower, ox + 1.2, 0.6, dz * 1.2), at(S.tower, ox - 1.05, 4.9, dz * 1.05), 0.12, 0.16));
    }
    props.add(new THREE.CylinderGeometry(2.1, 2.1, 3.2, 16), 0x6d4c33, local(S.tower, ox, 6.9, 0));
    for (const y of [5.6, 6.9, 8.2]) props.add(new THREE.CylinderGeometry(2.14, 2.14, 0.12, 16), 0x2a2522, local(S.tower, ox, y, 0));
    props.add(new THREE.ConeGeometry(2.45, 1.3, 16), 0x3d332c, local(S.tower, ox, 9.15, 0));
    props.add(BOX, 0x2e2a26, beamMatrix(at(S.tower, ox + side * 1.9, 6.0, 0), at(S.tower, -side * 1.6, 5.3, 0), 0.26, 0.26));
    props.add(BOX, 0x2e2a26, beamMatrix(at(S.tower, -side * 1.6, 5.3, 0), at(S.tower, -side * 1.3, 4.4, 0), 0.2, 0.2));
  }

  // ───────────── semaphore signal ─────────────
  const signal = new THREE.Group();
  {
    const sx = -side * 2.9;
    props.add(BOX, 0x2a2622, local(S.signal, sx, 2.7, 0, 0, 0, 0, 0.18, 6.4, 0.18));
    props.add(BOX, 0x2a2622, local(S.signal, sx, -0.2, 0, 0, 0, 0, 0.7, 0.3, 0.7));
    frameAt(S.signal, _m).decompose(signal.position, signal.quaternion, new V());
    signal.position.copy(at(S.signal, sx, 5.6, -0.12));
    const arm = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.24, 0.05).translate(-side * 0.75, 0, 0), std(0xb3261e, { roughness: 0.6 }));
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.25, 0.06).translate(-side * 1.1, 0, 0), std(0xeeeae0));
    arm.add(stripe);
    signal.add(arm);
    signal.userData.arm = arm;
    const lampMesh = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 0.12), makeGlass(0xff5a2a, 3));
    lampMesh.position.set(0, -0.35, -0.02);
    signal.add(lampMesh);
    scene.add(signal);
  }

  // ───────────── meshes ─────────────
  const propsMesh = new THREE.Mesh(props.build(), propsMaterial());
  propsMesh.castShadow = true; propsMesh.receiveShadow = true;
  scene.add(propsMesh);
  const railMesh = new THREE.Mesh(rails.build(), new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.55, roughness: 0.42, flatShading: true, side: THREE.DoubleSide }));
  railMesh.receiveShadow = true;
  railMesh.layers.set(LAYER_NO_REFLECT);
  scene.add(railMesh);
  scene.add(new THREE.Mesh(voids.build(), new THREE.MeshBasicMaterial({ color: 0x020202 })));
  const glass = makeGlass(0xffc27a, 3);
  scene.add(new THREE.Mesh(lamps.build(), glass));

  return {
    side,
    /** clear = arm raised 45° */
    setSignal(clear, dt) {
      const arm = signal.userData.arm, target = clear ? -side * 0.75 : 0;
      arm.rotation.z += (target - arm.rotation.z) * Math.min(1, dt * 2.5);
    },
    glass,
  };
}
