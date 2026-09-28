// Steam train: 2-6-0 locomotive with working valve-less rod gear, tender, three coaches,
// arc-length motion with a v² = 2as station stop, exhaust synced to the drivers, headlight and whistle.
import { THREE, GeoBag, BOX, M4, beamMatrix, R, U, lerp, smooth, clamp, makeGlass, LAYER_NO_REFLECT } from './core.js';
import { S, trackAt } from './route.js';
import * as audio from './audio.js';

const V = THREE.Vector3;
const Y = new V(0, 1, 0);
const GREEN = 0x1f3a2c, BLACK = 0x171615, BRASS = 0xb08a3a, RED = 0x8a2a1e, STEEL = 0x8f8a84;
const cylY = (r1, r2, h, seg = 12) => new THREE.CylinderGeometry(r1, r2, h, seg);
const cylZ = (r, len, seg = 14) => new THREE.CylinderGeometry(r, r, len, seg).rotateX(Math.PI / 2);
const cylX = (r, len, seg = 16) => new THREE.CylinderGeometry(r, r, len, seg).rotateZ(Math.PI / 2);
const halfSphere = r => new THREE.SphereGeometry(r, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2);

const R_DRV = 0.72, R_SMALL = 0.42, RC = 0.3, L_MAIN = 2.3, Y_CYL = 0.82, Z_CYL_REAR = 3.1;
const DRIVERS = [1.95, 0.25, -1.45];

const bodyMat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.55, metalness: 0.2 });
const rodMat = new THREE.MeshStandardMaterial({ color: 0xa7a19a, roughness: 0.35, metalness: 0.8, flatShading: true });
const glass = makeGlass(0xffc987, 2.4);

function mesh(geo, mat = bodyMat, shadow = true) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = shadow; m.receiveShadow = true;
  return m;
}

/** An axle with two wheels (X axis); cranked axles carry pins quartered 90° apart (left 0°, right 90°). */
function axleGeo(r, cranked) {
  const b = new GeoBag();
  for (const sg of [-1, 1]) {
    const x = sg * 0.78;
    b.add(cylX(r, 0.14), 0x33302d, M4(x, 0, 0));
    b.add(cylX(r * 0.84, 0.17), cranked ? RED : 0x3d2a22, M4(x, 0, 0));
    b.add(cylX(r * 0.2, 0.24, 8), 0x2a2826, M4(x + sg * 0.03, 0, 0));
    if (cranked) {
      const a = sg < 0 ? 0 : Math.PI / 2;
      b.add(cylX(0.075, 0.26, 8), 0xc9c3bb, M4(x + sg * 0.15, RC * Math.sin(a), RC * Math.cos(a)));
      b.add(BOX, BLACK, M4(x + sg * 0.02, -0.42 * Math.sin(a), -0.42 * Math.cos(a), -a, 0, 0, 0.19, 0.28, 0.42));
    } else {
      for (let k = 0; k < 6; k++) b.add(BOX, 0x2a2826, M4(x + sg * 0.09, 0, 0, k * Math.PI / 3, 0, 0, 0.04, 0.05, r * 1.6));
    }
  }
  b.add(cylX(0.07, 1.5, 6), 0x2a2826);
  return b.build();
}
const AXLE_DRV = axleGeo(R_DRV, true), AXLE_SMALL = axleGeo(R_SMALL, false);

function bogie(z) {
  const g = new THREE.Group();
  g.position.set(0, 0, z);
  const b = new GeoBag();
  b.add(BOX, BLACK, M4(0, 0.72, 0, 0, 0, 0, 1.9, 0.22, 2.5));
  for (const sg of [-1, 1]) {
    b.add(BOX, 0x24221f, M4(sg * 0.98, 0.5, 0, 0, 0, 0, 0.12, 0.34, 2.6));
    for (const zz of [-0.8, 0.8]) b.add(cylY(0.09, 0.09, 0.3, 6), 0x5a5550, M4(sg * 0.98, 0.72, zz));
  }
  g.add(mesh(b.build()));
  const axles = [-0.9, 0.9].map(az => { const a = mesh(AXLE_SMALL, bodyMat, false); a.position.set(0, R_SMALL, az); g.add(a); return a; });
  return { group: g, axles, z };
}

function buildLoco() {
  const g = new THREE.Group();
  const b = new GeoBag(), gl = new GeoBag({ aLight: 0 });
  const add = (geo, c, x, y, z, rx = 0, ry = 0, rz = 0) => b.add(geo, c, M4(x, y, z, rx, ry, rz));
  const bx = (w, h, d, c, x, y, z, rx = 0, ry = 0, rz = 0) => b.add(BOX, c, M4(x, y, z, rx, ry, rz, w, h, d));
  // frame, running boards, valance
  bx(1.8, 0.32, 10.2, BLACK, 0, 1.2, 0.5);
  for (const sg of [-1, 1]) {
    bx(0.5, 0.06, 7.4, 0x2a2826, sg * 1.28, 1.6, 1.4);
    bx(0.04, 0.26, 7.4, RED, sg * 1.52, 1.48, 1.4);
    bx(0.035, 0.035, 5.2, BRASS, sg * 0.88, 2.95, 1.6);                // handrails
  }
  // boiler, bands, smokebox
  add(cylZ(0.82, 5.3), GREEN, 0, 2.35, 1.5);
  for (const z of [-0.6, 0.8, 2.2, 3.6]) add(cylZ(0.845, 0.08), BRASS, 0, 2.35, z);
  add(cylZ(0.87, 1.3), BLACK, 0, 2.35, 4.75);
  add(cylZ(0.72, 0.08), 0x262422, 0, 2.35, 5.42);
  add(cylZ(0.1, 0.1, 8), BRASS, 0, 2.35, 5.48);
  bx(1.9, 0.9, 0.9, BLACK, 0, 1.6, 4.75);                               // smokebox saddle
  // stack, domes, whistle
  add(cylY(0.34, 0.24, 1.0, 10), BLACK, 0, 3.55, 4.7);
  add(cylY(0.44, 0.34, 0.22, 10), BLACK, 0, 4.12, 4.7);
  add(cylY(0.38, 0.44, 0.5, 10), BRASS, 0, 3.3, 2.4); add(halfSphere(0.38), BRASS, 0, 3.55, 2.4);
  add(cylY(0.3, 0.36, 0.42, 10), GREEN, 0, 3.24, 0.8); add(halfSphere(0.3), GREEN, 0, 3.45, 0.8);
  add(cylY(0.06, 0.07, 0.55, 6), BRASS, 0.25, 3.45, -1.6);
  add(cylY(0.09, 0.09, 0.3, 6), BRASS, 0.25, 3.8, -1.6);
  // headlight
  bx(0.56, 0.56, 0.52, BLACK, 0, 3.47, 5.1);
  bx(0.64, 0.08, 0.6, BLACK, 0, 3.8, 5.1);
  gl.add(new THREE.PlaneGeometry(0.42, 0.42), 0xffffff, M4(0, 3.47, 5.37));
  // buffer beam + pilot
  bx(2.3, 0.42, 0.24, RED, 0, 1.25, 5.62);
  for (let k = -2; k <= 2; k++) b.add(BOX, RED, beamMatrix(new V(k * 0.42, 1.08, 5.7), new V(k * 0.24, 0.16, 6.35), 0.08, 0.14));
  b.add(BOX, RED, beamMatrix(new V(-1.0, 0.95, 5.75), new V(1.0, 0.95, 5.75), 0.1, 0.1));
  // cylinders + slide bars
  for (const sg of [-1, 1]) {
    add(cylZ(0.34, 1.3), BLACK, sg * 1.08, Y_CYL, 3.75);
    for (const z of [3.12, 4.38]) add(cylZ(0.37, 0.07), BRASS, sg * 1.08, Y_CYL, z);
    for (const dy of [-0.15, 0.15]) bx(0.05, 0.05, 1.1, STEEL, sg * 1.08, Y_CYL + dy, 2.6);
    bx(0.1, 0.5, 0.2, BLACK, sg * 1.08, Y_CYL + 0.25, 3.12);
  }
  // cab
  bx(2.55, 2.4, 0.12, GREEN, 0, 2.8, -2.2);
  for (const sg of [-1, 1]) {
    bx(0.1, 1.25, 2.5, GREEN, sg * 1.22, 2.25, -3.45);
    bx(0.12, 1.15, 0.12, GREEN, sg * 1.22, 3.45, -2.26);
    bx(0.12, 1.15, 0.12, GREEN, sg * 1.22, 3.45, -4.64);
    bx(0.14, 0.05, 2.52, BRASS, sg * 1.23, 2.88, -3.45);
    gl.add(new THREE.CircleGeometry(0.22, 10), 0xffffff, M4(sg * 0.62, 3.35, -2.13));
  }
  bx(2.95, 0.12, 3.2, BLACK, 0, 4.1, -3.45);
  bx(2.5, 0.08, 2.5, 0x3a2a1e, 0, 1.62, -3.45);
  gl.add(new THREE.PlaneGeometry(0.62, 0.42), 0xffffff, M4(0, 2.05, -2.28, 0, Math.PI, 0));   // firebox glow
  bx(1.2, 0.22, 1.0, BLACK, 0, 0.72, 3.95);                                                  // pony truck frame

  g.add(mesh(b.build()));
  const glassMesh = mesh(gl.build(), glass, false);
  g.add(glassMesh);

  const drivers = DRIVERS.map(z => { const a = mesh(AXLE_DRV); a.position.set(0, R_DRV, z); g.add(a); return a; });
  const pony = mesh(AXLE_SMALL); pony.position.set(0, R_SMALL, 3.95); g.add(pony);

  const rods = [-1, 1].map(sg => {
    const coupling = mesh(new THREE.BoxGeometry(0.08, 0.14, DRIVERS[0] - DRIVERS[2] + 0.4), rodMat, false);
    const main = mesh(new THREE.BoxGeometry(0.08, 0.16, L_MAIN), rodMat, false);
    const cross = mesh(new THREE.BoxGeometry(0.16, 0.26, 0.34), rodMat, false);
    const piston = mesh(new THREE.BoxGeometry(0.07, 0.07, 1), rodMat, false);
    for (const m of [coupling, main, cross, piston]) { m.layers.set(LAYER_NO_REFLECT); g.add(m); }
    return { sg, coupling, main, cross, piston, a0: sg < 0 ? 0 : Math.PI / 2 };
  });

  const head = new THREE.SpotLight(0xffe2b0, 0, 90, 0.42, 0.55, 1.4);
  head.position.set(0, 3.47, 5.5);
  head.target.position.set(0, 1.2, 30);
  g.add(head, head.target);

  return {
    group: g, zFront: 6.4, zRear: 4.75, zf: 3.95, zr: 1.45, bogies: [], drivers, pony, rods, head,
    stack: new V(0, 4.25, 4.7), dome: new V(0, 3.9, 2.4), whistle: new V(0.25, 4.0, -1.6),
    cylFront: [new V(-1.08, Y_CYL, 4.45), new V(1.08, Y_CYL, 4.45)],
    cab: new V(-0.72, 3.3, -3.2),
  };
}

function buildTender() {
  const g = new THREE.Group();
  const b = new GeoBag();
  const bx = (w, h, d, c, x, y, z) => b.add(BOX, c, M4(x, y, z, 0, 0, 0, w, h, d));
  bx(2.2, 0.3, 6.4, BLACK, 0, 1.12, 0);
  bx(2.5, 1.9, 6.2, GREEN, 0, 2.25, 0);
  bx(2.56, 0.07, 6.26, BRASS, 0, 3.12, 0);
  bx(2.56, 0.07, 6.26, BRASS, 0, 1.4, 0);
  for (let k = 0; k < 7; k++) b.add(new THREE.IcosahedronGeometry(0.7, 0), 0x151312, M4(R(-0.5, 0.5), 3.25, -2.2 + k * 0.62, R(0, 3), R(0, 3), 0, 1.3, 0.55, 1.1));
  b.add(cylY(0.35, 0.35, 0.3, 10), 0x24221f, M4(0, 3.35, -2.55));
  bx(2.3, 0.35, 0.2, RED, 0, 1.25, -3.3);
  g.add(mesh(b.build()));
  const bogies = [bogie(2.2), bogie(-2.2)];
  bogies.forEach(bg => g.add(bg.group));
  return { group: g, zFront: 3.3, zRear: 3.3, zf: 2.2, zr: 2.2, bogies };
}

function buildCoach(main, trim) {
  const g = new THREE.Group();
  const b = new GeoBag(), gl = new GeoBag({ aLight: 0 });
  const bx = (w, h, d, c, x, y, z) => b.add(BOX, c, M4(x, y, z, 0, 0, 0, w, h, d));
  bx(2.3, 0.35, 12.2, BLACK, 0, 1.2, 0);
  bx(2.7, 1.25, 11.4, main, 0, 2.0, 0);
  bx(2.7, 1.2, 11.4, trim, 0, 3.22, 0);
  bx(2.74, 0.08, 11.44, 0x3a2e24, 0, 2.64, 0);
  b.add(new THREE.CylinderGeometry(1.5, 1.5, 11.9, 12, 1, false, Math.PI / 2, Math.PI).rotateX(Math.PI / 2), 0x3a3634, M4(0, 3.8, 0, 0, 0, 0, 1, 0.32, 1));
  for (const sz of [-1, 1]) {
    bx(2.4, 0.1, 0.6, 0x24221f, 0, 1.42, sz * 6.05);
    bx(0.9, 1.95, 0.08, 0x2a211b, 0, 2.5, sz * 5.72);
    for (const sx of [-1, 1]) bx(0.05, 0.9, 0.05, 0x24221f, sx * 1.15, 1.9, sz * 6.3);
    bx(2.35, 0.05, 0.05, 0x24221f, 0, 2.35, sz * 6.3);
  }
  for (const sg of [-1, 1]) for (let k = 0; k < 7; k++) {
    gl.add(new THREE.PlaneGeometry(0.78, 0.62), 0xffffff, M4(sg * 1.362, 3.25, -4.5 + k * 1.5, 0, sg * Math.PI / 2, 0));
  }
  g.add(mesh(b.build()));
  g.add(mesh(gl.build(), glass, false));
  const bogies = [bogie(4.4), bogie(-4.4)];
  bogies.forEach(bg => g.add(bg.group));
  return { group: g, zFront: 6.35, zRear: 6.35, zf: 4.4, zr: 4.4, bogies };
}

export function createTrain(scene, smoke, rail) {
  const loco = buildLoco();
  const vehicles = [loco, buildTender(), buildCoach(0x6e2420, 0xe6d9bc), buildCoach(0x2d4a36, 0xe6d9bc), buildCoach(0x6e2420, 0xe6d9bc)];
  // offsets: distance from the head (loco front) back to each vehicle's origin
  let acc = 0;
  for (const v of vehicles) { v.offset = acc + v.zFront; acc += v.zFront + v.zRear + 0.55; scene.add(v.group); }
  const LENGTH = acc - 0.55;

  const V_CRUISE = 11, A_BRAKE = 0.9, A_ACC = 0.45;
  const st = { s: S.start, v: V_CRUISE, mult: 1, phase: 'run', dwell: 0, hidden: 0, stopped: false, dist: 0, departT: 99, lastQ: 0, marks: {} };
  const listeners = [];
  const fire = (name) => listeners.forEach(f => f(name));

  const A = new V(), B = new V(), P = new V(), T = new V(), fwd = new V(), left = new V(), up = new V(), m = new THREE.Matrix4();
  function place(v, sO) {
    trackAt(sO + v.zf, A); trackAt(sO - v.zr, B);
    fwd.subVectors(A, B).normalize();
    left.crossVectors(Y, fwd).normalize(); up.crossVectors(fwd, left);
    v.group.quaternion.setFromRotationMatrix(m.makeBasis(left, up, fwd));
    v.group.position.copy(B).lerp(A, v.zr / (v.zf + v.zr));
    for (const bg of v.bogies) { trackAt(sO + bg.z, P, T); bg.group.rotation.y = Math.atan2(T.dot(left), T.dot(fwd)); }
  }

  const tmpW = new V(), tmpL = new V();
  const world = (v, local, out = tmpW) => out.copy(local).applyMatrix4(v.group.matrixWorld);

  function chuff() {
    if (st.v < 0.3 || !loco.group.visible) return;
    const p = world(loco, loco.stack);
    const k = clamp(st.v / V_CRUISE, 0.2, 1.3);
    for (let i = 0; i < 2; i++) smoke.emit({
      x: p.x + R(-0.1, 0.1), y: p.y + 0.1, z: p.z + R(-0.1, 0.1), vx: R(-0.3, 0.3), vy: R(3.2, 4.5) + st.v * 0.12, vz: R(-0.3, 0.3),
      dur: R(3.2, 5), s0: 0.4, s1: R(2.6, 3.6), a: 0.5, color: new THREE.Color(0x6a6562).lerp(new THREE.Color(0xd9d4cf), Math.random() * 0.6),
      buoy: 1.2, drag: 0.9, windK: 0.9,
    });
    if (st.departT < 4.5) {
      loco.group.updateMatrixWorld();
      for (const [i, cp] of loco.cylFront.entries()) {
        const q = world(loco, cp, tmpL);
        tmpW.set(i === 0 ? 1 : -1, 0, 0).transformDirection(loco.group.matrixWorld);
        smoke.emit({ x: q.x, y: q.y, z: q.z, vx: tmpW.x * 3.5, vy: 0.3, vz: tmpW.z * 3.5, dur: 1.3, s0: 0.25, s1: 1.5, a: 0.45, color: 0xf2f0ee, buoy: 0.5, drag: 2.4, windK: 0.4 });
      }
    }
    audio.chuff(world(loco, loco.stack), 0.6 + 0.4 * k);
  }
  // idle steam while standing at the platform
  smoke.addEmitter(5, emit => {
    if (st.phase !== 'dwell') return;
    const p = world(loco, loco.dome);
    emit({ x: p.x, y: p.y, z: p.z, vx: R(-0.4, 0.4), vy: R(1.5, 2.4), vz: R(-0.4, 0.4), dur: R(1.5, 2.5), s0: 0.15, s1: 0.9, a: 0.35, color: 0xf4f2f0, buoy: 1.0, drag: 1.4, windK: 0.8 });
  });
  smoke.addEmitter(1.2, emit => {
    if (st.phase !== 'dwell') return;
    const p = world(loco, loco.stack);
    emit({ x: p.x, y: p.y, z: p.z, vx: 0, vy: R(0.8, 1.2), vz: 0, dur: R(4, 6), s0: 0.35, s1: 2.2, a: 0.28, color: 0x77716c, buoy: 0.9, drag: 0.6, windK: 0.8 });
  });
  let whistleSteam = 0;
  smoke.addEmitter(14, emit => {
    if (whistleSteam <= 0) return;
    const p = world(loco, loco.whistle);
    emit({ x: p.x, y: p.y, z: p.z, vx: R(-0.2, 0.2), vy: R(3, 4), vz: R(-0.2, 0.2), dur: 0.9, s0: 0.08, s1: 0.6, a: 0.5, color: 0xffffff, buoy: 1.5, drag: 2, windK: 0.5 });
  });

  function blowWhistle(blasts = [1.3]) {
    whistleSteam = blasts.reduce((a, b) => a + b + 0.35, 0);
    audio.whistle(world(loco, loco.stack).clone(), blasts);
  }

  function crossed(name, sPrev, sNow, at) {
    if (sPrev < at && sNow >= at && !st.marks[name]) { st.marks[name] = true; return true; }
    return false;
  }

  function update(dt) {
    const vmax = V_CRUISE * st.mult;
    const sPrev = st.s;
    st.departT += dt;
    whistleSteam -= dt;
    if (st.phase === 'hidden') {
      st.hidden -= dt;
      if (st.hidden <= 0 && st.mult > 0) { st.s = S.A - 2; st.v = vmax; st.phase = 'run'; st.stopped = false; st.marks = {}; }
    } else if (st.phase === 'dwell') {
      st.v = 0; st.dwell -= dt;
      if (st.dwell <= 0) { st.phase = 'run'; st.departT = 0; blowWhistle([0.5, 1.1]); fire('depart'); }
    } else {
      let target = vmax;
      if (!st.stopped) { const d = S.stop - st.s; if (d >= 0) target = Math.min(target, Math.sqrt(2 * A_BRAKE * d)); }
      if (st.v < target) st.v = Math.min(target, st.v + A_ACC * dt);
      else st.v = Math.max(target, st.v - 2.2 * dt);
      st.s += st.v * dt;
      if (!st.stopped && S.stop - st.s < 0.04 && st.v < 0.3) { st.s = S.stop; st.v = 0; st.phase = 'dwell'; st.dwell = 12; st.stopped = true; fire('arrive'); }
      if (st.s - LENGTH > S.B + 4) { st.phase = 'hidden'; st.hidden = 6; fire('gone'); }
    }
    if (crossed('emerge', sPrev, st.s, S.A + 6)) blowWhistle([1.0]);
    if (crossed('approach', sPrev, st.s, S.stop - 160)) blowWhistle([1.6]);
    if (crossed('tunnel', sPrev, st.s, S.B - 30)) blowWhistle([0.6, 0.6]);
    st.dist += st.v * dt;

    // place vehicles; hide those fully inside a tunnel
    for (const v of vehicles) {
      const sO = st.s - v.offset;
      const vis = st.phase !== 'hidden' && sO + v.zFront > S.A - 0.5 && sO - v.zRear < S.B + 0.5;
      v.group.visible = vis;
      if (vis) place(v, sO);
      for (const bg of v.bogies) for (const a of bg.axles) a.rotation.x = st.dist / R_SMALL;
    }
    // running gear
    const th = st.dist / R_DRV;
    for (const d of loco.drivers) d.rotation.x = th;
    loco.pony.rotation.x = st.dist / R_SMALL;
    for (const r of loco.rods) {
      const a = r.a0 - th, py = R_DRV + RC * Math.sin(a), pz = DRIVERS[1] + RC * Math.cos(a);
      r.coupling.position.set(r.sg * 1.0, py, (DRIVERS[0] + DRIVERS[2]) / 2 + RC * Math.cos(a));
      const zc = pz + Math.sqrt(L_MAIN * L_MAIN - (Y_CYL - py) ** 2);
      r.main.position.set(r.sg * 1.12, (py + Y_CYL) / 2, (pz + zc) / 2);
      r.main.rotation.x = -Math.atan2(Y_CYL - py, zc - pz);
      r.cross.position.set(r.sg * 1.08, Y_CYL, zc);
      r.piston.position.set(r.sg * 1.08, Y_CYL, (zc + Z_CYL_REAR) / 2);
      r.piston.scale.z = Math.max(Z_CYL_REAR - zc, 0.01);
    }
    loco.group.updateMatrixWorld();
    const q = Math.floor(st.dist / (2 * Math.PI * R_DRV) * 4);
    if (q !== st.lastQ) { st.lastQ = q; chuff(); }
    loco.head.intensity = 70 * smooth(0.05, 0.6, U.night.value);
    rail.setSignal(st.stopped && (st.phase !== 'dwell' || st.dwell < 4), dt);
  }

  function status() {
    if (st.phase === 'hidden') return '隧道中';
    if (st.phase === 'dwell') return `停靠 ${Math.ceil(st.dwell)}s`;
    if (st.mult === 0 && st.v < 0.05) return '暫停';
    if (st.s < S.A + 2 || st.s - LENGTH > S.B - 2) return '隧道口';
    if (!st.stopped && S.stop - st.s < 70 && st.v < V_CRUISE * st.mult - 0.1) return '進站減速';
    if (st.stopped && st.v < V_CRUISE * st.mult - 0.1) return '出站加速';
    return '行駛中';
  }

  return {
    st, loco, vehicles, LENGTH, update, status, blowWhistle,
    onEvent(fn) { listeners.push(fn); },
    world,
  };
}
