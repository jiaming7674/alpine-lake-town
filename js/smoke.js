// One instanced pool of low-poly smoke/steam puffs shared by the campfire, chimneys and the locomotive.
import { THREE, smooth, WIND_DIR } from './core.js';

export function createSmoke(scene, max) {
  const geo = new THREE.IcosahedronGeometry(1, 0);
  const alpha = new Float32Array(max);
  const aAttr = new THREE.InstancedBufferAttribute(alpha, 1).setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('aAlpha', aAttr);
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, flatShading: true, transparent: true, depthWrite: false });
  mat.onBeforeCompile = sh => {
    sh.vertexShader = 'attribute float aAlpha;\nvarying float vAlpha;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvAlpha = aAlpha;');
    sh.fragmentShader = 'varying float vAlpha;\n' + sh.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.a *= vAlpha;');
  };
  const mesh = new THREE.InstancedMesh(geo, mat, max);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const zero = new THREE.Matrix4().makeScale(0, 0, 0), white = new THREE.Color(1, 1, 1);
  for (let i = 0; i < max; i++) { mesh.setMatrixAt(i, zero); mesh.setColorAt(i, white); }
  mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  scene.add(mesh);

  const P = Array.from({ length: max }, (_, i) => ({ i, live: false }));
  let cursor = 0, colorDirty = false;
  const col = new THREE.Color();

  /** o: {x,y,z, vx,vy,vz, dur, s0, s1, a, color, buoy, drag, windK} */
  function emit(o) {
    let p = null;
    for (let k = 0; k < max; k++) { const c = P[(cursor + k) % max]; if (!c.live) { p = c; break; } }
    if (!p) p = P[cursor];
    cursor = (p.i + 1) % max;
    p.live = true; p.age = 0;
    p.x = o.x; p.y = o.y; p.z = o.z; p.vx = o.vx ?? 0; p.vy = o.vy ?? 1; p.vz = o.vz ?? 0;
    p.dur = o.dur ?? 5; p.s0 = o.s0 ?? 0.3; p.s1 = o.s1 ?? 2; p.a = o.a ?? 0.3;
    p.buoy = o.buoy ?? 0.8; p.drag = o.drag ?? 0.5; p.windK = o.windK ?? 0.6;
    p.rx = Math.random() * 6; p.ry = Math.random() * 6; p.rz = Math.random() * 6;
    p.wx = (Math.random() - 0.5) * 0.6; p.wy = (Math.random() - 0.5) * 0.6;
    mesh.setColorAt(p.i, col.set(o.color ?? 0x777777)); colorDirty = true;
  }

  const emitters = [];
  function addEmitter(rate, spawn) { const e = { rate, spawn, acc: Math.random(), enabled: true }; emitters.push(e); return e; }

  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), eul = new THREE.Euler(), pos = new THREE.Vector3(), scl = new THREE.Vector3();
  function update(dt, wind) {
    for (const e of emitters) {
      if (!e.enabled) continue;
      e.acc += e.rate * dt;
      while (e.acc >= 1) { e.acc -= 1; e.spawn(emit); }
    }
    for (const p of P) {
      if (!p.live) continue;
      p.age += dt;
      if (p.age >= p.dur) { p.live = false; alpha[p.i] = 0; mesh.setMatrixAt(p.i, zero); continue; }
      const t = p.age / p.dur, k = 1 - Math.exp(-p.drag * dt);
      p.vx += (wind * p.windK * WIND_DIR.x - p.vx) * k;
      p.vz += (wind * p.windK * WIND_DIR.z - p.vz) * k;
      p.vy += (p.buoy - p.vy) * k;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      p.rx += p.wx * dt; p.ry += p.wy * dt;
      const s = p.s0 + (p.s1 - p.s0) * Math.sqrt(t);
      alpha[p.i] = p.a * smooth(0, 0.1, t) * (1 - smooth(0.45, 1, t));
      mesh.setMatrixAt(p.i, m4.compose(pos.set(p.x, p.y, p.z), q.setFromEuler(eul.set(p.rx, p.ry, p.rz)), scl.set(s, s * 0.85, s)));
    }
    mesh.instanceMatrix.needsUpdate = true;
    aAttr.needsUpdate = true;
    if (colorDirty) { mesh.instanceColor.needsUpdate = true; colorDirty = false; }
  }
  return { emit, addEmitter, update, mesh };
}
